CREATE SCHEMA IF NOT EXISTS class7_test;
CREATE TABLE IF NOT EXISTS class7_test.accounts(id text PRIMARY KEY,username text NOT NULL UNIQUE,owner_hash text NOT NULL UNIQUE,password_hash text NOT NULL,created_at text NOT NULL);
CREATE TABLE IF NOT EXISTS class7_test.account_sessions(token_hash text PRIMARY KEY,account_id text NOT NULL,expires_at bigint NOT NULL);
CREATE INDEX IF NOT EXISTS account_sessions_account ON class7_test.account_sessions(account_id);
CREATE INDEX IF NOT EXISTS account_sessions_expires ON class7_test.account_sessions(expires_at);
CREATE TABLE IF NOT EXISTS class7_test.auth_limits(key text PRIMARY KEY,window_start bigint NOT NULL,hits bigint NOT NULL);
CREATE TABLE IF NOT EXISTS class7_test.profiles(device_hash text PRIMARY KEY,nickname text NOT NULL,created_at text NOT NULL,updated_at text NOT NULL);
CREATE TABLE IF NOT EXISTS class7_test.photos(id text PRIMARY KEY,owner_hash text NOT NULL,uploader text NOT NULL,title text NOT NULL,caption text NOT NULL,object_key text NOT NULL,mime text NOT NULL,bytes bigint NOT NULL,width integer NOT NULL,height integer NOT NULL,rotation integer NOT NULL DEFAULT 0,created_at text NOT NULL);
CREATE INDEX IF NOT EXISTS photos_owner_created ON class7_test.photos(owner_hash,created_at);
CREATE INDEX IF NOT EXISTS photos_created ON class7_test.photos(created_at,id);
CREATE INDEX IF NOT EXISTS photos_title ON class7_test.photos(title);
CREATE TABLE IF NOT EXISTS class7_test.photo_name_counters(nickname text PRIMARY KEY,last_number bigint NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS class7_test.comments(id text PRIMARY KEY,photo_id text NOT NULL,owner_hash text NOT NULL,author text NOT NULL,body text NOT NULL,created_at text NOT NULL);
CREATE INDEX IF NOT EXISTS comments_photo_created ON class7_test.comments(photo_id,created_at,id);

-- Private schema: never exposed through the public PostgREST endpoint.
-- This function runs each server-generated batch in one database transaction.
-- Values are bound with USING, never interpolated into application SQL.
CREATE OR REPLACE FUNCTION class7_test.execute_batch(commands jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog,class7_test AS $$
DECLARE c jsonb; p jsonb; query text; rows jsonb; results jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(commands)<>'array' OR jsonb_array_length(commands)>25 THEN
    RAISE EXCEPTION 'invalid batch';
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(commands) LOOP
    query := c->>'query'; p := c->'params';
    IF NOT (query ~* '^\s*(SELECT|INSERT|UPDATE|DELETE)\s') OR query LIKE '%;%' THEN
      RAISE EXCEPTION 'unsupported statement';
    END IF;
    IF query ~* '^\s*(INSERT|UPDATE|DELETE)\s' AND query !~* '\mRETURNING\M' THEN
      query := query || ' RETURNING 1 AS affected';
    END IF;
    EXECUTE 'WITH class7_result AS ('||query||') SELECT COALESCE(jsonb_agg(to_jsonb(class7_result)),''[]''::jsonb) FROM class7_result'
      INTO rows USING p->>0,p->>1,p->>2,p->>3,p->>4,p->>5,p->>6,p->>7,p->>8,p->>9,p->>10,p->>11,p->>12,p->>13,p->>14,p->>15,p->>16,p->>17,p->>18,p->>19;
    results := results || jsonb_build_array(jsonb_build_object('results',rows,'meta',jsonb_build_object('changes',jsonb_array_length(rows))));
  END LOOP;
  RETURN results;
END $$;
REVOKE ALL ON SCHEMA class7_test FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA class7_test FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA class7_test FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA class7_test TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA class7_test TO service_role;
GRANT EXECUTE ON FUNCTION class7_test.execute_batch(jsonb) TO service_role;

-- Account linking requires both an authenticated session and the other password.
-- No existing accounts are linked by installing this schema.
CREATE TABLE IF NOT EXISTS class7_test.account_owner_links (
 owner_hash text PRIMARY KEY REFERENCES class7_test.accounts(owner_hash),
 canonical_owner_hash text NOT NULL REFERENCES class7_test.accounts(owner_hash)
);
CREATE INDEX IF NOT EXISTS account_owner_links_group ON class7_test.account_owner_links(canonical_owner_hash);
CREATE OR REPLACE FUNCTION class7_test.canonical_owner(value text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
 SELECT COALESCE((SELECT canonical_owner_hash FROM class7_test.account_owner_links WHERE owner_hash=value),value)
$$;
CREATE OR REPLACE FUNCTION class7_test.link_accounts(source_id text,target_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE source_raw text; target_raw text; source_group text; target_group text; photo_count bigint; comment_count bigint;
BEGIN
 LOCK TABLE class7_test.account_owner_links IN SHARE ROW EXCLUSIVE MODE;
 SELECT owner_hash INTO source_raw FROM class7_test.accounts WHERE id=source_id;
 SELECT owner_hash INTO target_raw FROM class7_test.accounts WHERE id=target_id;
 IF source_raw IS NULL OR target_raw IS NULL THEN RAISE EXCEPTION 'account missing'; END IF;
 source_group:=class7_test.canonical_owner(source_raw); target_group:=class7_test.canonical_owner(target_raw);
 IF source_group=target_group THEN RETURN jsonb_build_object('alreadyLinked',true,'linkedPhotos',0,'linkedComments',0); END IF;
 SELECT count(*) INTO photo_count FROM class7_test.photos WHERE class7_test.canonical_owner(owner_hash)=source_group;
 SELECT count(*) INTO comment_count FROM class7_test.comments WHERE class7_test.canonical_owner(owner_hash)=source_group;
 INSERT INTO class7_test.profiles(device_hash,nickname,created_at,updated_at)
 SELECT target_group,nickname,created_at,updated_at FROM class7_test.profiles WHERE device_hash=source_group
 ON CONFLICT(device_hash) DO NOTHING;
 INSERT INTO class7_test.account_owner_links(owner_hash,canonical_owner_hash) VALUES
 (source_group,source_group),(target_group,target_group) ON CONFLICT(owner_hash) DO NOTHING;
 INSERT INTO class7_test.account_owner_links(owner_hash,canonical_owner_hash) VALUES
 (source_raw,source_group),(target_raw,target_group) ON CONFLICT(owner_hash) DO NOTHING;
 UPDATE class7_test.account_owner_links SET canonical_owner_hash=target_group WHERE canonical_owner_hash=source_group;
 RETURN jsonb_build_object('alreadyLinked',false,'linkedPhotos',photo_count,'linkedComments',comment_count);
END $$;
REVOKE ALL ON TABLE class7_test.account_owner_links FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON class7_test.account_owner_links TO service_role;
REVOKE ALL ON FUNCTION class7_test.canonical_owner(text),class7_test.link_accounts(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.canonical_owner(text),class7_test.link_accounts(text,text) TO service_role;

-- Detach one OTHER account. All existing shared data stays with the caller's
-- remaining group; never delete files, accounts or sessions here.
CREATE OR REPLACE FUNCTION class7_test.unlink_account(source_id text,target_id text,expected_group text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE source_raw text; target_raw text; old_group text; new_group text; members text; photo_count bigint; comment_count bigint;
BEGIN
 LOCK TABLE class7_test.account_owner_links IN SHARE ROW EXCLUSIVE MODE;
 SELECT owner_hash INTO source_raw FROM class7_test.accounts WHERE id=source_id;
 SELECT owner_hash INTO target_raw FROM class7_test.accounts WHERE id=target_id;
 IF source_raw IS NULL OR target_raw IS NULL OR source_id=target_id THEN RETURN jsonb_build_object('invalid',true); END IF;
 old_group:=class7_test.canonical_owner(source_raw);
 IF class7_test.canonical_owner(target_raw)<>old_group THEN RETURN jsonb_build_object('notLinked',true); END IF;
 SELECT string_agg(username,'|' ORDER BY username) INTO members FROM class7_test.accounts WHERE class7_test.canonical_owner(owner_hash)=old_group;
 IF members IS DISTINCT FROM expected_group THEN RETURN jsonb_build_object('stale',true); END IF;
 SELECT count(*) INTO photo_count FROM class7_test.photos WHERE class7_test.canonical_owner(owner_hash)=old_group;
 SELECT count(*) INTO comment_count FROM class7_test.comments WHERE class7_test.canonical_owner(owner_hash)=old_group;
 new_group:=CASE WHEN old_group=target_raw THEN source_raw ELSE old_group END;
 INSERT INTO class7_test.profiles(device_hash,nickname,created_at,updated_at)
 SELECT new_group,nickname,created_at,updated_at FROM class7_test.profiles WHERE device_hash=old_group
 ON CONFLICT(device_hash) DO NOTHING;
 -- Only rows keyed to the removed account need to move. All other original
 -- owner identifiers and every file remain intact.
 UPDATE class7_test.photos SET owner_hash=new_group WHERE owner_hash=target_raw;
 UPDATE class7_test.comments SET owner_hash=new_group WHERE owner_hash=target_raw;
 UPDATE class7_test.account_owner_links SET canonical_owner_hash=new_group WHERE canonical_owner_hash=old_group AND owner_hash<>target_raw;
 DELETE FROM class7_test.account_owner_links WHERE owner_hash=target_raw;
 RETURN jsonb_build_object('retainedPhotos',photo_count,'retainedComments',comment_count);
END $$;
REVOKE ALL ON FUNCTION class7_test.unlink_account(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.unlink_account(text,text,text) TO service_role;
