// Owner-operated metadata only. Input: ["username1", "username2"] or [{username:"..."}].
// Keep the real list in an ignored local file, not in the source archive.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json'),'utf8'));
if(config.envId!=='class7-memory-d0gcpjaqu47530c54')throw Error('Verify the target environment before adapting this script');
const targetFile=process.argv[2]||path.join(root,'.private/vault-admins.json');
if(!fs.existsSync(targetFile))throw Error('Vault admins file not found: '+targetFile);
const raw=JSON.parse(fs.readFileSync(targetFile,'utf8'));
if(!Array.isArray(raw))throw Error('Expected array of usernames in JSON file');
const names=[...new Set(raw.map(x=>typeof x==='string'?x:x?.username).filter(Boolean))];
for(const name of names){
 if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(name))throw Error('Invalid username format: '+name);
}
let sql;
if(names.length===0){
 sql='BEGIN;TRUNCATE class7_test.photo_vault_admins;COMMIT;';
}else{
 const values=names.map(n=>"('"+n.replace(/'/g,"''")+"')").join(',');
 sql="BEGIN;CREATE TEMP TABLE admin_input(username text PRIMARY KEY) ON COMMIT DROP;INSERT INTO admin_input VALUES "+values+";DO $$ BEGIN IF EXISTS(SELECT 1 FROM admin_input a LEFT JOIN class7_test.accounts acc ON acc.username=a.username WHERE acc.username IS NULL) THEN RAISE EXCEPTION 'Admin list contains un-registered usernames';END IF;END $$;TRUNCATE class7_test.photo_vault_admins;INSERT INTO class7_test.photo_vault_admins SELECT username FROM admin_input;COMMIT;";
}
const result=spawnSync(process.execPath,[path.join(__dirname,'execute-sql.cjs'),config.envId],{input:sql,encoding:'utf8',maxBuffer:1000000});
if(result.status!==0){console.error(result.stderr||result.stdout||'Admin update failed');process.exit(result.status||1);}
console.log('Updated photo vault admins ('+names.length+' active admins); existing accounts and photos unchanged');
