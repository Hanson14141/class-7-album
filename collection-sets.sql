-- Persistent full-set achievements; only the server can award them.
CREATE TABLE IF NOT EXISTS class7_test.collection_set_achievements(account_id text NOT NULL REFERENCES class7_test.accounts(id),rarity text NOT NULL CHECK(rarity IN ('common','epic','legendary','classified')),unlocked_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(account_id,rarity));
REVOKE ALL ON class7_test.collection_set_achievements FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON class7_test.collection_set_achievements TO service_role;
CREATE OR REPLACE FUNCTION class7_test.unlock_collection_sets(p_account text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,class7_test AS $$
DECLARE result jsonb;
BEGIN
 WITH owned AS(SELECT photo_id FROM class7_test.mall_photo_inventory WHERE account_id=p_account),roster AS(SELECT id AS photo_id FROM class7_test.photos UNION SELECT photo_id FROM owned),complete AS(SELECT COALESCE(r.rarity,'common') AS rarity FROM roster p LEFT JOIN class7_test.photo_rarities r USING(photo_id) LEFT JOIN owned o USING(photo_id) GROUP BY COALESCE(r.rarity,'common') HAVING count(*)>0 AND CASE WHEN COALESCE(r.rarity,'common')='classified' THEN count(o.photo_id)>=1 ELSE count(*)=count(o.photo_id) END)
 INSERT INTO class7_test.collection_set_achievements(account_id,rarity) SELECT p_account,rarity FROM complete ON CONFLICT DO NOTHING;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('rarity',rarity,'unlockedAt',unlocked_at) ORDER BY rarity),'[]'::jsonb) INTO result FROM class7_test.collection_set_achievements WHERE account_id=p_account;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION class7_test.unlock_collection_sets(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.unlock_collection_sets(text) TO service_role;
