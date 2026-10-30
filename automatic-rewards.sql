-- Install after the current card and private-contest rules. No historical prizes.
CREATE TABLE IF NOT EXISTS class7_test.weekly_reward_settings(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 first_week timestamptz NOT NULL DEFAULT class7_test.contest_week_start(clock_timestamp())
);
INSERT INTO class7_test.weekly_reward_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS class7_test.weekly_reward_periods(
 board text NOT NULL CHECK(board IN('photo','comment')),week_start timestamptz NOT NULL,
 settled_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(board,week_start)
);
CREATE TABLE IF NOT EXISTS class7_test.weekly_reward_grants(
 board text NOT NULL,week_start timestamptz NOT NULL,account_id text NOT NULL REFERENCES class7_test.accounts(id),
 owner_hash text NOT NULL,rank integer NOT NULL CHECK(rank BETWEEN 1 AND 3),content_id text NOT NULL,
 points integer NOT NULL CHECK(points=90),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(board,week_start,account_id),UNIQUE(board,week_start,owner_hash),
 FOREIGN KEY(board,week_start) REFERENCES class7_test.weekly_reward_periods(board,week_start)
);
CREATE TABLE IF NOT EXISTS class7_test.collection_reward_grants(
 account_id text NOT NULL REFERENCES class7_test.accounts(id),block_no integer NOT NULL CHECK(block_no>0),
 points integer NOT NULL CHECK(points=20),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,block_no)
);
REVOKE ALL ON class7_test.weekly_reward_settings,class7_test.weekly_reward_periods,class7_test.weekly_reward_grants,class7_test.collection_reward_grants FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON class7_test.weekly_reward_settings,class7_test.weekly_reward_periods,class7_test.weekly_reward_grants,class7_test.collection_reward_grants TO service_role;

