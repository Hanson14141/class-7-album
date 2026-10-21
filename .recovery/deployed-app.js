async function cloudFetch(url,options){for(let retry=0;;retry++){const result=await fetch(url,options);if(result.status!==429||retry>=4)return result;await result.body?.cancel();await new Promise(resolve=>setTimeout(resolve,700*2**retry+Math.random()*250));}}
'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const app = {photos:[],visible:[],view:'all',filter:'',playing:!reducedMotion.matches,hoverPaused:false,lanes:[],lastFrame:0,lightboxIndex:0,files:[],db:null,objectUrls:[],columns:0,busy:false,profile:null,account:null,accountBusy:false,cloud:[],minePhotos:[],mineCursor:null,mineLoaded:false,nextCursor:null,legacy:[],pendingAction:null,comments:[],commentCursor:null,commentPhoto:null,commentBusy:false,selecting:false,selected:new Set(),bulkBusy:false,individualNotes:false,rotationBusy:false,wallWidth:0,wallHeight:0};

function safeRead(key) {try{return localStorage.getItem(key)||'';}catch{return '';}}
function safeWrite(key,value) {try{localStorage.setItem(key,value);}catch{}}
function applyTheme(theme){const dark=theme==='dark';document.documentElement.dataset.theme=dark?'dark':'light';$('#theme-toggle').setAttribute('aria-pressed',String(dark));$('#theme-toggle').setAttribute('aria-label',dark?'切换为浅色模式':'切换为深色模式');$('#theme-label').textContent=dark?'浅色':'深色';$('meta[name="theme-color"]').content=dark?'#111111':'#ffffff';}
function shuffle(items){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
function columnsForWidth(width){return width<1100?3:4;}
function columnCount(){return columnsForWidth($('#photo-wall').clientWidth);}
function photoRotation(photo){return [0,90,180,270].includes(photo.rotation)?photo.rotation:0;}
function photoAspect(photo){const width=Number(photo.width),height=Number(photo.height),aspect=Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0?width/height:4/3;return photoRotation(photo)%180?1/aspect:aspect;}
function fitRotatedImage(img,photo,width,height){
  if(width<=0||height<=0)return;
  const angle=photoRotation(photo),swap=angle%180!==0;
  img.style.width=(swap?height:width)+'px';img.style.height=(swap?width:height)+'px';
  img.style.transform=`translate(-50%,-50%) rotate(${angle}deg)`;
}
function photoFrameHeight(photo,width,wallHeight){
  if(completeWallView())return Math.max(1,Math.round(width/photoAspect(photo)));
  const minimum=Math.min(96,width*.6),maximum=Math.max(minimum,Math.min(width*2.25,Math.max(360,wallHeight*1.25)));
  return Math.max(1,Math.round(Math.min(maximum,Math.max(minimum,width/photoAspect(photo)))));
}
function balancePhotoColumns(photos,count,width,wallHeight,gap){
  const columns=Array.from({length:count},()=>[]),heights=Array(count).fill(0);
  for(const photo of photos){const index=heights.indexOf(Math.min(...heights)),height=photoFrameHeight(photo,width,wallHeight);columns[index].push({photo,height});heights[index]+=height+gap;}
  return columns;
}
function preservePhotoOrder(previous,photos){const remaining=new Map(photos.map(photo=>[photo.id,photo])),ordered=[];for(const photo of previous){if(remaining.has(photo.id)){ordered.push(remaining.get(photo.id));remaining.delete(photo.id);}}return [...ordered,...remaining.values()];}
let imageLayoutTimer;
function scheduleImageLayout(){clearTimeout(imageLayoutTimer);imageLayoutTimer=setTimeout(relayoutWallImages,150);}
function syncLaneHeights(){const heights=app.lanes.map(lane=>lane.group.offsetHeight);app.lanes.forEach((lane,index)=>{lane.height=heights[index];});refreshWallMotion();}
function pumpWallImages(state){
  if(app.wallLoader!==state)return;
  while(state.active<4&&state.queue.length){
    const {img,src}=state.queue.shift();if(!img.isConnected)continue;state.active++;
    let finished=false;const done=()=>{if(finished)return;finished=true;img.removeEventListener('load',done);img.removeEventListener('error',done);state.active--;pumpWallImages(state);};
    img.addEventListener('load',done);img.addEventListener('error',done);img.fetchPriority=state.started++<4?'high':'auto';img.src=src;delete img.dataset.loadSrc;
  }
}
function beginWallImages(wall){
  if(app.wallLoader){app.wallLoader.observer?.disconnect();app.wallLoader.queue.length=0;}
  const state={queue:[],active:0,started:0,observer:null};app.wallLoader=state;
  if(typeof IntersectionObserver!=='function')return;
  state.observer=new IntersectionObserver(entries=>{
    if(app.wallLoader!==state)return;
    for(const entry of entries){const img=entry.target;if(!entry.isIntersecting||!img.dataset.loadSrc||img.dataset.loadQueued)continue;img.dataset.loadQueued='1';state.observer.unobserve(img);const top=entry.rootBounds?.top||0;state.queue.push({img,src:img.dataset.loadSrc,priority:Math.max(0,entry.boundingClientRect.top-top)+(entry.boundingClientRect.bottom<=top?100000:0)});}
    state.queue.sort((a,b)=>a.priority-b.priority);pumpWallImages(state);
  },{root:completeWallView()?null:wall,rootMargin:'360px 0px'});
}
function observeWallImage(img,photo){if(app.wallLoader?.observer){img.dataset.loadSrc=photo.src;app.wallLoader.observer.observe(img);}else{img.loading='lazy';img.src=photo.src;}}
function toast(message){$('#toast span').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{$('#toast').hidden=true;},4200);}
function showDialog(id){const dialog=document.getElementById(id);if(!dialog.open)dialog.showModal();if(id==='lightbox'){dialog.scrollTop=0;fitMobilePhotoStory();}updateMotion();}
function closeDialog(id){document.getElementById(id).close();updateMotion();}

