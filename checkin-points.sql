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