CREATE OR REPLACE FUNCTION class7_test.award_closed_contests(p_board text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,class7_test AS $$
DECLARE period record;winner record;claimed timestamptz;entry uuid;reason_name text;
BEGIN
 IF p_board NOT IN('photo','comment') THEN RAISE EXCEPTION 'Invalid reward board'; END IF;
 PERFORM pg_advisory_xact_lock(72407180371001);
 reason_name:=CASE WHEN p_board='photo' THEN 'weekly_photo_top3' ELSE 'weekly_comment_top3' END;
 FOR period IN
  SELECT w.week_start FROM (
   SELECT week_start FROM class7_test.contest_weeks WHERE p_board='photo'
   UNION ALL SELECT week_start FROM class7_test.comment_contest_weeks WHERE p_board='comment'
  ) w CROSS JOIN class7_test.weekly_reward_settings s
  WHERE w.week_start>=s.first_week AND w.week_start<class7_test.contest_week_start(clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM class7_test.weekly_reward_periods x WHERE x.board=p_board AND x.week_start=w.week_start)
  ORDER BY w.week_start
 LOOP
  claimed:=NULL;
  INSERT INTO class7_test.weekly_reward_periods(board,week_start) VALUES(p_board,period.week_start)
   ON CONFLICT DO NOTHING RETURNING week_start INTO claimed;
  IF claimed IS NULL THEN CONTINUE; END IF;
  FOR winner IN
   WITH finalists AS (
    (SELECT p.owner_hash,r.photo_id AS content_id,row_number() OVER(ORDER BY r.rank)::integer AS rank
     FROM class7_test.contest_results r JOIN class7_test.photos p ON p.id=r.photo_id
     WHERE p_board='photo' AND r.week_start=period.week_start AND NOT class7_test.photo_is_classified(p.id)
     ORDER BY r.rank LIMIT 3)
    UNION ALL
    (SELECT c.owner_hash,r.comment_id AS content_id,row_number() OVER(ORDER BY r.rank)::integer AS rank
     FROM class7_test.comment_contest_results r JOIN class7_test.comments c ON c.id=r.comment_id JOIN class7_test.photos p ON p.id=c.photo_id
     WHERE p_board='comment' AND r.week_start=period.week_start AND NOT class7_test.photo_is_classified(p.id)
     ORDER BY r.rank LIMIT 3)
   ),people AS (
    SELECT DISTINCT ON(class7_test.canonical_owner(owner_hash)) class7_test.canonical_owner(owner_hash) AS group_owner,rank,content_id
    FROM finalists ORDER BY class7_test.canonical_owner(owner_hash),rank
   )
   SELECT a.id AS account_id,p.* FROM people p JOIN class7_test.accounts a ON a.owner_hash=p.group_owner ORDER BY a.id
  LOOP
   INSERT INTO class7_test.weekly_reward_grants(board,week_start,account_id,owner_hash,rank,content_id,points)
    VALUES(p_board,period.week_start,winner.account_id,winner.group_owner,winner.rank,winner.content_id,90);
   entry:=NULL;
   INSERT INTO class7_test.points_ledger(account_id,points,reason,ref_id)
    VALUES(winner.account_id,90,reason_name,to_char(period.week_start AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'))
    ON CONFLICT(account_id,reason,ref_id) DO NOTHING RETURNING id INTO entry;
   IF entry IS NOT NULL THEN
    INSERT INTO class7_test.user_points(account_id,total)VALUES(winner.account_id,90)
     ON CONFLICT(account_id)DO UPDATE SET total=class7_test.user_points.total+90,updated_at=now();
   END IF;
  END LOOP;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION class7_test.award_collection_rewards(p_account text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,class7_test AS $$
DECLARE blocks integer;bonus integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM class7_test.accounts WHERE id=p_account)THEN RETURN 0;END IF;
 -- The same balance row as purchases is locked first; no inverted inventory locks.
 INSERT INTO class7_test.user_points(account_id,total)VALUES(p_account,0)ON CONFLICT DO NOTHING;
 PERFORM account_id FROM class7_test.user_points WHERE account_id=p_account FOR UPDATE;
 SELECT (count(DISTINCT photo_id)/20)::integer INTO blocks FROM class7_test.mall_photo_inventory WHERE account_id=p_account;
 WITH new_blocks AS (
  INSERT INTO class7_test.collection_reward_grants(account_id,block_no,points)
   SELECT p_account,n,20 FROM generate_series(1,blocks)n ON CONFLICT DO NOTHING RETURNING block_no
 ),credited AS (
  INSERT INTO class7_test.points_ledger(account_id,points,reason,ref_id)
   SELECT p_account,20,'collection_twenty','block:'||block_no FROM new_blocks
   ON CONFLICT(account_id,reason,ref_id)DO NOTHING RETURNING points
 )SELECT COALESCE(sum(points),0)::integer INTO bonus FROM credited;
 IF bonus>0 THEN UPDATE class7_test.user_points SET total=total+bonus,updated_at=now()WHERE account_id=p_account;END IF;
 RETURN bonus;
END $$;

-- Keep the original finalizers/purchase implementations; install wrappers once.
DO $$ BEGIN
 IF to_regprocedure('class7_test.contest_tick_without_rewards()')IS NULL THEN ALTER FUNCTION class7_test.contest_tick() RENAME TO contest_tick_without_rewards;END IF;
 IF to_regprocedure('class7_test.comment_contest_tick_without_rewards()')IS NULL THEN ALTER FUNCTION class7_test.comment_contest_tick() RENAME TO comment_contest_tick_without_rewards;END IF;
 IF to_regprocedure('class7_test.draw_photos_without_rewards(text,integer,uuid,integer)')IS NULL THEN ALTER FUNCTION class7_test.draw_photos(text,integer,uuid,integer) RENAME TO draw_photos_without_rewards;END IF;
 IF to_regprocedure('class7_test.buy_mall_photo_without_rewards(text,text,date,uuid,integer)')IS NULL THEN ALTER FUNCTION class7_test.buy_mall_photo(text,text,date,uuid,integer) RENAME TO buy_mall_photo_without_rewards;END IF;
END $$;
CREATE OR REPLACE FUNCTION class7_test.contest_tick() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
BEGIN PERFORM class7_test.contest_tick_without_rewards();PERFORM class7_test.award_closed_contests('photo');END $$;
CREATE OR REPLACE FUNCTION class7_test.comment_contest_tick() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
BEGIN PERFORM class7_test.comment_contest_tick_without_rewards();PERFORM class7_test.award_closed_contests('comment');END $$;
CREATE OR REPLACE FUNCTION class7_test.draw_photos(p_account text,p_count integer,p_request uuid,p_expected_cost integer)RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE result jsonb;bonus integer;balance integer;
BEGIN
 result:=class7_test.draw_photos_without_rewards(p_account,p_count,p_request,p_expected_cost);
 IF COALESCE((result->>'ok')::boolean,false)THEN
  bonus:=class7_test.award_collection_rewards(p_account);SELECT total INTO balance FROM class7_test.user_points WHERE account_id=p_account;
  result:=result||jsonb_build_object('totalPoints',balance,'collectionReward',bonus);
 END IF;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION class7_test.buy_mall_photo(p_account text,p_photo text,p_day date,p_request uuid,p_expected_price integer)RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE result jsonb;bonus integer;balance integer;
BEGIN
 result:=class7_test.buy_mall_photo_without_rewards(p_account,p_photo,p_day,p_request,p_expected_price);
 IF COALESCE((result->>'bought')::boolean,false) OR COALESCE((result->>'alreadyOwned')::boolean,false)THEN
  bonus:=class7_test.award_collection_rewards(p_account);SELECT total INTO balance FROM class7_test.user_points WHERE account_id=p_account;
  result:=result||jsonb_build_object('total',balance,'collectionReward',bonus);
 END IF;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION class7_test.reward_points_state(p_account text)RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE state jsonb;
BEGIN
 PERFORM class7_test.contest_tick();PERFORM class7_test.comment_contest_tick();PERFORM class7_test.award_collection_rewards(p_account);
 SELECT jsonb_build_object('checkedIn',last_checkin_date=(now()AT TIME ZONE 'Asia/Shanghai')::date,
  'streak',CASE WHEN last_checkin_date>=(now()AT TIME ZONE 'Asia/Shanghai')::date-1 THEN streak ELSE 0 END,'totalPoints',total)
 INTO state FROM class7_test.user_points WHERE account_id=p_account;
 RETURN COALESCE(state,jsonb_build_object('checkedIn',false,'streak',0,'totalPoints',0));
END $$;
REVOKE ALL ON FUNCTION class7_test.award_closed_contests(text),class7_test.award_collection_rewards(text),class7_test.contest_tick(),class7_test.comment_contest_tick(),class7_test.draw_photos(text,integer,uuid,integer),class7_test.buy_mall_photo(text,text,date,uuid,integer),class7_test.reward_points_state(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.award_closed_contests(text),class7_test.award_collection_rewards(text),class7_test.contest_tick(),class7_test.comment_contest_tick(),class7_test.draw_photos(text,integer,uuid,integer),class7_test.buy_mall_photo(text,text,date,uuid,integer),class7_test.reward_points_state(text) TO service_role;
