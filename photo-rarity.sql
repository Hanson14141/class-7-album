-- Curated photo tiers. No foreign key: retired purchases keep their rarity.
CREATE TABLE IF NOT EXISTS class7_test.photo_rarities(
 photo_id text PRIMARY KEY,
 rarity text NOT NULL CHECK(rarity IN ('common','epic','legendary'))
);
CREATE INDEX IF NOT EXISTS photo_rarities_tier ON class7_test.photo_rarities(rarity,photo_id);
REVOKE ALL ON class7_test.photo_rarities FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON class7_test.photo_rarities TO service_role;

-- Select a tier first, then a uniformly random photo within that tier.
-- Empty tiers are removed and the remaining weights are normalized.
CREATE OR REPLACE FUNCTION class7_test.draw_photo_pool(c text[],e text[],l text[],n integer DEFAULT 5) RETURNS text[]
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,class7_test AS $$
DECLARE result text[]:='{}'; item text; wc integer; we integer; wl integer; roll double precision; idx integer;
BEGIN
 c:=COALESCE(c,'{}'); e:=COALESCE(e,'{}'); l:=COALESCE(l,'{}');
 FOR slot IN 1..LEAST(5,GREATEST(0,n)) LOOP
  wc:=CASE WHEN cardinality(c)>0 THEN 85 ELSE 0 END;
  we:=CASE WHEN cardinality(e)>0 THEN 10 ELSE 0 END;
  wl:=CASE WHEN cardinality(l)>0 THEN 5 ELSE 0 END;
  IF wc+we+wl=0 THEN EXIT; END IF;
  roll:=random()*(wc+we+wl);
  IF roll<wc THEN idx:=1+floor(random()*cardinality(c))::integer;item:=c[idx];c:=array_remove(c,item);
  ELSIF roll<wc+we THEN idx:=1+floor(random()*cardinality(e))::integer;item:=e[idx];e:=array_remove(e,item);
  ELSE idx:=1+floor(random()*cardinality(l))::integer;item:=l[idx];l:=array_remove(l,item); END IF;
  result:=array_append(result,item);
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION class7_test.photo_mall_day(p_account text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Shanghai')::date; fresh boolean; c text[];e text[];l text[];
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('photo-mall|'||p_account,0));
 INSERT INTO class7_test.mall_photo_days(account_id,day) VALUES(p_account,today) ON CONFLICT DO NOTHING;
 fresh:=FOUND;
 IF fresh THEN
  SELECT array_agg(p.id) FILTER(WHERE COALESCE(r.rarity,'common')='common'),
   array_agg(p.id) FILTER(WHERE r.rarity='epic'),array_agg(p.id) FILTER(WHERE r.rarity='legendary') INTO c,e,l
  FROM class7_test.photos p LEFT JOIN class7_test.photo_rarities r ON r.photo_id=p.id
  WHERE NOT EXISTS(SELECT 1 FROM class7_test.mall_photo_inventory i WHERE i.account_id=p_account AND i.photo_id=p.id);
  INSERT INTO class7_test.mall_photo_offers(account_id,day,photo_id)
  SELECT p_account,today,x FROM unnest(class7_test.draw_photo_pool(c,e,l,5)) x;
 END IF;
 RETURN jsonb_build_object('day',today::text,'nextResetAt',((today+1)::timestamp AT TIME ZONE 'Asia/Shanghai'));
END $$;
REVOKE ALL ON FUNCTION class7_test.draw_photo_pool(text[],text[],text[],integer),class7_test.photo_mall_day(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.draw_photo_pool(text[],text[],text[],integer),class7_test.photo_mall_day(text) TO service_role;

-- Preserve historical paid prices; current purchases use tier pricing.
ALTER TABLE class7_test.mall_photo_inventory DROP CONSTRAINT IF EXISTS mall_photo_inventory_price_check;
ALTER TABLE class7_test.mall_photo_inventory ADD CONSTRAINT mall_photo_inventory_price_check CHECK(price IN (10,20,30));
CREATE OR REPLACE FUNCTION class7_test.buy_mall_photo(p_account text,p_photo text,p_day date,p_request uuid,p_expected_price integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Shanghai')::date;
 old class7_test.mall_photo_inventory%ROWTYPE; photo class7_test.photos%ROWTYPE;
 balance integer; cost integer; tier text; new_id uuid:=gen_random_uuid();
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
 SELECT * INTO photo FROM class7_test.photos WHERE id=p_photo FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('bought',false,'error','missing'); END IF;
 SELECT rarity INTO tier FROM class7_test.photo_rarities WHERE photo_id=p_photo;
 cost:=CASE tier WHEN 'legendary' THEN 30 WHEN 'epic' THEN 20 ELSE 10 END;
 IF p_expected_price IS DISTINCT FROM cost THEN RETURN jsonb_build_object('bought',false,'error','price_changed','price',cost); END IF;
 INSERT INTO class7_test.user_points(account_id,total) VALUES(p_account,0) ON CONFLICT DO NOTHING;
 SELECT total INTO balance FROM class7_test.user_points WHERE account_id=p_account FOR UPDATE;
 IF balance<cost THEN RETURN jsonb_build_object('bought',false,'error','insufficient','total',balance,'price',cost); END IF;
 UPDATE class7_test.user_points SET total=total-cost,updated_at=now() WHERE account_id=p_account;
 INSERT INTO class7_test.points_ledger(account_id,points,reason,ref_id) VALUES(p_account,-cost,'mall_photo','photo:'||p_photo);
 INSERT INTO class7_test.mall_photo_inventory(id,account_id,photo_id,request_id,title,uploader,caption,price)
 VALUES(new_id,p_account,p_photo,p_request,photo.title,photo.uploader,photo.caption,cost);
 RETURN jsonb_build_object('bought',true,'id',new_id,'price',cost,'total',balance-cost);
END $$;

-- Old clients must refresh and confirm the displayed price before purchase.
CREATE OR REPLACE FUNCTION class7_test.buy_mall_photo(p_account text,p_photo text,p_day date,p_request uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$ SELECT jsonb_build_object('bought',false,'error','price_changed') $$;
REVOKE ALL ON FUNCTION class7_test.buy_mall_photo(text,text,date,uuid,integer),class7_test.buy_mall_photo(text,text,date,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.buy_mall_photo(text,text,date,uuid,integer),class7_test.buy_mall_photo(text,text,date,uuid) TO service_role;
