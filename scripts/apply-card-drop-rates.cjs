const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json'),'utf8'));
if(config.envId!=='class7-memory-d0gcpjaqu47530c54')throw Error('Check the authorized target environment');
const tables=['accounts','photos','comments','photo_likes','comment_likes','user_points','points_ledger','mall_redemptions','mall_photo_days','mall_photo_offers','mall_photo_inventory','photo_rarities','photo_draw_state','photo_draw_requests'];
const fingerprint=tables.map(name=>`SELECT '${name}' AS name,count(*) AS n,md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) AS fingerprint FROM class7_test.${name} t`).join(' UNION ALL ');
const sql='BEGIN;\nLOCK TABLE '+tables.map(t=>'class7_test.'+t).join(',')+' IN SHARE MODE;\nCREATE TEMP TABLE card_drop_rates_guard ON COMMIT DROP AS '+fingerprint+';\n'+fs.readFileSync(path.join(root,'card-drop-rates.sql'),'utf8')+'\nDO $verify$ BEGIN IF EXISTS(SELECT 1 FROM card_drop_rates_guard old JOIN('+fingerprint+") cur USING(name) WHERE old.n<>cur.n OR old.fingerprint IS DISTINCT FROM cur.fingerprint) THEN RAISE EXCEPTION 'Existing data changed'; END IF; END $verify$;\nCOMMIT;";
const r=spawnSync(process.execPath,[path.join(__dirname,'execute-sql.cjs'),config.envId],{input:sql,encoding:'utf8',maxBuffer:1000000});
if(r.status!==0){console.error(r.stderr||r.stdout||'Vault migration failed');process.exit(r.status||1);}
console.log('Installed 92/5/2.5/0.5 base weights; pity unchanged; existing accounts, photos, comments, votes, points and rarities verified unchanged');
