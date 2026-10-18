const fs=require('node:fs');const path=require('node:path');
const root=__dirname,old=path.join(root,'baseline');
fs.mkdirSync(path.join(root,'src'),{recursive:true});fs.mkdirSync(path.join(root,'public'),{recursive:true});
for(const name of ['app.js','editorial.css','favicon.svg'])fs.copyFileSync(path.join(old,'public',name),path.join(root,'public',name));
fs.copyFileSync(path.join(root,'src/photo-compression.js'),path.join(root,'public/photo-compression.js'));
fs.appendFileSync(path.join(root,'public/editorial.css'),'\n'+fs.readFileSync(path.join(root,'src/upload-compression.css'),'utf8'));
fs.appendFileSync(path.join(root,'public/editorial.css'),'\n'+fs.readFileSync(path.join(root,'src/usage-notice.css'),'utf8'));
fs.appendFileSync(path.join(root,'public/editorial.css'),'\n'+fs.readFileSync(path.join(root,'src/wall-speed.css'),'utf8'));
fs.appendFileSync(path.join(root,'public/editorial.css'),'\n'+fs.readFileSync(path.join(root,'src/account-linking.css'),'utf8'));
fs.appendFileSync(path.join(root,'public/editorial.css'),'\n'+fs.readFileSync(path.join(root,'src/desktop-wordmark.css'),'utf8'));
fs.appendFileSync(path.join(root,'public/editorial.css'),'\n'+fs.readFileSync(path.join(root,'src/wall-motion.css'),'utf8'));
fs.appendFileSync(path.join(root,'public/editorial.css'),'\n'+fs.readFileSync(path.join(root,'src/wall-view.css'),'utf8'));
let browserApp=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
browserApp="async function cloudFetch(url,options){for(let retry=0;;retry++){const result=await fetch(url,options);if(result.status!==429||retry>=4)return result;await result.body?.cancel();await new Promise(resolve=>setTimeout(resolve,700*2**retry+Math.random()*250));}}\n"+browserApp;
browserApp=browserApp.replace("const result=await fetch('/api'+path,{...options,headers,credentials:'same-origin'});", "const result=await cloudFetch('/api'+path,{...options,headers,credentials:'same-origin'});");
browserApp=browserApp.replace('let data;try{data=await result.json();}',"let data;if(result.status===406)throw new Error('上传请求被服务器拒绝（HTTP 406），原因尚未确认。可开启自动压缩大照片后重试。');try{data=await result.json();}");
const uploadHook='const dimensions=await uploadDimensions(entry);return shareFile(entry.file,{title,caption:photoCaption(entry,caption),rotation:photoRotation(entry),...dimensions});';
if(!browserApp.includes(uploadHook))throw Error('Upload hook changed; review compression integration');
browserApp=browserApp.replace(uploadHook,'const dimensions=await uploadDimensions(entry),prepared=await prepareUploadFile(entry,dimensions);return shareFile(prepared.file,{title,caption:photoCaption(entry,caption),rotation:photoRotation(entry),width:prepared.width,height:prepared.height});');
browserApp=browserApp.replace('edit.append(img);edit.addEventListener','renderCompressionNote(entry,thumb);edit.append(img);edit.addEventListener');
// Keep the size note below the image button, without text over the photo.
browserApp=browserApp.replace('thumb.append(edit,remove);item.append(thumb);','thumb.prepend(edit,remove);item.append(thumb);');
browserApp=browserApp.replace("(size/1024/1024).toFixed(1)+' MB'",'window.Class7PhotoCompression.formatBytes(size)');
browserApp=browserApp.replace("app.busy=true;$('#submit-upload').disabled=true;","app.busy=true;$('#auto-compress').disabled=true;$('#submit-upload').disabled=true;");
browserApp=browserApp.replace("finally{app.busy=false;$('#submit-upload').disabled=false;","finally{app.busy=false;$('#auto-compress').disabled=false;$('#submit-upload').disabled=false;");
browserApp=browserApp.replace('\ninit();','\n'+fs.readFileSync(path.join(root,'src/upload-compression-ui.js'),'utf8')+'\ninit();');
browserApp=browserApp.replace('dt*lane.speed','dt*lane.speed*wallSpeed');
const motionStart=browserApp.indexOf('function animate(timestamp){'),motionEnd=browserApp.indexOf('function openPhoto(',motionStart);
if(motionStart<0||motionEnd<0)throw Error('Wall animation hook changed');
browserApp=browserApp.slice(0,motionStart)+fs.readFileSync(path.join(root,'src/wall-motion.js'),'utf8')+'\n'+browserApp.slice(motionEnd);
browserApp=browserApp.replace('requestAnimationFrame(animate);','initWallMotion();');
browserApp=browserApp.replace('const wall=$(\'#photo-wall\'),scrollTop=',"captureWallMotion();\n  const wall=$('#photo-wall'),scrollTop=");
browserApp=browserApp.replace('const fragment=document.createDocumentFragment(),built=[];','app.cardWidth=width;const fragment=document.createDocumentFragment(),built=[];');
browserApp=browserApp.replace(/else status.textContent='照片缓缓流动，随时可以停下';\r?\n}/,"else status.textContent='照片缓缓流动，随时可以停下';\n  refreshWallMotion();\n}");
browserApp=browserApp.replace('imageLayoutTimer=setTimeout(()=>renderWall({preserveOrder:true,preservePosition:true}),100);','imageLayoutTimer=setTimeout(relayoutWallImages,150);');
browserApp=browserApp.replace('function syncLaneHeights(){for(const lane of app.lanes)lane.height=lane.group.offsetHeight;}','function syncLaneHeights(){const heights=app.lanes.map(lane=>lane.group.offsetHeight);app.lanes.forEach((lane,index)=>{lane.height=heights[index];});refreshWallMotion();}');
browserApp=browserApp.replace("rootMargin:'180px 0px'","rootMargin:'360px 0px'");
browserApp=browserApp.replace("event=>{if($('#photo-wall').classList.contains('static-wall'))return;event.preventDefault();for(const lane of app.lanes)lane.offset+=event.deltaY*.5;}",'scrollWallInput');
browserApp=browserApp.replace('for(const lane of app.lanes)lane.offset+=touchY-y;','moveWallBy(touchY-y,true);');
browserApp=browserApp.replace("for(const lane of app.lanes)lane.offset+=event.key==='ArrowDown'?90:-90;","moveWallBy(event.key==='ArrowDown'?90:-90);");
browserApp=browserApp.replace('button.disabled=staticWall;',"button.disabled=staticWall;$('#wall-speed').disabled=staticWall;");
browserApp=browserApp.replace("function columnsForWidth(width){return width<1800?3:4;}","function columnsForWidth(width){return width<1100?3:4;}");
browserApp=browserApp.replace('function photoFrameHeight(photo,width,wallHeight){','function photoFrameHeight(photo,width,wallHeight){\n  if(completeWallView())return Math.max(1,Math.round(width/photoAspect(photo)));');
browserApp=browserApp.replace('const isStatic=app.selecting||photos.length<8;', 'updateWallViewUI();const isStatic=completeWallView()||app.selecting||photos.length<8;');
browserApp=browserApp.replace("else if(staticWall)status.textContent='这些瞬间，值得慢慢看';", "else if(completeWallView())status.textContent='完整浏览 · 向下滚动查看全部照片';else if(staticWall)status.textContent='这些瞬间，值得慢慢看';");
browserApp=browserApp.replace("{root:wall,rootMargin:'360px 0px'}", "{root:completeWallView()?null:wall,rootMargin:'360px 0px'}");
browserApp=browserApp.replace('Math.abs(wall.clientHeight-app.wallHeight)>1','(!completeWallView()&&Math.abs(wall.clientHeight-app.wallHeight)>1)');
browserApp=browserApp.replace('\ninit();','\n'+fs.readFileSync(path.join(root,'src/wall-view-ui.js'),'utf8')+'\ninit();');
browserApp=browserApp.replace('function openLogin(action){',"function openLogin(action){if(!app.account?.signedIn){setAccountMode('login');$('#account-name').value=safeRead('class7-last-username');}");
browserApp=browserApp.replace("async function refreshIdentity(){const data=await api('/profile');app.profile=data.profile;app.account=data.account;updateProfile();}","async function refreshIdentity(){const version=++identityRequest;const data=await api('/profile');if(version!==identityRequest)return;app.profile=data.profile;app.account=data.account;rememberAccountName();updateProfile();}");
browserApp=browserApp.replace('async function reloadOwnership(){','async function reloadOwnership(){\n  ownershipGeneration++;');
browserApp=browserApp.replace("const data=await api('/photos?'+params);if(mine)","const generation=ownershipGeneration;const data=await api('/photos?'+params);if(generation!==ownershipGeneration)return;if(mine)");
// Invalidate requests started under the previous login before changing the session.
browserApp=browserApp.replace("try{await api('/account/'+accountMode", "try{identityRequest++;ownershipGeneration++;await api('/account/'+accountMode");
browserApp=browserApp.replace("try{await api('/account/logout'", "try{rememberAccountName();identityRequest++;ownershipGeneration++;await api('/account/logout'");
browserApp=browserApp.replace("const result=await cloudFetch('/api'+path", "const requestGeneration=ownershipGeneration;const result=await cloudFetch('/api'+path");
browserApp=browserApp.replace("result.status===401&&app.account?.signedIn", "result.status===401&&app.account?.signedIn&&requestGeneration===ownershipGeneration");
browserApp=browserApp.replace('\ninit();','\n'+fs.readFileSync(path.join(root,'src/account-recovery-ui.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/wall-speed-ui.js'),'utf8')+'\ninit();');
browserApp=browserApp.replace('function updateProfile(){','function updateProfile(){\n  renderLinkedAccounts();');
browserApp=browserApp.replace('\ninit();','\n'+fs.readFileSync(path.join(root,'src/account-linking-ui.js'),'utf8')+'\ninit();');
// Remember the first automatic display across visits; the footer can always reopen it.
browserApp=browserApp.replace('\ninit();',"\nif(safeRead('class7-usage-notice-seen')!=='1'){showDialog('info-dialog');safeWrite('class7-usage-notice-seen','1');}\ninit();");
browserApp=browserApp.replaceAll('下载原图','下载照片').replaceAll('原图读取失败','照片读取失败').replaceAll('正在保存原图','正在保存照片').replaceAll('打开原图','打开照片').replaceAll('准备原图','准备照片');
browserApp=browserApp.replace("toast(result.successes.length+' 张照片已加入共享相册');","const compressedCount=result.successes.filter(item=>item.entry.preparedUpload?.compressed).length;toast(result.successes.length+' 张照片已加入共享相册'+(compressedCount?'，其中 '+compressedCount+' 张已压缩':''));");
browserApp=browserApp.replace("history.replaceState({},'','/');","history.replaceState({},'','/api/');");
// Native PG storage CORS rejects this default HTTP domain on the trial plan.
// Keep same-origin streaming upload; do not require a paid safety-domain change.
browserApp=browserApp.replace("fetch(state.photo.src,{credentials:","cloudFetch(state.photo.shared?'/api/files/'+encodeURIComponent(state.photo.id)+'?raw=1':state.photo.src,{credentials:");
browserApp=browserApp.replace("return {href:photo.shared?'/api/files/'+encodeURIComponent(photo.id)+'?download=1':photo.src,filename:title+'.'+extension};","const target=new URL(photo.src,location.href);if(photo.shared)target.searchParams.set('download',title+'.'+extension);return {href:target.href,filename:title+'.'+extension};");
fs.writeFileSync(path.join(root,'public/app.js'),browserApp);
fs.cpSync(path.join(old,'public/fonts'),path.join(root,'public/fonts'),{recursive:true});
let html=fs.readFileSync(path.join(old,'public/album.html'),'utf8');
const oldInfoDialog=/<dialog class="info-dialog" id="info-dialog"[\s\S]*?<\/dialog>/;
if(!oldInfoDialog.test(html))throw Error('Usage dialog hook changed; review integration');
html=html.replace(oldInfoDialog,fs.readFileSync(path.join(root,'src/usage-notice.html'),'utf8'));
html=html.replace('id="footer-preview">关于相册','id="footer-preview">使用须知');
html=html.replace('<button class="button button-quiet motion-button"','<label class="wall-speed-control" for="wall-speed"><span>流速</span><select id="wall-speed" aria-label="照片墙滚动速度"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="3">3×</option></select></label><button class="button button-quiet motion-button"');
html=html.replace('<label class="wall-speed-control"','<button type="button" id="wall-view-toggle" class="text-button wall-view-toggle" aria-pressed="true">切换流动照片墙</button><label class="wall-speed-control"');
html=html.replace('这是照片集自己的账号，不需要 ChatGPT。登录同一账号，即可在不同设备管理照片。','使用原来的登录账号和密码，找回照片管理权限。昵称可以重复，新注册的同名昵称账号不会继承旧照片。');
html=html.replace('这个账号登录，即可继续管理已关联的照片。','这个登录账号和密码，即可继续管理自己的照片。');
html=html.replace('请记住账号和密码。昵称可以修改，不会改变照片归属。','注册会创建独立的新账号，不会找回同昵称的旧照片。已有照片请切换“登录”，使用原登录账号和密码。');
html=html.replace('<section class="legacy-account-panel">',fs.readFileSync(path.join(root,'src/account-linking.html'),'utf8')+'<section class="legacy-account-panel">');
html=html.replace('新注册的同名昵称账号不会继承旧照片。','新账号可在登录后验证并关联原账号，共享照片管理。');
html=html.replace('注册会创建独立的新账号，不会找回同昵称的旧照片。已有照片请切换“登录”，使用原登录账号和密码。','已有账号可直接登录。新账号注册后，也可在账号管理中验证并关联原账号，共同管理照片。');
html=html.replace('A SHARED PHOTO ARCHIVE.','OUR MEMORIES.');
html=html.replace('原图上传 · 最多 3 张同时上传','最多 3 张同时上传');
html=html.replace('<div class="photo-notes-tools"','<div class="compression-options"><label class="compression-choice"><input type="checkbox" id="auto-compress" checked><span>自动压缩大照片</span></label><p>超过 12 MB 时压缩至 6 MB 以内，优先保留照片尺寸，保留本地原文件。压缩后上传及下载的都是压缩版；动图不自动转换。</p></div><div class="photo-notes-tools"');
html=html.replace('<script src="./app.js" defer></script>','<script src="./photo-compression.js" defer></script><script src="./app.js" defer></script>');
html=html.replaceAll('下载原图','下载照片').replaceAll('原图，保留原始清晰度','照片').replaceAll('保留原始清晰度','保存网站中的照片').replaceAll('打开原图','打开照片');
const staticOrigin='https://class7-memory-d0gcpjaqu47530c54-1509361747.tcloudbaseapp.com/';
for(const asset of ['favicon.svg','fonts/ArchivoBlack-Regular.ttf','editorial.css','photo-compression.js','app.js']){const hash=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'public',asset))).digest('hex').slice(0,12);html=html.replaceAll('./'+asset,staticOrigin+asset+'?v='+hash);}
fs.writeFileSync(path.join(root,'public/index.html'),html);
let api=fs.readFileSync(path.join(old,'lib/photo-api.ts'),'utf8').replace("from 'cloudflare:workers'","from './platform'");
api=api.replace('function photoView(','async function photoView(').replace('src:`/api/files/${row.id}`','src:await bucket().signedUrl(row.object_key)');
api=api.replace('photos:rows.map(row=>photoView(row,hash))','photos:await Promise.all(rows.map(row=>photoView(row,hash)))').replaceAll('photo:photoView(','photo:await photoView(');
const fileRouteStart=api.indexOf("  if(parts[0]==='files'&&parts.length===2&&method==='GET'){");
const fileRouteEnd=api.indexOf("  if(parts[0]==='photos'&&parts.length===3&&parts[2]==='comments'){",fileRouteStart);
if(fileRouteStart<0||fileRouteEnd<0)throw Error('Original file route changed; review adapter');
api=api.slice(0,fileRouteStart)+`  if(parts[0]==='files'&&parts.length===2&&method==='GET'){
   const row=await database().prepare('SELECT object_key,mime,title FROM photos WHERE id=?').bind(parts[1]).first<{object_key:string;mime:string;title:string}>();if(!row)throw new ApiError(404,'照片不存在。');
   if(url.searchParams.get('raw')==='1'){const file=await bucket().get(row.object_key);if(!file)throw new ApiError(404,'照片文件不存在。');return new Response(file.body,{headers:{'Content-Type':row.mime,'Content-Length':String(file.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
   const target=new URL(await bucket().signedUrl(row.object_key));if(url.searchParams.get('download')==='1'){const encoded=attachmentName(row.title,row.mime).split("filename*=UTF-8''")[1];target.searchParams.set('download',decodeURIComponent(encoded));}
   return new Response(null,{status:302,headers:{Location:target.href,'Cache-Control':'no-store'}});
  }
`+api.slice(fileRouteEnd);
api=api.replace("const id=crypto.randomUUID(),key='photos/'+id,now=new Date().toISOString();","const id=crypto.randomUUID(),now=new Date().toISOString();let key='photos/'+id;");
api=api.replace("try{title=await insertPhoto(","key=stored.fileID||key;\n    try{title=await insertPhoto(");
api=api.replace('last_number=last_number+1','last_number=photo_name_counters.last_number+1');
// Normalize ownership at read/authorization time. Existing photo rows and files
// stay intact, including uploads that were already in flight during linking.
const linkedPhotoColumns='id,class7_test.canonical_owner(owner_hash) AS owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,rotation,created_at';
const linkedCommentColumns='id,photo_id,class7_test.canonical_owner(owner_hash) AS owner_hash,author,body,created_at';
api=api.replaceAll('SELECT * FROM photos','SELECT '+linkedPhotoColumns+' FROM photos').replaceAll('RETURNING *','RETURNING '+linkedPhotoColumns);
api=api.replaceAll('SELECT * FROM comments','SELECT '+linkedCommentColumns+' FROM comments');
api=api.replaceAll('SELECT owner_hash FROM photos','SELECT class7_test.canonical_owner(owner_hash) AS owner_hash FROM photos');
api=api.replaceAll('SELECT owner_hash FROM comments','SELECT class7_test.canonical_owner(owner_hash) AS owner_hash FROM comments');
api=api.replaceAll('owner_hash=?','class7_test.canonical_owner(owner_hash)=?');
api=api.replace('try{title=await insertPhoto({id,owner_hash:current.device_hash,','try{title=await insertPhoto({id,owner_hash:current.write_owner_hash,');
api=api.replace('await requireAccount(request);const current=(await profile(request,true))!,data=', 'const current=await requireAccountProfile(request),data=');
api=api.replace('.bind(id,photoId,current.device_hash,current.nickname,body,now)', '.bind(id,photoId,current.write_owner_hash,current.nickname,body,now)');
fs.writeFileSync(path.join(root,'src/photo-api.ts'),api);
let accounts=fs.readFileSync(path.join(old,'lib/accounts.ts'),'utf8').replace("from 'cloudflare:workers'","from './platform'");
accounts=accounts.replace("import {chatGPTSignInPath} from '../app/chatgpt-auth';","const chatGPTSignInPath=(_path:string)=>'/';");
accounts=accounts.replace("String(error).includes('UNIQUE')","/UNIQUE|duplicate key/i.test(String(error))");
accounts=accounts.replaceAll('window_start<?','auth_limits.window_start<?').replace('ELSE hits+1','ELSE auth_limits.hits+1').replace('ELSE window_start END','ELSE auth_limits.window_start END');
accounts=accounts.replaceAll('这个账号名已被使用，请换一个。','这个登录账号已存在，请切换“登录”并使用原密码；登录后也可验证关联其他账号。');
accounts=accounts.replace('SELECT a.id,a.username,a.owner_hash FROM account_sessions s JOIN accounts a','SELECT a.id,a.username,class7_test.canonical_owner(a.owner_hash) AS owner_hash FROM account_sessions s JOIN accounts a');
accounts=accounts.replace('SELECT a.owner_hash,p.nickname FROM account_sessions s JOIN accounts a','SELECT class7_test.canonical_owner(a.owner_hash) AS owner_hash,p.nickname FROM account_sessions s JOIN accounts a');
accounts=accounts.replace('LEFT JOIN profiles p ON p.device_hash=a.owner_hash','LEFT JOIN profiles p ON p.device_hash=class7_test.canonical_owner(a.owner_hash)');
accounts=accounts.replace('legacySignInUrl:chatGPTSignInPath', 'linkedAccounts:account?await linkedAccountNames(account.owner_hash):[],legacySignInUrl:chatGPTSignInPath');
accounts=accounts.replace("if(action==='link-existing'){", "if(action==='link-account')return await linkVerifiedAccount(request,await readJson(request));\n if(action==='link-existing'){");
accounts=accounts.replace("if(action==='link-account')", "if(action==='unlink-preview'||action==='unlink-account')return await unlinkAccountAction(request,await readJson(request),action==='unlink-preview');\n if(action==='link-account')");
// Attribute newly written rows to the actual login account. Canonical mapping
// is still used for access checks, so in-flight writes follow that account if
// its group changes while the image body is uploading.
accounts=accounts.replace('SELECT class7_test.canonical_owner(a.owner_hash) AS owner_hash,p.nickname','SELECT a.owner_hash AS write_owner_hash,class7_test.canonical_owner(a.owner_hash) AS owner_hash,p.nickname');
accounts=accounts.replace('first<{owner_hash:string;nickname:string|null}>()', 'first<{write_owner_hash:string;owner_hash:string;nickname:string|null}>()');
accounts=accounts.replace('return {device_hash:row.owner_hash,nickname:row.nickname}', 'return {device_hash:row.owner_hash,write_owner_hash:row.write_owner_hash,nickname:row.nickname}');
accounts+='\n'+fs.readFileSync(path.join(root,'src/account-linking-accounts.ts'),'utf8');
fs.writeFileSync(path.join(root,'src/accounts.ts'),accounts);
fs.cpSync(path.join(root,'public'),path.join(root,'functions/class7-photo-api/public'),{recursive:true});
fs.cpSync(path.join(root,'public'),path.join(root,'hosting'),{recursive:true});
fs.writeFileSync(path.join(root,'hosting/index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>高三七班照片集</title><style>body{font:16px Arial,"Microsoft YaHei",sans-serif;max-width:680px;margin:15vh auto;padding:24px;line-height:1.8;color:#111}a{color:inherit}</style><h1>高三七班照片集</h1><p>那些一起走过的日子，都在这里。</p><p><a href="https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com/api/">进入照片集 →</a></p></html>');
require('esbuild').buildSync({entryPoints:[path.join(root,'src/server.ts')],outfile:path.join(root,'functions/class7-photo-api/index.cjs'),bundle:true,platform:'node',target:'node20',format:'cjs',packages:'external'});
console.log('Built CloudBase test frontend and HTTP backend');