function openDatabase(){return new Promise((resolve,reject)=>{const request=indexedDB.open('shiguang-photo-wall',1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('photos'))db.createObjectStore('photos',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('请关闭旧的相册标签页后重试。'));});}
function readPhotos(){return new Promise((resolve,reject)=>{const request=app.db.transaction('photos','readonly').objectStore('photos').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function savePhoto(photo){return new Promise((resolve,reject)=>{const tx=app.db.transaction('photos','readwrite');tx.objectStore('photos').put(photo);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('照片保存中断。'));});}
function removePhoto(id){return new Promise((resolve,reject)=>{const tx=app.db.transaction('photos','readwrite');tx.objectStore('photos').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}

function deviceKey(){let key=safeRead('class7-device-key');if(!/^[a-f0-9]{64}$/.test(key)){key=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');safeWrite('class7-device-key',key);}if(safeRead('class7-device-key')!==key)throw new Error('请允许浏览器保存网站数据，才能记住昵称和管理自己的照片。');return key;}
async function api(path,options={}){const headers=new Headers(options.headers);try{headers.set('X-Device-Key',deviceKey());}catch(error){if(options.method&&options.method!=='GET'&&!app.account?.signedIn)throw error;}if(options.json){headers.set('Content-Type','application/json');options.body=JSON.stringify(options.json);delete options.json;}const requestGeneration=ownershipGeneration;const result=await cloudFetch('/api'+path,{...options,headers,credentials:'same-origin'});let data;if(result.status===406)throw new Error('上传请求被服务器拒绝（HTTP 406），原因尚未确认。可开启自动压缩大照片后重试。');try{data=await result.json();}catch{throw new Error('服务连接失败，请刷新页面后重试。');}if(!result.ok){if(result.status===401&&app.account?.signedIn&&requestGeneration===ownershipGeneration){app.account={...app.account,signedIn:false};app.profile=null;updateProfile();}const error=new Error(data.error||'操作失败，请重试。');error.status=result.status;throw error;}if(data.points&&requestGeneration===ownershipGeneration)document.dispatchEvent(new CustomEvent("class7:points",{detail:data.points}));return data;}
const isMine=photo=>photo.owned||photo.local;
let pointsRequest=0;
async function refreshAccountPoints(){
  const panel=$('#account-points'),version=++pointsRequest,generation=ownershipGeneration;
  if(!app.account?.signedIn){panel.hidden=true;return;}
  panel.hidden=false;
  try{
    const data=await api('/points');
    if(version!==pointsRequest||generation!==ownershipGeneration||!app.account?.signedIn)return;
    const total=Math.max(0,Number(data.totalPoints)||0),streak=Number(data.streak)||0;
    $('#account-points-value').textContent=total;
    $('#account-points-meta').textContent=(data.checkedIn?'今日已签到':'今日还未签到')+(streak?' · 已连续 '+streak+' 天':'');
  }catch{if(version===pointsRequest)panel.hidden=true;}
}
function updateProfile(){
 resetCommentEmojiIdentity();
  refreshCommentBoardIdentity();
  refreshReplyInbox();
  renderLinkedAccounts();
  updatePhotoLikeUI();
  const name=app.profile?.nickname,signed=!!app.account?.signedIn;
  $('#account-recovery-notice').hidden=app.view!=='mine'||signed;
  $('#profile-label').textContent=signed?(name||app.account.username):'登录';$('#profile-button').title=signed?'管理账号：'+app.account.username:'登录或注册照片集账号';$('#upload-nickname').textContent=name||'';$('#comment-identity').textContent=signed&&name?'以 '+name+' 的身份留言':'登录照片集账号，即可留言';
  $('#account-auth').hidden=signed;$('#account-settings').hidden=!signed;$('#login-title').textContent=signed?'账号与照片管理':'登录照片集';$('#account-username').textContent=app.account?.username||'';
  const photos=app.account?.legacyPhotos||0,comments=app.account?.legacyComments||0;
  $('#legacy-account-summary').textContent=photos||comments?'找到 '+photos+' 张旧照片、'+comments+' 条旧留言，关联后即可用此账号跨设备管理。':'当前身份没有待关联的旧照片或留言。';$('#link-existing').hidden=!(photos||comments);$('#link-existing').disabled=app.accountBusy;
  const url=app.account?.legacySignInUrl;if(url)$('#verify-legacy').href=url;
  $('#profile-button').classList.toggle('signed-in',signed);refreshAccountPoints();
}
function openLogin(action){if(!app.account?.signedIn){setAccountMode('login');$('#account-name').value=safeRead('class7-last-username');}app.pendingAction=typeof action==='function'?action:null;$('#nickname-input').value=app.profile?.nickname||safeRead('class7-nickname')||safeRead('shiguang-uploader');$('#account-nickname').value=$('#nickname-input').value;$('#account-password').value='';$('#account-confirm').value='';$('#login-error').hidden=true;$('#account-error').hidden=true;$('#legacy-account-result').hidden=true;updateProfile();showDialog('login-dialog');}
function withProfile(action){if(app.account?.signedIn&&app.profile)action();else openLogin(action);}
async function refreshIdentity(){const version=++identityRequest;const data=await api('/profile');if(version!==identityRequest)return;app.profile=data.profile;app.account=data.account;rememberAccountName();updateProfile();}
let accountMode='login';
function setAccountMode(mode){accountMode=mode;const register=mode==='register';$('#account-register-fields').hidden=!register;$('#account-confirm').required=register;$('#account-nickname').required=register;$('#account-password').autocomplete=register?'new-password':'current-password';$('#account-mode-login').setAttribute('aria-pressed',String(!register));$('#account-mode-register').setAttribute('aria-pressed',String(register));$('#account-submit').textContent=register?'注册并登录':'登录并恢复管理';$('#account-error').hidden=true;}
async function reloadOwnership(){
  ownershipGeneration++;resetPhotoCounts();
  app.minePhotos=[];app.mineCursor=null;app.mineLoaded=false;app.selected.clear();app.selecting=false;
  const photoId=app.visible[app.lightboxIndex]?.id;
  await loadCloud(false,false);if(app.view==='mine')await loadCloud(false,true);
  if($('#lightbox').open){const index=app.visible.findIndex(photo=>photo.id===photoId);if(index>=0){app.lightboxIndex=index;$('#delete-photo').hidden=!isMine(app.visible[index]);updateRotationControls();resetCaptionEditor();showPhotoLikes();}else closeDialog('lightbox');}
}
async function loadCloud(append=false,mine=app.view==='mine'){const pageKey=mine?'mine':'all';if(!append)photoPageVersions[pageKey]++;const pageVersion=photoPageVersions[pageKey],params=new URLSearchParams(),orderEpoch=photoOrderEpoch;if(weeklyActive()){params.set('sort','weekly');params.set('period',contestPeriod);}else if(rankingActive()){params.set('sort','likes');if(app.filter)params.set('uploader',app.filter);}if(mine)params.set('mine','1');const cursor=mine?app.mineCursor:app.nextCursor;if(append&&cursor)params.set('cursor',cursor);const generation=ownershipGeneration;const data=await api('/photos?'+params);if(generation!==ownershipGeneration||orderEpoch!==photoOrderEpoch||pageVersion!==photoPageVersions[pageKey])return;if(data.contest)acceptWeeklyContest(data);else acceptPhotoCounts(data,mine);if(mine){app.minePhotos=append?[...new Map([...app.minePhotos,...data.photos].map(photo=>[photo.id,photo])).values()]:data.photos;app.mineCursor=data.nextCursor;app.mineLoaded=true;}else{app.cloud=append?[...new Map([...app.cloud,...data.photos].map(photo=>[photo.id,photo])).values()]:data.photos;app.nextCursor=data.nextCursor;app.cloudLoaded=true;}$('#gallery-error').hidden=true;await refreshPhotos({},false);}
async function refreshPhotos(wallOptions={},readLocal=true){
  if(readLocal){
  let records=[];try{records=app.db?await readPhotos():[];}catch{toast('旧版本机照片读取失败，请保留原浏览器数据。');}
  for(const url of app.objectUrls)URL.revokeObjectURL(url);app.objectUrls=[];
  app.legacy=records.filter(record=>!record.sharedId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(record=>{const src=URL.createObjectURL(record.blob);app.objectUrls.push(src);return {...record,src,demo:false,local:true,owned:true};});
  }
  app.photos=[...new Map([...app.cloud,...app.minePhotos].map(photo=>[photo.id,photo])).values(),...app.legacy];const mine=photoTotalForView(true);
  $('#my-count').hidden=!mine;$('#my-count').textContent=mine;$('#local-sync-notice').hidden=!(app.view==='mine'&&app.legacy.length);$('#local-count').textContent=app.legacy.length;$('#load-more-photos').hidden=!(app.view==='mine'?app.mineCursor:app.nextCursor);
  refreshFilter();if(wallOptions.skipWall&&app.view==='all'&&app.cloudLoaded)return;renderWall(wallOptions);
}

function refreshFilter(){
  const select=$('#uploader-filter');
  const source=app.view==='mine'?app.photos.filter(isMine):app.photos;
  const counts=albumPhotoCounts[app.view==='mine'?'mine':'all'];const names=[...new Set([...source.map(photo=>photo.uploader),...(counts?.uploaders?.keys()||[]),...(app.filter?[app.filter]:[])])].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  select.replaceChildren(new Option('所有上传者',''));
  for(const name of names)select.add(new Option(name,name));
  if(!names.includes(app.filter))app.filter='';
  select.value=app.filter;
}

function photoCard(photo,duplicate,frameHeight,frameWidth){
  const button=document.createElement('button');button.type='button';button.className='photo-card';button.dataset.photoId=photo.id;button.style.height=frameHeight+'px';
  button.setAttribute('aria-label',`查看照片：${photo.title||'未命名的瞬间'}`);
  if(duplicate){button.tabIndex=-1;button.setAttribute('aria-hidden','true');}
  const img=document.createElement('img');img.alt=photo.title||'上传的照片';img.decoding='async';img.draggable=false;
  if(photo.width&&photo.height){img.width=photo.width;img.height=photo.height;}
  img.addEventListener('load',()=>{const before=photoAspect(photo);photo.width=img.naturalWidth;photo.height=img.naturalHeight;if(button.isConnected&&Math.abs(photoAspect(photo)-before)>.005)scheduleImageLayout();});
  img.addEventListener('error',()=>{button.classList.add('img-error');syncLaneHeights();});
  fitRotatedImage(img,photo,frameWidth,frameHeight);
  button.append(img);addPhotoRankBadge(button,photo);observeWallImage(img,photo);if(app.selecting){button.classList.add('selectable');const marker=document.createElement('span');marker.className='selection-mark';marker.setAttribute('aria-hidden','true');marker.innerHTML=icon('check');button.append(marker);}button.addEventListener('click',()=>{if(app.selecting)togglePhotoSelection(photo.id);else openPhoto(photo.id);});return button;
}

function renderWall({preserveOrder=false,preservePosition=false}={}){
  let photos=app.view==='mine'?app.photos.filter(isMine):app.photos.filter(photo=>!photo.local);
  $('#local-sync-notice').hidden=!(app.view==='mine'&&app.legacy.length);$('#load-more-photos').hidden=!(app.view==='mine'?app.mineCursor:app.nextCursor);
  $('#account-recovery-notice').hidden=app.view!=='mine'||!!app.account?.signedIn;
  if(rankingActive())photos=app.view==='mine'?app.minePhotos:app.cloud;if(app.filter)photos=photos.filter(photo=>photo.uploader===app.filter);
  app.visible=rankedWallPhotos(photos)||(preserveOrder?preservePhotoOrder(app.visible,photos):app.selecting?[...photos]:shuffle(photos));app.columns=columnCount();
  captureWallMotion();
  const wall=$('#photo-wall'),scrollTop=preservePosition?wall.scrollTop:0,phases=preservePosition?app.lanes.map(lane=>lane.height?lane.offset/lane.height:0):[];
  updateWallViewUI();const isStatic=completeWallView()||app.selecting||photos.length<8;wall.classList.toggle('static-wall',isStatic);
  app.wallWidth=wall.clientWidth;app.wallHeight=wall.clientHeight;beginWallImages(wall);wall.replaceChildren();app.lanes=[];
  const empty=$('#wall-empty');empty.hidden=!app.cloudLoaded||photos.length>0;$('#wall-loading').hidden=!!app.cloudLoaded||photos.length>0;
  $('#clear-filter').hidden=!app.filter;
  renderPhotoCount();
  $('#gallery-title').textContent=app.view==='mine'?'我留下的瞬间':'全班的瞬间';renderWeeklyContest();
  const columns=Math.min(app.columns,Math.max(1,weeklyActive()?photos.filter(photo=>photo.rank>3).length:photos.length));
  const measuredGap=parseFloat(getComputedStyle(wall).columnGap),gap=Number.isFinite(measuredGap)?measuredGap:8;
  const width=Math.max(1,(app.wallWidth-gap*(columns-1))/columns),distribution=balancePhotoColumns(weeklyActive()?app.visible.filter(photo=>photo.rank>3):app.visible,columns,width,app.wallHeight,gap);
  app.cardWidth=width;const fragment=document.createDocumentFragment(),built=[];
  for(let col=0;col<columns;col++){
    const lane=document.createElement('div');lane.className='photo-lane';
    const group=document.createElement('div');group.className='photo-group';
    distribution[col].forEach(({photo,height})=>group.append(photoCard(photo,false,height,width)));lane.append(group);
    if(!isStatic){const clone=document.createElement('div');clone.className='photo-group';clone.setAttribute('aria-hidden','true');distribution[col].forEach(({photo,height})=>clone.append(photoCard(photo,true,height,width)));lane.append(clone);}
    fragment.append(lane);built.push({element:lane,group,col});
  }
  wall.append(fragment);
  for(const {element,group,col} of built){const height=group.offsetHeight,offset=preservePosition?(phases[col]||0)*height:col%2?70:0;element.style.transform='translateY('+(-offset)+'px)';app.lanes.push({element,group,height,offset,lastOffset:offset,speed:8+col%3*2});}
  wall.scrollTop=scrollTop;
  $('#shuffle-button').disabled=app.selecting||photos.length<2;
  updateBulkUI();
  updateMotion();
}

function updateMotion(){
  const button=$('#motion-button');button.innerHTML=icon(app.playing?'pause':'play')+`<span>${app.playing?'暂停滚动':'继续滚动'}</span>`;button.setAttribute('aria-pressed',String(app.playing));button.title=app.playing?'暂停自动滚动':'继续自动滚动';
  const staticWall=$('#photo-wall').classList.contains('static-wall');
  button.disabled=staticWall;$('#wall-speed').disabled=staticWall;
  const status=$('#wall-status');
  if(app.selecting)status.textContent='点击照片选择，完成后可批量删除';
  else if(!app.visible.length)status.textContent='等待你的第一张照片';
  else if(completeWallView())status.textContent='完整浏览 · 向下滚动查看全部照片';else if(staticWall)status.textContent='这些瞬间，值得慢慢看';
  else if($('dialog[open]'))status.textContent='正在查看，照片墙已暂停';
  else if(!app.playing)status.textContent='已暂停，滚轮或滑动可以继续探索';
  else if(app.hoverPaused)status.textContent='停下来看看 · 移开鼠标继续流动';
  else status.textContent='照片缓缓流动，随时可以停下';
  refreshWallMotion();
}

// Compositor-driven automatic scrolling. requestAnimationFrame is used only
// for easing user input, or as a fallback when Web Animations is unavailable.
let wallInViewport=true,wallInputFrame=0,wallInputDelta=0,wallInputTime=0,wallFallbackFrame=0,wallFallbackTime=0;
function wrapWallOffset(value,height){return height>0?((value%height)+height)%height:0;}
function readWallOffset(lane){
 const time=lane.motion?.currentTime;
 return time!==null&&time!==undefined&&Number.isFinite(Number(time))?wrapWallOffset(Number(time)*lane.speed/1000,lane.motionHeight):lane.offset;
}
function placeWallLane(lane,value){
 lane.offset=wrapWallOffset(value,lane.height);lane.lastOffset=lane.offset;
 if(lane.motion)lane.motion.currentTime=lane.offset/lane.speed*1000;
 else lane.element.style.transform=`translate3d(0,${-lane.offset}px,0)`;
}
function wallShouldMove(){return !app.drawOpen&&!app.mallOpen&&!app.commentBoardOpen&&app.playing&&!app.hoverPaused&&!document.hidden&&wallInViewport&&!app.selecting&&!$('dialog[open]')&&!$('#photo-wall').classList.contains('static-wall');}
function captureWallMotion(){
 if(wallInputFrame)cancelAnimationFrame(wallInputFrame);wallInputFrame=0;wallInputDelta=0;wallInputTime=0;
 if(wallFallbackFrame)cancelAnimationFrame(wallFallbackFrame);wallFallbackFrame=0;wallFallbackTime=0;
 for(const lane of app.lanes){const offset=readWallOffset(lane);lane.motion?.cancel();lane.motion=null;placeWallLane(lane,offset);}
}
function fallbackWallFrame(timestamp){
 wallFallbackFrame=0;if(!wallShouldMove())return;
 const dt=wallFallbackTime?Math.min((timestamp-wallFallbackTime)/1000,.05):0;wallFallbackTime=timestamp;
 for(const lane of app.lanes)if(!lane.motion&&lane.height>50)placeWallLane(lane,lane.offset+dt*lane.speed*wallSpeed);
 wallFallbackFrame=requestAnimationFrame(fallbackWallFrame);
}
function refreshWallMotion(){
 const moving=wallShouldMove(),staticWall=$('#photo-wall').classList.contains('static-wall');let fallback=false;
 for(const lane of app.lanes){
  if(staticWall||lane.height<50){if(lane.motion){const offset=readWallOffset(lane);lane.motion.cancel();lane.motion=null;placeWallLane(lane,offset);}continue;}
  if(lane.motion&&lane.motionHeight!==lane.height){const offset=readWallOffset(lane);lane.motion.cancel();lane.motion=null;lane.offset=offset;}
  if(!lane.motion&&typeof lane.element.animate==='function'){
   lane.motionHeight=lane.height;
   lane.motion=lane.element.animate([{transform:'translate3d(0,0,0)'},{transform:`translate3d(0,${-lane.height}px,0)`}],{duration:lane.height/lane.speed*1000,iterations:Infinity,easing:'linear'});
   lane.motion.pause();lane.motion.currentTime=wrapWallOffset(lane.offset,lane.height)/lane.speed*1000;
  }
  if(lane.motion){
   if(lane.motion.playbackRate!==wallSpeed){if(typeof lane.motion.updatePlaybackRate==='function')lane.motion.updatePlaybackRate(wallSpeed);else lane.motion.playbackRate=wallSpeed;}
   if(moving){if(lane.motion.playState!=='running')lane.motion.play();}
   else if(lane.motion.playState!=='paused')lane.motion.pause();
  }else fallback=true;
 }
 if(moving&&fallback&&!wallFallbackFrame){wallFallbackTime=0;wallFallbackFrame=requestAnimationFrame(fallbackWallFrame);}
 if((!moving||!fallback)&&wallFallbackFrame){cancelAnimationFrame(wallFallbackFrame);wallFallbackFrame=0;wallFallbackTime=0;}
}
function easeWallInput(timestamp){
 wallInputFrame=0;
 const dt=wallInputTime?Math.min((timestamp-wallInputTime)/1000,.05):1/120;wallInputTime=timestamp;
 const step=Math.abs(wallInputDelta)<.05?wallInputDelta:wallInputDelta*(1-Math.exp(-22*dt));
 for(const lane of app.lanes)if(lane.height>50)placeWallLane(lane,readWallOffset(lane)+step);
 wallInputDelta-=step;
 if(Math.abs(wallInputDelta)>.01)wallInputFrame=requestAnimationFrame(easeWallInput);
 else{wallInputDelta=0;wallInputTime=0;}
}
function moveWallBy(delta,direct=false){
 if(!Number.isFinite(delta))return;
 if(direct){
  if(wallInputFrame)cancelAnimationFrame(wallInputFrame);wallInputFrame=0;
  for(const lane of app.lanes)if(lane.height>50)placeWallLane(lane,readWallOffset(lane)+delta+wallInputDelta);
  wallInputDelta=0;wallInputTime=0;return;
 }
 wallInputDelta+=delta;
 if(!wallInputFrame){wallInputTime=0;wallInputFrame=requestAnimationFrame(easeWallInput);}
}
function scrollWallInput(event){
 if($('#photo-wall').classList.contains('static-wall'))return;
 event.preventDefault();const scale=event.deltaMode===1?16:event.deltaMode===2?app.wallHeight:1;moveWallBy(event.deltaY*scale*.5);
}
function relayoutWallImages(){
 if(!app.cardWidth||!app.lanes.length)return;
 captureWallMotion();const photos=new Map(app.visible.map(photo=>[photo.id,photo]));
 for(const card of $$('.photo-card',$('#photo-wall'))){const photo=photos.get(card.dataset.photoId);if(!photo)continue;const height=photoFrameHeight(photo,app.cardWidth,app.wallHeight);card.style.height=height+'px';fitRotatedImage($('img',card),photo,app.cardWidth,height);}
 syncLaneHeights();refreshWallMotion();
}
function initWallMotion(){
 document.addEventListener('visibilitychange',()=>{if(document.hidden)captureWallMotion();refreshWallMotion();});
 if(typeof IntersectionObserver==='function')new IntersectionObserver(entries=>{const visible=entries[0]?.isIntersecting!==false;if(visible!==wallInViewport){wallInViewport=visible;refreshWallMotion();}},{threshold:0}).observe($('#photo-wall'));
 refreshWallMotion();
}

function openPhoto(id){app.lightboxIndex=app.visible.findIndex(photo=>photo.id===id);if(app.lightboxIndex<0)return;showPhoto();showDialog('lightbox');}
function photoDownload(photo){
  const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
  const extension=extensions[photo.mime||photo.blob?.type]||'jpg';
  const title=(photo.title||'photo').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,'_').replace(/\.(?:jpe?g|png|webp|gif|avif)$/i,'').replace(/[. ]+$/g,'').trim()||'photo';
  const target=new URL(photo.src,location.href);if(photo.shared)target.searchParams.set('download',title+'.'+extension);return {href:target.href,filename:title+'.'+extension};
}
function saveMessage(state,message){if(app.saveTarget===state){$('#save-photo-status').textContent=message;$('#save-photo-status').hidden=false;}}
function updateSaveControls(state){if(app.saveTarget!==state)return;$('#save-location').disabled=state.busy;$('#prepare-phone-save').disabled=state.busy;$('#share-phone-save').disabled=state.busy;}
function openSaveOptions(){
  const photo=app.visible[app.lightboxIndex];if(!photo)return;
  app.saveTarget?.controller?.abort();const download=photoDownload(photo),state={photo,filename:download.filename,busy:false,file:null,controller:null};app.saveTarget=state;
  $('#save-photo-name').textContent=state.filename;$('#save-photo-status').hidden=true;
  const picker=typeof window.showSaveFilePicker==='function';$('#save-location').hidden=!picker;
  $('#save-desktop-help').textContent=picker?'选择保存位置后，可保存到桌面或任意文件夹。':'此浏览器按下载设置保存。如需每次选择文件夹，请在浏览器下载设置中开启位置询问。';
  $('#save-browser-download').href=download.href;$('#save-browser-download').download=download.filename;$('#save-open-original').href=photo.src;
  $('#prepare-phone-save').hidden=!(navigator.share&&navigator.canShare);$('#share-phone-save').hidden=true;
  updateSaveControls(state);showDialog('save-photo-dialog');
}
async function saveOriginalResponse(state){const response=await cloudFetch(state.photo.shared?'/api/files/'+encodeURIComponent(state.photo.id)+'?raw=1':state.photo.src,{credentials:'same-origin',signal:state.controller.signal});if(!response.ok)throw new Error('照片读取失败，请重试。');return response;}
async function saveToLocation(){
  const state=app.saveTarget;if(!state||state.busy)return;state.busy=true;state.controller=new AbortController();updateSaveControls(state);let writable;
  try{
    // The picker must run directly from the click, before any network await.
    const handle=await window.showSaveFilePicker({suggestedName:state.filename,startIn:'desktop'});
    if(app.saveTarget!==state)return;saveMessage(state,'正在保存照片…');const response=await saveOriginalResponse(state);writable=await handle.createWritable();
    if(response.body)await response.body.pipeTo(writable);else{await writable.write(await response.arrayBuffer());await writable.close();}
    saveMessage(state,'已保存到你选择的位置。');
  }catch(error){if(writable)try{await writable.abort();}catch{}saveMessage(state,error.name==='AbortError'?'已取消保存。':error.message||'保存失败，请重新选择位置。');}
  finally{state.busy=false;updateSaveControls(state);}
}
async function preparePhoneSave(){
  const state=app.saveTarget;if(!state||state.busy)return;state.busy=true;state.controller=new AbortController();updateSaveControls(state);saveMessage(state,'正在准备照片…');
  try{
    const response=await saveOriginalResponse(state),blob=await response.blob();if(app.saveTarget!==state)return;
    const file=new File([blob],state.filename,{type:blob.type||state.photo.mime||state.photo.blob?.type||'image/jpeg'});
    if(!navigator.canShare({files:[file]})){saveMessage(state,'此浏览器不支持系统图片保存菜单。请打开照片，长按图片选择保存。');return;}
    state.file=file;$('#prepare-phone-save').hidden=true;$('#share-phone-save').hidden=false;saveMessage(state,'图片已准备好。点击“打开系统保存菜单”，选择保存图片；没有此选项时，可打开照片后长按保存。');
  }catch(error){saveMessage(state,error.name==='AbortError'?'已取消准备。':error.message||'图片准备失败，请重试。');}
  finally{state.busy=false;updateSaveControls(state);}
}
async function sharePhonePhoto(){
  const state=app.saveTarget;if(!state?.file||state.busy)return;state.busy=true;updateSaveControls(state);
  try{await navigator.share({files:[state.file],title:state.photo.title||'七班照片'});saveMessage(state,'已交由系统保存/分享菜单处理。');}
  catch(error){saveMessage(state,error.name==='AbortError'?'已取消，可重新选择保存方式。':'未能打开系统菜单，请打开照片后长按保存。');}
  finally{state.busy=false;updateSaveControls(state);}
}

function showPhoto(){
  const photo=app.visible[app.lightboxIndex];if(!photo)return;
  const download=photoDownload(photo),link=$('#download-photo');link.href=download.href;link.download=download.filename;
  const img=$('#lightbox-image');img.src=photo.src;img.alt=photo.title||'未命名的瞬间';
  $('#lightbox-title').textContent=photo.title||'未命名的瞬间';
  $('#lightbox-caption').textContent=photo.caption||'没有添加说明，照片已经说了很多。';
  resetCaptionEditor();
  $('#lightbox-uploader').textContent=photo.uploader;
  $('#lightbox-date').textContent=new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(photo.createdAt));
  $('#lightbox-dimensions').textContent=photo.width&&photo.height?`${photo.width} × ${photo.height}`:'正在读取…';
  img.onload=()=>{photo.width=img.naturalWidth;photo.height=img.naturalHeight;fitLightboxPhoto();};
  $('#rotation-status').textContent='每次 90° · 自动保存';fitLightboxPhoto();updateRotationControls();
  $('#lightbox-position').textContent=`${String(app.lightboxIndex+1).padStart(2,'0')} / ${String(app.visible.length).padStart(2,'0')}`;
  $('#lightbox-tag').textContent=photo.local?'旧版照片 · 仅本机可见':'CLASS 7 · 共享相册';
  $('#delete-photo').hidden=!isMine(photo);$('#delete-help').hidden=!isMine(photo);
  $('#delete-description').textContent=photo.local?'这张照片将从当前浏览器中删除，删除后无法恢复。':'照片和它下面的留言将从共享相册中删除，删除后无法恢复。';
  if(commentFocus?.photoId!==photo.id)commentFocus=null;resetCommentEmoji();resetCommentReply();app.commentPhoto=photo.id;app.comments=[];app.commentCursor=null;$('#comment-body').value='';$('#comment-error').hidden=true;$('#comment-form').hidden=!!photo.local;$('#refresh-comments').hidden=!!photo.local;$('#older-comments').hidden=true;$('#comment-count').textContent='';$('#comment-list').textContent=photo.local?'同步到共享相册后，就可以一起留言。':'正在读取留言…';
  if(!photo.local)loadComments().catch(commentError);showPhotoLikes();
  $('#previous-photo').hidden=app.visible.length<2;$('#next-photo').hidden=app.visible.length<2;resetMobilePhotoStory();if($('#lightbox').open)$('#lightbox').scrollTop=0;
}
function nextPhoto(direction){if(!app.visible.length)return;app.lightboxIndex=(app.lightboxIndex+direction+app.visible.length)%app.visible.length;showPhoto();}

function updateCaptionControls(){
  const photo=app.visible[app.lightboxIndex];$('#edit-caption').hidden=!photo||!isMine(photo)||app.captionEditingId===photo.id;
  $('#edit-caption').disabled=!!app.captionBusy;$('#save-caption').disabled=!!app.captionBusy;$('#cancel-caption').disabled=!!app.captionBusy;$('#caption-input').disabled=!!app.captionBusy;
  $('#save-caption').textContent=app.captionBusy?'正在保存…':'保存说明';
}
function resetCaptionEditor(){app.captionEditingId=null;$('#caption-edit-form').hidden=true;$('#lightbox-caption').hidden=false;$('#caption-save-status').hidden=true;$('#caption-input').value='';updateCaptionControls();}
function openCaptionEditor(){
  const photo=app.visible[app.lightboxIndex];if(!photo||!isMine(photo)||app.captionBusy)return;
  app.captionEditingId=photo.id;$('#caption-input').value=photo.caption||'';$('#caption-edit-count').textContent=(photo.caption||'').length+' / 500';$('#caption-edit-form').hidden=false;$('#lightbox-caption').hidden=true;$('#caption-save-status').hidden=true;updateCaptionControls();$('#caption-input').focus();
}
async function saveCaption(event){
  event.preventDefault();const photo=app.visible[app.lightboxIndex];if(app.captionBusy||!photo||!isMine(photo)||app.captionEditingId!==photo.id)return;
  const id=photo.id,caption=$('#caption-input').value.trim();if(caption.length>500){$('#caption-save-status').textContent='说明请控制在 500 个字符以内。';$('#caption-save-status').hidden=false;return;}
  app.captionBusy=true;updateCaptionControls();$('#caption-save-status').hidden=true;
  try{
    let saved=caption;
    if(photo.local)await savePhoto({...photo,caption});else{const data=await api('/photos/'+encodeURIComponent(id)+'/caption',{method:'POST',json:{caption}});saved=data.photo.caption;}
    for(const list of [app.photos,app.cloud,app.minePhotos,app.visible,app.legacy])for(const item of list)if(item.id===id)item.caption=saved;
    if(app.visible[app.lightboxIndex]?.id===id&&app.captionEditingId===id){$('#lightbox-caption').textContent=saved||'没有添加说明，照片已经说了很多。';$('#lightbox-caption').hidden=false;app.captionEditingId=null;$('#caption-edit-form').hidden=true;$('#caption-save-status').textContent=photo.local?'已保存在本机；同步后其他人可见。':'说明已保存，其他人重新打开或刷新详情即可看到。';$('#caption-save-status').hidden=false;}
    toast(photo.local?'说明已保存在本机':'照片说明已更新');
  }catch(error){if(app.visible[app.lightboxIndex]?.id===id&&app.captionEditingId===id){$('#caption-save-status').textContent='保存失败，修改内容已保留。'+error.message;$('#caption-save-status').hidden=false;}else toast(error.message);}
  finally{app.captionBusy=false;updateCaptionControls();}
}

function fitLightboxPhoto(){
  const photo=app.visible[app.lightboxIndex],stage=$('#lightbox-image-stage');if(!photo)return;
  fitRotatedImage($('#lightbox-image'),photo,stage.clientWidth,stage.clientHeight);
  if(photo.width&&photo.height){const swap=photoRotation(photo)%180;$('#lightbox-dimensions').textContent=swap?`${photo.height} × ${photo.width}`:`${photo.width} × ${photo.height}`;}
}
function updateRotationControls(){
  const photo=app.visible[app.lightboxIndex];$('#photo-rotation-tools').hidden=!photo||!isMine(photo);
  $('#rotate-left').disabled=!!app.rotationBusy;$('#rotate-right').disabled=!!app.rotationBusy;
  $('#rotation-angle').textContent=photoRotation(photo||{})+'°';
}
async function rotateCurrentPhoto(turn){
  const photo=app.visible[app.lightboxIndex];if(!photo||!isMine(photo)||app.rotationBusy||(turn!==1&&turn!==-1))return;
  const id=photo.id;app.rotationBusy=true;updateRotationControls();$('#rotation-status').textContent='正在保存…';
  try{
    let rotation;
    if(photo.local){rotation=(photoRotation(photo)+turn*90+360)%360;await savePhoto({...photo,rotation});}
    else{const data=await api('/photos/'+encodeURIComponent(id)+'/rotation',{method:'POST',json:{turn}});rotation=data.photo.rotation;}
    for(const list of [app.photos,app.cloud,app.minePhotos,app.visible,app.legacy])for(const item of list)if(item.id===id)item.rotation=rotation;
    renderWall({preserveOrder:true,preservePosition:true});
    if(app.visible[app.lightboxIndex]?.id===id){fitLightboxPhoto();$('#rotation-status').textContent=photo.local?'已保存在本机':'已保存，其他人也能看到';}
  }catch(error){if(app.visible[app.lightboxIndex]?.id===id)$('#rotation-status').textContent='保存失败，请重试';toast(error.message);}
  finally{app.rotationBusy=false;updateRotationControls();}
}

function openUpload(tier){if(app.busy||app.bulkBusy)return;withProfile(()=>{configureAdminUpload(typeof tier==='string'&&vaultStatusState.admin?tier:null);$('#upload-error').hidden=true;updateProfile();showDialog('upload-dialog');});}

function releaseSelected(){for(const entry of app.files)URL.revokeObjectURL(entry.preview);app.files=[];renderSelection();}
function photoCaption(entry,shared){return entry.caption?.trim()||shared;}
function fitUploadPreview(img,entry,stage){fitRotatedImage(img,entry,stage.clientWidth,stage.clientHeight);}
function openUploadPhoto(entry){
  if(app.busy||!app.files.includes(entry))return;app.editingFile=entry;
  const index=app.files.indexOf(entry),img=$('#upload-edit-image');
  $('#upload-edit-title').textContent='编辑第 '+(index+1)+' 张照片';$('#upload-edit-name').textContent=entry.file.name;
  $('#upload-edit-position').textContent=(index+1)+' / '+app.files.length;
  $('#upload-edit-caption').value=entry.caption||'';$('#upload-edit-caption-count').textContent=(entry.caption||'').length+' / 500';
  $('#upload-edit-angle').textContent=photoRotation(entry)+'°';
  $('#upload-edit-previous').disabled=index===0;$('#upload-edit-next').disabled=index===app.files.length-1;
  img.onload=()=>{if(app.editingFile===entry){entry.width=img.naturalWidth;entry.height=img.naturalHeight;fitUploadEditor();}};
  img.src=entry.preview;img.alt=entry.file.name;showDialog('upload-edit-dialog');fitUploadEditor();
}
function fitUploadEditor(){const entry=app.editingFile;if(entry)fitUploadPreview($('#upload-edit-image'),entry,$('#upload-edit-stage'));}
function rotateUploadPhoto(turn){
  const entry=app.editingFile;if(app.busy||!entry||!app.files.includes(entry)||(turn!==1&&turn!==-1))return;
  entry.rotation=(photoRotation(entry)+turn*90+360)%360;$('#upload-edit-angle').textContent=entry.rotation+'°';fitUploadEditor();
}
function nextUploadPhoto(direction){const index=app.files.indexOf(app.editingFile),entry=app.files[index+direction];if(entry)openUploadPhoto(entry);}
function updatePhotoNotesSummary(){
  const count=app.files.filter(entry=>entry.caption?.trim()).length;
  $('#photo-notes-tools').hidden=!app.files.length;
  $('#upload-edit-hint').hidden=!app.files.length;
  $('#photo-notes-summary').textContent='已选 '+app.files.length+' 张 · 已单独填写 '+count+' 张';
  $('#toggle-photo-notes').textContent=app.individualNotes?'收起逐张说明':'逐张填写说明';
  $('#toggle-photo-notes').setAttribute('aria-expanded',String(app.individualNotes));$('#toggle-photo-notes').disabled=app.busy;
}
function renderSelection(){
  const container=$('#selected-files'),scrollTop=$('.upload-scroll').scrollTop;container.replaceChildren();container.classList.toggle('individual-notes',app.individualNotes);
  for(const [index,entry] of app.files.entries()){
    entry.noteId??='photo-note-'+crypto.randomUUID();
    const item=document.createElement('div');item.className='selected-file';item.setAttribute('role','listitem');item.classList.toggle('has-note',!!entry.caption?.trim());
    const thumb=document.createElement('div');thumb.className='selected-thumb';
    const edit=document.createElement('button');edit.type='button';edit.className='edit-upload-photo';edit.disabled=app.busy;edit.setAttribute('aria-label','编辑第 '+(index+1)+' 张照片：'+entry.file.name);edit.title='点击单独旋转或填写说明';
    const img=document.createElement('img');img.alt=entry.file.name;img.decoding='async';
    img.onload=()=>{entry.width=img.naturalWidth;entry.height=img.naturalHeight;fitUploadPreview(img,entry,edit);};img.src=entry.preview;
    renderCompressionNote(entry,thumb);edit.append(img);edit.addEventListener('click',()=>openUploadPhoto(entry));
    const remove=document.createElement('button');remove.type='button';remove.className='remove-file';remove.setAttribute('aria-label','移除 '+entry.file.name);remove.disabled=app.busy;remove.innerHTML=icon('close');
    remove.addEventListener('click',()=>{if(app.busy)return;URL.revokeObjectURL(entry.preview);app.files=app.files.filter(item=>item!==entry);renderSelection();});thumb.prepend(edit,remove);item.append(thumb);
    if(app.individualNotes){
      const editor=document.createElement('div');editor.className='photo-note-editor';
      const label=document.createElement('label');label.htmlFor=entry.noteId;label.textContent=entry.file.name+' 的说明';label.title=entry.file.name;
      const input=document.createElement('textarea');input.id=entry.noteId;input.rows=2;input.maxLength=500;input.value=entry.caption||'';input.placeholder='这张照片有什么故事？留空使用统一说明';input.disabled=app.busy;
      const hint=document.createElement('div');hint.className='photo-note-hint';const help=document.createElement('span');help.textContent='单独说明优先；留空使用统一说明';const count=document.createElement('span');count.textContent=input.value.length+' / 500';hint.append(help,count);
      input.addEventListener('input',()=>{if(app.busy)return;entry.caption=input.value;count.textContent=input.value.length+' / 500';item.classList.toggle('has-note',!!entry.caption.trim());updatePhotoNotesSummary();});
      editor.append(label,input,hint);item.append(editor);
    }
    container.append(item);
  }
  $('.upload-scroll').scrollTop=scrollTop;
  const size=app.files.reduce((sum,entry)=>sum+entry.file.size,0);
  $('#selection-summary').textContent=app.files.length?'已选 '+app.files.length+' 张 · '+window.Class7PhotoCompression.formatBytes(size):'还没有选择照片';
  updatePhotoNotesSummary();
}
function addFiles(files){
  if(app.busy)return;
  let rejected=0;
  const allowed=['image/jpeg','image/png','image/webp','image/gif','image/avif'];
  for(const file of files){if(!allowed.includes(file.type)){rejected++;continue;}if(app.files.some(entry=>entry.file.name===file.name&&entry.file.size===file.size&&entry.file.lastModified===file.lastModified))continue;app.files.push({file,preview:URL.createObjectURL(file),caption:''});}
  renderSelection();$('#photo-input').value='';
  if(rejected){$('#upload-error').textContent=`有 ${rejected} 个文件不是支持的图片格式，已跳过。`;$('#upload-error').hidden=false;}else $('#upload-error').hidden=true;
}
function imageDimensions(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>reject(new Error('图片无法解码，请换一张可正常打开的照片。'));image.src=src;});}
async function uploadDimensions(entry){
  if(Number.isInteger(entry.width)&&entry.width>0&&Number.isInteger(entry.height)&&entry.height>0)return {width:entry.width,height:entry.height};
  const dimensions=await imageDimensions(entry.preview);entry.width=dimensions.width;entry.height=dimensions.height;return dimensions;
}

function metadataHeader(meta){return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(meta))));}
async function shareFile(file,meta){const data=await api(meta.rarity?'/admin/photos':'/photos',{method:'POST',headers:{'Content-Type':file.type,'X-Photo-Metadata':metadataHeader(meta)},body:file}),photo={...data.photo,vault:data.vault===true};if(!photo.vault)adjustPhotoCounts(photo,1);return photo;}
async function uploadWithLimit(entries,task,onProgress=()=>{}){
  let next=0,finished=0;const successes=[],failures=[];
  async function worker(){while(next<entries.length){const entry=entries[next++];try{const value=await task(entry);successes.push({entry,value});}catch(error){failures.push({entry,error});}finally{onProgress(++finished,entries.length);}}}
  await Promise.all(Array.from({length:Math.min(3,entries.length)},()=>worker()));return {successes,failures};
}
async function uploadPhotos(event){
  event.preventDefault();if(app.busy)return;const error=$('#upload-error');error.hidden=true;
  if(!app.profile){openLogin();return;}if(!app.files.length){error.textContent='先选择至少一张照片吧。';error.hidden=false;return;}
  const queue=[...app.files],caption=$('#photo-caption').value.trim(),title=$('#photo-title').value.trim();
  app.busy=true;$('#auto-compress').disabled=true;$('#submit-upload').disabled=true;$('#photo-input').disabled=true;$('#change-upload-name').disabled=true;$('#photo-title').disabled=true;$('#photo-caption').disabled=true;renderSelection();$('#submit-upload').textContent='正在上传…';$('#upload-progress').hidden=false;$('#upload-progress').value=0;$('#selection-summary').textContent='已处理 0 / '+queue.length+' 张';
  try{
    const result=await uploadWithLimit(queue,async entry=>{const dimensions=await uploadDimensions(entry),prepared=await prepareUploadFile(entry,dimensions);return shareFile(prepared.file,{title,caption:photoCaption(entry,caption),rotation:photoRotation(entry),width:prepared.width,height:prepared.height,rarity:adminUploadTier});},(finished,total)=>{$('#upload-progress').value=finished/total*100;$('#selection-summary').textContent='已处理 '+finished+' / '+total+' 张';});
    const uploaded=new Set(result.successes.map(item=>item.entry));
    for(const item of result.successes){if(!item.value.vault)app.cloud.unshift(item.value);URL.revokeObjectURL(item.entry.preview);}
    app.files=app.files.filter(entry=>!uploaded.has(entry));
    if(result.successes.length){if(adminUploadTier!=='classified'){app.view='mine';app.filter='';updateTabs();}await refreshPhotos();}
    if(result.failures.length){const first=result.failures[0];error.textContent='已上传 '+result.successes.length+' 张，'+result.failures.length+' 张未完成。再次点击上传只会重试保留的照片。'+first.entry.file.name+'：'+(first.error.message||'上传失败，请重试。');error.hidden=false;}
    else{$('#photo-title').value='';$('#photo-caption').value='';closeDialog('upload-dialog');const compressedCount=result.successes.filter(item=>item.entry.preparedUpload?.compressed).length;toast(result.successes.length+(adminUploadTier==='classified'?' 张保密卡已上传，仅在商城刷新':' 张照片已加入共享相册')+(compressedCount?'，其中 '+compressedCount+' 张已压缩':''));if(adminUploadTier==='classified')openPhotoManager();}
  }catch(e){error.textContent=e.message||'上传暂时中断，请重试。';error.hidden=false;}
  finally{app.busy=false;$('#auto-compress').disabled=false;$('#submit-upload').disabled=false;$('#photo-input').disabled=false;$('#change-upload-name').disabled=false;$('#photo-title').disabled=false;$('#photo-caption').disabled=false;$('#submit-upload').innerHTML=icon('upload')+'加入照片墙';$('#upload-progress').hidden=true;renderSelection();updateAdminUploadUI();}
}
function commentError(error){$('#comment-error').textContent=error.message||'留言读取失败，请重试。';$('#comment-error').hidden=false;}
function commentTime(value){return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
function renderCommentsLegacy(){const list=$('#comment-list');list.replaceChildren();if(!app.comments.length){const empty=document.createElement('p');empty.className='comment-empty';empty.textContent='还没有留言。让第一句话，从你开始。';list.append(empty);}for(const item of app.comments){const article=document.createElement('article');article.className='comment';const head=document.createElement('div');head.className='comment-head';const author=document.createElement('strong');author.textContent=item.author;const time=document.createElement('time');time.dateTime=item.createdAt;time.textContent=commentTime(item.createdAt);head.append(author,time);const body=document.createElement('p');body.textContent=item.body;article.append(head,body);if(item.mine){const remove=document.createElement('button');remove.type='button';remove.className='text-button comment-delete';remove.textContent='删除';remove.setAttribute('aria-label','删除自己在 '+time.textContent+' 的留言');remove.addEventListener('click',async()=>{if(remove.dataset.confirm!=='yes'){remove.textContent='确认删除';remove.dataset.confirm='yes';return;}remove.disabled=true;try{await api('/comments/'+item.id,{method:'DELETE'});if(app.commentPhoto)await loadComments();}catch(e){commentError(e);remove.disabled=false;}});article.append(remove);}list.append(article);}$('#older-comments').hidden=!app.commentCursor;}
async function loadCommentsLegacy(older=false){const id=app.commentPhoto;if(!id||id.startsWith('local-'))return;const data=await api('/photos/'+encodeURIComponent(id)+'/comments'+(older&&app.commentCursor?'?cursor='+encodeURIComponent(app.commentCursor):''));if(id!==app.commentPhoto)return;const merged=older?[...data.comments,...app.comments]:data.comments;app.comments=[...new Map(merged.map(item=>[item.id,item])).values()];app.commentCursor=data.nextCursor;$('#comment-count').textContent=data.total;$('#comment-error').hidden=true;renderComments();}
async function postComment(event){event.preventDefault();if(app.commentBusy)return;withProfile(async()=>{const body=$('#comment-body').value.trim(),id=app.commentPhoto;if((!body&&!commentEmojiSelection)||!id)return;app.commentBusy=true;$('#send-comment').disabled=true;$('#send-comment').textContent='发送中…';try{await api('/photos/'+encodeURIComponent(id)+'/comments',{method:'POST',json:{body,replyToId:commentReplyTarget?.id||null,emojiInventoryId:commentEmojiSelection?.inventoryId||null}});if(id===app.commentPhoto){$('#comment-body').value='';resetCommentEmoji();resetCommentReply();commentFocus=null;await loadComments();}toast('留言已发送');}catch(e){commentError(e);}finally{app.commentBusy=false;$('#send-comment').disabled=false;$('#send-comment').textContent=commentReplyTarget?'发送回复':'发送留言';}});}
async function syncLegacy(){if(app.busy)return;withProfile(async()=>{app.busy=true;$('#sync-local').disabled=true;let count=0;try{for(const record of [...app.legacy]){const dimensions=record.width&&record.height?{width:record.width,height:record.height}:await imageDimensions(record.src);const photo=await shareFile(record.blob,{title:(record.title||'未命名的瞬间').slice(0,100),caption:record.caption||'',rotation:photoRotation(record),...dimensions});await savePhoto({...record,src:undefined,sharedId:photo.id});app.cloud.unshift(photo);count++;$('#sync-local').textContent='已同步 '+count+' 张…';}toast(count+' 张旧版照片已分享');}catch(e){toast('已同步 '+count+' 张。'+e.message);}finally{app.busy=false;$('#sync-local').disabled=false;$('#sync-local').textContent='同步到共享相册 →';await refreshPhotos();}});}


function updateTabs(){for(const button of $$('.nav-tab')){const active=button.dataset.view===app.view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}}

for(const button of $$('[data-open-upload]'))button.addEventListener('click',openUpload);
$('#theme-toggle').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';applyTheme(theme);safeWrite('class7-theme',theme);});
for(const button of $$('[data-close-dialog]'))button.addEventListener('click',()=>{if((button.dataset.closeDialog==='upload-dialog'&&app.busy)||(button.dataset.closeDialog==='bulk-delete-dialog'&&app.bulkBusy))return;closeDialog(button.dataset.closeDialog);});
for(const dialog of $$('dialog')){
  dialog.addEventListener('close',updateMotion);
  dialog.addEventListener('cancel',event=>{if((dialog.id==='upload-dialog'&&app.busy)||(dialog.id==='bulk-delete-dialog'&&app.bulkBusy))event.preventDefault();});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom){if((dialog.id==='upload-dialog'&&app.busy)||(dialog.id==='bulk-delete-dialog'&&app.bulkBusy))return;dialog.close();}});
}
for(const id of ['footer-preview'])document.getElementById(id).addEventListener('click',()=>showDialog('info-dialog'));
for(const button of $$('.nav-tab'))button.addEventListener('click',()=>{if(app.bulkBusy)return;closeCommentBoard();if(weeklyActive()){photoOrder='random';safeWrite('class7-photo-order',photoOrder);app.view=button.dataset.view;app.filter='';updateTabs();reloadPhotoOrder();return;}app.selecting=false;app.selected.clear();$('#bulk-error').hidden=true;app.view=button.dataset.view;app.filter='';updateTabs();if(rankingActive()){reloadPhotoOrder();return;}refreshFilter();renderWall();if(app.view==='mine'&&!app.mineLoaded)loadCloud(false,true).catch(e=>toast(e.message));});
$('#uploader-filter').addEventListener('change',event=>{changePhotoFilter(event.target.value);});
$('#clear-filter').addEventListener('click',()=>{changePhotoFilter('');});
$('#shuffle-button').addEventListener('click',()=>{renderWall();toast('换个视角，遇见另一段风景');});
$('#motion-button').addEventListener('click',()=>{app.playing=!app.playing;updateMotion();});
$('#photo-wall').addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){app.hoverPaused=true;updateMotion();}});
$('#photo-wall').addEventListener('pointerleave',()=>{app.hoverPaused=false;updateMotion();});
$('#photo-wall').addEventListener('wheel',scrollWallInput,{passive:false});
let touchY=null;
$('#photo-wall').addEventListener('touchstart',event=>{if($('#photo-wall').classList.contains('static-wall'))return;touchY=event.touches[0].clientY;app.hoverPaused=true;updateMotion();},{passive:true});
$('#photo-wall').addEventListener('touchmove',event=>{if(touchY===null||$('#photo-wall').classList.contains('static-wall'))return;event.preventDefault();const y=event.touches[0].clientY;moveWallBy(touchY-y,true);touchY=y;},{passive:false});
$('#photo-wall').addEventListener('touchend',()=>{touchY=null;app.hoverPaused=false;updateMotion();});
$('#photo-wall').addEventListener('touchcancel',()=>{touchY=null;app.hoverPaused=false;updateMotion();});
$('#photo-wall').addEventListener('keydown',event=>{if($('dialog[open]'))return;if(event.key==='ArrowDown'||event.key==='ArrowUp'){if($('#photo-wall').classList.contains('static-wall'))return;event.preventDefault();moveWallBy(event.key==='ArrowDown'?90:-90);}});
$('#previous-photo').addEventListener('click',()=>nextPhoto(-1));$('#next-photo').addEventListener('click',()=>nextPhoto(1));
$('#rotate-left').addEventListener('click',()=>rotateCurrentPhoto(-1));$('#rotate-right').addEventListener('click',()=>rotateCurrentPhoto(1));
$('#edit-caption').addEventListener('click',openCaptionEditor);$('#caption-edit-form').addEventListener('submit',saveCaption);
$('#cancel-caption').addEventListener('click',()=>{if(!app.captionBusy)resetCaptionEditor();});
$('#caption-input').addEventListener('input',event=>{$('#caption-edit-count').textContent=event.target.value.length+' / 500';});
new ResizeObserver(fitLightboxPhoto).observe($('#lightbox-image-stage'));
$('#lightbox').addEventListener('keydown',event=>{if(/^(INPUT|TEXTAREA)$/.test(event.target.tagName)||event.target.isContentEditable)return;if(event.key==='ArrowLeft'){event.preventDefault();nextPhoto(-1);}else if(event.key==='ArrowRight'){event.preventDefault();nextPhoto(1);}});
$('#details-toggle').addEventListener('click',()=>{const details=$('#photo-details');details.hidden=!details.hidden;$('#details-toggle').setAttribute('aria-expanded',String(!details.hidden));});
$('#save-photo-options').addEventListener('click',openSaveOptions);$('#save-location').addEventListener('click',saveToLocation);$('#prepare-phone-save').addEventListener('click',preparePhoneSave);$('#share-phone-save').addEventListener('click',sharePhonePhoto);
$('#save-photo-dialog').addEventListener('close',()=>{app.saveTarget?.controller?.abort();app.saveTarget=null;});
$('#delete-photo').addEventListener('click',()=>showDialog('delete-dialog'));
$('#confirm-delete').addEventListener('click',async()=>{const photo=app.visible[app.lightboxIndex];if(!photo||!isMine(photo))return;$('#confirm-delete').disabled=true;try{if(photo.local)await removePhoto(photo.id);else{await api('/photos/'+photo.id,{method:'DELETE'});adjustPhotoCounts(photo,-1);app.cloud=app.cloud.filter(item=>item.id!==photo.id);app.minePhotos=app.minePhotos.filter(item=>item.id!==photo.id);}closeDialog('delete-dialog');closeDialog('lightbox');await refreshPhotos();toast(photo.local?'照片已从本机删除':'照片和留言已删除');}catch(e){toast(e.message);}finally{$('#confirm-delete').disabled=false;}});
$('#photo-input').addEventListener('change',event=>addFiles(event.target.files));
$('#upload-edit-left').addEventListener('click',()=>rotateUploadPhoto(-1));$('#upload-edit-right').addEventListener('click',()=>rotateUploadPhoto(1));
$('#upload-edit-previous').addEventListener('click',()=>nextUploadPhoto(-1));$('#upload-edit-next').addEventListener('click',()=>nextUploadPhoto(1));
$('#upload-edit-caption').addEventListener('input',event=>{if(app.editingFile&&!app.busy){app.editingFile.caption=event.target.value;$('#upload-edit-caption-count').textContent=event.target.value.length+' / 500';}});
$('#upload-edit-dialog').addEventListener('close',()=>{app.editingFile=null;renderSelection();});
new ResizeObserver(fitUploadEditor).observe($('#upload-edit-stage'));
$('#drop-zone').addEventListener('dragover',event=>{event.preventDefault();if(!app.busy)$('#drop-zone').classList.add('drag-over');});
$('#drop-zone').addEventListener('dragleave',()=>$('#drop-zone').classList.remove('drag-over'));
$('#drop-zone').addEventListener('drop',event=>{event.preventDefault();$('#drop-zone').classList.remove('drag-over');addFiles(event.dataTransfer.files);});
$('#upload-form').addEventListener('submit',uploadPhotos);
$('#toggle-photo-notes').addEventListener('click',()=>{if(app.busy)return;app.individualNotes=!app.individualNotes;renderSelection();});
$('#fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('.gallery-section').requestFullscreen();}catch{toast('当前浏览器暂不支持全屏，请使用大图查看');}});
let resizeTimer;
new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const wall=$('#photo-wall');if(app.photos.length&&(columnCount()!==app.columns||Math.abs(wall.clientWidth-app.wallWidth)>1||(!completeWallView()&&Math.abs(wall.clientHeight-app.wallHeight)>1)))renderWall({preserveOrder:true,preservePosition:true});},120);}).observe($('#photo-wall'));
reducedMotion.addEventListener('change',event=>{if(event.matches)app.playing=false;updateMotion();});

