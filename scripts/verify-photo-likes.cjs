const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com',run=crypto.randomBytes(5).toString('hex');
const users=['a','b','c'].map(n=>({username:'likeqa_'+n+'_'+run,password:crypto.randomBytes(14).toString('hex'),cookie:''})),created=[];
const identifiers=()=>fs.writeFileSync(path.join(root,'.private/likes-qa-identifiers.json'),JSON.stringify({run,usernames:users.map(u=>u.username),photoIds:created},null,2));
async function api(route,{cookie,json,expected=200,origin=base,...options}={}){
 for(let n=0;;n++){
  const r=await fetch(base+'/api'+route,{...options,headers:{...(options.headers||{}),...(cookie?{Cookie:cookie}:{}),...(options.method?{Origin:origin}:{}),...(json?{'Content-Type':'application/json'}:{})},...(json?{body:JSON.stringify(json)}:{}),signal:AbortSignal.timeout(45000)});
  if(r.status===429&&n<4){await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,800*2**n));continue;}
  const data=await r.json();assert.equal(r.status,expected,route.split('?')[0]+': '+r.status+' '+(data.error||''));return {data,cookie:r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};
 }
}
const state=async(user,id)=>(await api('/photos/'+id+'/likes',{cookie:user?.cookie})).data;
const set=async(user,id,liked)=>(await api('/photos/'+id+'/likes',{cookie:user.cookie,method:'POST',json:{liked}})).data;
const mine=async user=>(await api('/photos?mine=1',{cookie:user.cookie})).data;
const link=async(a,b)=>api('/account/link-account',{cookie:a.cookie,method:'POST',json:{username:b.username,password:b.password}});
async function detach(a,b){const plan=(await api('/account/unlink-preview',{cookie:a.cookie,method:'POST',json:{username:b.username}})).data;await api('/account/unlink-account',{cookie:a.cookie,method:'POST',json:{username:b.username,password:a.password,groupVersion:plan.groupVersion,confirmed:true}});}
async function upload(user,n){const meta={title:'点赞验证 '+run+' '+n,caption:'临时合成图，验证后清理',width:600,height:820};const r=await api('/photos',{cookie:user.cookie,method:'POST',expected:201,headers:{'Content-Type':'image/png','X-Photo-Metadata':Buffer.from(JSON.stringify(meta)).toString('base64')},body:fs.readFileSync(path.join(root,'.private/fixtures/synthetic-1.png'))});created.push(r.data.photo.id);identifiers();return r.data.photo.id;}
(async()=>{
 fs.mkdirSync(path.join(root,'.private'),{recursive:true});identifiers();const [a,b,c]=users;let passed=false;
 try{
  for(const user of users){user.cookie=(await api('/account/register',{method:'POST',expected:201,json:{username:user.username,password:user.password,nickname:'临时点赞验证'}})).cookie;}
  const id=await upload(a,1),other=await upload(b,2);
  assert.deepEqual(await state(null,id),{likeCount:0,liked:false});
  await api('/photos/'+id+'/likes',{method:'POST',json:{liked:true},expected:401});
  await api('/photos/'+id+'/likes',{cookie:a.cookie,method:'POST',json:{liked:1},expected:400});
  await api('/photos/'+id+'/likes',{cookie:a.cookie,origin:'https://example.invalid',method:'POST',json:{liked:true},expected:403});
  assert.deepEqual(await set(a,id,true),{likeCount:1,liked:true});assert.deepEqual(await set(a,id,true),{likeCount:1,liked:true});
  await set(a,id,false);const duplicate=await Promise.all([1,2,3].map(()=>set(a,id,true)));assert(duplicate.every(s=>s.likeCount===1&&s.liked));
  assert.deepEqual(await set(b,id,true),{likeCount:2,liked:true});assert.deepEqual(await set(b,id,false),{likeCount:1,liked:false});
  assert.deepEqual(await set(c,id,true),{likeCount:2,liked:true});assert.deepEqual(await state(null,id),{likeCount:2,liked:false});assert.deepEqual(await state(a,other),{likeCount:0,liked:false});
  console.log('PASS authentication, CSRF, idempotent concurrent likes, cancellation, independent photos and public counts');
  await api('/account/logout',{cookie:a.cookie,method:'POST'});a.cookie=(await api('/account/login',{method:'POST',json:{username:a.username,password:a.password}})).cookie;assert.deepEqual(await state(a,id),{likeCount:2,liked:true});
  await set(b,id,true);assert.equal((await state(null,id)).likeCount,3);await link(a,b);
  assert.deepEqual(await state(a,id),{likeCount:2,liked:true});assert.deepEqual(await state(b,id),{likeCount:2,liked:true});
  await set(b,id,false);assert.deepEqual(await state(a,id),{likeCount:1,liked:false});await set(b,id,true);
  const list=await mine(a),listed=list.photos.find(p=>p.id===id);assert.equal(listed.likeCount,2);assert.equal(listed.liked,true);
  await detach(a,b);assert.deepEqual(await state(a,id),{likeCount:2,liked:true});assert.deepEqual(await state(b,id),{likeCount:2,liked:false});await set(b,id,true);assert.equal((await state(null,id)).likeCount,3);
  await link(c,a);assert.equal((await state(null,id)).likeCount,2);await set(c,id,false);await set(c,id,true);await detach(a,c);
  assert.deepEqual(await state(a,id),{likeCount:2,liked:true});assert.deepEqual(await state(c,id),{likeCount:2,liked:false});await set(c,id,true);assert.equal((await state(null,id)).likeCount,3);
  console.log('PASS relogin, linked identity deduplication, list metadata, canonical/member unlink vote retention');passed=true;
 }finally{
  const managers=new Map();for(const user of users)if(user.cookie){for(const photo of (await mine(user)).photos)if(created.includes(photo.id)||photo.title?.startsWith('点赞验证 '+run+' ')){managers.set(photo.id,user.cookie);if(!created.includes(photo.id))created.push(photo.id);}}
  identifiers();for(const id of created){assert(managers.has(id),'Synthetic photo cleanup owner');await api('/photos/'+id,{cookie:managers.get(id),method:'DELETE'});await api('/photos/'+id+'/likes',{expected:404});}
  for(const user of users)if(user.cookie)await api('/account/logout',{cookie:user.cookie,method:'POST'});
 }
 assert(passed);const report={verifiedAt:new Date().toISOString(),loginRequired:true,publicCountsNoLikerIdentities:true,csrfRejected:true,idempotentConcurrentLikes:true,cancelAndIndependentPhotos:true,reloginPreservesState:true,photoListIncludesCounts:true,linkedAccountsOneVote:true,canonicalAndMemberUnlinkRetainVotes:true,syntheticPhotosRemoved:created.length,realAccountLinksUntouched:true,passed};fs.writeFileSync(path.join(root,'verification-photo-likes.json'),JSON.stringify(report,null,2));console.log('PASS synthetic-photo cleanup; real account links untouched');
})().catch(e=>{console.error(e.message);process.exitCode=1});
