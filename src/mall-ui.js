const mallRarities=[{key:'common',label:'普通'},{key:'epic',label:'史诗'},{key:'legendary',label:'传奇'},{key:'classified',label:'保密级'}];
function mallRarity(value){return mallRarities.find(x=>x.key===value)||mallRarities[0];}
// On-demand daily shop and private paginated photo collection.
const mallState={mode:'shop',items:[],inventory:[],cursor:null,totalPoints:null,total:0,summaryLoaded:false,collection:[],setAchievements:[],day:null,nextReset:null,loading:false,epoch:0,identity:null,buying:false,requests:new Map(),timer:null};
function syncMallNav(){const open=!!app.mallOpen,nav=$('#mall-nav');nav.classList.toggle('active',open);if(open){nav.setAttribute('aria-current','page');for(const item of $$('.nav-tab,#weekly-contest-nav,#comment-contest-nav')){item.classList.remove('active');item.removeAttribute('aria-current');}}else nav.removeAttribute('aria-current');}
function closeMall(){if(!app.mallOpen)return;resetMallCardHover();app.mallOpen=false;document.body.classList.remove('mall-board-mode');$('#mall-board').hidden=true;mallState.epoch++;mallState.loading=false;clearTimeout(mallState.timer);syncMallNav();updateTabs();applyContestLayout();refreshWallMotion();}
async function openMall(){if(app.bulkBusy)return;closeCommentBoard();app.mallOpen=true;app.selecting=false;app.selected.clear();updateBulkUI();document.body.classList.add('mall-board-mode');$('#mall-board').hidden=false;applyContestLayout();syncMallNav();refreshWallMotion();await loadMall();}
function mallStatus(message,error=false){const p=$('#mall-status');p.textContent=message;p.hidden=!message;p.classList.toggle('is-error',error);}
function renderMallPoints(){const signed=!!app.account?.signedIn;$('#mall-points').textContent=signed?String(Math.max(0,Number(mallState.totalPoints)||0)):'—';$('#mall-inventory-count').textContent=mallState.total;}
function mallPicture(photo){const frame=document.createElement('button');frame.type='button';frame.className='mall-picture';frame.setAttribute('aria-label','查看照片：'+photo.title);frame.disabled=!photo.available;if(photo.available&&photo.src){const image=document.createElement('img');image.loading='lazy';image.decoding='async';image.alt=photo.title;image.addEventListener('load',()=>fitRotatedImage(image,photo,frame.clientWidth,frame.clientHeight),{once:true});image.src=photo.src;frame.append(image);frame.addEventListener('click',()=>showMallPhoto(photo));}else{frame.textContent='原照片已被移除';}return frame;}
function renderMall(){
 const signed=!!app.account?.signedIn,inventory=mallState.mode==='inventory';renderMallPoints();renderCollectionProgress();
 $('#mall-shop-tab').setAttribute('aria-pressed',String(!inventory));$('#mall-inventory-tab').setAttribute('aria-pressed',String(inventory));$('#mall-login').hidden=signed;
 $('#mall-day-note').textContent=inventory?'已购买的照片 · 仅自己可见':(mallState.day?mallState.day+' · ':'')+'普通 10 · 史诗 20 · 传奇 30 · 保密 40 积分 · 零点更新';
 const wrap=$('#mall-items');wrap.replaceChildren();const entries=signed?(inventory?mallState.inventory:mallState.items):[];
 $('#mall-empty').hidden=!signed||mallState.loading||entries.length>0;$('#mall-empty').textContent=inventory?'库存还是空的，去今日照片挑选喜欢的瞬间。':'今天暂无可收藏的新照片。明天再来看看。';
 $('#mall-more').hidden=!signed||!inventory||!mallState.cursor;$('#mall-more').disabled=mallState.loading;
 for(const item of entries){const card=document.createElement('article');card.className='mall-card';card.dataset.rarity=mallRarity(item.rarity).key;card.append(mallPicture(item));const body=document.createElement('div');body.className='mall-card-body';const title=document.createElement('h3');title.textContent=item.title;const author=document.createElement('p');author.className='mall-card-desc';author.textContent='来自 '+item.uploader;const badge=document.createElement('span');badge.className='mall-rarity';badge.textContent=mallRarity(item.rarity).label+(item.rarity==='classified'?' · 独占':'');body.append(badge,title);if(item.caption){const caption=document.createElement('p');caption.className='mall-card-caption';caption.textContent=item.caption;body.append(caption);}body.append(author);
 if(inventory){const label=document.createElement('p');label.className='mall-stock';label.textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).format(new Date(item.purchasedAt))+(item.price===0?' 调整补偿 · 免费赠送':' 收藏 · '+item.price+' 积分');body.append(label);}else{const button=document.createElement('button');button.type='button';button.className='mall-redeem';button.disabled=mallState.buying||item.owned||Number(mallState.totalPoints)<item.price;button.textContent=item.owned?'已在库存':Number(mallState.totalPoints)<item.price?'积分不足 · '+item.price+' 积分':'收藏 · '+item.price+' 积分';button.addEventListener('click',()=>buyMallPhoto(item,button));body.append(button);}card.append(body);wrap.append(card);}
}
function scheduleMallDay(){clearTimeout(mallState.timer);if(app.mallOpen&&mallState.nextReset){const delay=Date.parse(mallState.nextReset)-Date.now()+250;mallState.timer=setTimeout(()=>{if(app.mallOpen)loadMall();},Math.max(1000,Math.min(86400250,delay)));}}
async function loadMall(older=false){
 const epoch=++mallState.epoch,generation=ownershipGeneration;mallState.loading=true;mallStatus('正在读取…');renderMall();
 if(!app.account?.signedIn){mallState.loading=false;mallStatus('');renderMall();return;}
 try{const data=await api('/mall');if(epoch!==mallState.epoch||generation!==ownershipGeneration||!app.mallOpen)return;
 mallState.items=data.items||[];mallState.day=data.day;mallState.nextReset=data.nextResetAt;mallState.totalPoints=data.totalPoints;mallState.total=data.inventoryTotal||0;mallState.collection=data.collection||[];mallState.setAchievements=data.setAchievements||[];mallState.summaryLoaded=true;
 if(mallState.mode==='inventory'){const list=await api('/mall/inventory'+(older&&mallState.cursor?'?cursor='+encodeURIComponent(mallState.cursor):''));if(epoch!==mallState.epoch||generation!==ownershipGeneration||!app.mallOpen)return;mallState.inventory=older?[...mallState.inventory,...list.entries]:list.entries;mallState.cursor=list.nextCursor;mallState.total=list.total;}
 mallState.loading=false;mallStatus('');renderMall();scheduleMallDay();return true;
 }catch(error){if(epoch===mallState.epoch&&generation===ownershipGeneration){mallState.loading=false;mallStatus(error.message||'暂时无法读取，请稍后重试。',true);renderMall();}}
}
async function buyMallPhoto(item,button){
 if(mallState.buying)return;if(!app.account?.signedIn){openLogin(()=>loadMall());return;}
 if(button.dataset.confirm!=='1'){button.dataset.confirm='1';button.textContent='确认收藏 · '+item.price+' 积分';setTimeout(()=>{if(button.isConnected&&button.dataset.confirm){delete button.dataset.confirm;button.textContent='收藏 · '+item.price+' 积分';}},3000);return;}
 const previousTotal=mallState.total,generation=ownershipGeneration,day=mallState.day,key=generation+'|'+day+'|'+item.photoId;mallState.buying=true;renderMall();if(!mallState.requests.has(key))mallState.requests.set(key,crypto.randomUUID());
 try{const result=await api('/mall/redeem',{method:'POST',json:{photoId:item.photoId,day,price:item.price,requestId:mallState.requests.get(key)}});if(generation!==ownershipGeneration)return;mallState.requests.delete(key);mallState.totalPoints=result.points.total;toast(result.alreadyOwned||result.duplicate?'这张照片已在库存中':'已加入我的库存，-'+result.price+' 积分'+(result.collectionReward?'，收藏奖励 +'+result.collectionReward+' 积分':''));mallState.buying=false;const loaded=await loadMall();if(loaded&&generation===ownershipGeneration&&!result.alreadyOwned&&!result.duplicate)notifyCollectionMilestone(previousTotal,mallState.total);}
 catch(error){if(generation!==ownershipGeneration)return;if(error.status&&error.status<500)mallState.requests.delete(key);toast(error.message||'购买结果暂时无法确认，请查看库存后重试。');mallState.buying=false;await loadMall();}
 finally{if(generation===ownershipGeneration){mallState.buying=false;renderMall();}}
}
function showMallPhoto(photo){if(!photo.available)return;$('#mall-photo-dialog').dataset.rarity=mallRarity(photo.rarity).key;$('#mall-photo-title').textContent=photo.title;$('#mall-photo-rarity').textContent=mallRarity(photo.rarity).label;$('#mall-photo-caption').textContent=photo.caption||'';$('#mall-photo-author').textContent='来自 '+photo.uploader;const image=$('#mall-photo-image'),frame=$('#mall-photo-frame');image.alt=photo.title;image.onload=()=>fitRotatedImage(image,photo,frame.clientWidth,frame.clientHeight);image.src=photo.src;showDialog('mall-photo-dialog');if(image.complete)fitRotatedImage(image,photo,frame.clientWidth,frame.clientHeight);}
function refreshMallIdentity(){const key=(app.account?.signedIn?app.account.username:'')+'|'+ownershipGeneration;if(mallState.identity===key)return;mallState.identity=key;mallState.epoch++;mallState.items=[];mallState.inventory=[];mallState.cursor=null;mallState.totalPoints=null;mallState.total=0;mallState.collection=[];mallState.setAchievements=[];mallState.summaryLoaded=false;mallState.buying=false;mallState.requests.clear();$('#mall-photo-dialog').close();$('#mall-photo-image').removeAttribute('src');if(app.mallOpen)loadMall();else renderMall();}

