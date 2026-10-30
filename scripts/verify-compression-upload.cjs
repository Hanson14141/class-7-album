const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com';
const identity=JSON.parse(fs.readFileSync(path.join(root,'.private/test-users.json')));let cookie=identity.cookie;
async function fetchBackoff(url,init={}){for(let n=0;;n++){const r=await fetch(url,{...init,signal:AbortSignal.timeout(45000)});if(r.status!==429||n===4)return r;await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,700*2**n+Math.random()*200));}}
async function api(route,init={}){const r=await fetchBackoff(base+route,{...init,headers:{Cookie:cookie,...(init.method?{Origin:base}:{}),...init.headers}});const data=await r.json();if(!r.ok)throw Error('Test API '+r.status+': '+(data.error||data.code||'failure'));return data;}
(async()=>{
 const qa=await(await fetch('http://127.0.0.1:4188/__qa/report')).json();assert.equal(qa.photos.length,3);assert(qa.photos.every(p=>p.bytes<=6000000));
 const before=await api('/api/photos');fs.writeFileSync(path.join(root,'.private/pre-compression-photo-manifest.json'),JSON.stringify(before.photos.map(p=>({id:p.id,bytes:p.bytes}))));
 const state=await api('/api/profile');if(!state.account.signedIn){const login=await fetchBackoff(base+'/api/account/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:identity.username,password:identity.password})});assert.equal(login.status,200);cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');}
 const created=[],verified=[];
 try{
  const settled=await Promise.allSettled(qa.photos.map(async item=>{
   const file=path.resolve(item.file);assert(file.startsWith(path.join(root,'.private/compression-qa-')),'Only generated local fixtures may be uploaded');const bytes=fs.readFileSync(file);assert.equal(bytes.length,item.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256);
   const meta={title:'',caption:'自动压缩功能验证（合成图片，可删除）',width:item.width,height:item.height,rotation:item.rotation};
   const data=await api('/api/photos',{method:'POST',headers:{'Content-Type':item.mime,'X-Photo-Metadata':Buffer.from(JSON.stringify(meta)).toString('base64')},body:bytes});created.push(data.photo);assert.equal(data.photo.bytes,item.bytes);assert.equal(data.photo.rotation,item.rotation);
   for(const url of [data.photo.src,base+'/api/files/'+data.photo.id+'?raw=1']){const r=await fetchBackoff(url);assert.equal(r.status,200);const hash=crypto.createHash('sha256');let size=0;for await(const part of r.body){hash.update(part);size+=part.length;}assert.equal(size,item.bytes);assert.equal(hash.digest('hex'),item.sha256);}
   verified.push({bytes:item.bytes,mime:item.mime,width:item.width,height:item.height,rotation:item.rotation,sha256:item.sha256});console.log('PASS compressed upload/download bytes and rotation:',item.bytes,item.mime);
  }));for(const result of settled)if(result.status==='rejected')throw result.reason;
 }finally{for(const photo of created){await api('/api/photos/'+photo.id,{method:'DELETE'});console.log('PASS removed own synthetic fixture');}}
 const after=await api('/api/photos'),byId=new Map(after.photos.map(p=>[p.id,p.bytes]));for(const p of before.photos)assert.equal(byId.get(p.id),p.bytes,'Pre-existing photo unchanged');
 const browser=fs.readFileSync(path.join(root,'../../outputs/高三七班照片集-6MB压缩浏览器验证.txt'),'utf8');assert(!browser.includes('FAIL'));
 const sources=[...browser.matchAll(/(synthetic-[\w.-]+): (\d+) → (\d+) bytes/g)].map(m=>({name:m[1],sourceBytes:Number(m[2]),uploadedBytes:Number(m[3])}));
 const report={testedAt:new Date().toISOString(),triggerBytes:12000000,targetBytes:6000000,sources,verified,browserChecksPassed:true,priorPhotos:before.total,afterPhotos:after.total,preExistingPhotosUnchanged:true,syntheticFixturesRemoved:created.length};
 fs.writeFileSync(path.join(root,'verification-compression-6mb.json'),JSON.stringify(report,null,2));console.log('PASS complete compression workflow; '+before.total+' pre-existing photos unchanged');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
