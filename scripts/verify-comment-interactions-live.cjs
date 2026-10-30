// Read-only check of the deployed public API; no votes, comments or photos are created.
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com/api';
async function get(path){for(let retry=0;retry<4;retry++){const result=await fetch(base+path,{signal:AbortSignal.timeout(18000)});if(result.status===429){await result.body?.cancel();await new Promise(r=>setTimeout(r,800*2**retry));continue;}const data=await result.json();if(result.status>=500)console.error(path+' HTTP '+result.status+': '+String(data?.error||'unknown'));return {status:result.status,data};}throw Error('Rate limit persisted');}
(async()=>{
 const album=await get('/photos');assert.equal(album.status,200);assert(Array.isArray(album.data.photos)&&album.data.photos.length);
 let chosen=null;
 const knownPhotoId='0ff7503e-4dfc-40b4-952b-9e3751d4f507';
 const knownPhoto=await get('/photos/'+knownPhotoId);
 if(knownPhoto.status===200){const comments=await get('/photos/'+knownPhotoId+'/comments');if(comments.status===200&&comments.data.comments?.length)chosen={photo:knownPhoto.data.photo,comments:comments.data};}
 assert(chosen,'A public photo with existing comments is required for read-only verification');
 const first=chosen.comments.comments[0];assert.equal(typeof first.likeCount,'number');assert.equal(typeof first.liked,'boolean');assert.equal(typeof first.mine,'boolean');assert(!('owner_hash' in first)&&!('authorUsername' in first)&&!('voters' in first));
 const likes=await get('/comments/'+encodeURIComponent(first.id)+'/likes');assert.equal(likes.status,200);assert.equal(typeof likes.data.likeCount,'number');assert.equal(typeof likes.data.liked,'boolean');assert(!('users' in likes.data));
 const inbox=await get('/replies/inbox');assert.equal(inbox.status,401,'Anonymous visitors cannot read reply inbox');
 const single=await get('/photos/'+encodeURIComponent(chosen.photo.id));assert.equal(single.status,200);assert.equal(single.data.photo.id,chosen.photo.id);
 const report={checkedAt:new Date().toISOString(),photoCount:Number(album.data.total)||album.data.photos.length,checkedComments:chosen.comments.comments.length,commentLikesPublicCountOnly:true,loginNamesNotPublic:true,inboxRequiresAccount:true,singlePhotoOpen:true,passed:true};
 fs.writeFileSync('verification-comment-interactions-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
