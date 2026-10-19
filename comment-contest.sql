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