$('#refresh-gallery').addEventListener('click',async()=>{$('#refresh-gallery').disabled=true;try{await loadCloud();toast('相册已更新');}catch(e){toast(e.message);}finally{$('#refresh-gallery').disabled=false;}});
$('#profile-button').addEventListener('click',()=>openLogin());
document.addEventListener('class7:points',event=>{pointsRequest++;if(app.account?.signedIn&&!$('#account-points').hidden)$('#account-points-value').textContent=Math.max(0,Number(event.detail?.total)||0);});
$('#change-upload-name').addEventListener('click',()=>openLogin());
$('#login-form').addEventListener('submit',async event=>{event.preventDefault();if(!app.account?.signedIn)return;const nickname=$('#nickname-input').value.trim();if(!nickname)return;$('#save-nickname').disabled=true;try{await api('/profile',{method:'POST',json:{nickname}});safeWrite('class7-nickname',nickname);await refreshIdentity();toast('昵称已保存');}catch(e){$('#login-error').textContent=e.message;$('#login-error').hidden=false;}finally{$('#save-nickname').disabled=false;}});
$('#account-mode-login').addEventListener('click',()=>setAccountMode('login'));$('#account-mode-register').addEventListener('click',()=>setAccountMode('register'));
$('#restore-account').addEventListener('click',()=>openLogin());
$('#account-form').addEventListener('submit',async event=>{
 event.preventDefault();if(app.accountBusy)return;const password=$('#account-password').value;
 if(accountMode==='register'&&password!==$('#account-confirm').value){$('#account-error').textContent='两次输入的密码不一致。';$('#account-error').hidden=false;return;}
 app.accountBusy=true;$('#account-submit').disabled=true;$('#account-error').hidden=true;
 try{identityRequest++;ownershipGeneration++;await api('/account/'+accountMode,{method:'POST',json:{username:$('#account-name').value,password,nickname:$('#account-nickname').value}});$('#account-password').value='';$('#account-confirm').value='';await refreshIdentity();await reloadOwnership();const action=app.pendingAction;app.pendingAction=null;if(action){closeDialog('login-dialog');action();}else{updateProfile();$('#nickname-input').value=app.profile?.nickname||'';}toast('已登录，同一账号可恢复照片管理');}
 catch(error){$('#account-error').textContent=error.message;$('#account-error').hidden=false;}
 finally{app.accountBusy=false;$('#account-submit').disabled=false;}
});
$('#account-logout').addEventListener('click',async()=>{if(app.accountBusy)return;app.accountBusy=true;$('#account-logout').disabled=true;try{rememberAccountName();identityRequest++;ownershipGeneration++;await api('/account/logout',{method:'POST'});await refreshIdentity();await reloadOwnership();closeDialog('login-dialog');toast('已退出照片集账号');}catch(error){toast(error.message);}finally{app.accountBusy=false;$('#account-logout').disabled=false;}});
$('#link-existing').addEventListener('click',async()=>{if(app.accountBusy)return;app.accountBusy=true;$('#link-existing').disabled=true;try{const data=await api('/account/link-existing',{method:'POST'});await refreshIdentity();await reloadOwnership();$('#legacy-account-result').textContent='已关联 '+data.linkedPhotos+' 张照片和 '+data.linkedComments+' 条留言，以后登录此账号即可管理。';$('#legacy-account-result').hidden=false;}catch(error){$('#legacy-account-result').textContent=error.message;$('#legacy-account-result').hidden=false;}finally{app.accountBusy=false;$('#link-existing').disabled=false;}});
$('#login-dialog').addEventListener('close',()=>{$('#account-password').value='';$('#account-confirm').value='';});
$('#sync-local').addEventListener('click',syncLegacy);
$('#load-more-photos').addEventListener('click',async()=>{$('#load-more-photos').disabled=true;try{await loadCloud(true);}catch(e){toast(e.message);}finally{$('#load-more-photos').disabled=false;}});
$('#comment-form').addEventListener('submit',postComment);
$('#refresh-comments').addEventListener('click',()=>{commentFocus=null;loadComments().catch(commentError);});
$('#older-comments').addEventListener('click',()=>loadComments(true).catch(commentError));
$('#lightbox').addEventListener('close',()=>{app.commentPhoto=null;resetCaptionEditor();});
setInterval(()=>{if($('#lightbox').open&&!document.hidden&&app.commentPhoto&&!app.visible[app.lightboxIndex]?.local&&!app.commentBusy&&!app.commentCursor)loadComments().catch(()=>{});},10000);

