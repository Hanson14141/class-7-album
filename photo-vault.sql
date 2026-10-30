-- Classified Photo Vault
-- Defines photo_in_vault check, photo_vault_admins whitelist table,
-- 4-tier weighted draws (95.95/3/1/0.05), and exclusive vault photo acquisition.

CREATE OR REPLACE FUNCTION class7_test.photo_in_vault(p_photo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
 SELECT EXISTS(SELECT 1 FROM class7_test.photo_rarities r WHERE r.photo_id=p_photo AND r.rarity='classified')
    AND NOT EXISTS(SELECT 1 FROM class7_test.mall_photo_inventory i WHERE i.photo_id=p_photo)
$$;
REVOKE ALL ON FUNCTION class7_test.photo_in_vault(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.photo_in_vault(text) TO service_role;

CREATE TABLE IF NOT EXISTS class7_test.photo_vault_admins(username text PRIMARY KEY);
REVOKE ALL ON class7_test.photo_vault_admins FROM PUBLIC,anon,authenticated;
GRANT SELECT ON class7_test.photo_vault_admins TO service_role;

-- Relax rarity check constraint to include 'classified'
ALTER TABLE class7_test.photo_rarities DROP CONSTRAINT IF EXISTS photo_rarities_rarity_check;
ALTER TABLE class7_test.photo_rarities ADD CONSTRAINT photo_rarities_rarity_check CHECK(rarity IN ('common','epic','legendary','classified'));

-- Allow current prices and preserve historical 80-point purchases
ALTER TABLE class7_test.mall_photo_inventory DROP CONSTRAINT IF EXISTS mall_photo_inventory_price_check;
ALTER TABLE class7_test.mall_photo_inventory ADD CONSTRAINT mall_photo_inventory_price_check CHECK(price IN (0,9,10,20,30,40,80));

-- Replace 3-pool draw with 4-pool draw (95.95 / 3 / 1 / 0.05)
DROP FUNCTION IF EXISTS class7_test.draw_photo_pool(text[],text[],text[],integer);
DROP FUNCTION IF EXISTS class7_test.draw_photo_pool(text[],text[],text[]);

CREATE OR REPLACE FUNCTION class7_test.draw_photo_pool(c text[],e text[],l text[],s text[],n integer DEFAULT 5) RETURNS text[]
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,class7_test AS $$
DECLARE result text[]:='{}'; item text; wc integer; we integer; wl integer; ws integer; roll double precision; idx integer;
BEGIN
 c:=COALESCE(c,'{}'); e:=COALESCE(e,'{}'); l:=COALESCE(l,'{}'); s:=COALESCE(s,'{}');
 FOR slot IN 1..LEAST(5,GREATEST(0,n)) LOOP
  wc:=CASE WHEN cardinality(c)>0 THEN 1919 ELSE 0 END;
  we:=CASE WHEN cardinality(e)>0 THEN 60 ELSE 0 END;
  wl:=CASE WHEN cardinality(l)>0 THEN 20 ELSE 0 END;
  ws:=CASE WHEN cardinality(s)>0 THEN 1 ELSE 0 END;
  IF wc+we+wl+ws=0 THEN EXIT; END IF;
  roll:=random()*(wc+we+wl+ws);
  IF roll<wc THEN idx:=1+floor(random()*cardinality(c))::integer;item:=c[idx];c:=array_remove(c,item);
  ELSIF roll<wc+we THEN idx:=1+floor(random()*cardinality(e))::integer;item:=e[idx];e:=array_remove(e,item);
  ELSIF roll<wc+we+wl THEN idx:=1+floor(random()*cardinality(l))::integer;item:=l[idx];l:=array_remove(l,item);
  ELSE idx:=1+floor(random()*cardinality(s))::integer;item:=s[idx];s:=array_remove(s,item); END IF;
  result:=array_append(result,item);
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION class7_test.draw_photo_pool(text[],text[],text[],text[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.draw_photo_pool(text[],text[],text[],text[],integer) TO service_role;

-- Update photo_mall_day to draw from 4 pools, excluding vault photos from c/e/l
CREATE OR REPLACE FUNCTION class7_test.photo_mall_day(p_account text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,class7_test AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Shanghai')::date; fresh boolean; c text[];e text[];l text[];s text[];
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('photo-mall|'||p_account,0));
 INSERT INTO class7_test.mall_photo_days(account_id,day) VALUES(p_account,today) ON CONFLICT DO NOTHING;
 fresh:=FOUND;
 IF fresh THEN
  SELECT array_agg(p.id) FILTER(WHERE COALESCE(r.rarity,'common')='common'),
   array_agg(p.id) FILTER(WHERE r.rarity='epic'),array_agg(p.id) FILTER(WHERE r.rarity='legendary') INTO c,e,l
  FROM class7_test.photos p LEFT JOIN class7_test.photo_rarities r ON r.photo_id=p.id
  WHERE NOT EXISTS(SELECT 1 FROM class7_test.mall_photo_inventory i WHERE i.account_id=p_account AND i.photo_id=p.id)
    AND NOT class7_test.photo_in_vault(p.id);

  SELECT COALESCE(array_agg(p.id ORDER BY p.id), '{}') INTO s
  FROM class7_test.photos p
  WHERE class7_test.photo_in_vault(p.id);

  INSERT INTO class7_test.mall_photo_offers(account_id,day,photo_id)
  SELECT p_account,today,x FROM unnest(class7_test.draw_photo_pool(c,e,l,s,5)) x;
 END IF;
 RETURN jsonb_build_object('day',today::text,'nextResetAt',((today+1)::timestamp AT TIME ZONE 'Asia/Shanghai'));
END $$;
REVOKE ALL ON FUNCTION class7_test.photo_mall_day(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.photo_mall_day(text) TO service_role;

-- Update buy_mall_photo with 40 pts classified tier, locking, and single-buyer ownership transfer
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

-- Server-only tag used inside the same transaction as the photo insert.
CREATE OR REPLACE FUNCTION class7_test.mark_vault_photo(p_photo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,class7_test AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM class7_test.photos WHERE id=p_photo) THEN RAISE EXCEPTION 'Missing vault photo'; END IF;
 INSERT INTO class7_test.photo_rarities(photo_id,rarity) VALUES(p_photo,'classified') ON CONFLICT(photo_id) DO UPDATE SET rarity='classified';
END $$;
REVOKE ALL ON FUNCTION class7_test.mark_vault_photo(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.mark_vault_photo(text) TO service_role;
