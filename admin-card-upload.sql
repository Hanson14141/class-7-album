-- Narrow server-only helper; ordinary upload metadata cannot select rarity.
CREATE OR REPLACE FUNCTION class7_test.mark_admin_photo(p_photo text,p_rarity text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,class7_test AS $$
BEGIN
 IF p_rarity NOT IN('epic','legendary','classified') OR p_rarity IS NULL THEN RAISE EXCEPTION 'Invalid admin rarity'; END IF;
 IF NOT EXISTS(SELECT 1 FROM class7_test.photos WHERE id=p_photo) THEN RAISE EXCEPTION 'Missing photo'; END IF;
 INSERT INTO class7_test.photo_rarities(photo_id,rarity) VALUES(p_photo,p_rarity) ON CONFLICT(photo_id) DO UPDATE SET rarity=excluded.rarity;
END $$;
REVOKE ALL ON FUNCTION class7_test.mark_admin_photo(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.mark_admin_photo(text,text) TO service_role;