function updateBulkUI(){
  const own=new Set(app.photos.filter(isMine).map(photo=>photo.id));for(const id of app.selected)if(!own.has(id))app.selected.delete(id);
  $('#start-bulk').hidden=app.view!=='mine'||app.selecting;$('#start-bulk').disabled=!own.size||app.bulkBusy;
  $('#bulk-toolbar').hidden=!app.selecting;$('#bulk-count').textContent='已选 '+app.selected.size+' 张';
  $('#review-bulk-delete').disabled=!app.selected.size||app.bulkBusy;$('#review-bulk-delete').textContent=app.selected.size?'删除所选（'+app.selected.size+'）':'删除所选';
  const visible=app.visible.filter(isMine),all=visible.length&&visible.every(photo=>app.selected.has(photo.id));
  $('#bulk-select-all').textContent=all?'取消当前全选':'全选当前显示';$('#bulk-select-all').disabled=!visible.length||app.bulkBusy;$('#cancel-bulk').disabled=app.bulkBusy;
  const byId=new Map(app.photos.map(photo=>[photo.id,photo]));
  for(const button of $$('.photo-card')){if(!app.selecting)continue;const selected=app.selected.has(button.dataset.photoId),photo=byId.get(button.dataset.photoId);if(button.getAttribute('aria-pressed')===String(selected))continue;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',(selected?'取消选择照片：':'选择照片：')+(photo?.title||'未命名的瞬间'));}
}
function togglePhotoSelection(id){if(app.bulkBusy||!app.selecting||!app.photos.some(photo=>photo.id===id&&isMine(photo)))return;if(app.selected.has(id))app.selected.delete(id);else app.selected.add(id);updateBulkUI();}
function cancelBulkSelection(){if(app.bulkBusy)return;app.selecting=false;app.selected.clear();$('#bulk-error').hidden=true;renderWall();}
function reviewBulkDelete(){
  const photos=app.photos.filter(photo=>app.selected.has(photo.id)&&isMine(photo));if(!photos.length)return;
  $('#bulk-delete-title').textContent='删除选中的 '+photos.length+' 张照片？';
  const shared=photos.filter(photo=>!photo.local).length;
  $('#bulk-delete-description').textContent=shared?'选中的照片及其留言会从相册中一起删除，其他人也将无法查看。删除后无法恢复。':'选中的旧版本机照片会从当前浏览器中删除，删除后无法恢复。';
  const preview=$('#bulk-preview');preview.replaceChildren();for(const photo of photos.slice(0,6)){const img=document.createElement('img');img.src=photo.src;img.alt=photo.title||'选中的照片';preview.append(img);}if(photos.length>6){const more=document.createElement('span');more.textContent='+'+(photos.length-6);preview.append(more);}
  $('#bulk-progress').hidden=true;$('#confirm-bulk-delete').textContent='确认删除 '+photos.length+' 张';showDialog('bulk-delete-dialog');
}
async function deleteSelectedPhotos(){
  if(app.bulkBusy)return;const photos=app.photos.filter(photo=>app.selected.has(photo.id)&&isMine(photo));if(!photos.length)return;
  app.bulkBusy=true;$('#bulk-error').hidden=true;$('#confirm-bulk-delete').disabled=true;$('#keep-bulk').disabled=true;$('#bulk-progress').hidden=false;
  const deleted=new Set(),failed=[];$('#bulk-progress').textContent='已处理 0 / '+photos.length+' 张 · 最多 3 张同时删除';$('#confirm-bulk-delete').textContent='正在删除…';updateBulkUI();
  try{
  const result=await uploadWithLimit(photos,async photo=>{
    if(photo.local)await removePhoto(photo.id);else{try{await api('/photos/'+encodeURIComponent(photo.id),{method:'DELETE',signal:AbortSignal.timeout(30000)});}catch(error){if(error.status!==404)throw error;}}
    deleted.add(photo.id);app.selected.delete(photo.id);
  },(finished,total)=>{$('#bulk-progress').textContent='已处理 '+finished+' / '+total+' 张 · 已删除 '+deleted.size+' 张';});
  for(const {entry,error} of result.failures)failed.push({id:entry.id,message:error.name==='TimeoutError'?'连接超时，请重试。':error.message});
  for(const photo of photos)if(deleted.has(photo.id))adjustPhotoCounts(photo,-1);app.cloud=app.cloud.filter(photo=>!deleted.has(photo.id));app.minePhotos=app.minePhotos.filter(photo=>!deleted.has(photo.id));
  if(!failed.length){app.selecting=false;app.selected.clear();}
  await refreshPhotos({preserveOrder:true,preservePosition:true});closeDialog('bulk-delete-dialog');
  if(failed.length){$('#bulk-error').textContent='已删除 '+deleted.size+' 张，'+failed.length+' 张未能删除，已保留选中，可重试。'+failed[0].message;$('#bulk-error').hidden=false;}
  toast(failed.length?'已删除 '+deleted.size+' 张，'+failed.length+' 张未完成':'已删除 '+deleted.size+' 张照片');
  }finally{app.bulkBusy=false;$('#confirm-bulk-delete').disabled=false;$('#keep-bulk').disabled=false;updateBulkUI();}
}
$('#start-bulk').addEventListener('click',()=>{if(app.view!=='mine'||app.bulkBusy)return;app.selecting=true;app.selected.clear();$('#bulk-error').hidden=true;renderWall();});
$('#cancel-bulk').addEventListener('click',cancelBulkSelection);
$('#bulk-select-all').addEventListener('click',()=>{if(app.bulkBusy)return;const photos=app.visible.filter(isMine),all=photos.every(photo=>app.selected.has(photo.id));for(const photo of photos){if(all)app.selected.delete(photo.id);else app.selected.add(photo.id);}updateBulkUI();});
$('#review-bulk-delete').addEventListener('click',reviewBulkDelete);
$('#confirm-bulk-delete').addEventListener('click',deleteSelectedPhotos);

async function init(){
  applyTheme(safeRead('class7-theme')==='dark'?'dark':'light');
  updateProfile();initWallMotion();
  const photosTask=loadCloud(false,false),identityTask=refreshIdentity();
  const localTask=(async()=>{try{app.db=await openDatabase();await refreshPhotos({preserveOrder:true,preservePosition:true,skipWall:true});}catch(e){console.warn('本地图片存储不可用：',e.message);}})();
  const [photos,identity]=await Promise.allSettled([photosTask,identityTask,localTask]);
  if(photos.status==='rejected'){$('#gallery-error').textContent=photos.reason.message+' 共享照片暂未载入。';$('#gallery-error').hidden=false;$('#wall-loading').hidden=true;}
  if(identity.status==='rejected')toast('账号暂未载入，可点击登录重试。');
  if(new URLSearchParams(location.search).get('restore')==='1'){openLogin();history.replaceState({},'','/api/');}
}

function compressionMessage(entry){
  const compressor=window.Class7PhotoCompression;
  if(entry.compressionStatus)return entry.compressionStatus;
  if(!compressor)return '';
  const original=compressor.formatBytes(entry.file.size);
  if($('#auto-compress')?.checked&&entry.file.size>compressor.threshold){
    return entry.preparedUpload?original+' → '+compressor.formatBytes(entry.preparedUpload.file.size):original+' · 上传时压缩';
  }
  return original+' · 原文件';
}
function renderCompressionNote(entry,thumb){
  const note=document.createElement('span');note.className='upload-size-note';note.id=entry.noteId+'-size';note.setAttribute('aria-live','polite');note.textContent=compressionMessage(entry);thumb.append(note);
}
function setCompressionStatus(entry,text){entry.compressionStatus=text;const note=document.getElementById(entry.noteId+'-size');if(note)note.textContent=text;}
async function prepareUploadFile(entry,dimensions){
  if(!$('#auto-compress')?.checked)return {file:entry.file,...dimensions};
  const compressor=window.Class7PhotoCompression;if(!compressor)throw new Error('压缩功能尚未载入，请刷新页面后重试。');
  if(entry.file.size<=compressor.threshold)return {file:entry.file,...dimensions};
  try{
    if(!entry.preparedUpload){setCompressionStatus(entry,'等待压缩…');entry.preparedUpload=await compressor.prepare(entry.file,dimensions,text=>setCompressionStatus(entry,text));}
    setCompressionStatus(entry,compressor.formatBytes(entry.file.size)+' → '+compressor.formatBytes(entry.preparedUpload.file.size));
    return entry.preparedUpload;
  }catch(error){setCompressionStatus(entry,'压缩未完成 · 可重试');throw error;}
}
$('#auto-compress').checked=safeRead('class7-auto-compress')!=='off';
$('#auto-compress').addEventListener('change',()=>{if(app.busy)return;safeWrite('class7-auto-compress',$('#auto-compress').checked?'on':'off');for(const entry of app.files)entry.compressionStatus='';renderSelection();});

const mobilePhotoMedia=matchMedia('(max-width:700px)');
let captionExpanded=false;
function fitMobilePhotoStory(){
 const caption=$('#lightbox-caption'),button=$('#caption-expand'),mobile=mobilePhotoMedia.matches;
 const longCaption=mobile&&!caption.hidden&&caption.scrollHeight>Math.ceil(parseFloat(getComputedStyle(caption).lineHeight)*3)+2;
 button.hidden=!longCaption;
 button.textContent=captionExpanded?'收起说明':'展开完整说明';
 button.setAttribute('aria-expanded',String(captionExpanded));
 caption.classList.toggle('caption-collapsed',mobile&&!captionExpanded);
}
function resetMobilePhotoStory(){
 captionExpanded=false;
 $('#photo-extra-info').open=!mobilePhotoMedia.matches;
 if(mobilePhotoMedia.matches){$('#photo-details').hidden=false;$('#details-toggle').setAttribute('aria-expanded','true');}
 $('#lightbox-caption').classList.remove('caption-collapsed');
 fitMobilePhotoStory();
}
$('#caption-expand').addEventListener('click',()=>{captionExpanded=!captionExpanded;fitMobilePhotoStory();});
mobilePhotoMedia.addEventListener('change',resetMobilePhotoStory);
new ResizeObserver(fitMobilePhotoStory).observe($('#lightbox-caption'));
resetMobilePhotoStory();

// Desktop browsing preference is independent of the established phone layout.
const desktopWallMedia=matchMedia('(min-width:701px)');
let desktopWallView=safeRead('class7-desktop-wall-view')==='flow'?'flow':'complete';
function completeWallView(){return rankingActive()||(desktopWallMedia.matches&&desktopWallView==='complete');}
function updateWallViewUI(){
 const complete=completeWallView(),button=$('#wall-view-toggle');
 $('#photo-wall').closest('.wall-shell').classList.toggle('complete-wall',complete);
 button.textContent=complete?'切换流动照片墙':'切换完整浏览';
 button.setAttribute('aria-pressed',String(complete));
 button.title=complete?'当前为完整浏览，点击切换自动流动':'当前为自动流动，点击完整浏览所有照片';
 $('.gallery-hint').hidden=complete;
}
$('#wall-view-toggle').addEventListener('click',()=>{
 desktopWallView=completeWallView()?'flow':'complete';
 safeWrite('class7-desktop-wall-view',desktopWallView);
 renderWall({preserveOrder:true});
});
desktopWallMedia.addEventListener('change',()=>renderWall({preserveOrder:true}));
updateWallViewUI();

// Totals describe all matching records, independently of the loaded page.
let albumPhotoCounts={all:null,mine:null,owned:null};
function resetPhotoCounts(){albumPhotoCounts={all:null,mine:null,owned:null};}
function acceptPhotoCounts(data,mine){
 const total=Number(data.total);
 if(!Number.isSafeInteger(total)||total<0)return;
 const uploaders=Array.isArray(data.uploaders)?new Map(data.uploaders.map(item=>[item.uploader,Number(item.total)])):null;
 albumPhotoCounts[mine?'mine':'all']={total,uploaders};
 const owned=Number(data.ownedTotal);
 if(Number.isSafeInteger(owned)&&owned>=0)albumPhotoCounts.owned=owned;
 if(mine)albumPhotoCounts.owned=total;
}
function photoTotalForView(mine,uploader=''){
 const source=app.photos.filter(photo=>(mine?isMine(photo):!photo.local)&&(!uploader||photo.uploader===uploader));
 const legacy=mine?source.filter(photo=>photo.local).length:0,counts=albumPhotoCounts[mine?'mine':'all'];
 if(mine&&!uploader&&albumPhotoCounts.owned!==null)return albumPhotoCounts.owned+legacy;
 if(counts&&(!uploader||counts.uploaders))return (uploader?counts.uploaders.get(uploader)||0:counts.total)+legacy;
 return source.length;
}
function adjustPhotoCounts(photo,delta){
 if(photo.local)return;
 const adjust=counts=>{if(!counts)return;counts.total=Math.max(0,counts.total+delta);if(counts.uploaders)counts.uploaders.set(photo.uploader,Math.max(0,(counts.uploaders.get(photo.uploader)||0)+delta));};
 adjust(albumPhotoCounts.all);
 if(isMine(photo)){adjust(albumPhotoCounts.mine);if(albumPhotoCounts.owned!==null)albumPhotoCounts.owned=Math.max(0,albumPhotoCounts.owned+delta);}
}
function renderPhotoCount(){
 const mine=app.view==='mine',total=photoTotalForView(mine,app.filter),loaded=app.visible.length;
 $('#photo-count').textContent=String(total);
 $('#photo-count').title='共 '+total+' 张照片，已加载 '+loaded+' 张';
 $('#photo-count').setAttribute('aria-label','共 '+total+' 张照片');
 $('#load-more-photos').textContent='加载更多照片（已显示 '+loaded+' / 共 '+total+' 张）';
}

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

// Store only the login name, never passwords or session credentials.
function rememberAccountName(){
  if(app.account?.signedIn&&app.account.username)safeWrite('class7-last-username',app.account.username);
}
let identityRequest=0,ownershipGeneration=0;

const wallSpeedValues=[0.5,1,1.5,2,3];
let wallSpeed=Number(safeRead('class7-wall-speed'))||1;
if(!wallSpeedValues.includes(wallSpeed))wallSpeed=1;
$('#wall-speed').value=String(wallSpeed);
$('#wall-speed').addEventListener('change',()=>{
  const value=Number($('#wall-speed').value);
  if(!wallSpeedValues.includes(value))return;
  wallSpeed=value;safeWrite('class7-wall-speed',String(value));refreshWallMotion();
});

function renderLinkedAccounts(){
 const names=app.account?.linkedAccounts||[],summary=$('#linked-accounts-summary');
 summary.hidden=names.length<2;summary.textContent='已关联账号：'+names.join('、');
 $('#account-link-current').textContent=app.account?.signedIn?'当前登录账号：'+app.account.username+'。请填写另一个登录账号；填写自己不会找回旧照片。':'';
 renderUnlinkAccounts(names);
}
$('#account-link-form').addEventListener('submit',async event=>{
 event.preventDefault();if(app.accountBusy)return;
 app.accountBusy=true;$('#link-account-submit').disabled=true;$('#account-link-result').hidden=true;
 try{
  const data=await api('/account/link-account',{method:'POST',json:{username:$('#link-account-name').value,password:$('#link-account-password').value}});
  $('#link-account-password').value='';
  const names=(data.linkedAccounts||[]).join('、'),count=Number(data.managedPhotos||0);
  $('#account-link-result').textContent=(data.alreadyLinked?'这两个账号此前已关联。':'关联成功。')+'账号：'+names+'；当前可管理 '+count+' 张照片。'+(count===0?'这组账号暂无照片，请确认关联的是原来上传照片的账号。':'');
  $('#account-link-result').hidden=false;$('#account-link-details').open=false;
  try{await refreshIdentity();await reloadOwnership();toast('账号已关联，当前可管理 '+count+' 张照片');}
  catch{toast('关联已保存，照片列表暂未刷新，请刷新网页查看。');}
 }catch(error){$('#account-link-result').textContent=error.message;$('#account-link-result').hidden=false;}
 finally{$('#link-account-password').value='';app.accountBusy=false;$('#link-account-submit').disabled=false;}
});
$('#login-dialog').addEventListener('close',()=>{$('#link-account-password').value='';});

let unlinkPreview=null,unlinkPreviewVersion=0,unlinkMemberKey='';
function resetUnlinkPreview(){
 unlinkPreview=null;unlinkPreviewVersion++;$('#unlink-confirm-panel').hidden=true;
 $('#unlink-account-password').value='';$('#unlink-account-password').disabled=true;
 $('#unlink-account-consent').checked=false;$('#unlink-account-consent').disabled=true;$('#unlink-account-submit').disabled=true;
}
function renderUnlinkAccounts(names){
 const others=names.filter(name=>name!==app.account?.username),key=[app.account?.username||'',...names].join('|');
 $('#account-unlink-details').hidden=others.length===0;
 if(key===unlinkMemberKey)return;unlinkMemberKey=key;resetUnlinkPreview();
 const select=$('#unlink-account-name');select.replaceChildren();
 for(const name of others){const option=document.createElement('option');option.value=name;option.textContent=name;select.append(option);}
}
$('#unlink-account-name').addEventListener('change',resetUnlinkPreview);
$('#unlink-account-preview').addEventListener('click',async()=>{
 if(app.accountBusy)return;resetUnlinkPreview();const version=unlinkPreviewVersion;
 const account=app.account?.username,target=$('#unlink-account-name').value;
 $('#unlink-account-preview').disabled=true;$('#account-unlink-result').hidden=true;
 try{
  const preview=await api('/account/unlink-preview',{method:'POST',json:{username:target}});
  if(version!==unlinkPreviewVersion||account!==app.account?.username||target!==$('#unlink-account-name').value)return;
  unlinkPreview=preview;$('#unlink-impact').textContent='将移除 '+preview.username+'。现有 '+preview.retainedPhotos+' 张共享照片继续由 '+preview.currentUsername+' 及其余关联账号管理。被移除账号仍能正常登录，但不再管理这些照片和留言。';
  $('#unlink-confirm-panel').hidden=false;$('#unlink-account-password').disabled=false;$('#unlink-account-consent').disabled=false;$('#unlink-account-submit').disabled=false;
 }catch(error){$('#account-unlink-result').textContent=error.message;$('#account-unlink-result').hidden=false;}
 finally{$('#unlink-account-preview').disabled=false;}
});
$('#account-unlink-form').addEventListener('submit',async event=>{
 event.preventDefault();if(app.accountBusy||!unlinkPreview)return;
 app.accountBusy=true;$('#unlink-account-submit').disabled=true;$('#account-unlink-result').hidden=true;
 try{
  const data=await api('/account/unlink-account',{method:'POST',json:{username:unlinkPreview.username,groupVersion:unlinkPreview.groupVersion,password:$('#unlink-account-password').value,confirmed:$('#unlink-account-consent').checked}});
  resetUnlinkPreview();$('#account-unlink-details').open=false;
  $('#account-unlink-result').textContent='已解除与 '+data.removedAccount+' 的关联。'+data.retainedPhotos+' 张照片保留在当前账号及其余关联账号下，照片和留言均未删除。';$('#account-unlink-result').hidden=false;
  identityRequest++;ownershipGeneration++;
  try{await refreshIdentity();await reloadOwnership();toast('已解除关联，照片保留在当前账号下');}
  catch{toast('解除关联已保存，请刷新页面更新照片列表。');}
 }catch(error){$('#account-unlink-result').textContent=error.message;$('#account-unlink-result').hidden=false;}
 finally{$('#unlink-account-password').value='';app.accountBusy=false;$('#unlink-account-submit').disabled=!unlinkPreview;}
});
$('#login-dialog').addEventListener('close',resetUnlinkPreview);

let adminUploadTier=null,originalUploadNotice=null;
function configureAdminUpload(tier){
 adminUploadTier=['epic','legendary','classified'].includes(tier)?tier:null;let fields=$('#admin-upload-fields');
 if(!fields){fields=document.createElement('div');fields.id='admin-upload-fields';fields.className='form-field admin-upload-fields';fields.innerHTML='<label for="admin-upload-tier">卡牌稀有度</label><select id="admin-upload-tier"><option value="epic">史诗</option><option value="legendary">传奇</option><option value="classified">保密级</option></select><p id="admin-upload-help"></p>';$('.upload-scroll').prepend(fields);$('#admin-upload-tier').addEventListener('change',event=>{if(!app.busy)adminUploadTier=event.target.value;updateAdminUploadUI();});}
 fields.hidden=!adminUploadTier;updateAdminUploadUI();
}
function updateAdminUploadUI(){
 const field=$('#admin-upload-fields');if(!field)return;const notice=$('#upload-dialog .preview-notice');if(notice){originalUploadNotice??=notice.innerHTML;if(adminUploadTier==='classified')notice.textContent='保密级照片不会出现在照片墙和共享相册中，只在商城低概率刷新；购买后可在库存查看。';else notice.innerHTML=originalUploadNotice;}field.hidden=!adminUploadTier;$('#admin-upload-tier').disabled=app.busy;
 if(adminUploadTier){$('#admin-upload-tier').value=adminUploadTier;$('#upload-title').textContent='上传'+mallRarity(adminUploadTier).label+'卡牌';$('#admin-upload-help').textContent=adminUploadTier==='classified'?'仅管理员、当日刷到该卡的账号及收藏者可查看；购买后也不转为公开。商城初始抽取权重为 3%。':'上传后公开展示，并进入对应稀有度卡池。';if(!app.busy)$('#submit-upload').innerHTML=icon('upload')+'上传卡牌';}
 else{$('#upload-title').textContent='分享你的瞬间';if(!app.busy)$('#submit-upload').innerHTML=icon('upload')+'加入照片墙';}
}
$('#upload-dialog').addEventListener('close',()=>{if(!app.busy){adminUploadTier=null;refreshVaultStatus();}});

// One alpha surface for the entire iris; opaque metal is painted directly.
// This factory is self-contained so the same drawing code runs in a worker or fallback.
function cameraIrisPainter(canvas){
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
 if(!ctx)throw Error('Canvas 2D unavailable');
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 const rad=a=>a*Math.PI/180;
 const point=(x,y,a)=>[x*Math.cos(rad(a))-y*Math.sin(rad(a)),x*Math.sin(rad(a))+y*Math.cos(rad(a))];
 const sector=(a,b)=>{const q1=point(40,-15,a),q2=point(40,-15,b),p1=point(130,0,a),p2=point(130,0,b),p=new Path2D();p.moveTo(0,0);p.quadraticCurveTo(...q1,...p1);p.arc(0,0,130,rad(a),rad(b));p.quadraticCurveTo(...q2,0,0);p.closePath();return p;};
 const body=new Path2D('M-18-100Q18 0-18 100H220V-100Z');
 const front=new Path2D('M-18-100Q18 0-18 100');
 const seam=new Path2D();seam.moveTo(0,0);seam.quadraticCurveTo(...point(40,-15,-40),...point(130,0,-40));
 const wedge=sector(-40,40),returned=sector(-40,-20),disc=new Path2D();disc.arc(0,0,82,0,Math.PI*2);
 const gray=n=>'rgb('+n+','+n+','+n+')';
 const paints=[52,48,44,49,45,41].map(n=>{const g=ctx.createLinearGradient(-20,-82,95,70);g.addColorStop(0,gray(n+15));g.addColorStop(.45,gray(n));g.addColorStop(1,gray(n-12));return g;});
 return function draw(progress){
  const p=Math.max(0,Math.min(1,progress)),size=canvas.width;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,size,size);
  if(p>=1)return;
  ctx.save();ctx.translate(size/2,size/2);ctx.scale(size/240,size/240);
  ctx.beginPath();ctx.arc(0,0,112,0,Math.PI*2);ctx.moveTo(81,0);ctx.arc(0,0,81,0,Math.PI*2);ctx.fillStyle='#181818';ctx.fill('evenodd');
  ctx.strokeStyle='#191919';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,111,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#e9e9e9';ctx.lineWidth=20;ctx.beginPath();ctx.arc(0,0,99,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#3b3b3b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,86,0,Math.PI*2);ctx.stroke();
  ctx.clip(disc);
  ctx.rotate(rad(-60*smooth((p-.04)/.96)));
  const opening=92*Math.pow(smooth((p-.12)/.84),1.8);
  // Continuous backing closes antialiased seams between separately clipped leaves.
  // Its curved hexagonal opening follows the six moving front edges, slightly inset.
  const inset=Math.max(0,opening-.45),x=2*inset/(1+Math.sqrt(1+.0024*inset)),y=x/Math.sqrt(3);
  ctx.beginPath();ctx.arc(0,0,82,0,Math.PI*2);ctx.closePath();
  if(inset>0){
   ctx.moveTo(x,-y);
   for(let i=0;i<6;i++){const control=point(2*inset-x,0,i*60),end=point(x,y,i*60);ctx.quadraticCurveTo(...control,...end);}
   ctx.closePath();
  }
  ctx.fillStyle='#242424';ctx.fill('evenodd');
  const leaf=(i,clip)=>{
   ctx.save();ctx.rotate(rad(i*60));ctx.clip(clip);ctx.translate(opening,0);
   // Every leaf is fully opaque. Only its geometrical opening is transparent.
   ctx.fillStyle=paints[i];ctx.fill(body);
   ctx.strokeStyle='#747474';ctx.globalAlpha=.45;ctx.lineWidth=.65;ctx.stroke(front);ctx.globalAlpha=1;
   ctx.clip(body);ctx.translate(-opening,0);
   ctx.strokeStyle='#080808';ctx.lineWidth=2.4;ctx.globalAlpha=.85;ctx.stroke(seam);
   ctx.translate(.65,.5);ctx.strokeStyle='#b6b6b6';ctx.lineWidth=.55;ctx.globalAlpha=.6;ctx.stroke(seam);
   ctx.restore();
  };
  for(let i=0;i<6;i++)leaf(i,wedge);
  leaf(0,returned);
  const coreAlpha=1-smooth((p-.1)/.14);
  if(coreAlpha>0){ctx.globalAlpha=coreAlpha;ctx.fillStyle='#07080a';ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();}
  ctx.restore();ctx.globalAlpha=1;
 };
}
// A viewport-sized matte avoids scaling an enormous SVG texture with the lens.
function cameraMattePainter(canvas,geometry){
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});if(!ctx)throw Error('Canvas matte unavailable');
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 return p=>{const w=canvas.width,h=canvas.height,r=82*geometry.scale*Math.pow(geometry.end/geometry.scale,smooth((p-.04)/.96))*w/geometry.width;ctx.clearRect(0,0,w,h);if(r>=Math.hypot(w,h)/2)return;ctx.beginPath();ctx.rect(0,0,w,h);ctx.moveTo(w/2+r,h/2);ctx.arc(w/2,h/2,r,0,Math.PI*2);ctx.fillStyle='#08090b';ctx.fill('evenodd');};
}
function createCameraIrisRenderer(original,matte,geometry){
 let canvas=original,worker=null,blobUrl=null,raf=0,stopped=false,startedAt=0,duration=0,draw=null,finishResolve=null;
 const cover=document.getElementById('camera-iris-cover');
 const epoch=()=>performance.timeOrigin+performance.now();
 const ready=()=>{if(cover)cover.hidden=true;document.getElementById('camera-intro')?.classList.add('iris-ready');};
 const workerProgram=`
 const makePainter=(`+cameraIrisPainter.toString()+`),makeMatte=(`+cameraMattePainter.toString()+`);
 let draw,frame=0,start=0,duration=0,count=0,totalDraw=0,maxDraw=0;
 const cancel=()=>{if(typeof cancelAnimationFrame==='function')cancelAnimationFrame(frame);clearTimeout(frame);};
 const schedule=f=>typeof requestAnimationFrame==='function'?requestAnimationFrame(f):setTimeout(f,1000/120);
 const tick=()=>{const now=performance.now(),p=Math.min(1,(performance.timeOrigin+now-start)/duration);draw(p);const cost=performance.now()-now;count++;totalDraw+=cost;maxDraw=Math.max(maxDraw,cost);if(p<1)frame=schedule(tick);else postMessage({type:'finished',stats:{frames:count,meanDrawMs:totalDraw/count,maxDrawMs:maxDraw}});};
 onmessage=e=>{try{const m=e.data;if(m.type==='init'){const iris=makePainter(m.canvas),matte=makeMatte(m.matte,m.geometry);draw=p=>{matte(p);iris(p);};draw(0);postMessage({type:'ready'});}if(m.type==='start'){cancel();start=m.start;duration=m.duration;tick();}if(m.type==='finish'){cancel();draw(1);postMessage({type:'finished',stats:{frames:count,meanDrawMs:totalDraw/count,maxDrawMs:maxDraw}});}}catch(error){postMessage({type:'failed'});}};
 `;
 const tick=()=>{if(stopped)return;const p=Math.min(1,(epoch()-startedAt)/duration);draw(p);if(p<1)raf=requestAnimationFrame(tick);else{finishResolve?.();finishResolve=null;}};
 const fallback=()=>{
  if(stopped)return;
  worker?.terminate();worker=null;
  if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null;}
  // A transferred canvas cannot regain a main-thread context: replace only this surface.
  if(!draw){
   const replacement=document.createElement('canvas');replacement.id=canvas.id;replacement.className=canvas.className;replacement.width=canvas.width;replacement.height=canvas.height;
   canvas.replaceWith(replacement);canvas=replacement;
   const matteReplacement=document.createElement('canvas');matteReplacement.id=matte.id;matteReplacement.width=matte.width;matteReplacement.height=matte.height;matte.replaceWith(matteReplacement);matte=matteReplacement;
   const iris=cameraIrisPainter(canvas),surround=cameraMattePainter(matte,geometry);draw=p=>{surround(p);iris(p);};
  }
  canvas.dataset.renderer='main-thread';draw(startedAt?Math.min(1,(epoch()-startedAt)/duration):0);ready();
  if(startedAt)tick();
 };
 try{
  if(typeof Worker!=='function'||typeof original.transferControlToOffscreen!=='function')throw Error('Use main-thread canvas');
  blobUrl=URL.createObjectURL(new Blob([workerProgram],{type:'text/javascript'}));worker=new Worker(blobUrl);
  worker.onmessage=e=>{
   if(stopped)return;
   if(e.data.type==='ready'){ready();if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null;}}
   if(e.data.type==='failed'){try{fallback();}catch{document.getElementById('camera-intro')?.close();}}
   if(e.data.type==='finished'){if(e.data.stats)canvas.dataset.drawStats=JSON.stringify(e.data.stats);finishResolve?.();finishResolve=null;}
  };
  worker.onerror=()=>{try{fallback();}catch{document.getElementById('camera-intro')?.close();}};
  canvas.dataset.renderer='worker';const transferred=original.transferControlToOffscreen(),matteTransfer=matte.transferControlToOffscreen();worker.postMessage({type:'init',canvas:transferred,matte:matteTransfer,geometry},[transferred,matteTransfer]);
 }catch{fallback();}
 return {
  start(ms,elapsed=0){duration=ms;startedAt=epoch()-elapsed;if(worker)worker.postMessage({type:'start',start:startedAt,duration});else tick();},
  finish(){return new Promise(resolve=>{finishResolve=resolve;if(worker)worker.postMessage({type:'finish'});else{cancelAnimationFrame(raf);draw(1);finishResolve=null;resolve();}});},
  destroy(){stopped=true;cancelAnimationFrame(raf);worker?.terminate();if(blobUrl)URL.revokeObjectURL(blobUrl);finishResolve?.();finishResolve=null;}
 };
}


