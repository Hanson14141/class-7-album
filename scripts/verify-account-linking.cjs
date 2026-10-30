const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com',run=crypto.randomBytes(5).toString('hex');
const users=[{username:'link_a_'+run,password:crypto.randomBytes(12).toString('hex')},{username:'link_b_'+run,password:crypto.randomBytes(12).toString('hex')}];
const created=[];let cookieA='',cookieB='';
async function api(route,{cookie,json,expected=200,...options}={}){for(let n=0;;n++){const r=await fetch(base+'/api'+route,{...options,headers:{...(options.headers||{}),...(cookie?{Cookie:cookie}:{}),...(options.method?{Origin:base}:{}),...(json?{'Content-Type':'application/json'}:{})},...(json?{body:JSON.stringify(json)}:{}),signal:AbortSignal.timeout(45000)});if(r.status===429&&n<4){await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,700*2**n));continue;}const data=await r.json();assert.equal(r.status,expected,route+' returned '+r.status);return {data,cookie:r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};}}
async function upload(cookie,n){const bytes=fs.readFileSync(path.join(root,'.private/fixtures/synthetic-1.png')),meta={title:'关联验证 '+run+' '+n,caption:'临时合成测试，验证后删除',width:600,height:820};const result=await api('/photos',{cookie,method:'POST',expected:201,headers:{'Content-Type':'image/png','X-Photo-Metadata':Buffer.from(JSON.stringify(meta)).toString('base64')},body:bytes});created.push(result.data.photo.id);return result.data.photo;}
(async()=>{const before=(await api('/photos')).data;try{
 for(const [i,user]of users.entries()){const r=await api('/account/register',{method:'POST',expected:201,json:{...user,nickname:'临时账号关联验证'}});if(i===0)cookieA=r.cookie;else cookieB=r.cookie;}
 const first=await upload(cookieA,1),second=await upload(cookieB,2);
 const beforeMineA=(await api('/photos?mine=1',{cookie:cookieA})).data;assert(beforeMineA.photos.some(p=>p.id===first.id));assert(!beforeMineA.photos.some(p=>p.id===second.id));
 const self=await api('/account/link-account',{cookie:cookieA,method:'POST',expected:409,json:users[0]});assert(self.data.error.includes('不能关联自己'));assert((await api('/profile',{cookie:cookieA})).data.account.signedIn);console.log('PASS self-link is rejected and cannot be mistaken for restored photos');
 await api('/account/link-account',{cookie:cookieA,method:'POST',expected:403,json:{username:users[1].username,password:'intentionally-wrong'}});
 assert((await api('/profile',{cookie:cookieA})).data.account.signedIn);assert(!(await api('/photos?mine=1',{cookie:cookieA})).data.photos.some(p=>p.id===second.id));console.log('PASS incorrect target password grants no access and keeps current session');
 await api('/account/link-account',{method:'POST',expected:401,json:users[1]});
 const linked=(await api('/account/link-account',{cookie:cookieA,method:'POST',json:users[1]})).data;assert(!linked.alreadyLinked);assert.equal(linked.managedPhotos,2);assert.deepEqual(linked.linkedAccounts.sort(),users.map(u=>u.username).sort());
 for(const cookie of [cookieA,cookieB]){const mine=(await api('/photos?mine=1',{cookie})).data;assert([first.id,second.id].every(id=>mine.photos.some(p=>p.id===id&&p.owned)));const profile=(await api('/profile',{cookie})).data;assert.deepEqual(profile.account.linkedAccounts.sort(),users.map(u=>u.username).sort());}
 console.log('PASS both verified accounts share both existing photos with current sessions');
 await api('/photos/'+first.id+'/caption',{cookie:cookieB,method:'POST',json:{caption:'关联账号可修改测试说明'}});
 await api('/photos/'+second.id+'/rotation',{cookie:cookieA,method:'POST',json:{turn:1}});
 const comment=(await api('/photos/'+first.id+'/comments',{cookie:cookieA,method:'POST',expected:201,json:{body:'临时关联留言验证'}})).data.comment;
 const comments=(await api('/photos/'+first.id+'/comments',{cookie:cookieB})).data;assert(comments.comments.some(c=>c.id===comment.id&&c.mine));await api('/comments/'+comment.id,{cookie:cookieB,method:'DELETE'});
 const future=await upload(cookieA,3);assert((await api('/photos?mine=1',{cookie:cookieB})).data.photos.some(p=>p.id===future.id&&p.owned));
 assert((await api('/account/link-account',{cookie:cookieA,method:'POST',json:users[1]})).data.alreadyLinked);
 await api('/account/logout',{cookie:cookieA,method:'POST',json:{}});cookieA='';cookieA=(await api('/account/login',{method:'POST',json:users[0]})).cookie;
 await api('/account/logout',{cookie:cookieB,method:'POST',json:{}});cookieB='';cookieB=(await api('/account/login',{method:'POST',json:users[1]})).cookie;
 for(const cookie of [cookieA,cookieB]){const mine=(await api('/photos?mine=1',{cookie})).data;assert(created.every(id=>mine.photos.some(p=>p.id===id&&p.owned)));}console.log('PASS both accounts retain shared management after explicit logout and relogin');
 }finally{
  for(const id of created){await api('/photos/'+id,{cookie:cookieA||cookieB,method:'DELETE'});}
  if(cookieA)await api('/account/logout',{cookie:cookieA,method:'POST',json:{}});if(cookieB)await api('/account/logout',{cookie:cookieB,method:'POST',json:{}});
 }
 const after=(await api('/photos')).data,map=new Map(after.photos.map(p=>[p.id,p.bytes]));for(const photo of before.photos)assert.equal(map.get(photo.id),photo.bytes);assert.equal(after.total,before.total);
 fs.writeFileSync(path.join(root,'verification-account-linking.json'),JSON.stringify({verifiedAt:new Date().toISOString(),selfLinkRejected:true,resultIncludesManagedPhotoCountAndAccountNames:true,wrongPasswordRejected:true,anonymousLinkRejected:true,bothAccountsManageExistingAndFuturePhotos:true,bothAccountsReloginRestoresSharedPhotos:true,sharedCaptionRotationAndCommentManagement:true,idempotentLink:true,syntheticPhotosRemoved:created.length,realPhotosUnchanged:before.total,actualHansonAccountLinked:false},null,2));console.log('PASS verified linking and cleanup; '+before.total+' existing photos unchanged');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
