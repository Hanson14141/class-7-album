-- Daily photo shop. Private account inventory, fixed 10 points per photo.
CREATE TABLE IF NOT EXISTS class7_test.mall_photo_days(
 account_id text NOT NULL REFERENCES class7_test.accounts(id) ON DELETE CASCADE,
 day date NOT NULL, PRIMARY KEY(account_id,day)
);
CREATE TABLE IF NOT EXISTS class7_test.mall_photo_offers(
 account_id text NOT NULL, day date NOT NULL,
 photo_id text NOT NULL REFERENCES class7_test.photos(id) ON DELETE CASCADE,
 PRIMARY KEY(account_id,day,photo_id),
 FOREIGN KEY(account_id,day) REFERENCES class7_test.mall_photo_days(account_id,day) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS class7_test.mall_photo_inventory(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id text NOT NULL REFERENCES class7_test.accounts(id) ON DELETE CASCADE,
 photo_id text NOT NULL, request_id uuid NOT NULL,
 title text NOT NULL, uploader text NOT NULL, caption text NOT NULL,
 price integer NOT NULL DEFAULT 10 CHECK(price=10),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,photo_id), UNIQUE(account_id,request_id)
);
CREATE INDEX IF NOT EXISTS mall_photo_inventory_page ON class7_test.mall_photo_inventory(account_id,created_at DESC,id DESC);
REVOKE ALL ON class7_test.mall_photo_days,class7_test.mall_photo_offers,class7_test.mall_photo_inventory FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON class7_test.mall_photo_days,class7_test.mall_photo_offers,class7_test.mall_photo_inventory TO service_role;

CREATE OR REPLACE FUNCTION class7_test.photo_mall_day(p_account text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Shanghai')::date; fresh boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('photo-mall|'||p_account,0));
 INSERT INTO class7_test.mall_photo_days(account_id,day) VALUES(p_account,today) ON CONFLICT DO NOTHING;
 fresh:=FOUND;
 IF fresh THEN
  INSERT INTO class7_test.mall_photo_offers(account_id,day,photo_id)
  SELECT p_account,today,p.id FROM class7_test.photos p
  WHERE NOT EXISTS(SELECT 1 FROM class7_test.mall_photo_inventory i WHERE i.account_id=p_account AND i.photo_id=p.id)
  ORDER BY md5(p_account||'|'||today::text||'|'||p.id),p.id LIMIT 5;
 END IF;
 RETURN jsonb_build_object('day',today::text,'nextResetAt',((today+1)::timestamp AT TIME ZONE 'Asia/Shanghai'));
END $$;

CREATE OR REPLACE FUNCTION class7_test.buy_mall_photo(p_account text,p_photo text,p_day date,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Shanghai')::date;
 old class7_test.mall_photo_inventory%ROWTYPE; photo class7_test.photos%ROWTYPE;
 balance integer; new_id uuid:=gen_random_uuid();
BEGIN
 IF p_request IS NULL OR p_day IS NULL THEN RETURN jsonb_build_object('bought',false,'error','invalid'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('photo-mall|'||p_account,0));
 SELECT * INTO old FROM class7_test.mall_photo_inventory WHERE account_id=p_account AND request_id=p_request;
 IF FOUND THEN
  IF old.photo_id<>p_photo THEN RETURN jsonb_build_object('bought',false,'error','invalid'); END IF;
  SELECT total INTO balance FROM class7_test.user_points WHERE account_id=p_account;
  RETURN jsonb_build_object('bought',true,'duplicate',true,'id',old.id,'total',COALESCE(balance,0));
 END IF;
 SELECT * INTO old FROM class7_test.mall_photo_inventory WHERE account_id=p_account AND photo_id=p_photo;
 IF FOUND THEN
  SELECT total INTO balance FROM class7_test.user_points WHERE account_id=p_account;
  RETURN jsonb_build_object('bought',true,'alreadyOwned',true,'id',old.id,'total',COALESCE(balance,0));
 END IF;
 IF p_day<>today THEN RETURN jsonb_build_object('bought',false,'error','expired'); END IF;
 IF NOT EXISTS(SELECT 1 FROM class7_test.mall_photo_offers WHERE account_id=p_account AND day=today AND photo_id=p_photo) THEN
  RETURN jsonb_build_object('bought',false,'error','not_offered');
 END IF;
 SELECT * INTO photo FROM class7_test.photos WHERE id=p_photo FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('bought',false,'error','missing'); END IF;
 INSERT INTO class7_test.user_points(account_id,total) VALUES(p_account,0) ON CONFLICT DO NOTHING;
 SELECT total INTO balance FROM class7_test.user_points WHERE account_id=p_account FOR UPDATE;
 IF balance<10 THEN RETURN jsonb_build_object('bought',false,'error','insufficient','total',balance); END IF;
 UPDATE class7_test.user_points SET total=total-10,updated_at=now() WHERE account_id=p_account;
 INSERT INTO class7_test.points_ledger(account_id,points,reason,ref_id) VALUES(p_account,-10,'mall_photo','photo:'||p_photo);
 INSERT INTO class7_test.mall_photo_inventory(id,account_id,photo_id,request_id,title,uploader,caption)
 VALUES(new_id,p_account,p_photo,p_request,photo.title,photo.uploader,photo.caption);
 RETURN jsonb_build_object('bought',true,'id',new_id,'total',balance-10);
END $$;
REVOKE ALL ON FUNCTION class7_test.photo_mall_day(text),class7_test.buy_mall_photo(text,text,date,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.photo_mall_day(text),class7_test.buy_mall_photo(text,text,date,uuid) TO service_role;
-- Withdraw legacy goods without erasing prior purchase records.
REVOKE EXECUTE ON FUNCTION class7_test.redeem_mall_item(text,text,text,integer,integer,uuid) FROM service_role;