// A real DOM portal: the page remains mounted and loading beneath this dialog.
let cameraIntroPhase='pending',cameraIntroTimer=0,cameraGeometry=null,cameraIrisRenderer=null;
const cameraIntroAnimations=[],cameraConfig=window.class7CameraConfig;
function showInitialUsageNotice(){
 if(safeRead('class7-usage-notice-seen')==='1'||$('dialog[open]'))return;
 showDialog('info-dialog');safeWrite('class7-usage-notice-seen','1');
}
function layoutCameraIntro(){
 if(cameraIntroPhase==='leaving'){completeCameraIntro();return;}
 const dialog=$('#camera-intro'),w=dialog.clientWidth,h=dialog.clientHeight;
 const scale=Math.max(.18,Math.min(.9,(w-42)/540,(h-180)/440));
 cameraGeometry={width:w,height:h,scale,end:Math.hypot(w,h)/2/82*1.3};
 $('#camera-world').style.transform='scale('+scale+')';
 dialog.style.setProperty('--camera-shutter-x',-132*scale+'px');
 dialog.style.setProperty('--camera-shutter-y',-163*scale+'px');
 dialog.style.setProperty('--camera-caption',Math.min(h/2-95,205*scale)+'px');
 dialog.classList.add('is-prepared');
}
function completeCameraIntro(options){
 if(cameraIntroPhase==='done')return;
 cameraIntroPhase='done';clearTimeout(cameraIntroTimer);clearTimeout(window.class7CameraBootTimer);
 window.removeEventListener('resize',layoutCameraIntro);
 const dialog=$('#camera-intro');document.documentElement.dataset.cameraIntro='done';
 // Close before cancelling fills: no frame can reveal the initial camera again.
 if(dialog.open)dialog.close();
 cameraIrisRenderer?.destroy();cameraIrisRenderer=null;
 for(const animation of cameraIntroAnimations)animation.cancel();cameraIntroAnimations.length=0;
 dialog.classList.remove('is-shooting');
 try{sessionStorage.setItem(cameraConfig.sessionKey,'1');}catch{}
 refreshWallMotion();
 if(!$('dialog[open]'))$('.brand')?.focus({preventScroll:true});
 if(!options?.deferNotice)showInitialUsageNotice();
}
function enterCameraIntro(skip=false){
 if(cameraIntroPhase!=='ready')return;
 cameraIntroPhase='leaving';document.documentElement.dataset.cameraIntro='leaving';
 const dialog=$('#camera-intro');$('#camera-shutter').disabled=true;$('#camera-intro-skip').disabled=true;
 if(skip){completeCameraIntro();return;}
 const reduced=reducedMotion.matches,duration=reduced?120:cameraConfig.durationMs;
 dialog.classList.add('is-shooting');
 cameraIntroTimer=setTimeout(completeCameraIntro,duration+150);
 if(typeof dialog.animate!=='function'){completeCameraIntro();return;}
 try{
  const timelineStart=document.timeline?.currentTime;
  const play=(node,frames,options={})=>{
   const animation=node.animate(frames,{duration,fill:'forwards',...options});
   if(Number.isFinite(timelineStart))animation.startTime=timelineStart;
   cameraIntroAnimations.push(animation);return animation;
  };
  if(!reduced){
   const {scale,end}=cameraGeometry;
   const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
   // Sample one continuous curve once; playback stays on transform/opacity tracks.
   // Logarithmic zoom avoids the perceptual speed jump of linear scale.
   const samples=Array.from({length:121},(_,i)=>i/120);
   const zoom=t=>scale*Math.pow(end/scale,smooth((t-.04)/.96));
   play($('#camera-world'),samples.map(t=>({offset:t,transform:'scale('+zoom(t)+')'})));
   play($('#camera-bodywork'),[{opacity:1},{opacity:1,offset:.18},{opacity:0,offset:.44},{opacity:0}]);
   for(const node of $$('.camera-intro-copy, #camera-shutter-form')){
    play(node,[{opacity:1},{opacity:0}],{duration:duration*.14});
   }
   // Draw all metal in one surface, outside the main thread when supported.
   const elapsed=Number.isFinite(timelineStart)?Math.max(0,document.timeline.currentTime-timelineStart):0;
   cameraIrisRenderer.start(duration,elapsed);
  }
  // Keep opaque leaves opaque through the entire traversal. Only the opening reveals the page.
  const exit=play(dialog,reduced?[{opacity:1},{opacity:0}]:[{opacity:1},{opacity:1}]);
  exit.finished.then(()=>{
   if(cameraIntroPhase!=='leaving')return;
   if(reduced)completeCameraIntro();
   else cameraIrisRenderer.finish().then(completeCameraIntro,completeCameraIntro);
  },completeCameraIntro);
 }catch{completeCameraIntro();}
}
function setupCameraIntro(){
 clearTimeout(window.class7CameraBootTimer);
 const dialog=$('#camera-intro'),skip=document.documentElement.dataset.cameraIntro!=='pending';
 if(dialog.open)dialog.removeAttribute('open');
 if(skip){cameraIntroPhase='done';document.documentElement.dataset.cameraIntro='done';showInitialUsageNotice();return;}
 cameraIntroPhase='ready';
 $('#camera-shutter-form').addEventListener('submit',event=>{event.preventDefault();enterCameraIntro();});
 $('#camera-intro-skip').addEventListener('click',()=>enterCameraIntro(true));
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(cameraIntroPhase==='ready')enterCameraIntro(true);});
 dialog.addEventListener('close',()=>{if(cameraIntroPhase!=='done')completeCameraIntro();});
 try{
  dialog.showModal();layoutCameraIntro();
  const canvas=$('#camera-iris-canvas');canvas.width=canvas.height=dialog.clientWidth<=700?512:768;
  const matte=$('#camera-matte-canvas'),ratio=Math.min(1,640/dialog.clientWidth);matte.width=Math.round(dialog.clientWidth*ratio);matte.height=Math.round(dialog.clientHeight*ratio);
  cameraIrisRenderer=createCameraIrisRenderer(canvas,matte,cameraGeometry);
  window.addEventListener('resize',layoutCameraIntro);
  $('#camera-shutter').focus({preventScroll:true});
 }catch{completeCameraIntro();}
}
const cameraDialogHook=showDialog;showDialog=function(id){if(id!=='camera-intro'&&id!=='info-dialog'&&cameraIntroPhase!=='done')completeCameraIntro({deferNotice:true});cameraDialogHook(id);};
document.addEventListener('close',()=>{if(cameraIntroPhase==='done')showInitialUsageNotice();},true);
reducedMotion.addEventListener('change',event=>{if(event.matches&&cameraIntroPhase==='leaving')completeCameraIntro();});
setupCameraIntro();


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
async function changePhotoFilter(value){app.filter=value;if(rankingActive())await reloadPhotoOrder();else{refreshFilter();renderWall();}}
$('#photo-order').addEventListener('change',async event=>{photoOrder=['likes','weekly'].includes(event.target.value)?event.target.value:'random';if(photoOrder==='weekly'){app.view='all';app.filter='';contestPeriod='current';}safeWrite('class7-photo-order',photoOrder);await reloadPhotoOrder();});
updatePhotoOrderUI();

