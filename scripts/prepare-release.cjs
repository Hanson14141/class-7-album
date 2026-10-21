// Explicit release preparation for the existing authorized environment.
// Creates at most one 180-day server key, stored only under .private/.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),privateDir=path.join(root,'.private'),cli=require('./cli-path.cjs');
const envId='class7-memory-d0gcpjaqu47530c54',config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json'),'utf8'));
if(config.envId!==envId)throw Error('Release preparation is restricted to the authorized class7-memory environment');
fs.mkdirSync(privateDir,{recursive:true});
function run(args){
 const r=spawnSync(process.execPath,[cli,...args,'-e',envId,'--json'],{encoding:'utf8',maxBuffer:2000000});
 if(r.status!==0)throw Error('CloudBase release preparation failed; no credentials printed');
 const start=r.stdout.indexOf('{');if(start<0)throw Error('Missing structured CloudBase result');
 const value=JSON.parse(r.stdout.slice(start));if(value.error||value.success===false)throw Error('CloudBase returned a release preparation error');return value;
}
const keyFile=path.join(privateDir,'storage-key.json');let key=fs.existsSync(keyFile)?JSON.parse(fs.readFileSync(keyFile,'utf8')):null;
if(!key?.expiresAt||Date.parse(key.expiresAt)-Date.now()<90*86400000){
 const resultFile=path.join(privateDir,'release-key-result.json');let result;
 if(fs.existsSync(resultFile))result=JSON.parse(fs.readFileSync(resultFile,'utf8'));
 else{result=run(['env','apikey','create','class7-album-server','--type','api_key','--expire','15552000','--yes']);fs.writeFileSync(resultFile,JSON.stringify(result));}
 const candidates=new Set();function visit(value){if(typeof value==='string'&&/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(value))candidates.add(value);else if(value&&typeof value==='object')Object.values(value).forEach(visit);}visit(result);
 if(candidates.size!==1)throw Error('Release key result saved privately; unexpected token shape');
 const token=[...candidates][0],jwt=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
 if(!jwt.exp||jwt.exp*1000-Date.now()<90*86400000)throw Error('Release key duration was not accepted');
 if(key&&!fs.existsSync(path.join(privateDir,'storage-key-before-release.json')))fs.writeFileSync(path.join(privateDir,'storage-key-before-release.json'),JSON.stringify(key));
 key={token,createdAt:new Date().toISOString(),expiresAt:new Date(jwt.exp*1000).toISOString(),purpose:'class7-memory-release'};
 fs.writeFileSync(keyFile,JSON.stringify(key,null,2));
}
const configFile=path.join(privateDir,'cloudbaserc.json'),priorConfig=path.join(privateDir,'cloudbaserc-before-release.json');
if(fs.existsSync(configFile)&&!fs.existsSync(priorConfig))fs.copyFileSync(configFile,priorConfig);
config.functions[0].envVariables.CLASS7_STORAGE_KEY=key.token;
config.functions[0].envVariables.CLASS7_STORAGE_BUCKET='class7-test';
fs.writeFileSync(configFile,JSON.stringify(config,null,2));
console.log('Release server configuration prepared; key expires '+key.expiresAt+'; no credentials printed');
