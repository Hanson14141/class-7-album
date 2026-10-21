// Fetch current rarity only when the administrator opens the editor.
let rarityEditorVersion=0,rarityEditorPhoto=null;const pendingRarityEdits=new Set();
function adminRarityPhoto(){return app.visible[app.lightboxIndex];}
function canEditPhotoRarity(){const photo=adminRarityPhoto();return !!app.account?.signedIn&&vaultStatusState.admin&&photo?.shared===true&&!photo.local&&!photo.demo;}
function resetAdminRarityEditor(){rarityEditorVersion++;rarityEditorPhoto=null;$('#photo-rarity-form').hidden=true;$('#photo-rarity-status').hidden=true;renderAdminRarityEntry();}
function renderAdminRarityEntry(){
 const allowed=canEditPhotoRarity();$('#admin-rarity-tools').hidden=!allowed;
 if(!allowed){rarityEditorVersion++;rarityEditorPhoto=null;$('#photo-rarity-form').hidden=true;$('#photo-rarity-status').hidden=true;}
 const busy=pendingRarityEdits.has(adminRarityPhoto()?.id);$('#edit-photo-rarity').hidden=!$('#photo-rarity-form').hidden;$('#edit-photo-rarity').disabled=busy;
 $('#photo-rarity-select').disabled=busy;$('#save-photo-rarity').disabled=busy;$('#cancel-photo-rarity').disabled=busy;$('#save-photo-rarity').textContent=busy?'保存中…':'保存';
}
function rarityStatus(message){$('#photo-rarity-status').textContent=message;$('#photo-rarity-status').hidden=!message;}
function syncRarityVisibility(id,rarity){
 // Invalidate old pages immediately; never leave a newly private card in the public wall cache.
 photoOrderEpoch++;photoPageVersions.all++;photoPageVersions.mine++;resetPhotoCounts();app.minePhotos=[];app.mineLoaded=false;
 if(rarity==='classified'){
  if($('#lightbox').open&&adminRarityPhoto()?.id===id)closeDialog('lightbox');
  app.cloud=app.cloud.filter(p=>p.id!==id);app.photos=app.photos.filter(p=>p.id!==id);app.visible=app.visible.filter(p=>p.id!==id);
 }
 refreshPhotos({preserveOrder:true,preservePosition:true},false);
 const generation=ownershipGeneration;loadCloud(false,false).then(()=>{if(generation===ownershipGeneration&&app.view==='mine')return loadCloud(false,true);}).catch(()=>{if(generation===ownershipGeneration)toast('等级已保存，照片墙稍后刷新即可更新。');});
 if(app.commentBoardOpen)loadCommentBoard();
}
function currentRarityRequest(id,version,generation){return version===rarityEditorVersion&&generation===ownershipGeneration&&adminRarityPhoto()?.id===id&&canEditPhotoRarity()&&$('#lightbox').open;}
async function openPhotoRarityEditor(){
 if(!canEditPhotoRarity())return;const id=adminRarityPhoto().id;if(pendingRarityEdits.has(id))return;
 const version=++rarityEditorVersion,generation=ownershipGeneration;rarityEditorPhoto=null;$('#edit-photo-rarity').disabled=true;rarityStatus('正在读取卡牌等级…');
 try{const data=await api('/admin/photos/'+encodeURIComponent(id)+'/rarity');if(!currentRarityRequest(id,version,generation))return;
  rarityEditorPhoto=id;$('#photo-rarity-select').value=mallRarity(data.rarity).key;$('#photo-rarity-form').hidden=false;rarityStatus('');renderAdminRarityEntry();$('#photo-rarity-select').focus();
 }catch(error){if(currentRarityRequest(id,version,generation)){rarityStatus(error.message||'等级暂未读取，请重试。');renderAdminRarityEntry();}}
}
async function savePhotoRarity(event){
 event.preventDefault();if(!canEditPhotoRarity())return;const id=adminRarityPhoto().id;if(rarityEditorPhoto!==id||pendingRarityEdits.has(id))return;
 const rarity=$('#photo-rarity-select').value,version=++rarityEditorVersion,generation=ownershipGeneration;pendingRarityEdits.add(id);renderAdminRarityEntry();rarityStatus('正在保存…');
 try{const result=await api('/admin/photos/'+encodeURIComponent(id)+'/rarity',{method:'POST',json:{rarity}});
  if(generation===ownershipGeneration){for(const list of [app.photos,app.cloud,app.minePhotos,app.visible])for(const photo of list)if(photo.id===id)photo.rarity=result.rarity;mallState.summaryLoaded=false;}
  if(currentRarityRequest(id,version,generation)){rarityEditorPhoto=null;$('#photo-rarity-form').hidden=true;rarityStatus('已设为'+mallRarity(result.rarity).label+'。原照片、点赞、评论和收藏已保留。');toast('卡牌等级已更新');}
  if(generation===ownershipGeneration)syncRarityVisibility(id,result.rarity);
 }catch(error){if(currentRarityRequest(id,version,generation))rarityStatus(error.message||'保存失败，选择已保留，可重试。');}
 finally{pendingRarityEdits.delete(id);renderAdminRarityEntry();}
}
$('#edit-photo-rarity').addEventListener('click',openPhotoRarityEditor);$('#photo-rarity-form').addEventListener('submit',savePhotoRarity);$('#cancel-photo-rarity').addEventListener('click',()=>{resetAdminRarityEditor();$('#edit-photo-rarity').focus();});
$('#lightbox').addEventListener('close',resetAdminRarityEditor);
const adminRarityPhotoHook=showPhoto;showPhoto=function(){adminRarityPhotoHook();resetAdminRarityEditor();};
const adminRarityStatusHook=renderVaultButton;renderVaultButton=function(){adminRarityStatusHook();renderAdminRarityEntry();};
renderAdminRarityEntry();
