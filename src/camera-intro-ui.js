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

