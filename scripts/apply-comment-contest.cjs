const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json'),'utf8'));
if(config.envId!=='class7-memory-d0gcpjaqu47530c54')throw Error('Confirm the deployment environment before installing comment contests');
const before=`CREATE TEMP TABLE comment_upgrade_guard ON COMMIT DROP AS
SELECT 'votes' AS kind,count(*) AS n,md5(COALESCE(jsonb_agg(jsonb_build_array(comment_id,owner_hash,created_at) ORDER BY comment_id,owner_hash,created_at)::text,'')) AS fingerprint FROM class7_test.comment_likes
UNION ALL SELECT 'comments',count(*),md5(COALESCE(jsonb_agg(jsonb_build_array(id,photo_id,owner_hash,author,body,created_at) ORDER BY id)::text,'')) FROM class7_test.comments;`;
const after=`DO $verify$ BEGIN
IF EXISTS(SELECT 1 FROM comment_upgrade_guard old JOIN(
SELECT 'votes' AS kind,count(*) AS n,md5(COALESCE(jsonb_agg(jsonb_build_array(comment_id,owner_hash,created_at) ORDER BY comment_id,owner_hash,created_at)::text,'')) AS fingerprint FROM class7_test.comment_likes
UNION ALL SELECT 'comments',count(*),md5(COALESCE(jsonb_agg(jsonb_build_array(id,photo_id,owner_hash,author,body,created_at) ORDER BY id)::text,'')) FROM class7_test.comments
) current USING(kind) WHERE old.n<>current.n OR old.fingerprint IS DISTINCT FROM current.fingerprint) THEN RAISE EXCEPTION 'Existing comments or votes changed during migration'; END IF;END $verify$;`;
const sql='BEGIN;\nLOCK TABLE class7_test.account_owner_links,class7_test.photos,class7_test.comments,class7_test.photo_likes,class7_test.comment_likes IN ACCESS EXCLUSIVE MODE;\n'+before+'\n'+fs.readFileSync(path.join(root,'comment-contest.sql'),'utf8')+'\n'+fs.readFileSync(path.join(root,'account-linking.sql'),'utf8')+'\n'+after+'\nCOMMIT;';
const r=spawnSync(process.execPath,[path.join(__dirname,'execute-sql.cjs'),config.envId],{input:sql,encoding:'utf8',maxBuffer:1000000});
if(r.status!==0){console.error(r.stderr||r.stdout||'Comment contest migration failed; transaction rolled back');process.exit(r.status||1);}
console.log('Installed weekly comment voting and leaderboards; existing comments and likes verified unchanged');
