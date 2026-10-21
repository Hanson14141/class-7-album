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