let weeklyContest=null,contestPeriod='current';
function weeklyActive(){return $('#photo-order').value==='weekly';}
function contestDate(value){return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).format(new Date(value));}
function applyContestLayout(){
 const active=!app.commentBoardOpen&&weeklyActive();document.body.classList.toggle('contest-mode',active);$('#weekly-contest').hidden=!active;
 $('#weekly-contest-nav').classList.toggle('active',active);
 if(active)$('#weekly-contest-nav').setAttribute('aria-current','page');else $('#weekly-contest-nav').removeAttribute('aria-current');
 for(const tab of $$('.nav-tab')){const chosen=!active&&tab.dataset.view===app.view;tab.classList.toggle('active',chosen);if(chosen)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
 $('#ranking-note').hidden=!rankingActive()||active;
 syncCommentBoardNav();
}
function acceptWeeklyContest(data){weeklyContest=data.contest;const owned=Number(data.ownedTotal);if(Number.isSafeInteger(owned)&&owned>=0)albumPhotoCounts.owned=owned;}
function renderWeeklyContest(){
 applyContestLayout();const active=weeklyActive();$('#wall-shell').hidden=active&&app.visible.filter(photo=>photo.rank>3).length===0;
 if(!active)return;
 $('#gallery-title').textContent='本期排行';$('#photo-count').textContent=weeklyContest?String(weeklyContest.total):'—';
 const loaded=app.visible.length,total=weeklyContest?.total||0;$('#load-more-photos').textContent='加载更多参赛照片（已显示 '+loaded+' / 共 '+total+' 张）';
 $('#photo-count').setAttribute('aria-label','本期共 '+total+' 张获得有效点赞的照片');
 $('#photo-count').title='本期共 '+total+' 张参赛照片，已加载 '+loaded+' 张';
 $('#contest-current').setAttribute('aria-pressed',String(contestPeriod==='current'));$('#contest-previous').setAttribute('aria-pressed',String(contestPeriod==='previous'));
 $('#contest-previous').disabled=!weeklyContest?.hasPrevious;
 $('#contest-dates').textContent=weeklyContest?contestDate(weeklyContest.start)+' — '+contestDate(Date.parse(weeklyContest.end)-1)+' · 北京时间':'正在读取本期大赛…';
 $('#contest-state').textContent=weeklyContest?(weeklyContest.closed?'已结算':'进行中 · 刷新更新'):'请稍候';
 const firstPeriod=weeklyContest&&!weeklyContest.closed&&Date.parse(weeklyContest.statsFrom)>Date.parse(weeklyContest.start);$('#contest-first-period').hidden=!firstPeriod;
 if(firstPeriod)$('#contest-first-period').textContent='首期自 '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(weeklyContest.statsFrom))+' 开始计分，已有赞保留在总榜。';
 const podium=$('#contest-podium');podium.replaceChildren();
 for(let place=1;place<=3;place++){
  const photo=app.visible.find(p=>p.rank===place),card=document.createElement(photo?'button':'div');card.className='contest-card'+(photo?'':' contest-vacant');
  const name=['冠军','亚军','季军'][place-1],heading=document.createElement('div');heading.className='contest-place';const number=document.createElement('strong');number.textContent='0'+place;const label=document.createElement('span');label.textContent=name;heading.append(number,label);
  const imageBox=document.createElement('div');imageBox.className='contest-image';card.append(heading,imageBox);
  if(photo){card.type='button';card.dataset.photoId=photo.id;card.setAttribute('aria-label',name+'，'+photo.title+'，本期 '+photo.weeklyCount+' 个赞');
   const image=document.createElement('img');image.alt=photo.title;image.decoding='async';image.src=photo.src;imageBox.append(image);
   const title=document.createElement('h3');title.className='contest-card-title';title.textContent=photo.title;
   const votes=document.createElement('p');votes.className='contest-votes';const count=document.createElement('strong');count.textContent=String(photo.weeklyCount);votes.append(count,document.createTextNode('本期赞'));card.append(title,votes);
   card.addEventListener('click',()=>openPhoto(photo.id));podium.append(card);fitRotatedImage(image,photo,imageBox.clientWidth,imageBox.clientHeight);
  }else{imageBox.textContent=app.cloudLoaded?(weeklyContest?.closed?'本期暂无照片':'席位待定'):'正在统计';podium.append(card);}
 }
 const empty=app.cloudLoaded&&total===0;$('#contest-empty').hidden=!empty;
 $('#contest-empty-message').textContent=weeklyContest?.closed?'本期没有获得有效点赞的照片。':'本周还没有有效点赞，以前赞过的照片也能再选。';
}
async function openWeeklyContest(){if(app.bulkBusy)return;closeCommentBoard();photoOrder='weekly';contestPeriod='current';app.view='all';app.filter='';safeWrite('class7-photo-order',photoOrder);await reloadPhotoOrder();}
$('#weekly-contest-nav').addEventListener('click',openWeeklyContest);
for(const [id,period] of [['contest-current','current'],['contest-previous','previous']])$('#'+id).addEventListener('click',async()=>{if(contestPeriod===period)return;contestPeriod=period;await reloadPhotoOrder();});
$('#contest-explore').addEventListener('click',async()=>{photoOrder='random';safeWrite('class7-photo-order',photoOrder);await reloadPhotoOrder();});
applyContestLayout();

let commentReplyTarget=null,replyInboxVersion=0,replyInboxTask=null,replyInboxTaskGeneration=-1;
const pendingCommentLikes=new Set();
function resetCommentReply(){commentReplyTarget=null;$('#comment-reply-target').hidden=true;$('#comment-reply-target-name').textContent='';$('#send-comment').textContent='发送留言';}
function chooseCommentReply(item){
 withProfile(()=>{commentReplyTarget={id:item.id,author:item.author};$('#comment-reply-target-name').textContent='回复 '+item.author;$('#comment-reply-target').hidden=false;$('#send-comment').textContent='发送回复';$('#comment-body').focus();});
}
function renderComments(){
 const list=$('#comment-list');list.replaceChildren();
 if(!app.comments.length){const empty=document.createElement('p');empty.className='comment-empty';empty.textContent='还没有留言。让第一句话，从你开始。';list.append(empty);}
 for(const item of app.comments){
  const article=document.createElement('article');article.className='comment';article.id='comment-'+item.id;if(item.replyToId)article.classList.add('is-reply');if(commentFocus?.id===item.id)article.classList.add('comment-focused');
  const head=document.createElement('div');head.className='comment-head';const author=document.createElement('strong');author.textContent=item.author;const time=document.createElement('time');time.dateTime=item.createdAt;time.textContent=commentTime(item.createdAt);head.append(author,time);article.append(head);
  if(item.replyToAuthor){const context=document.createElement('div');context.className='comment-reply-context';context.textContent='回复 '+item.replyToAuthor+(item.replyToBody?' · '+item.replyToBody.slice(0,70):'');article.append(context);}
  const body=document.createElement('p');body.textContent=item.body;if(item.body)article.append(body);const emoji=commentEmojiNode(item.emoji);if(emoji)article.append(emoji);
  const tools=document.createElement('div');tools.className='comment-tools';
  tools.append(makeCommentLikeButton(item));
  const reply=document.createElement('button');reply.type='button';reply.className='comment-tool';reply.textContent='回复';reply.addEventListener('click',()=>chooseCommentReply(item));tools.append(reply);
  if(item.mine){const remove=document.createElement('button');remove.type='button';remove.className='comment-tool';remove.textContent='删除';remove.setAttribute('aria-label','删除自己在 '+time.textContent+' 的留言');remove.addEventListener('click',async()=>{if(remove.dataset.confirm!=='yes'){remove.textContent='确认删除';remove.dataset.confirm='yes';return;}remove.disabled=true;try{await api('/comments/'+item.id,{method:'DELETE'});if(commentReplyTarget?.id===item.id)resetCommentReply();if(app.commentPhoto)await loadComments();refreshReplyInbox();}catch(e){commentError(e);remove.disabled=false;}});tools.append(remove);}
  article.append(tools);list.append(article);
 }
 $('#older-comments').hidden=!app.commentCursor;
}
async function setCommentLiked(id,desired){
 refreshCommentVoteWeek();const item=findCommentLikeItem(id);if(!item||pendingCommentLikes.has(id))return;
 if(!app.account?.signedIn){openLogin(()=>setCommentLiked(id,true));return;}
 const before={liked:item.liked===true,likeCount:Number(item.likeCount)||0,weeklyCount:Number(item.weeklyCount)||0},wanted=typeof desired==='boolean'?desired:!before.liked,generation=ownershipGeneration,week=commentVoteWeek,delta=Number(wanted)-Number(before.liked);
 pendingCommentLikes.add(id);storeCommentLikeState(id,{liked:wanted,likeCount:Math.max(0,before.likeCount+delta),weeklyCount:Math.max(0,before.weeklyCount+delta)});
 try{const state=await api('/comments/'+encodeURIComponent(id)+'/likes',{method:'POST',json:{liked:wanted}});if(generation===ownershipGeneration&&week===commentVoteWeek)storeCommentLikeState(id,state);}
 catch(error){if(generation===ownershipGeneration&&week===commentVoteWeek){storeCommentLikeState(id,before);if($('#lightbox').open)commentError(error);else commentBoardStatus(error.message||'点赞未保存，请重试。',true);}}
 finally{pendingCommentLikes.delete(id);const current=findCommentLikeItem(id);if(current)storeCommentLikeState(id,current);if((generation!==ownershipGeneration||week!==commentVoteWeek)&&$('#lightbox').open)loadComments().catch(commentError);}
}
function renderReplyBadge(count){const badge=$('#reply-badge');badge.hidden=!count;badge.textContent=count>99?'99+':String(count);$('#reply-inbox-button').setAttribute('aria-label',count?'回复我的，'+count+' 条未读':'回复我的');}
async function refreshReplyInbox(){
 const button=$('#reply-inbox-button');button.hidden=!app.account?.signedIn;
 if(!app.account?.signedIn){replyInboxVersion++;renderReplyBadge(0);$('#reply-inbox-list').replaceChildren();return;}
 if(replyInboxTask&&replyInboxTaskGeneration===ownershipGeneration)return replyInboxTask;
 const version=++replyInboxVersion,generation=ownershipGeneration;
 replyInboxTaskGeneration=generation;
 const task=(async()=>{
  try{const data=await api('/replies/inbox');if(version!==replyInboxVersion||generation!==ownershipGeneration||!app.account?.signedIn)return false;renderReplyBadge(data.unread);renderReplyInbox(data.items);$('#reply-inbox-error').hidden=true;return true;}
  catch(error){if($('#reply-inbox').open){$('#reply-inbox-error').textContent=error.message||'回复暂时无法读取';$('#reply-inbox-error').hidden=false;}return false;}
  finally{if(replyInboxTask===task)replyInboxTask=null;}
 })();
 replyInboxTask=task;return task;
}
function renderReplyInbox(items){
 const list=$('#reply-inbox-list');list.replaceChildren();
 if(!items.length){const empty=document.createElement('p');empty.className='reply-inbox-empty';empty.textContent='暂时没有人回复你的留言。';list.append(empty);return;}
 for(const item of items){const button=document.createElement('button');button.type='button';button.className='reply-inbox-item';const head=document.createElement('strong');head.textContent=item.author+(item.authorUsername?' · @'+item.authorUsername:'')+' 回复了你';const meta=document.createElement('small');meta.textContent=(item.photoTitle||'照片')+' · '+commentTime(item.createdAt);const text=document.createElement('p');text.textContent=item.body;button.append(head,meta,text);button.addEventListener('click',()=>openReplyPhoto(item.photoId,item.id));list.append(button);}
}
async function openReplyPhoto(photoId,replyId){
 closeDialog('reply-inbox');
 await openCommentPhoto(photoId,replyId);
}
$('#reply-inbox-button').addEventListener('click',async()=>{
 if(!app.account?.signedIn){openLogin();return;}showDialog('reply-inbox');if(!await refreshReplyInbox())return;
 try{await api('/replies/inbox',{method:'POST'});renderReplyBadge(0);}catch(error){$('#reply-inbox-error').textContent=error.message||'未读状态未保存';$('#reply-inbox-error').hidden=false;}
});
$('#cancel-comment-reply').addEventListener('click',resetCommentReply);
setInterval(()=>{if(!document.hidden&&app.account?.signedIn)refreshReplyInbox();},120000);

