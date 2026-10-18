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
