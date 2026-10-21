-- Read-time exclusions preserve archived votes and results.
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
  SELECT count(*) INTO n FROM class7_test.contest_results r JOIN class7_test.photos p ON p.id=r.photo_id WHERE week_start=chosen_week AND NOT class7_test.photo_in_vault(p.id);
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.rank),'[]'::jsonb) INTO found FROM(
   SELECT * FROM(SELECT r.photo_id,r.weekly_votes,r.total_votes,row_number() OVER(ORDER BY r.rank) AS rank FROM class7_test.contest_results r JOIN class7_test.photos p ON p.id=r.photo_id WHERE week_start=chosen_week AND NOT class7_test.photo_in_vault(p.id)) visible WHERE rank>page_offset ORDER BY rank LIMIT 101
  ) r;
 ELSE
  WITH scores AS (
   SELECT s.*,row_number() OVER(ORDER BY s.weekly_votes DESC,s.total_votes DESC,p.created_at DESC,p.id DESC) AS rank
   FROM class7_test.contest_scores(stats_from,chosen_week+interval '7 days') s JOIN class7_test.photos p ON p.id=s.photo_id WHERE s.weekly_votes>0 AND NOT class7_test.photo_in_vault(p.id)
  ),page AS (SELECT * FROM scores WHERE rank>page_offset ORDER BY rank LIMIT 101)
  SELECT (SELECT count(*) FROM scores),COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY rank) FROM page),'[]'::jsonb) INTO n,found;
 END IF;
 RETURN jsonb_build_object('week',chosen_week::text,'start',chosen_week,'end',chosen_week+interval '7 days',
  'statsFrom',stats_from,'launchedAt',settings.launched_at,'closed',closed,'available',available,
  'hasPrevious',current_week-interval '7 days'>=class7_test.contest_week_start(settings.launched_at),
  'entries',found,'total',n);
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
  SELECT count(*) INTO n FROM class7_test.comment_contest_results r JOIN class7_test.comments c ON c.id=r.comment_id JOIN class7_test.photos p ON p.id=c.photo_id WHERE r.week_start=chosen_week AND NOT class7_test.photo_in_vault(p.id);
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.rank),'[]'::jsonb) INTO found FROM(
   SELECT * FROM(SELECT r.comment_id,r.weekly_votes,r.total_votes,row_number() OVER(ORDER BY r.rank) AS rank FROM class7_test.comment_contest_results r JOIN class7_test.comments c ON c.id=r.comment_id JOIN class7_test.photos p ON p.id=c.photo_id WHERE r.week_start=chosen_week AND NOT class7_test.photo_in_vault(p.id)) visible WHERE rank>page_offset ORDER BY rank LIMIT 51
  ) r;
 ELSE
  WITH scores AS (
   SELECT s.*,row_number() OVER(ORDER BY CASE WHEN period_name='total' THEN s.total_votes ELSE s.weekly_votes END DESC,CASE WHEN period_name='total' THEN 0 ELSE s.total_votes END DESC,c.created_at DESC,c.id DESC) AS rank
   FROM class7_test.comment_contest_scores(chosen_week) s JOIN class7_test.comments c ON c.id=s.comment_id JOIN class7_test.photos p ON p.id=c.photo_id
   WHERE NOT class7_test.photo_in_vault(p.id) AND CASE WHEN period_name='total' THEN s.total_votes ELSE s.weekly_votes END>0
  ),page AS(SELECT * FROM scores WHERE rank>page_offset ORDER BY rank LIMIT 51)
  SELECT (SELECT count(*) FROM scores),COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY rank) FROM page),'[]'::jsonb) INTO n,found;
 END IF;
 RETURN jsonb_build_object('week',chosen_week::text,'start',chosen_week,'end',chosen_week+interval '7 days','period',period_name,'closed',period_name='previous','available',available,
 'hasPrevious',this_week-interval '7 days'>=class7_test.contest_week_start(settings.launched_at),'entries',found,'total',n);
END $$;
