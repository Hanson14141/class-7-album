const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com',run=crypto.randomBytes(5).toString('hex');
const users=['a','b','c'].map(n=>({username:'unlink_'+n+'_'+run,password:crypto.randomBytes(12).toString('hex'),cookie:''})),created=[];
async function api(route,{cookie,json,expected=200,...options}={}){
 for(let n=0;;n++){
  const r=await fetch(base+'/api'+route,{...options,headers:{...(options.headers||{}),...(cookie?{Cookie:cookie}:{}),...(options.method?{Origin:base}:{}),...(json?{'Content-Type':'application/json'}:{})},...(json?{body:JSON.stringify(json)}:{}),signal:AbortSignal.timeout(45000)});
  if(r.status===429&&n<4){await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,700*2**n));continue;}
  const data=await r.json();assert.equal(r.status,expected,route+' status '+r.status+': '+(data.error||''));return {data,cookie:r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};
 }
}
const mine=async user=>(await api('/photos?mine=1',{cookie:user.cookie})).data;
const profile=async user=>(await api('/profile',{cookie:user.cookie})).data;
const preview=async(user,target)=>(await api('/account/unlink-preview',{cookie:user.cookie,method:'POST',json:{username:target.username}})).data;
const detach=async(user,target,extra={})=>{const plan=await preview(user,target);return (await api('/account/unlink-account',{cookie:user.cookie,method:'POST',json:{username:target.username,groupVersion:plan.groupVersion,password:user.password,confirmed:true,...extra}})).data;};
async function upload(user,n){
 const bytes=fs.readFileSync(path.join(root,'.private/fixtures/synthetic-1.png')),meta={title:'解除关联验证 '+run+' '+n,caption:'临时合成测试，验证后删除',width:600,height:820};
 const r=await api('/photos',{cookie:user.cookie,method:'POST',expected:201,headers:{'Content-Type':'image/png','X-Photo-Metadata':Buffer.from(JSON.stringify(meta)).toString('base64')},body:bytes});created.push(r.data.photo.id);return r.data.photo;
}
(async()=>{
 const before=(await api('/photos')).data;const [a,b,c]=users;
 try{
  for(const user of users){const r=await api('/account/register',{method:'POST',expected:201,json:{username:user.username,password:user.password,nickname:'临时解除关联验证'}});user.cookie=r.cookie;}
  const first=await upload(a,1);await upload(b,2);await upload(c,3);
  await api('/account/link-account',{cookie:a.cookie,method:'POST',json:{username:b.username,password:b.password}});
  await api('/account/link-account',{cookie:c.cookie,method:'POST',json:{username:b.username,password:b.password}});
  const comment=(await api('/photos/'+first.id+'/comments',{cookie:b.cookie,method:'POST',expected:201,json:{body:'临时解除关联留言验证'}})).data.comment;
  const plan=await preview(a,b);assert.equal(plan.retainedPhotos,3);
  await api('/account/unlink-preview',{method:'POST',expected:401,json:{username:b.username}});
  await api('/account/unlink-preview',{cookie:a.cookie,method:'POST',expected:400,json:{username:a.username}});
  await api('/account/unlink-preview',{cookie:a.cookie,method:'POST',expected:409,json:{username:'not_a_linked_account'}});
  await api('/account/unlink-account',{cookie:a.cookie,method:'POST',expected:400,json:{username:b.username,password:a.password,groupVersion:plan.groupVersion,confirmed:false}});
  await api('/account/unlink-account',{cookie:a.cookie,method:'POST',expected:403,json:{username:b.username,password:b.password,groupVersion:plan.groupVersion,confirmed:true}});
  await api('/account/unlink-account',{cookie:a.cookie,method:'POST',expected:409,json:{username:b.username,password:a.password,groupVersion:'stale-group',confirmed:true}});
  assert.equal((await mine(b)).total,3);console.log('PASS preview, current-password verification, consent, same-group and stale-preview checks');
  const rootResult=await detach(a,b);assert.equal(rootResult.retainedPhotos,3);
  for(const user of [a,c]){const data=await mine(user);assert.equal(data.total,3);assert(data.photos.every(p=>p.owned));assert.deepEqual((await profile(user)).account.linkedAccounts.sort(),[a.username,c.username].sort());}
  assert.equal((await mine(b)).total,0);assert((await profile(b)).account.signedIn);
  await api('/photos/'+first.id+'/caption',{cookie:b.cookie,method:'POST',expected:403,json:{caption:'Must not be saved'}});
  const fromB=(await api('/photos/'+first.id+'/comments',{cookie:b.cookie})).data.comments.find(x=>x.id===comment.id),fromA=(await api('/photos/'+first.id+'/comments',{cookie:a.cookie})).data.comments.find(x=>x.id===comment.id);assert(fromB&&!fromB.mine);assert(fromA?.mine);
  console.log('PASS removing the canonical account retains all photos/comments and immediately revokes its existing sessions access');
  await upload(c,4);assert.equal((await mine(a)).total,4);
  const memberResult=await detach(a,c);assert.equal(memberResult.retainedPhotos,4);assert.equal((await mine(a)).total,4);assert.equal((await mine(c)).total,0);
  const ownB=await upload(b,5),ownC=await upload(c,6);assert.equal((await mine(b)).total,1);assert.equal((await mine(c)).total,1);assert(!(await mine(a)).photos.some(p=>p.id===ownB.id||p.id===ownC.id));
  console.log('PASS removing a noncanonical account, uploads written while linked, and independent future uploads');
  for(const user of users){await api('/account/logout',{cookie:user.cookie,method:'POST'});user.cookie=(await api('/account/login',{method:'POST',json:{username:user.username,password:user.password}})).cookie;}
  assert.equal((await mine(a)).total,4);assert.equal((await mine(b)).total,1);assert.equal((await mine(c)).total,1);console.log('PASS logout/relogin preserves separated management');
 }finally{
  const managers=new Map();for(const user of users)if(user.cookie){for(const photo of (await mine(user)).photos)if(created.includes(photo.id))managers.set(photo.id,user.cookie);}
  for(const id of created){const cookie=managers.get(id);assert(cookie,'Missing synthetic cleanup owner');await api('/photos/'+id,{cookie,method:'DELETE'});}
  for(const user of users)if(user.cookie)await api('/account/logout',{cookie:user.cookie,method:'POST'});
 }
 const after=(await api('/photos')).data,map=new Map(after.photos.map(p=>[p.id,p.bytes]));assert.equal(after.total,before.total);for(const photo of before.photos)assert.equal(map.get(photo.id),photo.bytes);
 const report={verifiedAt:new Date().toISOString(),previewAndConsentRequired:true,currentPasswordRequired:true,staleGroupRejected:true,canonicalAndNoncanonicalRemovalPassed:true,existingSharedPhotosAndCommentsRetained:true,removedAccountExistingSessionImmediatelyRestricted:true,newUploadsFollowActualAccount:true,logoutReloginPassed:true,syntheticPhotosRemoved:created.length,existingPhotosUnchanged:before.total,existingUserAccountsNotUnlinked:true};fs.writeFileSync(path.join(root,'verification-account-unlinking.json'),JSON.stringify(report,null,2));console.log('PASS cleanup; '+before.total+' existing photos unchanged; real account links untouched');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
