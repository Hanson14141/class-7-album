// Provision only the authorized private test bucket and one short-lived server key.
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),privateDir=path.join(root,'.private');
fs.mkdirSync(privateDir,{recursive:true});
const cli=require('./cli-path.cjs');
const envId='class7-memory-d0gcpjaqu47530c54';
function run(args){const r=spawnSync(process.execPath,[cli,...args,'-e',envId,'--json'],{encoding:'utf8',maxBuffer:2000000});if(r.status!==0)throw Error('CloudBase operation failed: '+r.stderr.slice(0,500));const start=r.stdout.indexOf('{');if(start<0)throw Error('Missing structured result');const result=JSON.parse(r.stdout.slice(start));if(result.success===false||result.error)throw Error('CloudBase operation returned failure');return result;}
const bucket=run(['db','execute','--role','service_role','--sql',"INSERT INTO storage.buckets(id,name,public,created_at,updated_at) VALUES('class7-test','class7-test',false,now(),now()) ON CONFLICT(id) DO NOTHING RETURNING id,public"]);
console.log('Private test bucket provisioned');
const keyFile=path.join(privateDir,'storage-key.json');let key;
if(fs.existsSync(keyFile)){key=JSON.parse(fs.readFileSync(keyFile,'utf8'));if(Date.now()>=Date.parse(key.expiresAt))throw Error('Test key expired; review before renewing');}
else{
 const result=run(['env','apikey','create','class7-test-server','--type','api_key','--expire','604800','--yes']);
 const candidates=[];function visit(v){if(typeof v==='string'&&/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v))candidates.push(v);else if(v&&typeof v==='object')Object.values(v).forEach(visit);}visit(result);
 if(candidates.length!==1){fs.writeFileSync(path.join(privateDir,'key-result.json'),JSON.stringify(result));throw Error('Key result saved privately; inspect shape without printing secret');}
 const jwt=JSON.parse(Buffer.from(candidates[0].split('.')[1],'base64url').toString());
 key={token:candidates[0],createdAt:new Date().toISOString(),expiresAt:new Date((jwt.exp||Math.floor(Date.now()/1000)+604800)*1000).toISOString()};
 fs.writeFileSync(keyFile,JSON.stringify(key,null,2));
}
const config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json'),'utf8'));
config.functionRoot='functions';
config.functions[0].envVariables.CLASS7_STORAGE_KEY=key.token;
config.functions[0].envVariables.CLASS7_STORAGE_BUCKET='class7-test';
delete config.functions[0].envVariables.CLASS7_BUCKET;
fs.writeFileSync(path.join(privateDir,'cloudbaserc.json'),JSON.stringify(config,null,2));
console.log('Server-only configuration saved; key expiry '+key.expiresAt+' (secret omitted)');