let vaultStatusState={admin:false,stock:0};
async function refreshVaultStatus(){
 if(!app.account?.signedIn){vaultStatusState={admin:false,stock:0};renderVaultButton();return;}
 const generation=ownershipGeneration;try{
  const data=await api('/vault/status');if(generation!==ownershipGeneration)return;
  vaultStatusState={admin:!!data.admin,stock:Number(data.stock)||0};
 }catch{
  vaultStatusState={admin:false,stock:0};
 }
 renderVaultButton();
}
function renderVaultButton(){
 let btn=$('#vault-upload-btn');
 if(!vaultStatusState.admin){
  if(btn)btn.remove();
  return;
 }
 if(!btn){
  btn=document.createElement('button');
  btn.type='button';
  btn.id='vault-upload-btn';
  btn.className='button button-secondary vault-upload-btn';
  btn.title='管理员照片管理：上传照片与设置卡牌等级';
  const openUpload=$('[data-open-upload]');
  if(openUpload)openUpload.insertAdjacentElement('afterend',btn);
  else document.querySelector('.header-actions')?.append(btn);
  btn.addEventListener('click',triggerVaultUpload);
 }
 btn.textContent='照片管理';
}
function triggerVaultUpload(){if(vaultStatusState.admin)openPhotoManager();}

$('#mall-nav').addEventListener('click',openMall);for(const button of $$('.nav-tab'))button.addEventListener('click',closeMall);$('#weekly-contest-nav').addEventListener('click',closeMall);$('#comment-contest-nav').addEventListener('click',closeMall);
$('#mall-shop-tab').addEventListener('click',()=>{mallState.mode='shop';loadMall();});$('#mall-inventory-tab').addEventListener('click',()=>{mallState.mode='inventory';loadMall();});$('#mall-more').addEventListener('click',()=>{if(!mallState.loading)loadMall(true);});$('#mall-login-button').addEventListener('click',()=>openLogin(()=>loadMall()));$('#mall-photo-close').addEventListener('click',()=>$('#mall-photo-dialog').close());
const mallProfileHook=updateProfile;updateProfile=function(){mallProfileHook();refreshMallIdentity();refreshVaultStatus();};const mallLayoutHook=applyContestLayout;applyContestLayout=function(){mallLayoutHook();syncMallNav();};
// One refresh when returning to an already-open shop; no polling or album downloads.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&app.mallOpen&&!mallState.buying)loadMall();});
refreshVaultStatus();
