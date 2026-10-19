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
function columnsForWidth(width){return width<1800?3:4;}
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
function scheduleImageLayout(){clearTimeout(imageLayoutTimer);imageLayoutTimer=setTimeout(()=>renderWall({preserveOrder:true,preservePosition:true}),100);}
function syncLaneHeights(){for(const lane of app.lanes)lane.height=lane.group.offsetHeight;}
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
  },{root:wall,rootMargin:'180px 0px'});
}
function observeWallImage(img,photo){if(app.wallLoader?.observer){img.dataset.loadSrc=photo.src;app.wallLoader.observer.observe(img);}else{img.loading='lazy';img.src=photo.src;}}
function toast(message){$('#toast span').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{$('#toast').hidden=true;},4200);}
function showDialog(id){const dialog=document.getElementById(id);if(!dialog.open)dialog.showModal();updateMotion();}
function closeDialog(id){document.getElementById(id).close();updateMotion();}

function openDatabase(){return new Promise((resolve,reject)=>{const request=indexedDB.open('shiguang-photo-wall',1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('photos'))db.createObjectStore('photos',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('请关闭旧的相册标签页后重试。'));});}
function readPhotos(){return new Promise((resolve,reject)=>{const request=app.db.transaction('photos','readonly').objectStore('photos').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function savePhoto(photo){return new Promise((resolve,reject)=>{const tx=app.db.transaction('photos','readwrite');tx.objectStore('photos').put(photo);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('照片保存中断。'));});}
function removePhoto(id){return new Promise((resolve,reject)=>{const tx=app.db.transaction('photos','readwrite');tx.objectStore('photos').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}

function deviceKey(){let key=safeRead('class7-device-key');if(!/^[a-f0-9]{64}$/.test(key)){key=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');safeWrite('class7-device-key',key);}if(safeRead('class7-device-key')!==key)throw new Error('请允许浏览器保存网站数据，才能记住昵称和管理自己的照片。');return key;}
async function api(path,options={}){const headers=new Headers(options.headers);try{headers.set('X-Device-Key',deviceKey());}catch(error){if(options.method&&options.method!=='GET'&&!app.account?.signedIn)throw error;}if(options.json){headers.set('Content-Type','application/json');options.body=JSON.stringify(options.json);delete options.json;}const result=await fetch('/api'+path,{...options,headers,credentials:'same-origin'});let data;try{data=await result.json();}catch{throw new Error('服务连接失败，请刷新页面后重试。');}if(!result.ok){if(result.status===401&&app.account?.signedIn){app.account={...app.account,signedIn:false};app.profile=null;updateProfile();}const error=new Error(data.error||'操作失败，请重试。');error.status=result.status;throw error;}return data;}
const isMine=photo=>photo.owned||photo.local;
let pointsRequest=0;
async function refreshAccountPoints(){
  const panel=$('#account-points'),version=++pointsRequest;
  if(!app.account?.signedIn){panel.hidden=true;return;}
  panel.hidden=false;
  try{
    const data=await api('/points');
    if(version!==pointsRequest||!app.account?.signedIn)return;
    const total=Math.max(0,Number(data.totalPoints)||0),streak=Number(data.streak)||0;
    $('#account-points-value').textContent=total;
    $('#account-points-meta').textContent=(data.checkedIn?'今日已签到':'今日还未签到')+(streak?' · 已连续 '+streak+' 天':'');
  }catch{if(version===pointsRequest)panel.hidden=true;}
}
function updateProfile(){
  const name=app.profile?.nickname,signed=!!app.account?.signedIn;
  $('#account-recovery-notice').hidden=app.view!=='mine'||signed;
  $('#profile-label').textContent=signed?(name||app.account.username):'登录';$('#profile-button').title=signed?'管理账号：'+app.account.username:'登录或注册照片集账号';$('#upload-nickname').textContent=name||'';$('#comment-identity').textContent=signed&&name?'以 '+name+' 的身份留言':'登录照片集账号，即可留言';
  $('#account-auth').hidden=signed;$('#account-settings').hidden=!signed;$('#login-title').textContent=signed?'账号与照片管理':'登录照片集';$('#account-username').textContent=app.account?.username||'';
  const photos=app.account?.legacyPhotos||0,comments=app.account?.legacyComments||0;
  $('#legacy-account-summary').textContent=photos||comments?'找到 '+photos+' 张旧照片、'+comments+' 条旧留言，关联后即可用此账号跨设备管理。':'当前身份没有待关联的旧照片或留言。';$('#link-existing').hidden=!(photos||comments);$('#link-existing').disabled=app.accountBusy;
  const url=app.account?.legacySignInUrl;if(url)$('#verify-legacy').href=url;
  $('#profile-button').classList.toggle('signed-in',signed);refreshAccountPoints();
}
function openLogin(action){app.pendingAction=typeof action==='function'?action:null;$('#nickname-input').value=app.profile?.nickname||safeRead('class7-nickname')||safeRead('shiguang-uploader');$('#account-nickname').value=$('#nickname-input').value;$('#account-password').value='';$('#account-confirm').value='';$('#login-error').hidden=true;$('#account-error').hidden=true;$('#legacy-account-result').hidden=true;updateProfile();showDialog('login-dialog');}
function withProfile(action){if(app.account?.signedIn&&app.profile)action();else openLogin(action);}
async function refreshIdentity(){const data=await api('/profile');app.profile=data.profile;app.account=data.account;updateProfile();}
let accountMode='login';
function setAccountMode(mode){accountMode=mode;const register=mode==='register';$('#account-register-fields').hidden=!register;$('#account-confirm').required=register;$('#account-nickname').required=register;$('#account-password').autocomplete=register?'new-password':'current-password';$('#account-mode-login').setAttribute('aria-pressed',String(!register));$('#account-mode-register').setAttribute('aria-pressed',String(register));$('#account-submit').textContent=register?'注册并登录':'登录并恢复管理';$('#account-error').hidden=true;}
async function reloadOwnership(){
  app.minePhotos=[];app.mineCursor=null;app.mineLoaded=false;app.selected.clear();app.selecting=false;
  const photoId=app.visible[app.lightboxIndex]?.id;
  await loadCloud(false,false);if(app.view==='mine')await loadCloud(false,true);
  if($('#lightbox').open){const index=app.visible.findIndex(photo=>photo.id===photoId);if(index>=0){app.lightboxIndex=index;$('#delete-photo').hidden=!isMine(app.visible[index]);updateRotationControls();resetCaptionEditor();}else closeDialog('lightbox');}
}
async function loadCloud(append=false,mine=app.view==='mine'){const params=new URLSearchParams();if(mine)params.set('mine','1');const cursor=mine?app.mineCursor:app.nextCursor;if(append&&cursor)params.set('cursor',cursor);const data=await api('/photos?'+params);if(mine){app.minePhotos=append?[...app.minePhotos,...data.photos]:data.photos;app.mineCursor=data.nextCursor;app.mineLoaded=true;}else{app.cloud=append?[...app.cloud,...data.photos]:data.photos;app.nextCursor=data.nextCursor;app.cloudLoaded=true;}$('#gallery-error').hidden=true;await refreshPhotos({},false);}
async function refreshPhotos(wallOptions={},readLocal=true){
  if(readLocal){
  let records=[];try{records=app.db?await readPhotos():[];}catch{toast('旧版本机照片读取失败，请保留原浏览器数据。');}
  for(const url of app.objectUrls)URL.revokeObjectURL(url);app.objectUrls=[];
  app.legacy=records.filter(record=>!record.sharedId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(record=>{const src=URL.createObjectURL(record.blob);app.objectUrls.push(src);return {...record,src,demo:false,local:true,owned:true};});
  }
  app.photos=[...new Map([...app.cloud,...app.minePhotos].map(photo=>[photo.id,photo])).values(),...app.legacy];const mine=app.photos.filter(isMine).length;
  $('#my-count').hidden=!mine;$('#my-count').textContent=mine;$('#local-sync-notice').hidden=!(app.view==='mine'&&app.legacy.length);$('#local-count').textContent=app.legacy.length;$('#load-more-photos').hidden=!(app.view==='mine'?app.mineCursor:app.nextCursor);
  refreshFilter();if(wallOptions.skipWall&&app.view==='all'&&app.cloudLoaded)return;renderWall(wallOptions);
}

function refreshFilter(){
  const select=$('#uploader-filter');
  const source=app.view==='mine'?app.photos.filter(isMine):app.photos;
  const names=[...new Set(source.map(photo=>photo.uploader))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
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
  button.append(img);observeWallImage(img,photo);if(app.selecting){button.classList.add('selectable');const marker=document.createElement('span');marker.className='selection-mark';marker.setAttribute('aria-hidden','true');marker.innerHTML=icon('check');button.append(marker);}button.addEventListener('click',()=>{if(app.selecting)togglePhotoSelection(photo.id);else openPhoto(photo.id);});return button;
}

function renderWall({preserveOrder=false,preservePosition=false}={}){
  let photos=app.view==='mine'?app.photos.filter(isMine):app.photos.filter(photo=>!photo.local);
  $('#local-sync-notice').hidden=!(app.view==='mine'&&app.legacy.length);$('#load-more-photos').hidden=!(app.view==='mine'?app.mineCursor:app.nextCursor);
  $('#account-recovery-notice').hidden=app.view!=='mine'||!!app.account?.signedIn;
  if(app.filter)photos=photos.filter(photo=>photo.uploader===app.filter);
  app.visible=preserveOrder?preservePhotoOrder(app.visible,photos):app.selecting?[...photos]:shuffle(photos);app.columns=columnCount();
  const wall=$('#photo-wall'),scrollTop=preservePosition?wall.scrollTop:0,phases=preservePosition?app.lanes.map(lane=>lane.height?lane.offset/lane.height:0):[];
  const isStatic=app.selecting||photos.length<8;wall.classList.toggle('static-wall',isStatic);
  app.wallWidth=wall.clientWidth;app.wallHeight=wall.clientHeight;beginWallImages(wall);wall.replaceChildren();app.lanes=[];
  const empty=$('#wall-empty');empty.hidden=!app.cloudLoaded||photos.length>0;$('#wall-loading').hidden=!!app.cloudLoaded||photos.length>0;
  $('#clear-filter').hidden=!app.filter;
  $('#photo-count').textContent=photos.length;
  $('#gallery-title').textContent=app.view==='mine'?'我留下的瞬间':'全班的瞬间';
  const columns=Math.min(app.columns,Math.max(1,photos.length));
  const measuredGap=parseFloat(getComputedStyle(wall).columnGap),gap=Number.isFinite(measuredGap)?measuredGap:8;
  const width=Math.max(1,(app.wallWidth-gap*(columns-1))/columns),distribution=balancePhotoColumns(app.visible,columns,width,app.wallHeight,gap);
  const fragment=document.createDocumentFragment(),built=[];
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
  button.disabled=staticWall;
  const status=$('#wall-status');
  if(app.selecting)status.textContent='点击照片选择，完成后可批量删除';
  else if(!app.visible.length)status.textContent='等待你的第一张照片';
  else if(staticWall)status.textContent='这些瞬间，值得慢慢看';
  else if($('dialog[open]'))status.textContent='正在查看，照片墙已暂停';
  else if(!app.playing)status.textContent='已暂停，滚轮或滑动可以继续探索';
  else if(app.hoverPaused)status.textContent='停下来看看 · 移开鼠标继续流动';
  else status.textContent='照片缓缓流动，随时可以停下';
}

function animate(timestamp){
  const dt=app.lastFrame?Math.min((timestamp-app.lastFrame)/1000,.05):0;app.lastFrame=timestamp;
  if(!$('#photo-wall').classList.contains('static-wall')){
    const moving=app.playing&&!app.hoverPaused&&!$('dialog[open]')&&!document.hidden;
    for(const lane of app.lanes){const height=lane.height;if(height<50)continue;if(moving)lane.offset+=dt*lane.speed;lane.offset=((lane.offset%height)+height)%height;if(lane.lastOffset!==lane.offset){lane.element.style.transform=`translateY(${-lane.offset}px)`;lane.lastOffset=lane.offset;}}
  }
  requestAnimationFrame(animate);
}

function openPhoto(id){app.lightboxIndex=app.visible.findIndex(photo=>photo.id===id);if(app.lightboxIndex<0)return;showPhoto();showDialog('lightbox');}
function photoDownload(photo){
  const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
  const extension=extensions[photo.mime||photo.blob?.type]||'jpg';
  const title=(photo.title||'photo').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,'_').replace(/\.(?:jpe?g|png|webp|gif|avif)$/i,'').replace(/[. ]+$/g,'').trim()||'photo';
  return {href:photo.shared?'/api/files/'+encodeURIComponent(photo.id)+'?download=1':photo.src,filename:title+'.'+extension};
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
async function saveOriginalResponse(state){const response=await fetch(state.photo.src,{credentials:'same-origin',signal:state.controller.signal});if(!response.ok)throw new Error('原图读取失败，请重试。');return response;}
async function saveToLocation(){
  const state=app.saveTarget;if(!state||state.busy)return;state.busy=true;state.controller=new AbortController();updateSaveControls(state);let writable;
  try{
    // The picker must run directly from the click, before any network await.
    const handle=await window.showSaveFilePicker({suggestedName:state.filename,startIn:'desktop'});
    if(app.saveTarget!==state)return;saveMessage(state,'正在保存原图…');const response=await saveOriginalResponse(state);writable=await handle.createWritable();
    if(response.body)await response.body.pipeTo(writable);else{await writable.write(await response.arrayBuffer());await writable.close();}
    saveMessage(state,'已保存到你选择的位置。');
  }catch(error){if(writable)try{await writable.abort();}catch{}saveMessage(state,error.name==='AbortError'?'已取消保存。':error.message||'保存失败，请重新选择位置。');}
  finally{state.busy=false;updateSaveControls(state);}
}
async function preparePhoneSave(){
  const state=app.saveTarget;if(!state||state.busy)return;state.busy=true;state.controller=new AbortController();updateSaveControls(state);saveMessage(state,'正在准备原图…');
  try{
    const response=await saveOriginalResponse(state),blob=await response.blob();if(app.saveTarget!==state)return;
    const file=new File([blob],state.filename,{type:blob.type||state.photo.mime||state.photo.blob?.type||'image/jpeg'});
    if(!navigator.canShare({files:[file]})){saveMessage(state,'此浏览器不支持系统图片保存菜单。请打开原图，长按图片选择保存。');return;}
    state.file=file;$('#prepare-phone-save').hidden=true;$('#share-phone-save').hidden=false;saveMessage(state,'图片已准备好。点击“打开系统保存菜单”，选择保存图片；没有此选项时，可打开原图后长按保存。');
  }catch(error){saveMessage(state,error.name==='AbortError'?'已取消准备。':error.message||'图片准备失败，请重试。');}
  finally{state.busy=false;updateSaveControls(state);}
}
async function sharePhonePhoto(){
  const state=app.saveTarget;if(!state?.file||state.busy)return;state.busy=true;updateSaveControls(state);
  try{await navigator.share({files:[state.file],title:state.photo.title||'七班照片'});saveMessage(state,'已交由系统保存/分享菜单处理。');}
  catch(error){saveMessage(state,error.name==='AbortError'?'已取消，可重新选择保存方式。':'未能打开系统菜单，请打开原图后长按保存。');}
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
  app.commentPhoto=photo.id;app.comments=[];app.commentCursor=null;$('#comment-body').value='';$('#comment-error').hidden=true;$('#comment-form').hidden=!!photo.local;$('#refresh-comments').hidden=!!photo.local;$('#older-comments').hidden=true;$('#comment-count').textContent='';$('#comment-list').textContent=photo.local?'同步到共享相册后，就可以一起留言。':'正在读取留言…';
  if(!photo.local)loadComments().catch(commentError);
  $('#previous-photo').hidden=app.visible.length<2;$('#next-photo').hidden=app.visible.length<2;
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

function openUpload(){if(app.bulkBusy)return;withProfile(()=>{$('#upload-error').hidden=true;updateProfile();showDialog('upload-dialog');});}

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
    edit.append(img);edit.addEventListener('click',()=>openUploadPhoto(entry));
    const remove=document.createElement('button');remove.type='button';remove.className='remove-file';remove.setAttribute('aria-label','移除 '+entry.file.name);remove.disabled=app.busy;remove.innerHTML=icon('close');
    remove.addEventListener('click',()=>{if(app.busy)return;URL.revokeObjectURL(entry.preview);app.files=app.files.filter(item=>item!==entry);renderSelection();});thumb.append(edit,remove);item.append(thumb);
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
  $('#selection-summary').textContent=app.files.length?'已选 '+app.files.length+' 张 · '+(size/1024/1024).toFixed(1)+' MB':'还没有选择照片';
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
async function shareFile(file,meta){return (await api('/photos',{method:'POST',headers:{'Content-Type':file.type,'X-Photo-Metadata':metadataHeader(meta)},body:file})).photo;}
async function uploadWithLimit(entries,task,onProgress=()=>{}){
  let next=0,finished=0;const successes=[],failures=[];
  async function worker(){while(next<entries.length){const entry=entries[next++];try{const value=await task(entry);successes.push({entry,value});}catch(error){failures.push({entry,error});}finally{onProgress(++finished,entries.length);}}}
  await Promise.all(Array.from({length:Math.min(3,entries.length)},()=>worker()));return {successes,failures};
}
async function uploadPhotos(event){
  event.preventDefault();if(app.busy)return;const error=$('#upload-error');error.hidden=true;
  if(!app.profile){openLogin();return;}if(!app.files.length){error.textContent='先选择至少一张照片吧。';error.hidden=false;return;}
  const queue=[...app.files],caption=$('#photo-caption').value.trim(),title=$('#photo-title').value.trim();
  app.busy=true;$('#submit-upload').disabled=true;$('#photo-input').disabled=true;$('#change-upload-name').disabled=true;$('#photo-title').disabled=true;$('#photo-caption').disabled=true;renderSelection();$('#submit-upload').textContent='正在上传…';$('#upload-progress').hidden=false;$('#upload-progress').value=0;$('#selection-summary').textContent='已处理 0 / '+queue.length+' 张';
  try{
    const result=await uploadWithLimit(queue,async entry=>{const dimensions=await uploadDimensions(entry);return shareFile(entry.file,{title,caption:photoCaption(entry,caption),rotation:photoRotation(entry),...dimensions});},(finished,total)=>{$('#upload-progress').value=finished/total*100;$('#selection-summary').textContent='已处理 '+finished+' / '+total+' 张';});
    const uploaded=new Set(result.successes.map(item=>item.entry));
    for(const item of result.successes){app.cloud.unshift(item.value);URL.revokeObjectURL(item.entry.preview);}
    app.files=app.files.filter(entry=>!uploaded.has(entry));
    if(result.successes.length){app.view='mine';app.filter='';updateTabs();await refreshPhotos();}
    if(result.failures.length){const first=result.failures[0];error.textContent='已上传 '+result.successes.length+' 张，'+result.failures.length+' 张未完成。再次点击上传只会重试保留的照片。'+first.entry.file.name+'：'+(first.error.message||'上传失败，请重试。');error.hidden=false;}
    else{$('#photo-title').value='';$('#photo-caption').value='';closeDialog('upload-dialog');toast(result.successes.length+' 张照片已加入共享相册');}
  }catch(e){error.textContent=e.message||'上传暂时中断，请重试。';error.hidden=false;}
  finally{app.busy=false;$('#submit-upload').disabled=false;$('#photo-input').disabled=false;$('#change-upload-name').disabled=false;$('#photo-title').disabled=false;$('#photo-caption').disabled=false;$('#submit-upload').innerHTML=icon('upload')+'加入照片墙';$('#upload-progress').hidden=true;renderSelection();}
}
function commentError(error){$('#comment-error').textContent=error.message||'留言读取失败，请重试。';$('#comment-error').hidden=false;}
function commentTime(value){return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
function renderComments(){const list=$('#comment-list');list.replaceChildren();if(!app.comments.length){const empty=document.createElement('p');empty.className='comment-empty';empty.textContent='还没有留言。让第一句话，从你开始。';list.append(empty);}for(const item of app.comments){const article=document.createElement('article');article.className='comment';const head=document.createElement('div');head.className='comment-head';const author=document.createElement('strong');author.textContent=item.author;const time=document.createElement('time');time.dateTime=item.createdAt;time.textContent=commentTime(item.createdAt);head.append(author,time);const body=document.createElement('p');body.textContent=item.body;article.append(head,body);if(item.mine){const remove=document.createElement('button');remove.type='button';remove.className='text-button comment-delete';remove.textContent='删除';remove.setAttribute('aria-label','删除自己在 '+time.textContent+' 的留言');remove.addEventListener('click',async()=>{if(remove.dataset.confirm!=='yes'){remove.textContent='确认删除';remove.dataset.confirm='yes';return;}remove.disabled=true;try{await api('/comments/'+item.id,{method:'DELETE'});if(app.commentPhoto)await loadComments();}catch(e){commentError(e);remove.disabled=false;}});article.append(remove);}list.append(article);}$('#older-comments').hidden=!app.commentCursor;}
async function loadComments(older=false){const id=app.commentPhoto;if(!id||id.startsWith('local-'))return;const data=await api('/photos/'+encodeURIComponent(id)+'/comments'+(older&&app.commentCursor?'?cursor='+encodeURIComponent(app.commentCursor):''));if(id!==app.commentPhoto)return;const merged=older?[...data.comments,...app.comments]:data.comments;app.comments=[...new Map(merged.map(item=>[item.id,item])).values()];app.commentCursor=data.nextCursor;$('#comment-count').textContent=data.total;$('#comment-error').hidden=true;renderComments();}
async function postComment(event){event.preventDefault();if(app.commentBusy)return;withProfile(async()=>{const body=$('#comment-body').value.trim(),id=app.commentPhoto;if(!body||!id)return;app.commentBusy=true;$('#send-comment').disabled=true;$('#send-comment').textContent='发送中…';try{await api('/photos/'+encodeURIComponent(id)+'/comments',{method:'POST',json:{body}});if(id===app.commentPhoto){$('#comment-body').value='';await loadComments();}toast('留言已发送');}catch(e){commentError(e);}finally{app.commentBusy=false;$('#send-comment').disabled=false;$('#send-comment').textContent='发送留言';}});}
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
for(const button of $$('.nav-tab'))button.addEventListener('click',()=>{if(app.bulkBusy)return;app.selecting=false;app.selected.clear();$('#bulk-error').hidden=true;app.view=button.dataset.view;app.filter='';updateTabs();refreshFilter();renderWall();if(app.view==='mine'&&!app.mineLoaded)loadCloud(false,true).catch(e=>toast(e.message));});
$('#uploader-filter').addEventListener('change',event=>{app.filter=event.target.value;renderWall();});
$('#clear-filter').addEventListener('click',()=>{app.filter='';refreshFilter();renderWall();});
$('#shuffle-button').addEventListener('click',()=>{renderWall();toast('换个视角，遇见另一段风景');});
$('#motion-button').addEventListener('click',()=>{app.playing=!app.playing;updateMotion();});
$('#photo-wall').addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){app.hoverPaused=true;updateMotion();}});
$('#photo-wall').addEventListener('pointerleave',()=>{app.hoverPaused=false;updateMotion();});
$('#photo-wall').addEventListener('wheel',event=>{if($('#photo-wall').classList.contains('static-wall'))return;event.preventDefault();for(const lane of app.lanes)lane.offset+=event.deltaY*.5;},{passive:false});
let touchY=null;
$('#photo-wall').addEventListener('touchstart',event=>{if($('#photo-wall').classList.contains('static-wall'))return;touchY=event.touches[0].clientY;app.hoverPaused=true;updateMotion();},{passive:true});
$('#photo-wall').addEventListener('touchmove',event=>{if(touchY===null||$('#photo-wall').classList.contains('static-wall'))return;event.preventDefault();const y=event.touches[0].clientY;for(const lane of app.lanes)lane.offset+=touchY-y;touchY=y;},{passive:false});
$('#photo-wall').addEventListener('touchend',()=>{touchY=null;app.hoverPaused=false;updateMotion();});
$('#photo-wall').addEventListener('touchcancel',()=>{touchY=null;app.hoverPaused=false;updateMotion();});
$('#photo-wall').addEventListener('keydown',event=>{if($('dialog[open]'))return;if(event.key==='ArrowDown'||event.key==='ArrowUp'){if($('#photo-wall').classList.contains('static-wall'))return;event.preventDefault();for(const lane of app.lanes)lane.offset+=event.key==='ArrowDown'?90:-90;}});
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
$('#confirm-delete').addEventListener('click',async()=>{const photo=app.visible[app.lightboxIndex];if(!photo||!isMine(photo))return;$('#confirm-delete').disabled=true;try{if(photo.local)await removePhoto(photo.id);else{await api('/photos/'+photo.id,{method:'DELETE'});app.cloud=app.cloud.filter(item=>item.id!==photo.id);app.minePhotos=app.minePhotos.filter(item=>item.id!==photo.id);}closeDialog('delete-dialog');closeDialog('lightbox');await refreshPhotos();toast(photo.local?'照片已从本机删除':'照片和留言已删除');}catch(e){toast(e.message);}finally{$('#confirm-delete').disabled=false;}});
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
new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const wall=$('#photo-wall');if(app.photos.length&&(columnCount()!==app.columns||Math.abs(wall.clientWidth-app.wallWidth)>1||Math.abs(wall.clientHeight-app.wallHeight)>1))renderWall({preserveOrder:true,preservePosition:true});},120);}).observe($('#photo-wall'));
reducedMotion.addEventListener('change',event=>{if(event.matches)app.playing=false;updateMotion();});

$('#refresh-gallery').addEventListener('click',async()=>{$('#refresh-gallery').disabled=true;try{await loadCloud();toast('相册已更新');}catch(e){toast(e.message);}finally{$('#refresh-gallery').disabled=false;}});
$('#profile-button').addEventListener('click',()=>openLogin());
document.addEventListener('class7:points',event=>{if(app.account?.signedIn&&!$('#account-points').hidden)$('#account-points-value').textContent=Math.max(0,Number(event.detail?.total)||0);});
$('#change-upload-name').addEventListener('click',()=>openLogin());
$('#login-form').addEventListener('submit',async event=>{event.preventDefault();if(!app.account?.signedIn)return;const nickname=$('#nickname-input').value.trim();if(!nickname)return;$('#save-nickname').disabled=true;try{await api('/profile',{method:'POST',json:{nickname}});safeWrite('class7-nickname',nickname);await refreshIdentity();toast('昵称已保存');}catch(e){$('#login-error').textContent=e.message;$('#login-error').hidden=false;}finally{$('#save-nickname').disabled=false;}});
$('#account-mode-login').addEventListener('click',()=>setAccountMode('login'));$('#account-mode-register').addEventListener('click',()=>setAccountMode('register'));
$('#restore-account').addEventListener('click',()=>openLogin());
$('#account-form').addEventListener('submit',async event=>{
 event.preventDefault();if(app.accountBusy)return;const password=$('#account-password').value;
 if(accountMode==='register'&&password!==$('#account-confirm').value){$('#account-error').textContent='两次输入的密码不一致。';$('#account-error').hidden=false;return;}
 app.accountBusy=true;$('#account-submit').disabled=true;$('#account-error').hidden=true;
 try{await api('/account/'+accountMode,{method:'POST',json:{username:$('#account-name').value,password,nickname:$('#account-nickname').value}});$('#account-password').value='';$('#account-confirm').value='';await refreshIdentity();await reloadOwnership();const action=app.pendingAction;app.pendingAction=null;if(action){closeDialog('login-dialog');action();}else{updateProfile();$('#nickname-input').value=app.profile?.nickname||'';}toast('已登录，同一账号可恢复照片管理');}
 catch(error){$('#account-error').textContent=error.message;$('#account-error').hidden=false;}
 finally{app.accountBusy=false;$('#account-submit').disabled=false;}
});
$('#account-logout').addEventListener('click',async()=>{if(app.accountBusy)return;app.accountBusy=true;$('#account-logout').disabled=true;try{await api('/account/logout',{method:'POST'});await refreshIdentity();await reloadOwnership();closeDialog('login-dialog');toast('已退出照片集账号');}catch(error){toast(error.message);}finally{app.accountBusy=false;$('#account-logout').disabled=false;}});
$('#link-existing').addEventListener('click',async()=>{if(app.accountBusy)return;app.accountBusy=true;$('#link-existing').disabled=true;try{const data=await api('/account/link-existing',{method:'POST'});await refreshIdentity();await reloadOwnership();$('#legacy-account-result').textContent='已关联 '+data.linkedPhotos+' 张照片和 '+data.linkedComments+' 条留言，以后登录此账号即可管理。';$('#legacy-account-result').hidden=false;}catch(error){$('#legacy-account-result').textContent=error.message;$('#legacy-account-result').hidden=false;}finally{app.accountBusy=false;$('#link-existing').disabled=false;}});
$('#login-dialog').addEventListener('close',()=>{$('#account-password').value='';$('#account-confirm').value='';});
$('#sync-local').addEventListener('click',syncLegacy);
$('#load-more-photos').addEventListener('click',async()=>{$('#load-more-photos').disabled=true;try{await loadCloud(true);}catch(e){toast(e.message);}finally{$('#load-more-photos').disabled=false;}});
$('#comment-form').addEventListener('submit',postComment);
$('#refresh-comments').addEventListener('click',()=>loadComments().catch(commentError));
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
  app.cloud=app.cloud.filter(photo=>!deleted.has(photo.id));app.minePhotos=app.minePhotos.filter(photo=>!deleted.has(photo.id));
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
  updateProfile();requestAnimationFrame(animate);
  const photosTask=loadCloud(false,false),identityTask=refreshIdentity();
  const localTask=(async()=>{try{app.db=await openDatabase();await refreshPhotos({preserveOrder:true,preservePosition:true,skipWall:true});}catch(e){console.warn('本地图片存储不可用：',e.message);}})();
  const [photos,identity]=await Promise.allSettled([photosTask,identityTask,localTask]);
  if(photos.status==='rejected'){$('#gallery-error').textContent=photos.reason.message+' 共享照片暂未载入。';$('#gallery-error').hidden=false;$('#wall-loading').hidden=true;}
  if(identity.status==='rejected')toast('账号暂未载入，可点击登录重试。');
  if(new URLSearchParams(location.search).get('restore')==='1'){openLogin();history.replaceState({},'','/');}
}

init();
