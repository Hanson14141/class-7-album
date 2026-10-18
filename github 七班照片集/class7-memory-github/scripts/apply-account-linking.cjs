const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cli=require('./cli-path.cjs'),config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json')));
const sql=fs.readFileSync(path.join(root,'account-linking.sql'),'utf8');
const result=spawnSync(process.execPath,[cli,'db','execute','-e',config.envId,'--sql',sql,'--json'],{encoding:'utf8',maxBuffer:200000});
if(result.status!==0){console.error('Account-linking schema setup failed');process.exit(result.status||1);}
console.log('Applied account-linking table/functions; no existing accounts were associated');
