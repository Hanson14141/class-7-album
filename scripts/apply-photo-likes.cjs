const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cli=require('./cli-path.cjs'),config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json')));
const sql=fs.readFileSync(path.join(root,'photo-likes.sql'),'utf8');
const result=spawnSync(process.execPath,[cli,'db','execute','-e',config.envId,'--sql',sql,'--json'],{encoding:'utf8',maxBuffer:200000});
if(result.status!==0){console.error('Photo likes schema setup failed');process.exit(result.status||1);}
console.log('Applied private photo likes table and functions; existing account links and photos unchanged');
