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
 IF to_regprocedure('class7_test.contest_tick()') IS NOT NULL THEN PERFORM class7_test.contest_tick(); END IF;
 IF to_regprocedure('class7_test.comment_contest_tick()') IS NOT NULL THEN PERFORM class7_test.comment_contest_tick(); END IF;
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
 IF to_regprocedure('class7_test.contest_tick()') IS NOT NULL THEN PERFORM class7_test.contest_tick(); END IF;
 IF to_regprocedure('class7_test.comment_contest_tick()') IS NOT NULL THEN PERFORM class7_test.comment_contest_tick(); END IF;
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
 -- Keep existing shared votes with the remaining group when a member leaves.
 IF to_regclass('class7_test.photo_likes') IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='class7_test.photo_likes'::regclass AND attname='week_start' AND NOT attisdropped) THEN
   INSERT INTO class7_test.photo_likes(photo_id,owner_hash,created_at,voted_at,week_start)
   SELECT photo_id,new_group,min(created_at),min(voted_at),week_start FROM class7_test.photo_likes WHERE owner_hash=target_raw GROUP BY photo_id,week_start
   ON CONFLICT(photo_id,owner_hash,week_start) DO UPDATE SET created_at=LEAST(class7_test.photo_likes.created_at,excluded.created_at),voted_at=LEAST(class7_test.photo_likes.voted_at,excluded.voted_at);
  ELSE
  INSERT INTO class7_test.photo_likes(photo_id,owner_hash,created_at)
  SELECT photo_id,new_group,min(created_at) FROM class7_test.photo_likes WHERE owner_hash=target_raw GROUP BY photo_id
  ON CONFLICT(photo_id,owner_hash) DO UPDATE SET created_at=LEAST(class7_test.photo_likes.created_at,excluded.created_at);
  END IF;
  DELETE FROM class7_test.photo_likes WHERE owner_hash=target_raw;
 END IF;
 IF to_regclass('class7_test.comment_likes') IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='class7_test.comment_likes'::regclass AND attname='week_start' AND NOT attisdropped) THEN
   INSERT INTO class7_test.comment_likes(comment_id,owner_hash,created_at,voted_at,week_start)
   SELECT comment_id,new_group,min(created_at),min(voted_at),week_start FROM class7_test.comment_likes WHERE owner_hash=target_raw GROUP BY comment_id,week_start
   ON CONFLICT(comment_id,owner_hash,week_start) DO UPDATE SET created_at=LEAST(class7_test.comment_likes.created_at,excluded.created_at),voted_at=LEAST(class7_test.comment_likes.voted_at,excluded.voted_at);
  ELSE
  INSERT INTO class7_test.comment_likes(comment_id,owner_hash,created_at)
  SELECT comment_id,new_group,min(created_at) FROM class7_test.comment_likes WHERE owner_hash=target_raw GROUP BY comment_id
  ON CONFLICT(comment_id,owner_hash) DO UPDATE SET created_at=LEAST(class7_test.comment_likes.created_at,excluded.created_at);
  END IF;
  DELETE FROM class7_test.comment_likes WHERE owner_hash=target_raw;
 END IF;
 -- Preserve the earliest shared vote when an account leaves the group.
 IF to_regclass('class7_test.photo_like_history') IS NOT NULL THEN
  INSERT INTO class7_test.photo_like_history(photo_id,owner_hash,first_liked_at)
  SELECT photo_id,new_group,min(first_liked_at) FROM class7_test.photo_like_history WHERE owner_hash=target_raw GROUP BY photo_id
  ON CONFLICT(photo_id,owner_hash) DO UPDATE SET first_liked_at=LEAST(class7_test.photo_like_history.first_liked_at,excluded.first_liked_at);
  DELETE FROM class7_test.photo_like_history WHERE owner_hash=target_raw;
 END IF;
 UPDATE class7_test.account_owner_links SET canonical_owner_hash=new_group WHERE canonical_owner_hash=old_group AND owner_hash<>target_raw;
 DELETE FROM class7_test.account_owner_links WHERE owner_hash=target_raw;
 RETURN jsonb_build_object('retainedPhotos',photo_count,'retainedComments',comment_count);
