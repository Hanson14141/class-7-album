// A single administrator entry for the existing library and card uploads.
const photoManager={items:[],cursor:null,total:0,search:'',rarity:'all',epoch:0,loading:false,loader:null,rows:new Map()};let managerUploadReturn=false;
function managerAllowed(){return !!app.account?.signedIn&&vaultStatusState.admin;}
function managerStatus(message){$('#manager-status').textContent=message;}
function managerCounts(){$('#manager-count').textContent='共 '+photoManager.total+' 张 · 已显示 '+photoManager.items.length+' 张';$('#manager-empty').hidden=photoManager.loading||photoManager.items.length>0;$('#manager-more').hidden=!photoManager.cursor;$('#manager-more').disabled=photoManager.loading;}
function clearManagerImages(){const loader=photoManager.loader;if(loader){loader.observer?.disconnect();loader.queue=[];for(const image of $$('#manager-photos img'))image.removeAttribute('src');}photoManager.loader=null;}
function pumpManagerImages(loader){
 if(photoManager.loader!==loader)return;
 while(loader.active<3&&loader.queue.length){const {image,photo}=loader.queue.shift();if(!image.isConnected)continue;loader.active++;const done=()=>{if(photoManager.loader!==loader)return;loader.active--;if(image.naturalWidth)fitRotatedImage(image,photo,image.parentElement.clientWidth,image.parentElement.clientHeight);pumpManagerImages(loader);};image.addEventListener('load',done,{once:true});image.addEventListener('error',done,{once:true});image.src=photo.src;}
}
function managerObserveImage(image,photo){
 let loader=photoManager.loader;if(!loader){loader={active:0,queue:[],observer:null};photoManager.loader=loader;
  if('IntersectionObserver' in window)loader.observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){loader.observer.unobserve(entry.target);loader.queue.push({image:entry.target,photo:entry.target._managerPhoto});}pumpManagerImages(loader);},{root:$('#photo-manager'),rootMargin:'100px'});
 }
 image._managerPhoto=photo;if(loader.observer)loader.observer.observe(image);else{loader.queue.push({image,photo});pumpManagerImages(loader);}
}
function managerRow(photo){
 const card=document.createElement('article');card.className='manager-card';card.dataset.photoId=photo.id;
 const picture=document.createElement('button');picture.type='button';picture.className='manager-picture';picture.setAttribute('aria-label','预览照片：'+photo.title);
 const image=document.createElement('img');image.alt=photo.title;image.decoding='async';picture.append(image);picture.addEventListener('click',()=>showMallPhoto({...photo,photoId:photo.id,available:true}));
 const body=document.createElement('div');body.className='manager-card-body';const title=document.createElement('h3');title.textContent=photo.title;const author=document.createElement('p');author.className='manager-card-author';author.textContent='来自 '+photo.uploader;
 const form=document.createElement('form'),select=document.createElement('select'),save=document.createElement('button');select.setAttribute('aria-label',photo.title+'的卡牌等级');for(const tier of mallRarities){const option=document.createElement('option');option.value=tier.key;option.textContent=tier.label;select.append(option);}select.value=mallRarity(photo.rarity).key;
 save.type='submit';save.textContent='保存';save.disabled=true;select.disabled=pendingRarityEdits.has(photo.id);const message=document.createElement('p');message.className='manager-card-message';message.setAttribute('role','status');
 const row={card,picture,select,save,message};select.addEventListener('change',()=>{save.disabled=select.value===photo.rarity||pendingRarityEdits.has(photo.id);message.textContent='';});form.addEventListener('submit',event=>{event.preventDefault();saveManagedRarity(photo,row);});form.append(select,save);body.append(title,author,form,message);card.append(picture,body);photoManager.rows.set(photo.id,row);
 return {card,image};
}
function managerScopeAlive(epoch,generation){return epoch===photoManager.epoch&&generation===ownershipGeneration&&managerAllowed()&&$('#photo-manager').open;}
async function loadManagedPhotos(older=false){
 if(!managerAllowed()||!$('#photo-manager').open||older&&(photoManager.loading||!photoManager.cursor))return;
 const epoch=++photoManager.epoch,generation=ownershipGeneration,params=new URLSearchParams({search:photoManager.search,rarity:photoManager.rarity});if(older)params.set('cursor',photoManager.cursor);
 photoManager.loading=true;managerStatus('正在读取…');managerCounts();
 if(!older){clearManagerImages();photoManager.items=[];photoManager.cursor=null;photoManager.total=0;photoManager.rows.clear();$('#manager-photos').replaceChildren();managerCounts();}
 try{const data=await api('/admin/photos?'+params);if(!managerScopeAlive(epoch,generation))return;
  const known=new Set(photoManager.items.map(p=>p.id)),fresh=(data.photos||[]).filter(p=>!known.has(p.id));photoManager.items.push(...fresh);photoManager.cursor=data.nextCursor;photoManager.total=data.total;
  for(const photo of fresh){const row=managerRow(photo);$('#manager-photos').append(row.card);managerObserveImage(row.image,photo);}managerStatus('');
 }catch(error){if(managerScopeAlive(epoch,generation))managerStatus(error.message||'照片未能读取，请点击刷新重试。');}
 finally{if(managerScopeAlive(epoch,generation)){photoManager.loading=false;managerCounts();}}
}
async function saveManagedRarity(photo,row){
 if(!managerAllowed()||pendingRarityEdits.has(photo.id)||row.select.value===photo.rarity)return;
 const rarity=row.select.value,generation=ownershipGeneration;pendingRarityEdits.add(photo.id);row.select.disabled=true;row.save.disabled=true;row.save.textContent='保存中…';row.message.textContent='';
 try{const data=await api('/admin/photos/'+encodeURIComponent(photo.id)+'/rarity',{method:'POST',json:{rarity}});if(generation!==ownershipGeneration)return;
  for(const list of [app.photos,app.cloud,app.minePhotos,app.visible])for(const item of list)if(item.id===photo.id)item.rarity=data.rarity;mallState.summaryLoaded=false;photo.rarity=data.rarity;
  const current=photoManager.rows.get(photo.id);for(const item of photoManager.items)if(item.id===photo.id)item.rarity=data.rarity;
  if(current&&$('#photo-manager').open){current.select.value=data.rarity;current.message.textContent='已保存 · 原照片与互动记录保留';
   if(photoManager.rarity!=='all'&&photoManager.rarity!==data.rarity){photoManager.items=photoManager.items.filter(p=>p.id!==photo.id);photoManager.total=Math.max(0,photoManager.total-1);photoManager.rows.delete(photo.id);current.card.remove();managerStatus('等级已保存，照片已移出当前筛选。');managerCounts();}
  }
  syncRarityVisibility(photo.id,data.rarity);
 }catch(error){if(generation===ownershipGeneration&&photoManager.rows.get(photo.id)===row)row.message.textContent=error.message||'未保存，请重试。';}
 finally{pendingRarityEdits.delete(photo.id);const current=photoManager.rows.get(photo.id),item=photoManager.items.find(p=>p.id===photo.id);if(current&&item){current.select.disabled=false;current.save.textContent='保存';current.save.disabled=current.select.value===item.rarity;}renderAdminRarityEntry();}
}
function openPhotoManager(){if(!managerAllowed()||app.busy||app.bulkBusy)return;showDialog('photo-manager');loadManagedPhotos();}
function searchManagedPhotos(){photoManager.search=$('#manager-search').value.trim();photoManager.rarity=$('#manager-rarity-filter').value;photoManager.cursor=null;loadManagedPhotos();}
$('#manager-search-form').addEventListener('submit',event=>{event.preventDefault();searchManagedPhotos();});$('#manager-rarity-filter').addEventListener('change',searchManagedPhotos);$('#manager-refresh').addEventListener('click',searchManagedPhotos);$('#manager-more').addEventListener('click',()=>loadManagedPhotos(true));
$('#manager-upload').addEventListener('click',()=>{if(!managerAllowed())return;managerUploadReturn=true;closeDialog('photo-manager');openUpload('epic');});
$('#photo-manager').addEventListener('close',()=>{photoManager.epoch++;photoManager.loading=false;clearManagerImages();photoManager.items=[];photoManager.rows.clear();$('#manager-photos').replaceChildren();});
const managerRoleHook=renderVaultButton;renderVaultButton=function(){managerRoleHook();if(!managerAllowed()&&$('#photo-manager').open)closeDialog('photo-manager');};
const managerUploadHook=updateAdminUploadUI;updateAdminUploadUI=function(){managerUploadHook();const field=$('#admin-upload-fields');if(!field)return;let back=$('#manager-upload-return');if(!back){back=document.createElement('button');back.type='button';back.id='manager-upload-return';back.className='text-button manager-upload-return';back.textContent='← 返回照片管理';back.addEventListener('click',()=>{if(app.busy)return;closeDialog('upload-dialog');openPhotoManager();});field.prepend(back);}back.hidden=!managerUploadReturn||!adminUploadTier;back.disabled=app.busy;};
$('#upload-dialog').addEventListener('close',()=>{managerUploadReturn=false;});
new ResizeObserver(()=>{for(const row of photoManager.rows.values()){const image=$('img',row.picture);if(image?.naturalWidth)fitRotatedImage(image,image._managerPhoto,row.picture.clientWidth,row.picture.clientHeight);}}).observe($('#photo-manager'));
