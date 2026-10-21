-- Change only the rarity of an existing photo; no file or interaction mutations.
CREATE OR REPLACE FUNCTION class7_test.set_admin_photo_rarity(p_account text,p_photo text,p_rarity text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,class7_test AS $$
DECLARE previous text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM class7_test.accounts a JOIN class7_test.photo_vault_admins v ON v.username=a.username WHERE a.id=p_account) THEN
  RETURN jsonb_build_object('error','unauthorized');
 END IF;
 IF p_rarity IS NULL OR p_rarity NOT IN('common','epic','legendary','classified') THEN RETURN jsonb_build_object('error','invalid'); END IF;
 PERFORM 1 FROM class7_test.photos WHERE id=p_photo FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','missing'); END IF;
 SELECT rarity INTO previous FROM class7_test.photo_rarities WHERE photo_id=p_photo;
 INSERT INTO class7_test.photo_rarities(photo_id,rarity) VALUES(p_photo,p_rarity)
 ON CONFLICT(photo_id) DO UPDATE SET rarity=excluded.rarity;
 RETURN jsonb_build_object('photoId',p_photo,'rarity',p_rarity,'changed',COALESCE(previous,'common')<>p_rarity);
END $$;
REVOKE ALL ON FUNCTION class7_test.set_admin_photo_rarity(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION class7_test.set_admin_photo_rarity(text,text,text) TO service_role;
