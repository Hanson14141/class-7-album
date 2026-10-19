// Upgrade the existing free environment without resetting totals or old results.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json'),'utf8')),cli=require('./cli-path.cjs');
if(config.envId!=='class7-memory-d0gcpjaqu47530c54')throw Error('Confirm the target environment before applying the weekly vote migration');
const linking=fs.readFileSync(path.join(root,'account-linking.sql'),'utf8'),start=linking.indexOf('CREATE OR REPLACE FUNCTION class7_test.unlink_account(');
if(start<0||!linking.slice(start).includes('week_start'))throw Error('Weekly unlink integration missing');
const guardBefore=`CREATE TEMP TABLE class7_vote_reset_guard ON COMMIT DROP AS SELECT count(*) AS n,md5(COALESCE(string_agg(photo_id||'|'||owner_hash||'|'||created_at,E'\\n' ORDER BY photo_id,owner_hash,created_at),'')) AS fingerprint FROM class7_test.photo_likes;
CREATE TEMP TABLE class7_vote_reset_results ON COMMIT DROP AS SELECT * FROM class7_test.contest_results;`;
const guardAfter=`DO $verify$ BEGIN
 IF EXISTS(SELECT 1 FROM class7_vote_reset_guard g CROSS JOIN(SELECT count(*) AS n,md5(COALESCE(string_agg(photo_id||'|'||owner_hash||'|'||created_at,E'\\n' ORDER BY photo_id,owner_hash,created_at),'')) AS fingerprint FROM class7_test.photo_likes) c WHERE g.n<>c.n OR g.fingerprint IS DISTINCT FROM c.fingerprint) THEN RAISE EXCEPTION 'Existing votes changed during migration'; END IF;
 IF EXISTS(SELECT 1 FROM class7_vote_reset_results old WHERE NOT EXISTS(SELECT 1 FROM class7_test.contest_results current WHERE to_jsonb(current)=to_jsonb(old))) THEN RAISE EXCEPTION 'Frozen weekly results changed during migration'; END IF;
END $verify$;`;
const sql='BEGIN;\nLOCK TABLE class7_test.account_owner_links,class7_test.photos,class7_test.photo_likes IN ACCESS EXCLUSIVE MODE;\n'+guardBefore+'\n'+fs.readFileSync(path.join(root,'weekly-vote-reset.sql'),'utf8')+'\n'+linking.slice(start)+'\n'+guardAfter+'\nCOMMIT;';
const result=spawnSync(process.execPath,[cli,'db','execute','-e',config.envId,'--sql',sql,'--json'],{encoding:'utf8',maxBuffer:200000});
if(result.status!==0){console.error(result.stderr||'Weekly vote migration failed; transaction rolled back');process.exit(result.status||1);}
console.log('Installed weekly photo vote renewal; existing votes and frozen weekly results preserved');
