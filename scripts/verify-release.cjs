const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com';
let cookie='',createdId='';
async function api(route,{json,expected=200,...options}={}){
 for(let n=0;;n++){
  const r=await fetch(base+'/api'+route,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),...(options.method?{Origin:base}:{}),...(json?{'Content-Type':'application/json'}:{})},...(json?{body:JSON.stringify(json)}:{}),signal:AbortSignal.timeout(45000)});
  if(r.status===429&&n<4){await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,700*2**n));continue;}
  const data=await r.json();assert.equal(r.status,expected,route+' HTTP '+r.status);return {data,cookie:r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};
 }
}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const before=(await api('/photos')).data,existingIds=new Set(before.photos.map(p=>p.id));
 const htmlResponse=await fetch(base+'/api/'),html=await htmlResponse.text();assert.equal(htmlResponse.status,200);assert(html.includes('<title>高三七班照片集</title>'));assert(!/测试版|测试相册|测试入口|CLOUDBASE TEST PREVIEW|· 测试/.test(html));assert(html.includes('OUR MEMORIES.'));assert.equal((await api('/health')).data.release,'class7-memory');
 const fallback=await(await fetch('https://class7-memory-d0gcpjaqu47530c54-1509361747.tcloudbaseapp.com/')).text();assert(fallback.includes('<title>高三七班照片集</title>'));assert(!/测试版|测试入口|测试相册/.test(fallback));
 const user=JSON.parse(fs.readFileSync(path.join(root,'.private/test-users.json'))),bytes=fs.readFileSync(path.join(root,'.private/fixtures/synthetic-1.png'));
 try{
  cookie=(await api('/account/login',{method:'POST',json:{username:user.username,password:user.password}})).cookie;assert(cookie);
  const meta={title:'发布存储验证 '+crypto.randomBytes(5).toString('hex'),caption:'临时合成验证，完成后自动删除',width:600,height:820};
  const uploaded=await api('/photos',{method:'POST',expected:201,headers:{'Content-Type':'image/png','X-Photo-Metadata':Buffer.from(JSON.stringify(meta)).toString('base64')},body:bytes});createdId=uploaded.data.photo.id;assert(createdId&&!existingIds.has(createdId));
  for(const suffix of ['?download=1','?raw=1']){const r=await fetch(base+'/api/files/'+createdId+suffix,{headers:{Cookie:cookie},signal:AbortSignal.timeout(45000)});assert.equal(r.status,200);assert.equal(sha(Buffer.from(await r.arrayBuffer())),sha(bytes));}
  const comment=await api('/photos/'+createdId+'/comments',{method:'POST',expected:201,json:{body:'临时发布功能验证'}});assert(comment.data.comment.id);
  console.log('PASS official page labels, release health, account login and live storage upload/download byte equality');
 }finally{
  if(createdId){assert(!existingIds.has(createdId));await api('/photos/'+createdId,{method:'DELETE'});createdId='';}
  if(cookie){await api('/account/logout',{method:'POST'});cookie='';}
 }
 const after=(await api('/photos')).data,map=new Map(after.photos.map(p=>[p.id,p.bytes]));assert.equal(after.total,before.total);for(const p of before.photos)assert.equal(map.get(p.id),p.bytes);
 const key=JSON.parse(fs.readFileSync(path.join(root,'.private/storage-key.json')));
 const report={verifiedAt:new Date().toISOString(),formalLabelsRemoved:true,fallbackEntryUpdated:true,releaseHealth:true,accountLoginPassed:true,liveStorageUploadPassed:true,signedAndSameOriginDownloadsByteIdentical:true,commentWritePassed:true,syntheticUploadRemoved:true,existingPhotosUnchanged:before.total,storageCredentialExpiresAt:key.expiresAt,accountAndSessionExportPerformed:false};fs.writeFileSync(path.join(root,'verification-release.json'),JSON.stringify(report,null,2));console.log('PASS release cleanup; '+before.total+' existing photos unchanged');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
