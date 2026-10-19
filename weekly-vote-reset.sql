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
