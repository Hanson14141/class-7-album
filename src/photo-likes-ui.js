const pendingPhotoLikes=new Set();let photoLikeVersion=0;
function photoVoteWeekKey(now=Date.now()){const day=new Date(now+8*3600000);day.setUTCHours(0,0,0,0);day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);return day.getTime()-8*3600000;}
let photoVoteWeek=photoVoteWeekKey(),photoVoteWeekTimer;
function refreshPhotoVoteWeek(){const week=photoVoteWeekKey();if(week===photoVoteWeek)return false;photoVoteWeek=week;photoLikeVersion++;for(const list of [app.photos,app.cloud,app.minePhotos,app.visible])for(const photo of list)photo.liked=false;updatePhotoLikeUI();return true;}
function schedulePhotoVoteWeek(){clearTimeout(photoVoteWeekTimer);photoVoteWeekTimer=setTimeout(()=>{refreshPhotoVoteWeek();if($('#lightbox').open)showPhotoLikes();schedulePhotoVoteWeek();},Math.max(1000,photoVoteWeekKey()+7*86400000-Date.now()+150));}
function currentLikePhoto(){return app.visible[app.lightboxIndex];}
function storePhotoLikeState(id,state){
 for(const list of [app.photos,app.cloud,app.minePhotos,app.visible])for(const photo of list)if(photo.id===id){photo.likeCount=Math.max(0,Number(state.likeCount)||0);photo.liked=state.liked===true;}
}
function updatePhotoLikeUI(){
 const photo=currentLikePhoto(),button=$('#photo-like-button');$('#photo-like-row').hidden=!photo||!!photo.local;
 if(!photo||photo.local)return;
 const liked=!!app.account?.signedIn&&photo.liked===true,count=Math.max(0,Number(photo.likeCount)||0);
 button.disabled=pendingPhotoLikes.has(photo.id);button.setAttribute('aria-busy',String(button.disabled));
 button.setAttribute('aria-pressed',String(liked));button.setAttribute('aria-label',(liked?'取消本周点赞':'给照片本周点赞')+'，累计 '+count+' 个赞');
 button.title=(liked?'再次点击取消本周点赞':'每周可重新点赞')+'，累计 '+count+' 个赞';$('#photo-like-label').textContent=liked?'本周已赞':'本周点赞';$('#photo-like-count').textContent=String(count);$('#photo-like-count').title='累计总赞数';
}
async function showPhotoLikes(){
 refreshPhotoVoteWeek();
 const photo=currentLikePhoto(),version=++photoLikeVersion,generation=ownershipGeneration;$('#photo-like-status').hidden=true;updatePhotoLikeUI();
 if(!photo||photo.local)return;
 try{const state=await api('/photos/'+encodeURIComponent(photo.id)+'/likes');if(version!==photoLikeVersion||generation!==ownershipGeneration||pendingPhotoLikes.has(photo.id))return;storePhotoLikeState(photo.id,state);updatePhotoLikeUI();}
 catch(error){if(version===photoLikeVersion&&currentLikePhoto()?.id===photo.id&&!pendingPhotoLikes.has(photo.id)){$('#photo-like-status').textContent='点赞数暂未更新，可稍后重新打开。';$('#photo-like-status').hidden=false;}}
}
async function setPhotoLiked(id,wanted){
 refreshPhotoVoteWeek();const voteWeek=photoVoteWeek;
 const photo=app.photos.find(item=>item.id===id)||app.visible.find(item=>item.id===id);if(photo?.local||pendingPhotoLikes.has(id)||(!photo&&wanted!==true))return;
 if(!app.account?.signedIn){openLogin(()=>setPhotoLiked(id,true));return;}
 const before={liked:photo?.liked===true,likeCount:Math.max(0,Number(photo?.likeCount)||0)},liked=typeof wanted==='boolean'?wanted:!before.liked,generation=ownershipGeneration;
 ++photoLikeVersion;pendingPhotoLikes.add(id);storePhotoLikeState(id,{liked,likeCount:Math.max(0,before.likeCount+Number(liked)-Number(before.liked))});$('#photo-like-status').hidden=true;updatePhotoLikeUI();
 try{const state=await api('/photos/'+encodeURIComponent(id)+'/likes',{method:'POST',json:{liked}});if(generation===ownershipGeneration&&voteWeek===photoVoteWeek){storePhotoLikeState(id,state);if(!photo)toast('已点赞');}}
 catch(error){if(generation===ownershipGeneration&&voteWeek===photoVoteWeek){storePhotoLikeState(id,before);if(currentLikePhoto()?.id===id){$('#photo-like-status').textContent=error.message||'点赞未保存，请重试。';$('#photo-like-status').hidden=false;}else toast('点赞未保存，请重试。');}}
 finally{pendingPhotoLikes.delete(id);updatePhotoLikeUI();if((generation!==ownershipGeneration||voteWeek!==photoVoteWeek)&&$('#lightbox').open)showPhotoLikes();}
}
$('#photo-like-button').addEventListener('click',()=>{const photo=currentLikePhoto(),wanted=app.account?.signedIn?undefined:true;if(photo)withProfile(()=>setPhotoLiked(photo.id,wanted));});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&refreshPhotoVoteWeek()&&$('#lightbox').open)showPhotoLikes();});
schedulePhotoVoteWeek();
