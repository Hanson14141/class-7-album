-- Current classified price is 40; historical 80-point rows remain valid.
ALTER TABLE class7_test.mall_photo_inventory DROP CONSTRAINT IF EXISTS mall_photo_inventory_price_check;
ALTER TABLE class7_test.mall_photo_inventory ADD CONSTRAINT mall_photo_inventory_price_check CHECK(price IN (0,9,10,20,30,40,80));

CREATE OR REPLACE FUNCTION class7_test.buy_mall_photo(p_account text,p_photo text,p_day date,p_request uuid,p_expected_price integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Shanghai')::date;
 old class7_test.mall_photo_inventory%ROWTYPE; photo class7_test.photos%ROWTYPE;
 balance integer; cost integer; tier text; new_id uuid:=gen_random_uuid();
 raw text; buyer_hash text; buyer_name text; item_uploader text;
BEGIN
 IF p_request IS NULL OR p_day IS NULL THEN RETURN jsonb_build_object('bought',false,'error','invalid'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('photo-mall|'||p_account,0));
 SELECT * INTO old FROM class7_test.mall_photo_inventory WHERE account_id=p_account AND request_id=p_request;
 IF FOUND THEN
  IF old.photo_id<>p_photo THEN RETURN jsonb_build_object('bought',false,'error','invalid'); END IF;
  SELECT total INTO balance FROM class7_test.user_points WHERE account_id=p_account;
  RETURN jsonb_build_object('bought',true,'duplicate',true,'id',old.id,'price',old.price,'total',COALESCE(balance,0));
 END IF;
 SELECT * INTO old FROM class7_test.mall_photo_inventory WHERE account_id=p_account AND photo_id=p_photo;
 IF FOUND THEN
  SELECT total INTO balance FROM class7_test.user_points WHERE account_id=p_account;
  RETURN jsonb_build_object('bought',true,'alreadyOwned',true,'id',old.id,'price',old.price,'total',COALESCE(balance,0));
 END IF;
 IF p_day<>today THEN RETURN jsonb_build_object('bought',false,'error','expired'); END IF;
 IF NOT EXISTS(SELECT 1 FROM class7_test.mall_photo_offers WHERE account_id=p_account AND day=today AND photo_id=p_photo) THEN
  RETURN jsonb_build_object('bought',false,'error','not_offered');
 END IF;
 SELECT * INTO photo FROM class7_test.photos WHERE id=p_photo FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('bought',false,'error','missing'); END IF;
 SELECT rarity INTO tier FROM class7_test.photo_rarities WHERE photo_id=p_photo;
 cost:=CASE tier WHEN 'classified' THEN 40 WHEN 'legendary' THEN 30 WHEN 'epic' THEN 20 ELSE 10 END;
 IF p_expected_price IS DISTINCT FROM cost THEN RETURN jsonb_build_object('bought',false,'error','price_changed','price',cost); END IF;

 IF tier = 'classified' THEN
  -- The photo row is already locked before checking global availability.
  IF NOT class7_test.photo_in_vault(p_photo) THEN
   RETURN jsonb_build_object('bought',false,'error','already_sold');
  END IF;
  SELECT owner_hash INTO raw FROM class7_test.accounts WHERE id=p_account;
  buyer_hash := class7_test.canonical_owner(raw);
  SELECT nickname INTO buyer_name FROM class7_test.profiles WHERE device_hash=buyer_hash;
  IF buyer_name IS NULL OR buyer_name = '' THEN
   SELECT username INTO buyer_name FROM class7_test.accounts WHERE id=p_account;
  END IF;
  item_uploader := buyer_name;
 ELSE
  item_uploader := photo.uploader;
 END IF;

 INSERT INTO class7_test.user_points(account_id,total) VALUES(p_account,0) ON CONFLICT DO NOTHING;
 SELECT total INTO balance FROM class7_test.user_points WHERE account_id=p_account FOR UPDATE;
 IF balance<cost THEN RETURN jsonb_build_object('bought',false,'error','insufficient','total',balance,'price',cost); END IF;
 UPDATE class7_test.user_points SET total=total-cost,updated_at=now() WHERE account_id=p_account;
 INSERT INTO class7_test.points_ledger(account_id,points,reason,ref_id) VALUES(p_account,-cost,'mall_photo','photo:'||p_photo);
 INSERT INTO class7_test.mall_photo_inventory(id,account_id,photo_id,request_id,title,uploader,caption,price)
 VALUES(new_id,p_account,p_photo,p_request,photo.title,item_uploader,photo.caption,cost);

 IF tier = 'classified' THEN
  UPDATE class7_test.photos SET owner_hash=buyer_hash, uploader=buyer_name WHERE id=p_photo;
  RETURN jsonb_build_object('bought',true,'id',new_id,'price',cost,'total',balance-cost,'claimed',true);
 END IF;

 RETURN jsonb_build_object('bought',true,'id',new_id,'price',cost,'total',balance-cost);
END $$;
REVOKE ALL ON FUNCTION class7_test.buy_mall_photo(text,text,date,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.buy_mall_photo(text,text,date,uuid,integer) TO service_role;