const commentBoard={period:'current',entries:[],cursor:null,total:0,meta:null,epoch:0,loading:false,identity:null};
let commentFocus=null,commentLoadVersion=0,commentVoteWeek=photoVoteWeekKey(),commentVoteTimer,commentImages=null;
function syncCommentBoardNav(){
 const open=!!app.commentBoardOpen,nav=$('#comment-contest-nav');nav.classList.toggle('active',open);if(open){nav.setAttribute('aria-current','page');for(const item of $$('.nav-tab,#weekly-contest-nav')){item.classList.remove('active');item.removeAttribute('aria-current');}}else nav.removeAttribute('aria-current');
}
function closeCommentBoard(){if(!app.commentBoardOpen)return;app.commentBoardOpen=false;document.body.classList.remove('comment-board-mode');$('#comment-board').hidden=true;commentBoard.epoch++;commentBoard.loading=false;updateTabs();applyContestLayout();refreshWallMotion();}
async function openCommentBoard(){if(app.bulkBusy)return;app.commentBoardOpen=true;app.selecting=false;app.selected.clear();updateBulkUI();document.body.classList.add('comment-board-mode');$('#comment-board').hidden=false;syncCommentBoardNav();refreshWallMotion();await loadCommentBoard();}
function commentBoardStatus(message,error=false){const p=$('#comment-board-status');p.textContent=message;p.hidden=!message;p.classList.toggle('is-error',error);}
function stopCommentImages(){commentImages?.observer?.disconnect();if(commentImages)commentImages.queue.length=0;commentImages=null;}
function beginCommentImages(){
 stopCommentImages();const state={queue:[],active:0,observer:null};commentImages=state;
 if(typeof IntersectionObserver==='function')state.observer=new IntersectionObserver(entries=>{if(state!==commentImages)return;for(const entry of entries)if(entry.isIntersecting){state.observer.unobserve(entry.target);state.queue.push(entry.target);}pumpCommentImages(state);},{rootMargin:'100px 0px'});
}
function pumpCommentImages(state){if(state!==commentImages)return;while(state.active<2&&state.queue.length){const img=state.queue.shift();if(!img.isConnected||!img.dataset.src)continue;state.active++;let done=false;const finish=()=>{if(done)return;done=true;state.active--;pumpCommentImages(state);};img.addEventListener('load',finish,{once:true});img.addEventListener('error',finish,{once:true});img.src=img.dataset.src;delete img.dataset.src;}}
function commentSource(item){
 const button=document.createElement('button');button.type='button';button.className='comment-board-source';button.setAttribute('aria-label','查看来源照片 '+item.photo.title+' 并定位这条评论');
 const img=document.createElement('img');img.alt='';img.width=56;img.height=56;img.decoding='async';img.loading='lazy';img.dataset.src=item.photo.src;
 const label=document.createElement('span');label.textContent='出自《'+item.photo.title+'》';const sub=document.createElement('small');sub.textContent='照片上传者：'+item.photo.uploader;label.append(sub);button.append(img,label);button.addEventListener('click',()=>openCommentPhoto(item.photo.id,item.id));
 if(commentImages?.observer)commentImages.observer.observe(img);else img.src=item.photo.src;return button;
}
function updateCommentLikeButton(button,item){const liked=!!app.account?.signedIn&&item.liked===true,count=Math.max(0,Number(item.likeCount)||0);button.textContent=(liked?'♥ 本周已赞':'♡ 本周点赞')+' '+count;button.setAttribute('aria-pressed',String(liked));button.setAttribute('aria-label',(liked?'取消':'给 '+item.author+' 的评论')+'本周点赞，累计 '+count+' 个赞');button.title='每周可重新点赞，累计 '+count+' 个赞';button.disabled=pendingCommentLikes.has(item.id);}
function makeCommentLikeButton(item,board=false){const button=document.createElement('button');button.type='button';button.className=board?'comment-board-vote':'comment-tool';button.dataset.commentLikeId=item.id;updateCommentLikeButton(button,item);button.addEventListener('click',()=>setCommentLiked(item.id));return button;}
function findCommentLikeItem(id){return app.comments.find(item=>item.id===id)||commentBoard.entries.find(item=>item.id===id);}
function storeCommentLikeState(id,state){for(const list of [app.comments,commentBoard.entries])for(const item of list)if(item.id===id){item.likeCount=Math.max(0,Number(state.likeCount)||0);item.weeklyCount=Math.max(0,Number(state.weeklyCount)||0);item.liked=state.liked===true;}for(const button of $$('[data-comment-like-id]'))if(button.dataset.commentLikeId===id){const item=findCommentLikeItem(id);if(item)updateCommentLikeButton(button,item);}}
function refreshCommentVoteWeek(){const week=photoVoteWeekKey();if(week===commentVoteWeek)return false;commentVoteWeek=week;commentLoadVersion++;for(const list of [app.comments,commentBoard.entries])for(const item of list)storeCommentLikeState(item.id,{...item,liked:false});return true;}
function scheduleCommentVoteWeek(){clearTimeout(commentVoteTimer);commentVoteTimer=setTimeout(()=>{refreshCommentVoteWeek();if(app.commentBoardOpen)loadCommentBoard();if($('#lightbox').open)loadComments().catch(commentError);scheduleCommentVoteWeek();},Math.max(1000,photoVoteWeekKey()+7*86400000-Date.now()+180));}
function refreshCommentBoardIdentity(){const key=(app.account?.signedIn?app.account.username:'')+'|'+ownershipGeneration;if(commentBoard.identity===key)return;commentBoard.identity=key;commentLoadVersion++;for(const item of [...app.comments,...commentBoard.entries])storeCommentLikeState(item.id,{...item,liked:false});if(app.commentBoardOpen)loadCommentBoard();if($('#lightbox').open&&app.commentPhoto)loadComments().catch(commentError);}
function commentQuote(item){const wrap=document.createElement('div'),quote=document.createElement('p');quote.className='comment-board-quote';quote.textContent=item.body;wrap.append(quote);const emoji=commentEmojiNode(item.emoji);if(emoji)wrap.append(emoji);if(item.body.length>100||item.body.split('\n').length>4){const expand=document.createElement('button');expand.type='button';expand.className='text-button comment-board-expand';expand.textContent='展开全文';expand.setAttribute('aria-expanded','false');expand.addEventListener('click',()=>{const open=quote.classList.toggle('expanded');expand.textContent=open?'收起':'展开全文';expand.setAttribute('aria-expanded',String(open));});wrap.append(expand);}const author=document.createElement('p');author.className='comment-board-author';const name=document.createElement('strong');name.textContent=item.author;author.append(name,document.createTextNode(' · '+commentTime(item.createdAt)+(item.replyToAuthor?' · 回复 '+item.replyToAuthor:'')));wrap.append(author);return wrap;}
function commentScore(item){const p=document.createElement('p');p.className='comment-board-score';const count=document.createElement('strong');count.textContent=item.score;p.append(count,document.createTextNode(commentBoard.period==='total'?'累计赞':'本期赞'));return p;}
function renderCommentBoard(append=false){
 const meta=commentBoard.meta,total=commentBoard.total;for(const button of $$('[data-comment-period]')){button.setAttribute('aria-pressed',String(button.dataset.commentPeriod===commentBoard.period));button.disabled=button.dataset.commentPeriod==='previous'&&!meta?.hasPrevious;}
 $('#comment-board-title').textContent=commentBoard.period==='total'?'评论总赞榜':'这期神了';$('#comment-board-dates').textContent=commentBoard.period==='total'?'每周好评，累计收藏':meta?contestDate(meta.start)+' — '+contestDate(Date.parse(meta.end)-1)+' · 北京时间'+(meta.closed?' · 已结算':''):'正在读取本期留言…';
 $('#comment-board-count').textContent=total?'共 '+total+' 条上榜评论':'';
 $('#more-comment-board').hidden=!commentBoard.cursor;$('#more-comment-board').disabled=commentBoard.loading;$('#more-comment-board').textContent='加载更多评论（'+commentBoard.entries.length+' / '+total+'）';
 $('#comment-board-empty').hidden=commentBoard.loading||total>0;$('#comment-board-empty p').textContent=commentBoard.period==='total'?'还没有获赞的评论。':meta?.closed?'本期还没有获赞的评论。':'本周的神评论，等你来选。';
 const podium=$('#comment-board-podium'),list=$('#comment-board-list');
 if(!append){beginCommentImages();podium.replaceChildren();list.replaceChildren();for(let rank=1;rank<=3;rank++){
  const item=commentBoard.entries.find(entry=>entry.rank===rank),card=document.createElement('article');card.className='comment-board-card'+(item?'':' comment-board-vacant');const place=document.createElement('div');place.className='comment-board-place';const number=document.createElement('strong');number.textContent='0'+rank;place.append(number,document.createTextNode(['本期神评','高赞佳句','妙语时刻'][rank-1]));card.append(place);
  if(item){card.dataset.commentEntry=item.id;card.append(commentQuote(item),commentScore(item),commentSource(item));if(commentBoard.period!=='previous')card.append(makeCommentLikeButton(item,true));}else{const empty=document.createElement('p');empty.className='comment-board-quote';empty.textContent=commentBoard.loading?'正在统计…':'席位待定';card.append(empty);}podium.append(card);
 }}
 const shown=new Set([...list.children].map(row=>row.dataset.commentEntry));for(const item of commentBoard.entries.filter(entry=>entry.rank>3)){if(shown.has(item.id))continue;const row=document.createElement('article');row.className='comment-board-row';row.dataset.commentEntry=item.id;const rank=document.createElement('span');rank.className='comment-board-row-rank';rank.textContent=String(item.rank).padStart(2,'0');const content=commentQuote(item);content.append(commentScore(item));if(commentBoard.period!=='previous')content.append(makeCommentLikeButton(item,true));row.append(rank,content,commentSource(item));list.append(row);}
}
async function loadCommentBoard(append=false){
 if(append&&(commentBoard.loading||!commentBoard.cursor))return;
 const epoch=append?commentBoard.epoch:++commentBoard.epoch,generation=ownershipGeneration,period=commentBoard.period;
 if(!append){commentBoard.entries=[];commentBoard.cursor=null;commentBoard.total=0;commentBoard.meta=null;}
 commentBoard.loading=true;commentBoardStatus(append?'正在加载更多评论…':'正在整理本期好评…');renderCommentBoard(append);
 try{const params=new URLSearchParams({period});if(append)params.set('cursor',commentBoard.cursor);const data=await api('/comment-board?'+params);if(epoch!==commentBoard.epoch||!app.commentBoardOpen)return;if(generation!==ownershipGeneration){commentBoard.loading=false;loadCommentBoard();return;}commentBoard.entries=append?[...new Map([...commentBoard.entries,...data.entries].map(item=>[item.id,item])).values()]:data.entries;commentBoard.cursor=data.nextCursor;commentBoard.total=data.total;commentBoard.meta=data.contest;commentBoard.loading=false;renderCommentBoard(append);commentBoardStatus('');}
 catch(error){if(epoch===commentBoard.epoch){commentBoard.loading=false;renderCommentBoard(true);commentBoardStatus(error.message||'评论榜暂时无法读取，请刷新重试。',true);}}
}
async function openCommentPhoto(photoId,commentId){try{const data=await api('/photos/'+encodeURIComponent(photoId));const index=app.visible.findIndex(photo=>photo.id===photoId);if(index>=0)app.visible[index]=data.photo;else app.visible=[data.photo,...app.visible];commentFocus={photoId,id:commentId};openPhoto(photoId);}catch(error){toast(error.message||'来源照片暂时无法打开。');}}
async function loadComments(older=false){
 const id=app.commentPhoto;if(!id||app.visible.find(photo=>photo.id===id)?.local)return;refreshCommentVoteWeek();const version=++commentLoadVersion,generation=ownershipGeneration,params=new URLSearchParams();if(older&&app.commentCursor)params.set('cursor',app.commentCursor);if(commentFocus?.photoId===id)params.set('focus',commentFocus.id);
 const data=await api('/photos/'+encodeURIComponent(id)+'/comments'+(params.size?'?'+params:''));if(id!==app.commentPhoto||version!==commentLoadVersion||generation!==ownershipGeneration)return;
 for(const item of data.comments){const old=findCommentLikeItem(item.id);if(old&&pendingCommentLikes.has(item.id))Object.assign(item,{liked:old.liked,likeCount:old.likeCount,weeklyCount:old.weeklyCount});}
 app.comments=[...new Map((older?[...data.comments,...app.comments]:data.comments).map(item=>[item.id,item])).values()];app.commentCursor=data.nextCursor;$('#comment-count').textContent=data.total;$('#comment-error').hidden=true;$('#latest-comments').hidden=!data.focused;renderComments();if(data.focused){const target=document.getElementById('comment-'+data.focused);target?.classList.add('comment-focused');if(!older)target?.scrollIntoView({block:'nearest'});}
}
$('#comment-contest-nav').addEventListener('click',openCommentBoard);
$('#refresh-comment-board').addEventListener('click',()=>loadCommentBoard());$('#more-comment-board').addEventListener('click',()=>loadCommentBoard(true));
for(const button of $$('[data-comment-period]'))button.addEventListener('click',()=>{if(button.dataset.commentPeriod===commentBoard.period)return;commentBoard.period=button.dataset.commentPeriod;loadCommentBoard();});
$('#comment-board-explore').addEventListener('click',()=>{closeCommentBoard();photoOrder='random';safeWrite('class7-photo-order',photoOrder);reloadPhotoOrder();});
$('#latest-comments').addEventListener('click',()=>{commentFocus=null;loadComments().catch(commentError);});
$('#lightbox').addEventListener('close',()=>{commentFocus=null;commentLoadVersion++;});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&refreshCommentVoteWeek()){if(app.commentBoardOpen)loadCommentBoard();if($('#lightbox').open)loadComments().catch(commentError);}});
scheduleCommentVoteWeek();

