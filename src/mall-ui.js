// Points mall; goods come from the build-time MALL_ITEMS manifest (mall-goods/).
const mallState={items:[],totalPoints:null,history:[],loading:false,epoch:0,identity:null};
function syncMallNav(){
 const open=!!app.mallOpen,nav=$('#mall-nav');nav.classList.toggle('active',open);if(open){nav.setAttribute('aria-current','page');for(const item of $$('.nav-tab,#weekly-contest-nav,#comment-contest-nav')){item.classList.remove('active');item.removeAttribute('aria-current');}}else nav.removeAttribute('aria-current');
}
function closeMall(){if(!app.mallOpen)return;app.mallOpen=false;document.body.classList.remove('mall-board-mode');$('#mall-board').hidden=true;mallState.epoch++;mallState.loading=false;syncMallNav();updateTabs();applyContestLayout();refreshWallMotion();}
async function openMall(){if(app.bulkBusy)return;closeCommentBoard();app.mallOpen=true;app.selecting=false;app.selected.clear();updateBulkUI();document.body.classList.add('mall-board-mode');$('#mall-board').hidden=false;syncMallNav();refreshWallMotion();await loadMall();}
function mallStatus(message,error=false){const p=$('#mall-status');p.textContent=message;p.hidden=!message;p.classList.toggle('is-error',error);}
function mallTime(value){return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric',day:'numeric'}).format(new Date(value));}
function renderMallPoints(){const signed=!!app.account?.signedIn;$('#mall-points').textContent=signed?String(Math.max(0,Number(mallState.totalPoints)||0)):'—';$('#mall-points').parentElement.title=signed?'当前可用积分':'登录后显示我的积分';}
function renderMallItems(){
 const signed=!!app.account?.signedIn,total=Math.max(0,Number(mallState.totalPoints)||0),wrap=$('#mall-items');wrap.replaceChildren();
 $('#mall-empty').hidden=mallState.loading||mallState.items.length>0;
 for(const item of mallState.items){
  const card=document.createElement('article');card.className='mall-card';
  if(item.images?.length){
   const images=document.createElement('div');images.className='mall-card-images';
   for(const image of item.images){const img=document.createElement('img');img.src=image.src;img.alt=image.alt;img.loading='lazy';img.decoding='async';img.draggable=false;images.append(img);}
   card.append(images);
  }
  const name=document.createElement('h3');name.textContent=item.name;
  const desc=document.createElement('p');desc.className='mall-card-desc';desc.textContent=item.description;
  const meta=document.createElement('div');meta.className='mall-card-meta';
  const price=document.createElement('p');price.className='mall-price';price.textContent=String(item.price);const unit=document.createElement('small');unit.textContent='积分';price.append(unit);
  const stock=document.createElement('span');stock.className='mall-stock';const soldOut=item.remaining===0;stock.textContent=item.remaining==null?'不限量':soldOut?'已兑完':'仅剩 '+item.remaining+' 份';
  meta.append(price,stock);
  const button=document.createElement('button');button.type='button';button.className='mall-redeem';
  button.disabled=soldOut||(signed&&total<item.price);
  button.textContent=soldOut?'已兑完':!signed?'登录后兑换':total<item.price?'积分不足':'兑换';
  button.setAttribute('aria-label','兑换 '+item.name+'，需要 '+item.price+' 积分');
  button.addEventListener('click',()=>redeemMallItem(item,button));
  card.append(name,desc,meta,button);wrap.append(card);
 }
}
function renderMallHistory(){
 const signed=!!app.account?.signedIn,section=$('#mall-history'),list=$('#mall-history-list');
 section.hidden=!signed||!mallState.history.length;list.replaceChildren();
 for(const entry of mallState.history){
  const row=document.createElement('li'),name=document.createElement('strong');name.textContent=entry.itemName+'（-'+entry.price+' 分）';
  const time=document.createElement('span');time.textContent=mallTime(entry.createdAt);row.append(name,time);list.append(row);
 }
}
function renderMall(){renderMallPoints();renderMallItems();renderMallHistory();}
async function loadMall(){
 const epoch=++mallState.epoch,generation=ownershipGeneration;
 mallState.loading=true;mallStatus('正在整理货架…');renderMall();
 try{
  const data=await api('/mall');if(epoch!==mallState.epoch||!app.mallOpen)return;
  if(generation!==ownershipGeneration){mallState.loading=false;loadMall();return;}
  mallState.items=data.items||[];mallState.totalPoints=data.totalPoints;
  if(app.account?.signedIn){const mine=await api('/mall/redemptions');if(epoch!==mallState.epoch||generation!==ownershipGeneration||!app.mallOpen)return;mallState.history=mine.redemptions||[];}else mallState.history=[];
  mallState.loading=false;mallStatus('');renderMall();
 }catch(error){if(epoch===mallState.epoch){mallState.loading=false;renderMall();mallStatus(error.message||'商城暂时无法读取，请刷新重试。',true);}}
}
async function redeemMallItem(item,button){
 if(!app.account?.signedIn){openLogin(()=>{if(app.mallOpen)loadMall();});return;}
 if(button.dataset.confirm!=='1'){
  button.dataset.confirm='1';button.textContent='确认兑换 -'+item.price+' 分';
  setTimeout(()=>{if(button.isConnected&&button.dataset.confirm){delete button.dataset.confirm;renderMallItems();}},3000);return;
 }
 delete button.dataset.confirm;button.disabled=true;button.textContent='兑换中…';
 const generation=ownershipGeneration;
 try{
  const data=await api('/mall/redeem',{method:'POST',json:{itemId:item.id}});if(generation!==ownershipGeneration)return;
  mallState.totalPoints=data.points.total;toast('兑换成功：'+data.item.name+'，剩余 '+data.points.total+' 分');
  await loadMall();
 }catch(error){if(generation!==ownershipGeneration)return;toast(error.message||'兑换失败，请重试。');await loadMall();}
}
function refreshMallIdentity(){const key=(app.account?.signedIn?app.account.username:'')+'|'+ownershipGeneration;if(mallState.identity===key)return;mallState.identity=key;if(!app.account?.signedIn){mallState.totalPoints=null;mallState.history=[];}if(app.mallOpen)loadMall();else renderMall();}
$('#mall-nav').addEventListener('click',openMall);
for(const button of $$('.nav-tab'))button.addEventListener('click',closeMall);
$('#weekly-contest-nav').addEventListener('click',closeMall);
$('#comment-contest-nav').addEventListener('click',closeMall);
const mallProfileHook=updateProfile;updateProfile=function(){mallProfileHook();refreshMallIdentity();};
