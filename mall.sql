-- 积分商城 · 数据库结构
-- 新环境：将本文件内容追加至 schema.sql 末尾
-- 已有环境：执行 node scripts/apply-mall.cjs
-- 商品目录与配图不在数据库中：商品 JSON 和 mall-goods/images/ 在构建时写入前后端；
-- 本文件只保存兑换记录和扣分事务，图片作为静态资源发布，不写入数据库

-- 1. 兑换记录：私有表，游客不可读
CREATE TABLE IF NOT EXISTS class7_test.mall_redemptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id text NOT NULL REFERENCES class7_test.accounts(id) ON DELETE CASCADE,
 item_id text NOT NULL,               -- mall-goods 中的商品 id
 item_name text NOT NULL,             -- 兑换时快照，商品日后改名不影响记录
 price integer NOT NULL CHECK(price>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mall_redemptions_account_date
 ON class7_test.mall_redemptions(account_id,created_at);
CREATE INDEX IF NOT EXISTS mall_redemptions_item
 ON class7_test.mall_redemptions(item_id);

REVOKE ALL ON TABLE class7_test.mall_redemptions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON TABLE class7_test.mall_redemptions TO service_role;

-- 2. 兑换事务：库存检查、余额检查、扣分、流水、记录在同一事务内提交或回滚
CREATE OR REPLACE FUNCTION class7_test.redeem_mall_item(
 p_account_id text,p_item_id text,p_item_name text,p_price integer,p_stock integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE
 cur_total integer; used integer; new_id uuid:=gen_random_uuid();
BEGIN
 IF p_price IS NULL OR p_price<=0 THEN
  RETURN jsonb_build_object('redeemed',false,'error','invalid_item');
 END IF;

 -- 串行化同一账号的兑换，余额不会并发扣成负数
 PERFORM pg_advisory_xact_lock(hashtextextended('mall|'||p_account_id,0));

 -- 限量商品按商品串行，已兑数量以兑换记录为准
 IF p_stock IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('mall-item|'||p_item_id,0));
  SELECT count(*) INTO used FROM class7_test.mall_redemptions WHERE item_id=p_item_id;
  IF used>=p_stock THEN
   RETURN jsonb_build_object('redeemed',false,'error','sold_out');
  END IF;
 END IF;

 INSERT INTO class7_test.user_points(account_id,total) VALUES(p_account_id,0)
 ON CONFLICT(account_id) DO NOTHING;
 SELECT total INTO cur_total FROM class7_test.user_points
 WHERE account_id=p_account_id FOR UPDATE;
 IF cur_total<p_price THEN
  RETURN jsonb_build_object('redeemed',false,'error','insufficient','total',cur_total);
 END IF;

 UPDATE class7_test.user_points
 SET total=total-p_price,updated_at=now()
 WHERE account_id=p_account_id;
 INSERT INTO class7_test.points_ledger(account_id,points,reason,ref_id)
 VALUES(p_account_id,-p_price,'mall_redeem','mall:'||new_id::text);
 INSERT INTO class7_test.mall_redemptions(id,account_id,item_id,item_name,price)
 VALUES(new_id,p_account_id,p_item_id,p_item_name,p_price);

 RETURN jsonb_build_object('redeemed',true,'id',new_id,'total',cur_total-p_price);
END $$;

REVOKE ALL ON FUNCTION class7_test.redeem_mall_item(text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.redeem_mall_item(text,text,text,integer,integer) TO service_role;
