const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com';
async function get(route){for(let i=0;;i++){const r=await fetch(base+route);if(r.status===429&&i<4){await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,800*2**i));continue;}assert.equal(r.status,200);return r.json();}}
(async()=>{
 const health=await get('/api/health'),list=await get('/api/photos');assert(health.ok&&health.test);
 const report=JSON.parse(fs.readFileSync(path.join(root,'verification.json')));
 const comments=await get('/api/photos/'+report.photos[0].id+'/comments');assert(comments.comments.some(c=>c.body==='CloudBase 浏览器测试留言：其他访客可见。'));
 const secret=JSON.parse(fs.readFileSync(path.join(root,'.private/storage-key.json'))).token;
 assert(!JSON.stringify({health,list,comments}).includes(secret));
 for(const file of ['public/app.js','public/index.html','hosting/index.html','functions/class7-photo-api/index.cjs'])assert(!fs.readFileSync(path.join(root,file),'utf8').includes(secret));
 const cli=require('./cli-path.cjs'),result=spawnSync(process.execPath,[cli,'env','detail','-e','class7-memory-d0gcpjaqu47530c54','--json'],{encoding:'utf8'});assert.equal(result.status,0);
 const config=JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))),flags={};
 function visit(value){if(!value||typeof value!=='object')return;for(const [name,item]of Object.entries(value)){if(['PackageId','EnableOverrun','IsAutoRenew'].includes(name))flags[name]=item;else if(item&&typeof item==='object')visit(item);}}visit(config);
 if(!Object.hasOwn(flags,'EnableOverrun')||!Object.hasOwn(flags,'IsAutoRenew')){const names=[];function fields(v,p=''){if(!v||typeof v!=='object')return;for(const [k,item]of Object.entries(v)){if(/over|renew|pack|bill|pay/i.test(k))names.push(p+k+': '+typeof item);if(item&&typeof item==='object')fields(item,p+k+'.');}}fields(config);console.log('Billing field names',names);}
 assert.equal(flags.PackageId,'baas_trial');
 if(Object.hasOwn(flags,'EnableOverrun'))assert.equal(flags.EnableOverrun,false);if(Object.hasOwn(flags,'IsAutoRenew'))assert.equal(flags.IsAutoRenew,false);
 const final={checkedAt:new Date().toISOString(),health,photos:list.total,browserCommentPublic:true,serviceSecretAbsentFromPublic:true,flags};
 fs.writeFileSync(path.join(root,'verification-final.json'),JSON.stringify(final,null,2));console.log(JSON.stringify(final,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
