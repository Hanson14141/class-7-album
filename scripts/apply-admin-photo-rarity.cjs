const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json'),'utf8'));
if(config.envId!=='class7-memory-d0gcpjaqu47530c54')throw Error('Check the authorized target environment');
const tables=['accounts','photos','comments','photo_likes','comment_likes','user_points','points_ledger','mall_redemptions','mall_photo_days','mall_photo_offers','mall_photo_inventory','photo_rarities'];
const fingerprint=tables.map(name=>`SELECT '${name}' AS name,count(*) AS n,md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) AS fingerprint FROM class7_test.${name} t`).join(' UNION ALL ');
const sql='BEGIN;\nLOCK TABLE '+tables.map(t=>'class7_test.'+t).join(',')+' IN SHARE MODE;\nCREATE TEMP TABLE admin_photo_rarity_guard ON COMMIT DROP AS '+fingerprint+';\n'+fs.readFileSync(path.join(root,'admin-photo-rarity.sql'),'utf8')+'\nDO $verify$ BEGIN IF EXISTS(SELECT 1 FROM admin_photo_rarity_guard old JOIN('+fingerprint+") cur USING(name) WHERE old.n<>cur.n OR old.fingerprint IS DISTINCT FROM cur.fingerprint) THEN RAISE EXCEPTION 'Existing data changed'; END IF; END $verify$;\nCOMMIT;";
const r=spawnSync(process.execPath,[path.join(__dirname,'execute-sql.cjs'),config.envId],{input:sql,encoding:'utf8',maxBuffer:1000000});
if(r.status!==0){console.error(r.stderr||r.stdout||'Vault migration failed');process.exit(r.status||1);}
console.log('Installed existing photo rarity editor; existing accounts, photos, comments, votes, points and rarities verified unchanged');
