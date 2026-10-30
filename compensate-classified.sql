-- Explicit one-time administrator operation. Caller wraps this in a transaction and locks business tables.
-- Campaign id and authorized custody account must be supplied with set_config(..., true).
CREATE TABLE IF NOT EXISTS class7_test.admin_card_adjustments(
 campaign text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now(),before_state jsonb NOT NULL,result jsonb NOT NULL
);
REVOKE ALL ON class7_test.admin_card_adjustments FROM PUBLIC,anon,authenticated,service_role;
DO $adjust$
DECLARE campaign_key text:=current_setting('class7.adjustment_campaign');custodian text:=current_setting('class7.adjustment_custodian');
 custody_hash text;before_data jsonb;receipt jsonb;affected_n integer;revoked_n integer;
BEGIN
 IF campaign_key !~ '^[a-z0-9-]{8,80}$' THEN RAISE EXCEPTION 'Invalid compensation campaign'; END IF;
 IF EXISTS(SELECT 1 FROM class7_test.admin_card_adjustments WHERE campaign=campaign_key) THEN RETURN; END IF;
 SELECT class7_test.canonical_owner(a.owner_hash) INTO custody_hash FROM class7_test.accounts a JOIN class7_test.photo_vault_admins v ON v.username=a.username WHERE a.username=custodian;
 IF custody_hash IS NULL THEN RAISE EXCEPTION 'Custody account is not a registered photo administrator'; END IF;
 CREATE TEMP TABLE adjustment_revoked ON COMMIT DROP AS SELECT i.* FROM class7_test.mall_photo_inventory i JOIN class7_test.photo_rarities r ON r.photo_id=i.photo_id WHERE r.rarity='classified';
 CREATE TEMP TABLE adjustment_accounts ON COMMIT DROP AS SELECT DISTINCT account_id FROM adjustment_revoked;
 SELECT count(*) INTO affected_n FROM adjustment_accounts;SELECT count(*) INTO revoked_n FROM adjustment_revoked;
 CREATE TEMP TABLE adjustment_gifts ON COMMIT DROP AS
  SELECT a.account_id,p.id AS photo_id,p.title,p.uploader,p.caption,gen_random_uuid() AS inventory_id,gen_random_uuid() AS request_id
  FROM adjustment_accounts a CROSS JOIN LATERAL(
   SELECT p.* FROM class7_test.photos p JOIN class7_test.photo_rarities r ON r.photo_id=p.id
   WHERE r.rarity='legendary' AND NOT EXISTS(SELECT 1 FROM class7_test.mall_photo_inventory i WHERE i.account_id=a.account_id AND i.photo_id=p.id)
   ORDER BY random() LIMIT 1
  ) p;
 IF (SELECT count(*) FROM adjustment_gifts)<>affected_n THEN RAISE EXCEPTION 'An affected account has no new legendary card; entire compensation cancelled'; END IF;
 SELECT jsonb_build_object(
  'revokedInventory',COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM adjustment_revoked i),'[]'),
  'points',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.account_id) FROM class7_test.user_points p JOIN adjustment_accounts a USING(account_id)),'[]'),
  'photoCustody',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM class7_test.photos p WHERE p.id IN(SELECT photo_id FROM adjustment_revoked)),'[]'),
  'drawState',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.account_id) FROM class7_test.photo_draw_state s JOIN adjustment_accounts a USING(account_id)),'[]')
 ) INTO before_data;
 -- Revoked cards return to private stock. Remove prior purchaser's management rights, keep original bytes and display metadata.
 UPDATE class7_test.photos SET owner_hash=custody_hash WHERE id IN(SELECT photo_id FROM adjustment_revoked);
 DELETE FROM class7_test.mall_photo_inventory WHERE id IN(SELECT id FROM adjustment_revoked);
 INSERT INTO class7_test.mall_photo_inventory(id,account_id,photo_id,request_id,title,uploader,caption,price)
  SELECT inventory_id,account_id,photo_id,request_id,title,uploader,caption,0 FROM adjustment_gifts;
 INSERT INTO class7_test.user_points(account_id,total) SELECT account_id,20 FROM adjustment_accounts
  ON CONFLICT(account_id) DO UPDATE SET total=class7_test.user_points.total+20,updated_at=now();
 INSERT INTO class7_test.points_ledger(account_id,points,reason,ref_id)
  SELECT account_id,20,'card_rebalance',campaign_key FROM adjustment_accounts;
 SELECT jsonb_build_object('affectedAccounts',affected_n,'revokedCards',revoked_n,'legendaryPerAccount',1,'pointsPerAccount',20,
  'grants',COALESCE((SELECT jsonb_agg(jsonb_build_object('accountId',g.account_id,'legendaryPhotoId',g.photo_id,'inventoryId',g.inventory_id,'totalPoints',p.total) ORDER BY g.account_id) FROM adjustment_gifts g JOIN class7_test.user_points p USING(account_id)),'[]')
 ) INTO receipt;
 IF EXISTS(SELECT 1 FROM adjustment_revoked old JOIN class7_test.mall_photo_inventory i ON i.id=old.id)
  OR (SELECT count(*) FROM class7_test.points_ledger WHERE reason='card_rebalance' AND ref_id=campaign_key)<>affected_n THEN RAISE EXCEPTION 'Compensation verification failed'; END IF;
 INSERT INTO class7_test.admin_card_adjustments(campaign,before_state,result) VALUES(campaign_key,before_data,receipt);
END $adjust$;
