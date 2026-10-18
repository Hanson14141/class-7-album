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
function wallShouldMove(){return app.playing&&!app.hoverPaused&&!document.hidden&&wallInViewport&&!app.selecting&&!$('dialog[open]')&&!$('#photo-wall').classList.contains('static-wall');}
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
