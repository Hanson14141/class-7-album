// Decorative shutter-to-playback sequence. The result grid is already rendered beneath it.
const drawCinemaState={token:0,active:false,ready:false,finishing:false,advancing:false,index:0,entries:[],slides:[],screenWidth:0,screenHeight:0,animations:[],timers:{},resolve:null};
const drawCinemaTransitionMs=1320,drawCinemaReadyMs=720,drawCinemaGuardMs=8000,drawCinemaAdvanceMs=180;
function drawCinemaEl(id){return document.getElementById(id);}
function drawCinemaMotion(){return !reducedMotion.matches&&typeof drawCinemaEl('draw-cinema')?.animate==='function';}
function drawCinemaSetTimer(key,fn,ms){const state=drawCinemaState;clearTimeout(state.timers[key]);state.timers[key]=setTimeout(fn,ms);}
function drawCinemaClearTimers(){const timers=drawCinemaState.timers;for(const key in timers)clearTimeout(timers[key]);drawCinemaState.timers={};}
function drawCinemaPlay(node,frames,options={}){const animation=node.animate(frames,{fill:'forwards',...options});drawCinemaState.animations.push(animation);return animation;}
function drawCinemaFinish(token){
 if(token!==drawCinemaState.token)return;
 drawCinemaState.token++;
 drawCinemaClearTimers();
 for(const animation of drawCinemaState.animations){try{animation.cancel();}catch{}}
 drawCinemaState.animations=[];
 const overlay=drawCinemaEl('draw-cinema');
 if(overlay){overlay.hidden=true;overlay.style.opacity='';overlay.classList.remove('is-ready');}
 document.body.classList.remove('draw-cinema-open');
 const playback=drawCinemaEl('draw-cinema-playback');
 if(playback){playback.hidden=true;playback.style.opacity='';}
 drawCinemaEl('draw-cinema-slides')?.replaceChildren();
 const resolve=drawCinemaState.resolve;drawCinemaState.resolve=null;
 Object.assign(drawCinemaState,{active:false,ready:false,finishing:false,advancing:false,index:0,entries:[],slides:[],screenWidth:0,screenHeight:0});
 resolve?.();
}
function cancelDrawCinema(){if(drawCinemaState.active)drawCinemaFinish(drawCinemaState.token);}
function finishDrawCinema(){
 const state=drawCinemaState;
 if(!state.active||state.finishing)return;
 state.finishing=true;state.ready=false;drawCinemaClearTimers();
 const overlay=drawCinemaEl('draw-cinema');
 if(!overlay){drawCinemaFinish(state.token);return;}
 overlay.classList.remove('is-ready');
 try{
  const out=drawCinemaPlay(overlay,[{opacity:1},{opacity:0}],{duration:280,easing:'ease-out'});
  drawCinemaSetTimer('finishTimer',()=>drawCinemaFinish(state.token),700);
  out.finished.then(()=>drawCinemaFinish(state.token),()=>drawCinemaFinish(state.token));
 }catch{drawCinemaFinish(state.token);}
}
function drawCinemaFitImage(image,entry){
 if(!drawCinemaState.screenWidth||!drawCinemaState.screenHeight)return;
 fitRotatedImage(image,entry,drawCinemaState.screenWidth,drawCinemaState.screenHeight);
}
function drawCinemaFitSlides(){
 for(const slide of drawCinemaState.slides){const image=slide.querySelector('img');if(image&&slide._drawEntry)drawCinemaFitImage(image,slide._drawEntry);}
}
function drawCinemaBuildSlides(entries){
 const wrap=drawCinemaEl('draw-cinema-slides');wrap.replaceChildren();drawCinemaState.slides=[];
 entries.forEach((entry,index)=>{
  const slide=document.createElement('div');slide.className='draw-cinema-slide';slide._drawEntry=entry;
  if(entry.available!==false&&entry.src){
   const image=document.createElement('img');image.alt='';image.loading='eager';image.decoding='async';
   image.addEventListener('load',()=>{slide.classList.add('is-loaded');drawCinemaFitImage(image,entry);},{once:true});
   image.addEventListener('error',()=>{slide.dataset.error='1';if(drawCinemaState.active&&drawCinemaState.index===index)drawCinemaShowSlide(index,false);},{once:true});
   image.src=entry.src;slide.append(image);
   if(image.complete&&image.naturalWidth)slide.classList.add('is-loaded');
  }
  wrap.append(slide);drawCinemaState.slides.push(slide);
 });
}
function drawCinemaLayout(){
 const state=drawCinemaState,vw=Math.max(320,document.documentElement?.clientWidth||window.innerWidth||320),vh=Math.max(320,document.documentElement?.clientHeight||window.innerHeight||320),mobile=vw<=700;
 const pad=mobile?12:20,controls=mobile?0:132,gap=mobile?0:18,framePad=mobile?6:8,playbackPad=mobile?12:22,border=2;
 const availW=Math.min(vw-playbackPad*2,mobile?Infinity:980)-pad*2-controls-gap-framePad*2-border;
 const availH=vh*(mobile?.52:.72)-pad*2-framePad*2;
 let width=Math.min(availW,availH*4/3);
 width=Math.max(mobile?180:260,Math.floor(width));
 const height=Math.round(width*3/4);
 const screen=drawCinemaEl('draw-cinema-screen'),device=drawCinemaEl('draw-cinema-device');
 if(!screen||!device)return;
 state.screenWidth=width;state.screenHeight=height;
 screen.style.width=width+'px';screen.style.height=height+'px';
 device.style.width=Math.min(vw-playbackPad*2,width+framePad*2+(mobile?0:controls+gap)+pad*2+border)+'px';
 drawCinemaFitSlides();
}
function drawCinemaShowSlide(index,blink=false){
 const state=drawCinemaState,entry=state.entries[index],screen=drawCinemaEl('draw-cinema-screen');
 if(!entry||!screen)return;
 const total=state.entries.length,last=index>=total-1,rarity=mallRarity(entry.rarity),slide=state.slides[index];
 state.slides.forEach((item,itemIndex)=>item.classList.toggle('is-active',itemIndex===index));
 screen.dataset.rarity=rarity.key;
 drawCinemaEl('draw-cinema-position').textContent=String(index+1).padStart(2,'0')+' / '+String(total).padStart(2,'0');
 drawCinemaEl('draw-cinema-title').textContent=entry.title||'未命名照片';
 drawCinemaEl('draw-cinema-rarity').textContent=rarity.label+(entry.rarity==='classified'?' · 独占':'');
 const failed=slide?.dataset.error==='1',available=entry.available!==false&&!!entry.src&&!failed,empty=drawCinemaEl('draw-cinema-empty');
 if(empty){empty.hidden=available;empty.textContent=failed?'照片读取失败':'原照片已被移除';}
 const prompt=drawCinemaEl('draw-cinema-prompt');if(prompt)prompt.textContent=last?'点击任意位置 · 完成':'点击任意位置 · 查看下一张';
 if(blink){const element=drawCinemaEl('draw-cinema-blink');if(element)drawCinemaPlay(element,[{opacity:0},{opacity:1,offset:.32},{opacity:0}],{duration:240,easing:'ease-out'});}
}
function advanceDrawCinema(){
 const state=drawCinemaState;
 if(!state.active||!state.ready||state.finishing||state.advancing)return;
 if(state.index>=state.entries.length-1){finishDrawCinema();return;}
 state.advancing=true;state.index++;
 drawCinemaShowSlide(state.index,true);
 drawCinemaSetTimer('advanceTimer',()=>{state.advancing=false;},drawCinemaAdvanceMs);
}
function drawCinemaRevealPlayback(token){
 const state=drawCinemaState;
 if(token!==state.token||!state.active||state.finishing)return;
 let playback;
 try{
  playback=drawCinemaEl('draw-cinema-playback');
  const screen=drawCinemaEl('draw-cinema-screen'),device=drawCinemaEl('draw-cinema-device'),blackout=drawCinemaEl('draw-cinema-blackout'),stage=drawCinemaEl('draw-cinema-stage');
  if(!playback){drawCinemaFinish(token);return;}
  playback.hidden=false;playback.style.opacity='0';
  drawCinemaLayout();drawCinemaShowSlide(0,false);
  drawCinemaPlay(playback,[{opacity:0},{opacity:1}],{duration:520,easing:'ease-out'});
  if(device)drawCinemaPlay(device,[{transform:'translateY(12px) scale(.97)'},{transform:'translateY(0) scale(1)'}],{duration:620,easing:'cubic-bezier(.2,.8,.25,1)'});
  if(screen)drawCinemaPlay(screen,[{opacity:.08},{opacity:1}],{duration:460,delay:100,easing:'ease-out'});
  if(blackout)drawCinemaPlay(blackout,[{opacity:1},{opacity:0}],{duration:520,easing:'ease-out'});
  if(stage)drawCinemaPlay(stage,[{opacity:1},{opacity:0}],{duration:380,easing:'ease-out'});
  clearTimeout(state.timers.guardTimer);state.timers.guardTimer=0;
  drawCinemaSetTimer('guardTimer',()=>finishDrawCinema(),6000);
  drawCinemaSetTimer('readyTimer',()=>{
   if(token!==state.token||state.finishing)return;
   state.ready=true;
   clearTimeout(state.timers.guardTimer);state.timers.guardTimer=0;
   drawCinemaEl('draw-cinema')?.classList.add('is-ready');
  },drawCinemaReadyMs);
 }catch{drawCinemaFinish(token);}
}
function playDrawCinema(entries){
 const overlay=drawCinemaEl('draw-cinema');
 if(!overlay||!Array.isArray(entries)||!entries.length||!drawCinemaMotion()||document.visibilityState==='hidden')return Promise.resolve();
 cancelDrawCinema();
 const state=drawCinemaState,token=++state.token;
 Object.assign(state,{active:true,ready:false,finishing:false,advancing:false,index:0,entries,slides:[],screenWidth:0,screenHeight:0});
 const done=new Promise(resolve=>{state.resolve=resolve;});
 try{
  const world=drawCinemaEl('draw-cinema-world'),body=drawCinemaEl('draw-cinema-body'),flash=drawCinemaEl('draw-cinema-flash'),blackout=drawCinemaEl('draw-cinema-blackout'),playback=drawCinemaEl('draw-cinema-playback');
  const scale=Math.max(.28,Math.min(.92,(window.innerWidth-42)/540,(window.innerHeight-180)/440));
  document.body.classList.add('draw-cinema-open');overlay.hidden=false;overlay.style.opacity='1';overlay.classList.remove('is-ready');
  if(playback){playback.hidden=true;playback.style.opacity='';}
  drawCinemaBuildSlides(entries);
  world.style.transform='scale('+scale+')';
  void overlay.offsetWidth;
  drawCinemaPlay(drawCinemaEl('draw-cinema-shutter'),[{transform:'translateY(0)'},{transform:'translateY(4px)'}],{duration:130,delay:110,easing:'ease-in'});
  for(const node of overlay.querySelectorAll('.draw-cinema-copy'))drawCinemaPlay(node,[{opacity:1},{opacity:0}],{duration:240,delay:230});
  drawCinemaPlay(flash,[{opacity:0},{opacity:.94,offset:.34},{opacity:0}],{duration:300,delay:250,easing:'ease-out'});
  drawCinemaPlay(world,[{transform:'scale('+scale+')'},{transform:'scale('+scale*9+')'}],{duration:900,delay:320,easing:'cubic-bezier(.55,0,.25,1)'});
  drawCinemaPlay(body,[{opacity:1},{opacity:1,offset:.16},{opacity:0,offset:.6},{opacity:0}],{duration:900,delay:320,easing:'linear'});
  drawCinemaPlay(blackout,[{opacity:0},{opacity:1}],{duration:420,delay:900,easing:'ease-in'});
  drawCinemaSetTimer('revealTimer',()=>drawCinemaRevealPlayback(token),drawCinemaTransitionMs);
  drawCinemaSetTimer('guardTimer',()=>finishDrawCinema(),drawCinemaGuardMs);
 }catch{drawCinemaFinish(token);}
 return done;
}
drawCinemaEl('draw-cinema')?.addEventListener('click',event=>{if(event.target.closest?.('#draw-cinema-skip'))return;advanceDrawCinema();});
drawCinemaEl('draw-cinema-skip')?.addEventListener('click',event=>{event.stopPropagation();finishDrawCinema();});
document.addEventListener('keydown',event=>{
 if(!drawCinemaState.active)return;
 if(event.key==='Escape'){event.preventDefault();finishDrawCinema();return;}
 if(!drawCinemaState.ready)return;
 if(event.key==='Enter'||event.key===' '||event.key==='ArrowRight'||event.key==='ArrowDown'){event.preventDefault();advanceDrawCinema();}
});
window.addEventListener('resize',()=>{if(drawCinemaState.active&&drawCinemaState.ready&&!drawCinemaState.finishing){drawCinemaLayout();drawCinemaShowSlide(drawCinemaState.index,false);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelDrawCinema();});
reducedMotion.addEventListener('change',event=>{if(event.matches)cancelDrawCinema();});
