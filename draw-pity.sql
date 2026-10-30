-- Keep legendary50; classified has no guarantee without changing existing counters, points, inventory or base probabilities.
ALTER TABLE class7_test.photo_draw_state DROP CONSTRAINT IF EXISTS photo_draw_state_legendary_misses_check;
ALTER TABLE class7_test.photo_draw_state ADD CONSTRAINT photo_draw_state_legendary_misses_check CHECK(legendary_misses BETWEEN 0 AND 49);
ALTER TABLE class7_test.photo_draw_state DROP CONSTRAINT IF EXISTS photo_draw_state_classified_misses_check;
ALTER TABLE class7_test.photo_draw_state ADD CONSTRAINT photo_draw_state_classified_misses_check CHECK(classified_misses>=0);

CREATE OR REPLACE FUNCTION class7_test.draw_photos(p_account text,p_count integer,p_request uuid,p_expected_cost integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,class7_test AS $$
DECLARE state class7_test.photo_draw_state%ROWTYPE; old class7_test.photo_draw_requests%ROWTYPE;
 c text[];e text[];l text[];s text[]; selected text; tier text; photo class7_test.photos%ROWTYPE;
 cost integer; balance integer; unit_cost integer; n integer; ticket uuid; picked_tier text; guaranteed text;
 result jsonb; entries jsonb:='[]'::jsonb; details text; buyer_hash text; buyer_name text;
BEGIN
 IF p_count IS NULL OR p_count NOT IN(1,10) OR p_request IS NULL OR NOT EXISTS(SELECT 1 FROM class7_test.accounts WHERE id=p_account) THEN
  RETURN jsonb_build_object('ok',false,'error','invalid');
 END IF;
 cost:=CASE WHEN p_count=10 THEN 90 ELSE 10 END;unit_cost:=cost/p_count;
 IF p_expected_cost IS DISTINCT FROM cost THEN RETURN jsonb_build_object('ok',false,'error','price_changed'); END IF;
 -- Same account lock as the shop; draw requests serialize shared exclusive stock.
 PERFORM pg_advisory_xact_lock(hashtextextended('photo-mall|'||p_account,0));
 SELECT * INTO old FROM class7_test.photo_draw_requests WHERE account_id=p_account AND request_id=p_request;
 IF FOUND THEN
  IF old.draw_count<>p_count THEN RETURN jsonb_build_object('ok',false,'error','request_conflict'); END IF;
  SELECT total INTO balance FROM class7_test.user_points WHERE account_id=p_account;
  RETURN old.result||jsonb_build_object('duplicate',true,'totalPoints',COALESCE(balance,0));
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('photo-draw-stock',0));
 -- Any failure below rolls back the entire single/ten draw, including ownership and pity.
 BEGIN
  INSERT INTO class7_test.user_points(account_id,total) VALUES(p_account,0) ON CONFLICT DO NOTHING;
  SELECT total INTO balance FROM class7_test.user_points WHERE account_id=p_account FOR UPDATE;
  IF balance<cost THEN RAISE EXCEPTION USING ERRCODE='P7001',MESSAGE='insufficient'; END IF;
  INSERT INTO class7_test.photo_draw_state(account_id) VALUES(p_account) ON CONFLICT DO NOTHING;
  SELECT * INTO state FROM class7_test.photo_draw_state WHERE account_id=p_account FOR UPDATE;
  SELECT class7_test.canonical_owner(a.owner_hash),COALESCE(NULLIF(p.nickname,''),a.username) INTO buyer_hash,buyer_name
   FROM class7_test.accounts a LEFT JOIN class7_test.profiles p ON p.device_hash=class7_test.canonical_owner(a.owner_hash) WHERE a.id=p_account;
  FOR n IN 1..p_count LOOP
   guaranteed:=CASE WHEN state.legendary_misses>=49 THEN 'legendary' ELSE NULL END;
   LOOP
    SELECT array_agg(p.id) FILTER(WHERE COALESCE(r.rarity,'common')='common'),array_agg(p.id) FILTER(WHERE r.rarity='epic'),
     array_agg(p.id) FILTER(WHERE r.rarity='legendary'),array_agg(p.id) FILTER(WHERE r.rarity='classified') INTO c,e,l,s
    FROM class7_test.photos p LEFT JOIN class7_test.photo_rarities r ON r.photo_id=p.id
    WHERE NOT EXISTS(SELECT 1 FROM class7_test.mall_photo_inventory i WHERE i.account_id=p_account AND i.photo_id=p.id)
     AND (COALESCE(r.rarity,'common')<>'classified' OR class7_test.photo_in_vault(p.id));
    IF guaranteed='legendary' THEN
     IF COALESCE(cardinality(l),0)+COALESCE(cardinality(s),0)=0 THEN RAISE EXCEPTION USING ERRCODE='P7001',MESSAGE='legendary_empty'; END IF;
     selected:=(class7_test.draw_photo_pool('{}','{}',l,s,1))[1];
    ELSE
     selected:=(class7_test.draw_photo_pool(c,e,l,s,1))[1];
    END IF;
    IF selected IS NULL THEN RAISE EXCEPTION USING ERRCODE='P7001',MESSAGE='pool_empty'; END IF;
    picked_tier:=CASE WHEN selected=ANY(COALESCE(s,'{}')) THEN 'classified' WHEN selected=ANY(COALESCE(l,'{}')) THEN 'legendary' WHEN selected=ANY(COALESCE(e,'{}')) THEN 'epic' ELSE 'common' END;
    SELECT * INTO photo FROM class7_test.photos WHERE id=selected FOR UPDATE;
    IF FOUND THEN
     SELECT COALESCE((SELECT rarity FROM class7_test.photo_rarities WHERE photo_id=selected),'common') INTO tier;
     -- A shop purchase or admin change may complete while waiting for the photo lock.
     EXIT WHEN tier=picked_tier AND (tier<>'classified' OR class7_test.photo_in_vault(selected));
    END IF;
   END LOOP;
   ticket:=gen_random_uuid();
   INSERT INTO class7_test.mall_photo_inventory(id,account_id,photo_id,request_id,title,uploader,caption,price)
    VALUES(ticket,p_account,selected,gen_random_uuid(),photo.title,CASE WHEN tier='classified' THEN buyer_name ELSE photo.uploader END,photo.caption,unit_cost);
   IF tier='classified' THEN UPDATE class7_test.photos SET owner_hash=buyer_hash,uploader=buyer_name WHERE id=selected; END IF;
   state.total_draws:=state.total_draws+1;
   state.legendary_misses:=CASE WHEN tier IN('legendary','classified') THEN 0 ELSE state.legendary_misses+1 END;
   state.classified_misses:=CASE WHEN tier='classified' THEN 0 ELSE state.classified_misses+1 END;
   entries:=entries||jsonb_build_array(jsonb_build_object('photoId',selected,'inventoryId',ticket,'rarity',tier,'guaranteed',guaranteed,'drawNumber',state.total_draws));
  END LOOP;
  UPDATE class7_test.user_points SET total=total-cost,updated_at=now() WHERE account_id=p_account;
  INSERT INTO class7_test.points_ledger(account_id,points,reason,ref_id) VALUES(p_account,-cost,'photo_draw',p_request::text);
  UPDATE class7_test.photo_draw_state SET total_draws=state.total_draws,legendary_misses=state.legendary_misses,classified_misses=state.classified_misses,updated_at=now() WHERE account_id=p_account;
  result:=jsonb_build_object('ok',true,'entries',entries,'cost',cost,'count',p_count,'totalPoints',balance-cost,
   'totalDraws',state.total_draws,'legendaryMisses',state.legendary_misses,'classifiedMisses',state.classified_misses);
  INSERT INTO class7_test.photo_draw_requests(account_id,request_id,draw_count,result) VALUES(p_account,p_request,p_count,result);
  RETURN result;
 EXCEPTION WHEN SQLSTATE 'P7001' THEN
  GET STACKED DIAGNOSTICS details=MESSAGE_TEXT;
  RETURN jsonb_build_object('ok',false,'error',details,'cost',cost);
 END;
END $$;
REVOKE ALL ON FUNCTION class7_test.draw_photos(text,integer,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.draw_photos(text,integer,uuid,integer) TO service_role;