// Daily check-in and score display; ignore requests from previous identities.
(function(){
 const button=$('#checkin-button'),label=$('#checkin-label'),badge=$('#points-badge');
 let requestVersion=0,pointsRevision=0,busy=false,refreshAfterCheckin=false,lastIdentity=null,state={checkedIn:false,streak:0,totalPoints:0},timer;
 function mergeTotal(value,revision){const total=Math.max(0,Number(value)||0);return revision===pointsRevision?total:state.totalPoints;}
 function render(){label.textContent=busy?'签到中…':state.checkedIn?'已签到 ✓':'签到';button.disabled=busy||state.checkedIn;button.title='每日签到 +10 分，每连续7天额外 +30 分'+(state.streak?' · 已连续 '+state.streak+' 天':'');badge.textContent=state.totalPoints;badge.hidden=state.totalPoints<=0;badge.setAttribute('aria-label','积分 '+state.totalPoints);}
 async function refresh(force=false){
  const key=(app.account?.signedIn?app.account.username:'')+'|'+ownershipGeneration,changed=key!==lastIdentity;
  if(busy&&!changed){if(force)refreshAfterCheckin=true;return;}if(!force&&!changed)return;
  lastIdentity=key;busy=false;if(changed){pointsRevision=0;refreshAfterCheckin=false;}
  const version=++requestVersion,generation=ownershipGeneration,revision=pointsRevision;
  if(!app.account?.signedIn){state={checkedIn:false,streak:0,totalPoints:0};busy=false;render();return;}
  if(changed)state={checkedIn:false,streak:0,totalPoints:0};render();
  try{const data=await api('/checkin');if(version!==requestVersion||generation!==ownershipGeneration)return;state={...data,totalPoints:mergeTotal(data.totalPoints,revision)};render();}catch{if(version===requestVersion){button.title='签到状态暂时不可用，点击可重试';}}
 }
 async function checkin(){
  if(!app.account?.signedIn){openLogin(checkin);return;}if(busy)return;
  busy=true;const version=++requestVersion,generation=ownershipGeneration,revision=pointsRevision;render();
  try{const data=await api('/checkin',{method:'POST',json:{}});if(version!==requestVersion||generation!==ownershipGeneration)return;state={checkedIn:!!data.checkedIn,streak:Number(data.streak)||0,totalPoints:mergeTotal(data.total,revision)};if(!data.duplicate)toast('+'+data.pointsAwarded+' 分，已连续 '+data.streak+' 天');else toast('今天已经签到');}
  catch(error){if(version===requestVersion)toast(error.message||'签到失败，请重试。');}
  finally{if(version===requestVersion){busy=false;render();if(refreshAfterCheckin){refreshAfterCheckin=false;refresh(true);}}}
 }
 function schedule(){clearTimeout(timer);const bj=Date.now()+8*3600000,next=Math.floor(bj/86400000)*86400000+86400000-8*3600000;timer=setTimeout(()=>{refresh(true);schedule();},Math.max(1000,next-Date.now()+200));}
 button.addEventListener('click',checkin);
 document.addEventListener('class7:points',event=>{if(app.account?.signedIn){pointsRevision++;state.totalPoints=Math.max(0,Number(event.detail.total)||0);render();}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
 const original=updateProfile;updateProfile=function(){original();refresh();};
 schedule();
})();

// Milestones use the server's complete inventory count, never the loaded page.
const collectionMilestones=[
 {count:20,title:'新手收藏者'},
 {count:40,title:'老手收藏家'},
 {count:60,title:'大份收集家'}
];
function collectionProgress(value){
 const count=Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
 const earned=collectionMilestones.filter(item=>count>=item.count),next=collectionMilestones.find(item=>count<item.count)||null;
 return {count,earned,next,title:earned.at(-1)?.title||'尚未获得称号',progress:Math.min(60,count),remaining:next?next.count-count:0};
}
const collectionSetTitles={common:'超越常人的恒心',epic:'史到临头',legendary:'高三七班没有活着的传奇',classified:'黑暗往事'};
function collectionSetProgress(tier,stats,earned=[]){const total=Math.max(0,Number(stats?.total)||0),owned=Math.max(0,Number(stats?.owned)||0);return {title:collectionSetTitles[tier],total,owned,unlocked:earned.some(x=>x.rarity===tier),complete:total>0&&owned>=total};}
function renderCollectionProgress(){
 const section=$('#mall-collection-progress');
 section.hidden=!app.account?.signedIn||mallState.mode!=='inventory'||!mallState.summaryLoaded;
 if(section.hidden)return;
 const state=collectionProgress(mallState.total);
 $('#collection-total').textContent=state.count;
 $('#collection-current-title').textContent=state.title;
 $('#collection-next').textContent=state.next?'再收藏 '+state.remaining+' 张，解锁「'+state.next.title+'」':'三个收藏成就已全部解锁';
 const grid=$('#collection-rarity-progress');grid.replaceChildren();for(const tier of mallRarities){const stats=mallState.collection.find(x=>x.rarity===tier.key)||{owned:0,total:0};const cell=document.createElement('div');cell.className='collection-tier';cell.dataset.rarity=tier.key;const label=document.createElement('span');label.textContent=tier.label;const count=document.createElement('strong');count.textContent=stats.owned+' / '+stats.total;const meter=document.createElement('progress');meter.max=Math.max(1,stats.total);meter.value=stats.owned;meter.setAttribute('aria-label',tier.label+'照片已收藏 '+stats.owned+' 张，共 '+stats.total+' 张');const achievement=collectionSetProgress(tier.key,stats,mallState.setAchievements),title=document.createElement('span'),status=document.createElement('span');title.className='collection-set-title';title.textContent=achievement.title;status.className='collection-set-state';status.textContent=achievement.unlocked?'已达成':stats.total>0?'集齐解锁':'卡池暂无照片';cell.classList.toggle('is-complete',achievement.unlocked);cell.append(label,count,meter,title,status);grid.append(cell);}
 for(const item of collectionMilestones){const node=$('[data-collection-goal="'+item.count+'"]'),unlocked=state.count>=item.count;node.classList.toggle('is-unlocked',unlocked);$('.collection-achievement-state',node).textContent=unlocked?'已解锁':'未解锁';}
}
function notifyCollectionMilestone(before,after){const unlocked=collectionMilestones.filter(item=>before<item.count&&after>=item.count);if(unlocked.length)toast('解锁收藏成就：'+unlocked.at(-1).title);}

// Only one hovered desktop card updates, at most once per pointer animation frame.
let resetMallCardHover=()=>{};
(function(){
 const grid=$('#mall-items'),media=matchMedia('(min-width:701px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
 let card=null,rect=null,frame=0,x=0,y=0;
 function reset(){cancelAnimationFrame(frame);frame=0;if(card){card.classList.remove('is-hovered');for(const key of ['--card-rx','--card-ry','--card-light-x','--card-light-y'])card.style.removeProperty(key);}card=null;rect=null;}
 function paint(){frame=0;if(!card||!media.matches||!card.isConnected){reset();return;}const px=Math.max(0,Math.min(1,(x-rect.left)/rect.width)),py=Math.max(0,Math.min(1,(y-rect.top)/rect.height));card.style.setProperty('--card-rx',((.5-py)*12).toFixed(2)+'deg');card.style.setProperty('--card-ry',((px-.5)*12).toFixed(2)+'deg');card.style.setProperty('--card-light-x',(px*100).toFixed(1)+'%');card.style.setProperty('--card-light-y',(py*100).toFixed(1)+'%');}
 resetMallCardHover=reset;
 grid.addEventListener('pointermove',event=>{
  if(!media.matches||event.pointerType!=='mouse'){reset();return;}
  const next=event.target.closest('.mall-card');if(!next||!grid.contains(next)){reset();return;}
  if(card!==next){reset();card=next;rect=card.getBoundingClientRect();card.classList.add('is-hovered');}
  x=event.clientX;y=event.clientY;if(!frame)frame=requestAnimationFrame(paint);
 });
 grid.addEventListener('pointerleave',reset);grid.addEventListener('pointercancel',reset);grid.addEventListener('focusin',reset);
 grid.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse')reset();});
 media.addEventListener('change',reset);window.addEventListener('resize',reset);window.addEventListener('scroll',reset,{passive:true,capture:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
 new MutationObserver(()=>{if(card&&!card.isConnected)reset();}).observe(grid,{childList:true});
})();

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
 if(inventory){const label=document.createElement('p');label.className='mall-stock';label.textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).format(new Date(item.purchasedAt))+' 收藏 · '+item.price+' 积分';body.append(label);}else{const button=document.createElement('button');button.type='button';button.className='mall-redeem';button.disabled=mallState.buying||item.owned||Number(mallState.totalPoints)<item.price;button.textContent=item.owned?'已在库存':Number(mallState.totalPoints)<item.price?'积分不足 · '+item.price+' 积分':'收藏 · '+item.price+' 积分';button.addEventListener('click',()=>buyMallPhoto(item,button));body.append(button);}card.append(body);wrap.append(card);}
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
 try{const result=await api('/mall/redeem',{method:'POST',json:{photoId:item.photoId,day,price:item.price,requestId:mallState.requests.get(key)}});if(generation!==ownershipGeneration)return;mallState.requests.delete(key);mallState.totalPoints=result.points.total;toast(result.alreadyOwned||result.duplicate?'这张照片已在库存中':'已加入我的库存，-'+result.price+' 积分');mallState.buying=false;const loaded=await loadMall();if(loaded&&generation===ownershipGeneration&&!result.alreadyOwned&&!result.duplicate)notifyCollectionMilestone(previousTotal,mallState.total);}
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

// A single inventory attachment; fetch only when the user opens the picker.
let commentEmojiSelection=null;
const commentEmojiPicker={entries:[],cursor:null,loading:false,epoch:0,identity:null};
function commentEmojiNode(emoji){if(!emoji)return null;const button=document.createElement('button');button.type='button';button.className='comment-photo-emoji';button.setAttribute('aria-label',emoji.available?'放大照片表情：'+emoji.title:emoji.private?'保密卡不公开展示':'照片表情已被原作者移除');if(!emoji.available||!emoji.src){button.textContent=emoji.private?'保密卡不公开展示':'表情已被移除';button.disabled=true;return button;}const image=document.createElement('img');image.alt=emoji.title;image.loading='lazy';image.decoding='async';image.addEventListener('load',()=>fitRotatedImage(image,emoji,button.clientWidth,button.clientHeight),{once:true});image.src=emoji.src;button.append(image);button.addEventListener('click',()=>showMallPhoto(emoji));return button;}
function closeCommentEmojiPicker(){commentEmojiPicker.epoch++;commentEmojiPicker.loading=false;$('#comment-emoji-picker').hidden=true;$('#comment-emoji-toggle').setAttribute('aria-expanded','false');}
function resetCommentEmoji(){commentEmojiSelection=null;closeCommentEmojiPicker();$('#comment-emoji-selected').hidden=true;$('#comment-emoji-selected-image').removeAttribute('src');$('#comment-body').required=true;}
function resetCommentEmojiIdentity(){const key=ownershipGeneration+'|'+(app.account?.signedIn?app.account.username:'');if(commentEmojiPicker.identity===key)return;commentEmojiPicker.identity=key;commentEmojiPicker.entries=[];commentEmojiPicker.cursor=null;$('#comment-emoji-grid').replaceChildren();resetCommentEmoji();}
function selectCommentEmoji(entry){commentEmojiSelection=entry;$('#comment-emoji-selected-image').src=entry.src;$('#comment-emoji-selected-image').style.transform='rotate('+(entry.rotation||0)+'deg)';$('#comment-emoji-selected').hidden=false;$('#comment-body').required=false;closeCommentEmojiPicker();}
function renderCommentEmojiPicker(){const grid=$('#comment-emoji-grid');grid.replaceChildren();for(const entry of commentEmojiPicker.entries){if(!entry.available||entry.rarity==='classified')continue;const button=document.createElement('button');button.type='button';button.className='comment-emoji-choice';button.setAttribute('aria-label','选择表情：'+entry.title);const image=document.createElement('img');image.alt=entry.title;image.loading='lazy';image.decoding='async';image.addEventListener('load',()=>fitRotatedImage(image,entry,button.clientWidth,button.clientHeight),{once:true});image.src=entry.src;button.append(image);button.addEventListener('click',()=>selectCommentEmoji(entry));grid.append(button);}$('#comment-emoji-more').hidden=!commentEmojiPicker.cursor;$('#comment-emoji-more').disabled=commentEmojiPicker.loading;$('#comment-emoji-shop').hidden=grid.childElementCount>0;}
async function loadCommentEmojiPicker(older=false){if(commentEmojiPicker.loading)return;const epoch=++commentEmojiPicker.epoch,generation=ownershipGeneration;commentEmojiPicker.loading=true;$('#comment-emoji-status').textContent='正在读取库存…';try{const data=await api('/mall/inventory'+(older&&commentEmojiPicker.cursor?'?cursor='+encodeURIComponent(commentEmojiPicker.cursor):''));if(epoch!==commentEmojiPicker.epoch||generation!==ownershipGeneration)return;commentEmojiPicker.entries=older?[...commentEmojiPicker.entries,...data.entries]:data.entries;commentEmojiPicker.cursor=data.nextCursor;commentEmojiPicker.loading=false;renderCommentEmojiPicker();$('#comment-emoji-status').textContent=commentEmojiPicker.entries.some(x=>x.available&&x.rarity!=='classified')?'每条留言可以附一张照片表情':'还没有可用的库存照片。';}catch(error){if(epoch===commentEmojiPicker.epoch&&generation===ownershipGeneration){commentEmojiPicker.loading=false;$('#comment-emoji-status').textContent=error.message||'库存读取失败，请收起后重试。';}}}
$('#comment-emoji-toggle').addEventListener('click',()=>{withProfile(()=>{if(!$('#comment-emoji-picker').hidden){closeCommentEmojiPicker();return;}$('#comment-emoji-picker').hidden=false;$('#comment-emoji-toggle').setAttribute('aria-expanded','true');loadCommentEmojiPicker();});});
$('#comment-emoji-remove').addEventListener('click',resetCommentEmoji);$('#comment-emoji-picker-close').addEventListener('click',closeCommentEmojiPicker);$('#comment-emoji-more').addEventListener('click',()=>loadCommentEmojiPicker(true));$('#comment-emoji-shop').addEventListener('click',()=>{closeCommentEmojiPicker();closeDialog('lightbox');mallState.mode='shop';openMall();});

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

// The server owns RNG, spending, inventory and pity. Requests retain their id after ambiguous errors.
const drawState={identity:null,generation:0,epoch:0,loading:false,busy:false,pending:null,totalPoints:null,totalDraws:0,legendaryMisses:0,classifiedMisses:0,entries:[],pointsRevision:0};
function drawPendingKey(){return 'class7-draw-pending:'+app.account?.username;}
function saveDrawPending(){try{if(drawState.pending)sessionStorage.setItem(drawPendingKey(),JSON.stringify(drawState.pending));else sessionStorage.removeItem(drawPendingKey());}catch{}}
function drawStatus(message,error=false){const p=$('#draw-status');p.textContent=message;p.hidden=!message;p.classList.toggle('is-error',error);}
function renderDraw(){
 const signed=!!app.account?.signedIn;$('#draw-points').textContent=signed&&drawState.totalPoints!==null?String(drawState.totalPoints):'—';$('#draw-login').hidden=signed;
 $('#draw-legendary-left').textContent='最多 '+(30-drawState.legendaryMisses)+' 抽';$('#draw-classified-left').textContent='最多 '+(50-drawState.classifiedMisses)+' 抽';
 $('#draw-legendary-progress').value=drawState.legendaryMisses;$('#draw-classified-progress').value=drawState.classifiedMisses;
 $('#draw-total').textContent=drawState.totalDraws?'已抽 '+drawState.totalDraws+' 次 · 保底跨天保留':'单抽与十连共用保底 · 进度永久保留';
 for(const [id,cost]of[['draw-single',10],['draw-ten',90]])$('#'+id).disabled=drawState.loading||drawState.busy||!!drawState.pending||(signed&&Number(drawState.totalPoints)<cost);
 $('#draw-retry').hidden=!signed||!drawState.pending;$('#draw-retry').disabled=drawState.busy||drawState.loading;
 $('#draw-board').setAttribute('aria-busy',String(drawState.busy||drawState.loading));
}
function renderDrawResults(){
 const wrap=$('#draw-results');wrap.replaceChildren();$('#draw-results-heading').textContent=drawState.entries.length?'本次收藏':'你的下一张回忆';
 if(!drawState.entries.length){const p=document.createElement('p');p.className='draw-placeholder';p.textContent='抽到的照片会直接收进「我的库存」。';wrap.append(p);return;}
 for(const item of drawState.entries){const card=document.createElement('article');card.className='mall-card';card.dataset.rarity=mallRarity(item.rarity).key;card.append(mallPicture(item));const body=document.createElement('div');body.className='mall-card-body';const badge=document.createElement('span');badge.className='mall-rarity';badge.textContent=mallRarity(item.rarity).label+(item.rarity==='classified'?' · 独占':'');const title=document.createElement('h3');title.textContent=item.title;body.append(badge,title);if(item.caption){const p=document.createElement('p');p.className='mall-card-caption';p.textContent=item.caption;body.append(p);}const note=document.createElement('p');note.className='draw-guaranteed';note.textContent='第 '+item.drawNumber+' 抽'+(item.guaranteed?' · 保底获得':'')+' · 已入库';body.append(note);card.append(body);wrap.append(card);}
}
function syncDrawLayout(){const open=!!app.drawOpen;document.body.classList.toggle('draw-board-mode',open);$('#draw-board').hidden=!open;const nav=$('#draw-nav');nav.classList.toggle('active',open);if(open){nav.setAttribute('aria-current','page');for(const n of $$('.nav-tab,#weekly-contest-nav,#comment-contest-nav,#mall-nav')){n.classList.remove('active');n.removeAttribute('aria-current');}}else nav.removeAttribute('aria-current');}
function closeDraw(){if(!app.drawOpen)return;app.drawOpen=false;drawState.epoch++;drawState.loading=false;syncDrawLayout();applyContestLayout();refreshWallMotion();}
async function openDraw(){if(app.bulkBusy)return;closeMall();closeCommentBoard();app.drawOpen=true;app.selecting=false;app.selected.clear();updateBulkUI();syncDrawLayout();refreshWallMotion();await loadDraw();}
async function loadDraw(){
 const epoch=++drawState.epoch,generation=ownershipGeneration,revision=drawState.pointsRevision;drawState.loading=true;renderDraw();
 try{const data=await api('/draw');if(epoch!==drawState.epoch||generation!==ownershipGeneration||!app.drawOpen)return;for(const k of['totalDraws','legendaryMisses','classifiedMisses'])drawState[k]=Number(data[k])||0;if(revision===drawState.pointsRevision)drawState.totalPoints=Number(data.totalPoints)||0;drawStatus(drawState.pending?'上次抽卡结果尚未确认，请重试查询；不会重复扣分。':'');}
 catch(error){if(epoch===drawState.epoch&&generation===ownershipGeneration)drawStatus(error.message||'抽卡状态暂时无法读取。',true);}
 finally{if(epoch===drawState.epoch&&generation===ownershipGeneration){drawState.loading=false;renderDraw();}}
}
async function performDraw(count,retry=false){
 if(drawState.busy||drawState.loading)return;if(!app.account?.signedIn){openLogin(()=>{if(app.drawOpen)loadDraw();});return;}
 if(drawState.pending&&!retry)return;
 if(!retry){drawState.pending={count,cost:count===10?90:10,requestId:crypto.randomUUID()};saveDrawPending();}
 if(!drawState.pending)return;const generation=ownershipGeneration,request={...drawState.pending};drawState.busy=true;drawStatus('正在收集这一刻…');renderDraw();
 try{const result=await api('/draw',{method:'POST',json:request});if(generation!==ownershipGeneration)return;drawState.pending=null;saveDrawPending();for(const k of['totalPoints','totalDraws','legendaryMisses','classifiedMisses'])drawState[k]=Number(result[k])||0;drawState.entries=result.entries||[];renderDrawResults();$('#draw-result-note').textContent=(result.duplicate?'已找回本次结果 · ':'')+request.count+' 张 · '+result.cost+' 积分';mallState.summaryLoaded=false;mallState.inventory=[];mallState.cursor=null;drawStatus('已加入我的库存。');if(result.duplicate&&app.drawOpen)await loadDraw();}
 catch(error){if(generation!==ownershipGeneration)return;if(error.status&&error.status<500){drawState.pending=null;saveDrawPending();}drawStatus(drawState.pending?'结果暂时无法确认。请点击重试查询，同一次抽卡不会重复扣分。':error.message||'抽卡未完成。',true);}
 finally{if(generation===ownershipGeneration){drawState.busy=false;renderDraw();}}
}
function refreshDrawIdentity(){
 const identity=(app.account?.signedIn?app.account.username:'')+'|'+ownershipGeneration;if(drawState.identity===identity)return;
 drawState.identity=identity;drawState.pointsRevision++;drawState.epoch++;drawState.loading=false;drawState.busy=false;drawState.pending=null;drawState.entries=[];drawState.totalPoints=null;drawState.totalDraws=0;drawState.legendaryMisses=0;drawState.classifiedMisses=0;
 if(app.account?.signedIn)try{const pending=JSON.parse(sessionStorage.getItem(drawPendingKey())||'null');if(pending&&[1,10].includes(pending.count)&&pending.cost===(pending.count===10?90:10)&&/^[a-f0-9-]{36}$/i.test(pending.requestId))drawState.pending=pending;}catch{}
 $('#draw-result-note').textContent='';drawStatus('');renderDrawResults();renderDraw();if(app.drawOpen)loadDraw();
}
$('#draw-nav').addEventListener('click',openDraw);for(const nav of $$('.nav-tab,#weekly-contest-nav,#comment-contest-nav,#mall-nav'))nav.addEventListener('click',()=>{if(!app.bulkBusy)closeDraw();},true);
$('#draw-single').addEventListener('click',()=>performDraw(1));$('#draw-ten').addEventListener('click',()=>performDraw(10));$('#draw-retry').addEventListener('click',()=>performDraw(drawState.pending?.count,true));$('#draw-inventory').addEventListener('click',()=>{closeDraw();mallState.mode='inventory';openMall();});
const drawProfileHook=updateProfile;updateProfile=function(){drawProfileHook();refreshDrawIdentity();};const drawLayoutHook=applyContestLayout;applyContestLayout=function(){drawLayoutHook();syncDrawLayout();};
document.addEventListener('class7:points',event=>{if(app.account?.signedIn){drawState.pointsRevision++;drawState.totalPoints=Math.max(0,Number(event.detail.total)||0);if(app.drawOpen)renderDraw();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&app.drawOpen&&!drawState.busy)loadDraw();});
refreshDrawIdentity();

init();
