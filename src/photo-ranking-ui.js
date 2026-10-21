let photoOrder=['likes','weekly'].includes(safeRead('class7-photo-order'))?safeRead('class7-photo-order'):'random',photoOrderEpoch=0;
const photoPageVersions={all:0,mine:0};
function rankingActive(){return ['likes','weekly'].includes($('#photo-order').value);}
function rankedWallPhotos(photos){
 if(!rankingActive())return null;
 // Page order is authoritative. Keep it fixed while a detail is being liked.
 return photos.filter(photo=>!photo.local&&(!weeklyActive()||photo.weeklyCount>0&&photo.rank)).sort((a,b)=>(a.rank||Number.MAX_SAFE_INTEGER)-(b.rank||Number.MAX_SAFE_INTEGER));
}
function updatePhotoOrderUI(){
 $('#photo-order').value=photoOrder;
 $('#shuffle-button').hidden=rankingActive();
 $('#wall-view-toggle').hidden=rankingActive();
 $('#wall-shell').classList.toggle('ranking-wall',rankingActive());
 $('#photo-order').title=weeklyActive()?'每周大赛：每周重置点赞机会，突出前三名':rankingActive()?'累计点赞从高到低，同赞数按最新上传排序；刷新更新名次':'保留随机瀑布照片墙';
 $('#ranking-note').hidden=!rankingActive();
}
function addPhotoRankBadge(button,photo){
 if(!rankingActive()||!photo.rank)return;
 const badge=document.createElement('span');badge.className='photo-rank';badge.textContent=String(photo.rank);badge.setAttribute('aria-hidden','true');button.append(badge);
 button.setAttribute('aria-label','第 '+photo.rank+' 名，'+(weeklyActive()?'本期 '+(photo.weeklyCount||0):(photo.likeCount||0))+' 个赞，查看照片：'+photo.title);
}
async function reloadPhotoOrder(){
 const epoch=++photoOrderEpoch;
 app.cloud=[];app.minePhotos=[];app.nextCursor=null;app.mineCursor=null;app.cloudLoaded=false;app.mineLoaded=false;
 app.selected.clear();app.selecting=false;weeklyContest=null;updatePhotoOrderUI();await refreshPhotos({},false);
 $('#photo-order').setAttribute('aria-busy','true');
 try{await loadCloud(false);}
 catch(error){if(epoch===photoOrderEpoch){$('#gallery-error').textContent=error.message||'排行加载失败，请刷新重试。';$('#gallery-error').hidden=false;}}
 finally{if(epoch===photoOrderEpoch)$('#photo-order').removeAttribute('aria-busy');}
}
async function changePhotoFilter(value){app.filter=value;if(rankingActive())await reloadPhotoOrder();else{refreshFilter();renderWall();try{for(let p,c;value&&!rankingActive()&&app.filter===value&&(c=app.view==='mine'?app.mineCursor:app.nextCursor)&&c!==p;p=c)await loadCloud(true);}catch(error){toast(error.message);}}}
$('#photo-order').addEventListener('change',async event=>{photoOrder=['likes','weekly'].includes(event.target.value)?event.target.value:'random';if(photoOrder==='weekly'){app.view='all';app.filter='';contestPeriod='current';}safeWrite('class7-photo-order',photoOrder);await reloadPhotoOrder();});
updatePhotoOrderUI();