END $$;
REVOKE ALL ON FUNCTION class7_test.unlink_account(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.unlink_account(text,text,text) TO service_role;

-- Private, server-managed likes. Account links define one voting identity.
CREATE TABLE IF NOT EXISTS class7_test.photo_likes (
 photo_id text NOT NULL REFERENCES class7_test.photos(id) ON DELETE CASCADE,
 owner_hash text NOT NULL REFERENCES class7_test.accounts(owner_hash),
 created_at text NOT NULL,
 PRIMARY KEY(photo_id,owner_hash)
);
CREATE INDEX IF NOT EXISTS photo_likes_owner ON class7_test.photo_likes(owner_hash);
REVOKE ALL ON TABLE class7_test.photo_likes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON class7_test.photo_likes TO service_role;
CREATE OR REPLACE FUNCTION class7_test.set_photo_like(account_key text,photo_key text,should_like boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE raw_owner text; group_owner text; likes bigint; mine boolean;
BEGIN
 -- Link/unlink takes SHARE ROW EXCLUSIVE; votes see one stable account group.
 LOCK TABLE class7_test.account_owner_links IN SHARE MODE;
 IF to_regprocedure('class7_test.contest_tick()') IS NOT NULL THEN PERFORM class7_test.contest_tick(); END IF;
 SELECT owner_hash INTO raw_owner FROM class7_test.accounts WHERE id=account_key;
 IF raw_owner IS NULL THEN RETURN jsonb_build_object('unauthorized',true); END IF;
 PERFORM id FROM class7_test.photos WHERE id=photo_key FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('missing',true); END IF;
 group_owner:=class7_test.canonical_owner(raw_owner);
 PERFORM pg_advisory_xact_lock(hashtextextended(photo_key||'|'||group_owner,0));
 IF should_like THEN
  INSERT INTO class7_test.photo_likes(photo_id,owner_hash,created_at)
  SELECT photo_key,raw_owner,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  WHERE NOT EXISTS(SELECT 1 FROM class7_test.photo_likes WHERE photo_id=photo_key AND class7_test.canonical_owner(owner_hash)=group_owner)
  ON CONFLICT(photo_id,owner_hash) DO NOTHING;
 ELSE
  DELETE FROM class7_test.photo_likes WHERE photo_id=photo_key AND class7_test.canonical_owner(owner_hash)=group_owner;
 END IF;
 SELECT count(DISTINCT class7_test.canonical_owner(owner_hash)),COALESCE(bool_or(class7_test.canonical_owner(owner_hash)=group_owner),false)
 INTO likes,mine FROM class7_test.photo_likes WHERE photo_id=photo_key;
 RETURN jsonb_build_object('likeCount',likes,'liked',mine);
END $$;
REVOKE ALL ON FUNCTION class7_test.set_photo_like(text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.set_photo_like(text,text,boolean) TO service_role;

-- Weekly contest schema integration
-- Private contest records. Existing likes keep their original total and state.
CREATE OR REPLACE FUNCTION class7_test.contest_week_start(at_time timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
 SELECT date_trunc('week',at_time AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
$$;
CREATE TABLE IF NOT EXISTS class7_test.contest_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 launched_at timestamptz NOT NULL,
 open_week timestamptz NOT NULL
);
INSERT INTO class7_test.contest_settings(singleton,launched_at,open_week)
VALUES(true,clock_timestamp(),class7_test.contest_week_start(clock_timestamp())) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS class7_test.photo_like_history (
 photo_id text NOT NULL REFERENCES class7_test.photos(id) ON DELETE CASCADE,
 owner_hash text NOT NULL REFERENCES class7_test.accounts(owner_hash) ON DELETE CASCADE,
 first_liked_at timestamptz NOT NULL,
 PRIMARY KEY(photo_id,owner_hash)
);
CREATE INDEX IF NOT EXISTS photo_like_history_owner ON class7_test.photo_like_history(owner_hash);
-- Existing active likes are remembered but excluded from the inaugural contest.
INSERT INTO class7_test.photo_like_history(photo_id,owner_hash,first_liked_at)
SELECT photo_id,owner_hash,created_at::timestamptz FROM class7_test.photo_likes
ON CONFLICT(photo_id,owner_hash) DO NOTHING;
CREATE TABLE IF NOT EXISTS class7_test.contest_weeks (
 week_start timestamptz PRIMARY KEY,
 week_end timestamptz NOT NULL,
 stats_from timestamptz NOT NULL,
 finalized_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS class7_test.contest_results (
 week_start timestamptz NOT NULL REFERENCES class7_test.contest_weeks(week_start) ON DELETE CASCADE,
 photo_id text NOT NULL REFERENCES class7_test.photos(id) ON DELETE CASCADE,
 weekly_votes bigint NOT NULL CHECK(weekly_votes>0),
 total_votes bigint NOT NULL,
 rank bigint NOT NULL,
 PRIMARY KEY(week_start,photo_id),UNIQUE(week_start,rank)
);
REVOKE ALL ON TABLE class7_test.contest_settings,class7_test.photo_like_history,class7_test.contest_weeks,class7_test.contest_results FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE class7_test.contest_settings,class7_test.photo_like_history,class7_test.contest_weeks,class7_test.contest_results TO service_role;

CREATE OR REPLACE FUNCTION class7_test.contest_scores(stats_from timestamptz,stats_until timestamptz)
RETURNS TABLE(photo_id text,weekly_votes bigint,total_votes bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
 WITH first_votes AS (
  SELECT h.photo_id,class7_test.canonical_owner(h.owner_hash) AS voter,min(h.first_liked_at) AS first_at
  FROM class7_test.photo_like_history h GROUP BY h.photo_id,class7_test.canonical_owner(h.owner_hash)
 ),active_votes AS (
  SELECT l.photo_id,class7_test.canonical_owner(l.owner_hash) AS voter
  FROM class7_test.photo_likes l GROUP BY l.photo_id,class7_test.canonical_owner(l.owner_hash)
 )
 SELECT a.photo_id,count(*) FILTER(WHERE f.first_at>=stats_from AND f.first_at<stats_until),count(*)
 FROM active_votes a JOIN first_votes f ON f.photo_id=a.photo_id AND f.voter=a.voter GROUP BY a.photo_id
$$;

-- Lazy finalization happens before every vote/link/delete mutation, and on
-- contest reads. No scheduler, extra cloud function or recurring browser job.
CREATE OR REPLACE FUNCTION class7_test.contest_tick() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE settings class7_test.contest_settings%ROWTYPE; current_week timestamptz; now_at timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(72407180371001);
 now_at:=clock_timestamp();PERFORM set_config('class7.contest_now',now_at::text,true);
 current_week:=class7_test.contest_week_start(now_at);
 SELECT * INTO settings FROM class7_test.contest_settings WHERE singleton;
 IF current_week<=settings.open_week THEN RETURN; END IF;
 INSERT INTO class7_test.contest_weeks(week_start,week_end,stats_from,finalized_at)
 SELECT w,w+interval '7 days',GREATEST(w,settings.launched_at),now_at
 FROM generate_series(settings.open_week,current_week-interval '7 days',interval '7 days') w ON CONFLICT DO NOTHING;
 -- No mutations occurred between the last open period and this tick, so any
 -- skipped later weeks have no newly received votes and correctly stay empty.
 INSERT INTO class7_test.contest_results(week_start,photo_id,weekly_votes,total_votes,rank)
 SELECT settings.open_week,s.photo_id,s.weekly_votes,s.total_votes,
  row_number() OVER(ORDER BY s.weekly_votes DESC,s.total_votes DESC,p.created_at DESC,p.id DESC)
 FROM class7_test.contest_scores(GREATEST(settings.open_week,settings.launched_at),settings.open_week+interval '7 days') s
 JOIN class7_test.photos p ON p.id=s.photo_id WHERE s.weekly_votes>0 ON CONFLICT DO NOTHING;
 UPDATE class7_test.contest_settings SET open_week=current_week WHERE singleton;
END $$;

CREATE OR REPLACE FUNCTION class7_test.contest_before_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
BEGIN PERFORM class7_test.contest_tick();RETURN NULL;END $$;
DROP TRIGGER IF EXISTS contest_likes_boundary ON class7_test.photo_likes;
CREATE TRIGGER contest_likes_boundary BEFORE INSERT OR UPDATE OR DELETE ON class7_test.photo_likes
FOR EACH STATEMENT EXECUTE FUNCTION class7_test.contest_before_change();
DROP TRIGGER IF EXISTS contest_links_boundary ON class7_test.account_owner_links;
CREATE TRIGGER contest_links_boundary BEFORE INSERT OR UPDATE OR DELETE ON class7_test.account_owner_links
FOR EACH STATEMENT EXECUTE FUNCTION class7_test.contest_before_change();
DROP TRIGGER IF EXISTS contest_delete_boundary ON class7_test.photos;
CREATE TRIGGER contest_delete_boundary BEFORE DELETE ON class7_test.photos
FOR EACH STATEMENT EXECUTE FUNCTION class7_test.contest_before_change();

CREATE OR REPLACE FUNCTION class7_test.remember_photo_like() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE earliest timestamptz;
BEGIN
 SELECT min(first_liked_at) INTO earliest FROM class7_test.photo_like_history
 WHERE photo_id=NEW.photo_id AND class7_test.canonical_owner(owner_hash)=class7_test.canonical_owner(NEW.owner_hash);
 INSERT INTO class7_test.photo_like_history(photo_id,owner_hash,first_liked_at)
 VALUES(NEW.photo_id,NEW.owner_hash,COALESCE(earliest,NULLIF(current_setting('class7.contest_now',true),'')::timestamptz,clock_timestamp()))
 ON CONFLICT(photo_id,owner_hash) DO UPDATE SET first_liked_at=LEAST(class7_test.photo_like_history.first_liked_at,excluded.first_liked_at);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contest_remember_like ON class7_test.photo_likes;
CREATE TRIGGER contest_remember_like BEFORE INSERT ON class7_test.photo_likes
FOR EACH ROW EXECUTE FUNCTION class7_test.remember_photo_like();

CREATE OR REPLACE FUNCTION class7_test.weekly_contest_page(period_name text,page_cursor jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE settings class7_test.contest_settings%ROWTYPE; current_week timestamptz; chosen_week timestamptz;
 stats_from timestamptz; closed boolean; available boolean; found jsonb; n bigint; page_offset bigint:=0;
BEGIN
 IF period_name NOT IN('current','previous') THEN RAISE EXCEPTION 'invalid contest period'; END IF;
 PERFORM class7_test.contest_tick();
 SELECT * INTO settings FROM class7_test.contest_settings WHERE singleton;
 current_week:=class7_test.contest_week_start(current_setting('class7.contest_now')::timestamptz);
 chosen_week:=current_week-CASE WHEN period_name='previous' THEN interval '7 days' ELSE interval '0 days' END;
 closed:=period_name='previous';available:=chosen_week>=class7_test.contest_week_start(settings.launched_at);
 stats_from:=GREATEST(chosen_week,settings.launched_at);
 IF page_cursor IS NOT NULL AND page_cursor<>'null'::jsonb THEN
  IF page_cursor->>'week' IS DISTINCT FROM chosen_week::text OR NOT COALESCE((page_cursor->>'rank')~'^[0-9]{1,9}$',false) THEN RETURN jsonb_build_object('stale',true);END IF;
  page_offset:=(page_cursor->>'rank')::bigint;
 END IF;
 IF NOT available THEN found:='[]'::jsonb;n:=0;
 ELSIF closed THEN
  SELECT count(*) INTO n FROM class7_test.contest_results WHERE week_start=chosen_week;
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.rank),'[]'::jsonb) INTO found FROM(
   SELECT photo_id,weekly_votes,total_votes,rank FROM class7_test.contest_results
   WHERE week_start=chosen_week AND rank>page_offset ORDER BY rank LIMIT 101
  ) r;
 ELSE
  WITH scores AS (
   SELECT s.*,row_number() OVER(ORDER BY s.weekly_votes DESC,s.total_votes DESC,p.created_at DESC,p.id DESC) AS rank
   FROM class7_test.contest_scores(stats_from,chosen_week+interval '7 days') s JOIN class7_test.photos p ON p.id=s.photo_id WHERE s.weekly_votes>0
  ),page AS (SELECT * FROM scores WHERE rank>page_offset ORDER BY rank LIMIT 101)
  SELECT (SELECT count(*) FROM scores),COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY rank) FROM page),'[]'::jsonb) INTO n,found;
 END IF;
 RETURN jsonb_build_object('week',chosen_week::text,'start',chosen_week,'end',chosen_week+interval '7 days',
  'statsFrom',stats_from,'launchedAt',settings.launched_at,'closed',closed,'available',available,
  'hasPrevious',current_week-interval '7 days'>=class7_test.contest_week_start(settings.launched_at),
  'entries',found,'total',n);
END $$;
REVOKE ALL ON FUNCTION class7_test.contest_week_start(timestamptz),class7_test.contest_scores(timestamptz,timestamptz),class7_test.contest_tick(),class7_test.contest_before_change(),class7_test.remember_photo_like(),class7_test.weekly_contest_page(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.contest_week_start(timestamptz),class7_test.contest_scores(timestamptz,timestamptz),class7_test.contest_tick(),class7_test.contest_before_change(),class7_test.remember_photo_like(),class7_test.weekly_contest_page(text,jsonb) TO service_role;

-- Comment interactions schema integration
-- Replies and private comment votes in the existing free PostgreSQL database.
ALTER TABLE class7_test.comments ADD COLUMN IF NOT EXISTS reply_to_id text;
ALTER TABLE class7_test.comments ADD COLUMN IF NOT EXISTS reply_to_author text;
ALTER TABLE class7_test.comments ADD COLUMN IF NOT EXISTS author_username text;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='comments_reply_to_fk' AND conrelid='class7_test.comments'::regclass) THEN
  ALTER TABLE class7_test.comments ADD CONSTRAINT comments_reply_to_fk FOREIGN KEY(reply_to_id) REFERENCES class7_test.comments(id) ON DELETE SET NULL;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS comments_reply_to_created ON class7_test.comments(reply_to_id,created_at);
CREATE TABLE IF NOT EXISTS class7_test.comment_likes (
 comment_id text NOT NULL REFERENCES class7_test.comments(id) ON DELETE CASCADE,
 owner_hash text NOT NULL REFERENCES class7_test.accounts(owner_hash),
 created_at text NOT NULL,
 PRIMARY KEY(comment_id,owner_hash)
);
CREATE INDEX IF NOT EXISTS comment_likes_owner ON class7_test.comment_likes(owner_hash);
CREATE TABLE IF NOT EXISTS class7_test.reply_inbox_seen (
 account_id text PRIMARY KEY REFERENCES class7_test.accounts(id) ON DELETE CASCADE,
 seen_at text NOT NULL
);
REVOKE ALL ON TABLE class7_test.comment_likes,class7_test.reply_inbox_seen FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE class7_test.comment_likes,class7_test.reply_inbox_seen TO service_role;

CREATE OR REPLACE FUNCTION class7_test.set_comment_like(account_key text,comment_key text,should_like boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE raw_owner text; group_owner text; likes bigint; mine boolean;
BEGIN
 LOCK TABLE class7_test.account_owner_links IN SHARE MODE;
 SELECT owner_hash INTO raw_owner FROM class7_test.accounts WHERE id=account_key;
 IF raw_owner IS NULL THEN RETURN jsonb_build_object('unauthorized',true); END IF;
 PERFORM id FROM class7_test.comments WHERE id=comment_key FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('missing',true); END IF;
 group_owner:=class7_test.canonical_owner(raw_owner);
 PERFORM pg_advisory_xact_lock(hashtextextended('comment|'||comment_key||'|'||group_owner,0));
 IF should_like THEN
  INSERT INTO class7_test.comment_likes(comment_id,owner_hash,created_at)
  SELECT comment_key,raw_owner,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  WHERE NOT EXISTS(SELECT 1 FROM class7_test.comment_likes WHERE comment_id=comment_key AND class7_test.canonical_owner(owner_hash)=group_owner)
  ON CONFLICT(comment_id,owner_hash) DO NOTHING;
 ELSE
  DELETE FROM class7_test.comment_likes WHERE comment_id=comment_key AND class7_test.canonical_owner(owner_hash)=group_owner;
 END IF;
 SELECT count(DISTINCT class7_test.canonical_owner(owner_hash)),COALESCE(bool_or(class7_test.canonical_owner(owner_hash)=group_owner),false)
 INTO likes,mine FROM class7_test.comment_likes WHERE comment_id=comment_key;
 RETURN jsonb_build_object('likeCount',likes,'liked',mine);
END $$;
REVOKE ALL ON FUNCTION class7_test.set_comment_like(text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.set_comment_like(text,text,boolean) TO service_role;

-- Weekly vote renewal integration
-- Preserve every existing vote and frozen result. New weeks have a fresh vote.
-- Run inside a transaction after weekly-contest.sql has been installed.
SELECT class7_test.contest_tick();
ALTER TABLE class7_test.photo_likes ADD COLUMN IF NOT EXISTS voted_at timestamptz;
ALTER TABLE class7_test.photo_likes ADD COLUMN IF NOT EXISTS week_start timestamptz;
UPDATE class7_test.photo_likes l SET voted_at=COALESCE((
 SELECT min(h.first_liked_at) FROM class7_test.photo_like_history h
 WHERE h.photo_id=l.photo_id AND class7_test.canonical_owner(h.owner_hash)=class7_test.canonical_owner(l.owner_hash)
),l.created_at::timestamptz) WHERE l.voted_at IS NULL;
UPDATE class7_test.photo_likes SET week_start=class7_test.contest_week_start(voted_at) WHERE week_start IS NULL;
ALTER TABLE class7_test.photo_likes ALTER COLUMN voted_at SET NOT NULL;
ALTER TABLE class7_test.photo_likes ALTER COLUMN week_start SET NOT NULL;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='class7_test.photo_likes'::regclass AND contype='p' AND cardinality(conkey)=2) THEN
  ALTER TABLE class7_test.photo_likes DROP CONSTRAINT photo_likes_pkey;
  ALTER TABLE class7_test.photo_likes ADD PRIMARY KEY(photo_id,owner_hash,week_start);
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS photo_likes_week_photo ON class7_test.photo_likes(week_start,photo_id);

-- One vote is linearized at its first tick while holding the contest lock.
-- Do not move its clock again in the statement trigger across Monday 00:00.
CREATE OR REPLACE FUNCTION class7_test.contest_before_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
BEGIN
 IF TG_TABLE_NAME='photo_likes' AND current_setting('class7.photo_vote_locked',true)='1' THEN RETURN NULL; END IF;
 PERFORM class7_test.contest_tick();RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION class7_test.contest_scores(stats_from timestamptz,stats_until timestamptz)
RETURNS TABLE(photo_id text,weekly_votes bigint,total_votes bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
 SELECT l.photo_id,
  count(DISTINCT class7_test.canonical_owner(l.owner_hash)) FILTER(WHERE l.week_start=class7_test.contest_week_start(stats_from) AND l.voted_at>=stats_from AND l.voted_at<stats_until),
  count(DISTINCT (class7_test.canonical_owner(l.owner_hash),l.week_start))
 FROM class7_test.photo_likes l GROUP BY l.photo_id
$$;

CREATE OR REPLACE FUNCTION class7_test.set_photo_like(account_key text,photo_key text,should_like boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE raw_owner text; group_owner text; likes bigint; mine boolean; now_at timestamptz; this_week timestamptz;
BEGIN
 LOCK TABLE class7_test.account_owner_links IN SHARE MODE;
 PERFORM class7_test.contest_tick();
 now_at:=current_setting('class7.contest_now')::timestamptz;this_week:=class7_test.contest_week_start(now_at);
 SELECT owner_hash INTO raw_owner FROM class7_test.accounts WHERE id=account_key;
 IF raw_owner IS NULL THEN RETURN jsonb_build_object('unauthorized',true); END IF;
 PERFORM id FROM class7_test.photos WHERE id=photo_key FOR KEY SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('missing',true); END IF;
 group_owner:=class7_test.canonical_owner(raw_owner);
 PERFORM pg_advisory_xact_lock(hashtextextended(photo_key||'|'||group_owner,0));
 PERFORM set_config('class7.photo_vote_locked','1',true);
 IF should_like THEN
  INSERT INTO class7_test.photo_likes(photo_id,owner_hash,created_at,voted_at,week_start)
  SELECT photo_key,raw_owner,to_char(now_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),now_at,this_week
  WHERE NOT EXISTS(SELECT 1 FROM class7_test.photo_likes WHERE photo_id=photo_key AND week_start=this_week AND class7_test.canonical_owner(owner_hash)=group_owner)
  ON CONFLICT(photo_id,owner_hash,week_start) DO NOTHING;
 ELSE
  DELETE FROM class7_test.photo_likes WHERE photo_id=photo_key AND week_start=this_week AND class7_test.canonical_owner(owner_hash)=group_owner;
 END IF;
 PERFORM set_config('class7.photo_vote_locked','',true);
 SELECT count(DISTINCT (class7_test.canonical_owner(owner_hash),week_start)),
  COALESCE(bool_or(week_start=this_week AND class7_test.canonical_owner(owner_hash)=group_owner),false)
 INTO likes,mine FROM class7_test.photo_likes WHERE photo_id=photo_key;
 RETURN jsonb_build_object('likeCount',likes,'liked',mine,'voteWeek',this_week);
END $$;
REVOKE ALL ON FUNCTION class7_test.contest_before_change(),class7_test.contest_scores(timestamptz,timestamptz),class7_test.set_photo_like(text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.contest_before_change(),class7_test.contest_scores(timestamptz,timestamptz),class7_test.set_photo_like(text,text,boolean) TO service_role;

-- Comment contest integration
-- Weekly comment voting and private, lazily finalized leaderboards.
ALTER TABLE class7_test.comment_likes ADD COLUMN IF NOT EXISTS voted_at timestamptz;
ALTER TABLE class7_test.comment_likes ADD COLUMN IF NOT EXISTS week_start timestamptz;
UPDATE class7_test.comment_likes SET voted_at=created_at::timestamptz WHERE voted_at IS NULL;
UPDATE class7_test.comment_likes SET week_start=class7_test.contest_week_start(voted_at) WHERE week_start IS NULL;
ALTER TABLE class7_test.comment_likes ALTER COLUMN voted_at SET NOT NULL;
ALTER TABLE class7_test.comment_likes ALTER COLUMN week_start SET NOT NULL;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='class7_test.comment_likes'::regclass AND contype='p' AND cardinality(conkey)=2) THEN
  ALTER TABLE class7_test.comment_likes DROP CONSTRAINT comment_likes_pkey;
  ALTER TABLE class7_test.comment_likes ADD PRIMARY KEY(comment_id,owner_hash,week_start);
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS comment_likes_week_comment ON class7_test.comment_likes(week_start,comment_id);
CREATE TABLE IF NOT EXISTS class7_test.comment_contest_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),launched_at timestamptz NOT NULL,open_week timestamptz NOT NULL);
INSERT INTO class7_test.comment_contest_settings VALUES(true,clock_timestamp(),class7_test.contest_week_start(clock_timestamp())) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS class7_test.comment_contest_weeks(week_start timestamptz PRIMARY KEY,finalized_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS class7_test.comment_contest_results(
 week_start timestamptz NOT NULL REFERENCES class7_test.comment_contest_weeks(week_start) ON DELETE CASCADE,
 comment_id text NOT NULL REFERENCES class7_test.comments(id) ON DELETE CASCADE,
 weekly_votes bigint NOT NULL CHECK(weekly_votes>0),total_votes bigint NOT NULL,rank bigint NOT NULL,
 PRIMARY KEY(week_start,comment_id),UNIQUE(week_start,rank)
);
REVOKE ALL ON TABLE class7_test.comment_contest_settings,class7_test.comment_contest_weeks,class7_test.comment_contest_results FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE class7_test.comment_contest_settings,class7_test.comment_contest_weeks,class7_test.comment_contest_results TO service_role;

CREATE OR REPLACE FUNCTION class7_test.comment_contest_scores(chosen_week timestamptz)
RETURNS TABLE(comment_id text,weekly_votes bigint,total_votes bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
 SELECT l.comment_id,count(DISTINCT class7_test.canonical_owner(l.owner_hash)) FILTER(WHERE l.week_start=chosen_week),
 count(DISTINCT (class7_test.canonical_owner(l.owner_hash),l.week_start)) FROM class7_test.comment_likes l GROUP BY l.comment_id
$$;

CREATE OR REPLACE FUNCTION class7_test.comment_contest_tick() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE settings class7_test.comment_contest_settings%ROWTYPE; now_at timestamptz; this_week timestamptz;
BEGIN
 -- Same lock as photo contests keeps account changes and both votes ordered.
 PERFORM pg_advisory_xact_lock(72407180371001);
 now_at:=clock_timestamp();PERFORM set_config('class7.comment_contest_now',now_at::text,true);
 this_week:=class7_test.contest_week_start(now_at);
 SELECT * INTO settings FROM class7_test.comment_contest_settings WHERE singleton;
 IF this_week<=settings.open_week THEN RETURN; END IF;
 INSERT INTO class7_test.comment_contest_weeks(week_start,finalized_at)
 SELECT w,now_at FROM generate_series(settings.open_week,this_week-interval '7 days',interval '7 days') w ON CONFLICT DO NOTHING;
 INSERT INTO class7_test.comment_contest_results(week_start,comment_id,weekly_votes,total_votes,rank)
 SELECT settings.open_week,s.comment_id,s.weekly_votes,s.total_votes,row_number() OVER(ORDER BY s.weekly_votes DESC,s.total_votes DESC,c.created_at DESC,c.id DESC)
 FROM class7_test.comment_contest_scores(settings.open_week) s JOIN class7_test.comments c ON c.id=s.comment_id JOIN class7_test.photos p ON p.id=c.photo_id
 WHERE s.weekly_votes>0 ON CONFLICT DO NOTHING;
 UPDATE class7_test.comment_contest_settings SET open_week=this_week WHERE singleton;
END $$;

CREATE OR REPLACE FUNCTION class7_test.comment_contest_before_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
BEGIN
 IF TG_TABLE_NAME='comment_likes' AND current_setting('class7.comment_vote_locked',true)='1' THEN RETURN NULL; END IF;
 PERFORM class7_test.comment_contest_tick();RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS comment_contest_vote_boundary ON class7_test.comment_likes;
CREATE TRIGGER comment_contest_vote_boundary BEFORE INSERT OR UPDATE OR DELETE ON class7_test.comment_likes FOR EACH STATEMENT EXECUTE FUNCTION class7_test.comment_contest_before_change();
DROP TRIGGER IF EXISTS comment_contest_link_boundary ON class7_test.account_owner_links;
CREATE TRIGGER comment_contest_link_boundary BEFORE INSERT OR UPDATE OR DELETE ON class7_test.account_owner_links FOR EACH STATEMENT EXECUTE FUNCTION class7_test.comment_contest_before_change();
DROP TRIGGER IF EXISTS comment_contest_delete_boundary ON class7_test.comments;
CREATE TRIGGER comment_contest_delete_boundary BEFORE DELETE ON class7_test.comments FOR EACH STATEMENT EXECUTE FUNCTION class7_test.comment_contest_before_change();
DROP TRIGGER IF EXISTS comment_contest_photo_boundary ON class7_test.photos;
CREATE TRIGGER comment_contest_photo_boundary BEFORE DELETE ON class7_test.photos FOR EACH STATEMENT EXECUTE FUNCTION class7_test.comment_contest_before_change();

CREATE OR REPLACE FUNCTION class7_test.set_comment_like(account_key text,comment_key text,should_like boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE raw_owner text; group_owner text; likes bigint; weekly bigint; mine boolean; now_at timestamptz; this_week timestamptz;
BEGIN
 LOCK TABLE class7_test.account_owner_links IN SHARE MODE;
 PERFORM class7_test.comment_contest_tick();now_at:=current_setting('class7.comment_contest_now')::timestamptz;this_week:=class7_test.contest_week_start(now_at);
 SELECT owner_hash INTO raw_owner FROM class7_test.accounts WHERE id=account_key;
 IF raw_owner IS NULL THEN RETURN jsonb_build_object('unauthorized',true); END IF;
 PERFORM c.id FROM class7_test.comments c JOIN class7_test.photos p ON p.id=c.photo_id WHERE c.id=comment_key FOR KEY SHARE OF c;
 IF NOT FOUND THEN RETURN jsonb_build_object('missing',true); END IF;
 group_owner:=class7_test.canonical_owner(raw_owner);PERFORM pg_advisory_xact_lock(hashtextextended('comment|'||comment_key||'|'||group_owner,0));
 PERFORM set_config('class7.comment_vote_locked','1',true);
 IF should_like THEN
  INSERT INTO class7_test.comment_likes(comment_id,owner_hash,created_at,voted_at,week_start)
  SELECT comment_key,raw_owner,to_char(now_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),now_at,this_week
  WHERE NOT EXISTS(SELECT 1 FROM class7_test.comment_likes WHERE comment_id=comment_key AND week_start=this_week AND class7_test.canonical_owner(owner_hash)=group_owner)
  ON CONFLICT(comment_id,owner_hash,week_start) DO NOTHING;
 ELSE
  DELETE FROM class7_test.comment_likes WHERE comment_id=comment_key AND week_start=this_week AND class7_test.canonical_owner(owner_hash)=group_owner;
 END IF;
 PERFORM set_config('class7.comment_vote_locked','',true);
 SELECT count(DISTINCT (class7_test.canonical_owner(owner_hash),week_start)),count(DISTINCT class7_test.canonical_owner(owner_hash)) FILTER(WHERE week_start=this_week),
 COALESCE(bool_or(week_start=this_week AND class7_test.canonical_owner(owner_hash)=group_owner),false)
 INTO likes,weekly,mine FROM class7_test.comment_likes WHERE comment_id=comment_key;
 RETURN jsonb_build_object('likeCount',likes,'weeklyCount',weekly,'liked',mine,'voteWeek',this_week);
END $$;

CREATE OR REPLACE FUNCTION class7_test.comment_contest_page(period_name text,page_cursor jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE settings class7_test.comment_contest_settings%ROWTYPE; this_week timestamptz; chosen_week timestamptz; available boolean; found jsonb; n bigint; page_offset bigint:=0;
BEGIN
 IF period_name NOT IN('current','previous','total') THEN RAISE EXCEPTION 'invalid comment contest period'; END IF;
 PERFORM class7_test.comment_contest_tick();SELECT * INTO settings FROM class7_test.comment_contest_settings WHERE singleton;
 this_week:=class7_test.contest_week_start(current_setting('class7.comment_contest_now')::timestamptz);
 chosen_week:=this_week-CASE WHEN period_name='previous' THEN interval '7 days' ELSE interval '0 days' END;
 available:=period_name='total' OR chosen_week>=class7_test.contest_week_start(settings.launched_at);
 IF page_cursor IS NOT NULL AND page_cursor<>'null'::jsonb THEN
  IF page_cursor->>'week' IS DISTINCT FROM chosen_week::text OR page_cursor->>'period' IS DISTINCT FROM period_name OR NOT COALESCE((page_cursor->>'rank')~'^[0-9]{1,9}$',false) THEN RETURN jsonb_build_object('stale',true); END IF;
  page_offset:=(page_cursor->>'rank')::bigint;
 END IF;
 IF NOT available THEN found:='[]'::jsonb;n:=0;
 ELSIF period_name='previous' THEN
  SELECT count(*) INTO n FROM class7_test.comment_contest_results r JOIN class7_test.comments c ON c.id=r.comment_id JOIN class7_test.photos p ON p.id=c.photo_id WHERE r.week_start=chosen_week;
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.rank),'[]'::jsonb) INTO found FROM(
   SELECT r.comment_id,r.weekly_votes,r.total_votes,r.rank FROM class7_test.comment_contest_results r JOIN class7_test.comments c ON c.id=r.comment_id JOIN class7_test.photos p ON p.id=c.photo_id
   WHERE r.week_start=chosen_week AND r.rank>page_offset ORDER BY r.rank LIMIT 51
  ) r;
 ELSE
  WITH scores AS (
   SELECT s.*,row_number() OVER(ORDER BY CASE WHEN period_name='total' THEN s.total_votes ELSE s.weekly_votes END DESC,CASE WHEN period_name='total' THEN 0 ELSE s.total_votes END DESC,c.created_at DESC,c.id DESC) AS rank
   FROM class7_test.comment_contest_scores(chosen_week) s JOIN class7_test.comments c ON c.id=s.comment_id JOIN class7_test.photos p ON p.id=c.photo_id
   WHERE CASE WHEN period_name='total' THEN s.total_votes ELSE s.weekly_votes END>0
  ),page AS(SELECT * FROM scores WHERE rank>page_offset ORDER BY rank LIMIT 51)
  SELECT (SELECT count(*) FROM scores),COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY rank) FROM page),'[]'::jsonb) INTO n,found;
 END IF;
 RETURN jsonb_build_object('week',chosen_week::text,'start',chosen_week,'end',chosen_week+interval '7 days','period',period_name,'closed',period_name='previous','available',available,
 'hasPrevious',this_week-interval '7 days'>=class7_test.contest_week_start(settings.launched_at),'entries',found,'total',n);
END $$;
REVOKE ALL ON FUNCTION class7_test.comment_contest_scores(timestamptz),class7_test.comment_contest_tick(),class7_test.comment_contest_before_change(),class7_test.set_comment_like(text,text,boolean),class7_test.comment_contest_page(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.comment_contest_scores(timestamptz),class7_test.comment_contest_tick(),class7_test.comment_contest_before_change(),class7_test.set_comment_like(text,text,boolean),class7_test.comment_contest_page(text,jsonb) TO service_role;

-- Checkin points integration
-- 签到 + 积分系统 · 数据库结构
-- 新环境：将本文件内容追加至 schema.sql 末尾
-- 已有环境：执行 node scripts/apply-checkin-points.cjs

-- 1. 分值配置：调分只改这张表，无需改代码、无需重新部署
CREATE TABLE IF NOT EXISTS class7_test.points_config(
 reason text PRIMARY KEY,
 points integer NOT NULL,
 daily_cap integer                        -- NULL 表示无上限
);
INSERT INTO class7_test.points_config(reason,points,daily_cap) VALUES
 ('checkin',10,NULL),
 ('checkin_streak',30,NULL),
 ('comment',5,50),
 ('photo_like',2,NULL),
 ('comment_like',2,NULL)
ON CONFLICT(reason) DO NOTHING;

-- 2. 积分流水：UNIQUE 保证幂等去重；points 记录当时分值，配置日后调整不影响历史
CREATE TABLE IF NOT EXISTS class7_test.points_ledger(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id text NOT NULL REFERENCES class7_test.accounts(id) ON DELETE CASCADE,
 points integer NOT NULL,
 reason text NOT NULL,
 ref_id text NOT NULL,              -- 去重键：签到用日期文本；评论用评论id；
                                    -- 点赞用 'photo:<id>' / 'comment:<id>'
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,reason,ref_id)
);
CREATE INDEX IF NOT EXISTS points_ledger_account_reason_date
 ON class7_test.points_ledger(account_id,reason,created_at);

-- 3. 积分总数 + 连续签到（冗余表，读得快）
CREATE TABLE IF NOT EXISTS class7_test.user_points(
 account_id text PRIMARY KEY REFERENCES class7_test.accounts(id) ON DELETE CASCADE,
 total integer NOT NULL DEFAULT 0,
 streak integer NOT NULL DEFAULT 0,
 last_checkin_date date,
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. 权限（照抄 photo-likes.sql）
REVOKE ALL ON TABLE class7_test.points_config FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE class7_test.points_config TO service_role;
REVOKE ALL ON TABLE class7_test.points_ledger FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON TABLE class7_test.points_ledger TO service_role;
REVOKE ALL ON TABLE class7_test.user_points FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE class7_test.user_points TO service_role;

-- 5. 通用加分：查配置、查每日上限、防重复；并发安全
CREATE OR REPLACE FUNCTION class7_test.award_points(
 p_account_id text,p_reason text,p_ref_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE
 cfg_points integer; cfg_cap integer; today_points integer;
 new_id uuid; new_total integer;
BEGIN
 -- 串行化同一账号同一 reason 的加分，防并发超发
 PERFORM pg_advisory_xact_lock(hashtextextended(p_account_id||'|'||p_reason,0));

 SELECT points,daily_cap INTO cfg_points,cfg_cap
 FROM class7_test.points_config WHERE reason=p_reason;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('awarded',false,'error','unknown_reason');
 END IF;

 -- 每日上限检查
 IF cfg_cap IS NOT NULL THEN
  SELECT COALESCE(sum(points),0) INTO today_points
  FROM class7_test.points_ledger
  WHERE account_id=p_account_id AND reason=p_reason
   AND (created_at AT TIME ZONE 'Asia/Shanghai')::date
     = (now() AT TIME ZONE 'Asia/Shanghai')::date;
  IF today_points+cfg_points>cfg_cap THEN
   SELECT total INTO new_total FROM class7_test.user_points WHERE account_id=p_account_id;
   RETURN jsonb_build_object('awarded',false,'capped',true,'total',COALESCE(new_total,0));
  END IF;
 END IF;

 -- 原子去重：并发双击时一方成功、一方返回 duplicate，不抛异常
 INSERT INTO class7_test.points_ledger(account_id,points,reason,ref_id)
 VALUES(p_account_id,cfg_points,p_reason,p_ref_id)
 ON CONFLICT(account_id,reason,ref_id) DO NOTHING
 RETURNING id INTO new_id;
 IF new_id IS NULL THEN
  SELECT total INTO new_total FROM class7_test.user_points WHERE account_id=p_account_id;
  RETURN jsonb_build_object('awarded',false,'duplicate',true,'total',COALESCE(new_total,0));
 END IF;

 -- UPSERT 总分并用 RETURNING 直接拿到新 total，省掉额外 SELECT
 INSERT INTO class7_test.user_points(account_id,total,updated_at)
 VALUES(p_account_id,cfg_points,now())
 ON CONFLICT(account_id) DO UPDATE
 SET total=class7_test.user_points.total+EXCLUDED.total,updated_at=now()
 RETURNING class7_test.user_points.total INTO new_total;

 RETURN jsonb_build_object('awarded',true,'points',cfg_points,'total',new_total);
END $$;

-- 6. 每日签到：幂等 + 连续天数 + 满 7 天奖励
CREATE OR REPLACE FUNCTION class7_test.do_checkin(p_account_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE
 today date:=(now() AT TIME ZONE 'Asia/Shanghai')::date;
 new_streak integer; r jsonb; streak_r jsonb; cur_total integer;
BEGIN
 r:=class7_test.award_points(p_account_id,'checkin',today::text);
 IF NOT (r->>'awarded')::boolean THEN
  SELECT total,streak INTO cur_total,new_streak
  FROM class7_test.user_points WHERE account_id=p_account_id;
  RETURN jsonb_build_object('checkedIn',true,'duplicate',true,
   'streak',COALESCE(new_streak,0),'pointsAwarded',0,'total',COALESCE(cur_total,0));
 END IF;

 SELECT CASE WHEN last_checkin_date=today-1 THEN streak+1 ELSE 1 END
 INTO new_streak FROM class7_test.user_points WHERE account_id=p_account_id;
 new_streak:=COALESCE(new_streak,1);

 IF new_streak%7=0 THEN
  streak_r:=class7_test.award_points(p_account_id,'checkin_streak','streak:'||today::text);
 END IF;

 UPDATE class7_test.user_points
 SET streak=new_streak,last_checkin_date=today,updated_at=now()
 WHERE account_id=p_account_id;

 SELECT total INTO cur_total FROM class7_test.user_points WHERE account_id=p_account_id;
 RETURN jsonb_build_object('checkedIn',true,'duplicate',false,'streak',new_streak,
  'pointsAwarded',(r->>'points')::int+COALESCE((streak_r->>'points')::int,0),
  'total',COALESCE(cur_total,0));
END $$;

-- 7. 函数权限
REVOKE ALL ON FUNCTION class7_test.award_points(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.award_points(text,text,text) TO service_role;
REVOKE ALL ON FUNCTION class7_test.do_checkin(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.do_checkin(text) TO service_role;

-- The original like and its reward commit or roll back together.
CREATE OR REPLACE FUNCTION class7_test.set_photo_like_with_points(account_key text,photo_key text,wanted boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE result jsonb; reward jsonb;
BEGIN
 result:=class7_test.set_photo_like(account_key,photo_key,wanted);
 IF wanted AND COALESCE((result->>'liked')::boolean,false) THEN reward:=class7_test.award_points(account_key,'photo_like','photo:'||photo_key); END IF;
 RETURN result||jsonb_build_object('points',reward);
END $$;
CREATE OR REPLACE FUNCTION class7_test.set_comment_like_with_points(account_key text,comment_key text,wanted boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE result jsonb; reward jsonb;
BEGIN
 result:=class7_test.set_comment_like(account_key,comment_key,wanted);
 IF wanted AND COALESCE((result->>'liked')::boolean,false) THEN reward:=class7_test.award_points(account_key,'comment_like','comment:'||comment_key); END IF;
 RETURN result||jsonb_build_object('points',reward);
END $$;
REVOKE ALL ON FUNCTION class7_test.set_photo_like_with_points(text,text,boolean),class7_test.set_comment_like_with_points(text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.set_photo_like_with_points(text,text,boolean),class7_test.set_comment_like_with_points(text,text,boolean) TO service_role;
