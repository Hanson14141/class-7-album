// Local lifecycle checks for the draw camera playback; no browser, network or user data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/draw-cinema.js','utf8');
let animationSink=[];
class ClassList{
 constructor(){this.values=new Set();}
 add(...names){for(const name of names)this.values.add(name);}
 remove(...names){for(const name of names)this.values.delete(name);}
 contains(name){return this.values.has(name);}
 toggle(name,force){const on=force===undefined?!this.values.has(name):!!force;if(on)this.values.add(name);else this.values.delete(name);}
}
class Style{
 constructor(){this.values={};}
 setProperty(name,value){this.values[name]=String(value);}
 removeProperty(name){delete this.values[name];}
}
class Node{
 constructor(tag='div',id=''){
  this.tagName=tag;this.id=id;this.children=[];this.classList=new ClassList();this.style=new Style();this.dataset={};this.listeners={};
  this.textContent='';this.hidden=false;this.className='';this.complete=tag==='img';this.naturalWidth=tag==='img'?1:0;
 }
 append(...nodes){for(const node of nodes){if(node==null)continue;this.children.push(node);node.parent=this;}}
 appendChild(node){this.append(node);}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 addEventListener(type,handler){this.listeners[type]=handler;}
 setAttribute(name,value){this[name]=value;}
 removeAttribute(name){delete this[name];}
 querySelector(selector){return selector==='img'?this.children.find(child=>child.tagName==='img')||null:null;}
 querySelectorAll(selector){return selector==='.draw-cinema-copy'?this.copies||[]:[];}
 animate(frames,options){
  const animation={frames,options,currentTime:0,playState:'running',cancelled:false};
  animation.finished=new Promise((resolve,reject)=>{animation.resolve=resolve;animation.reject=reject;});animation.finished.catch(()=>{});
  animation.finish=()=>animation.resolve?.();
  animation.cancel=()=>{animation.cancelled=true;animation.reject?.(Error('synthetic cancel'));};
  animationSink.push(animation);return animation;
 }
 get offsetWidth(){return 1280;}
}
function setup({reduced=false}={}){
 const nodes=new Map(),animations=[],fits=[],timers=new Map();let timerId=0;animationSink=animations;
 for(const id of ['draw-cinema','draw-cinema-stage','draw-cinema-world','draw-cinema-body','draw-cinema-shutter','draw-cinema-flash','draw-cinema-blackout','draw-cinema-playback','draw-cinema-device','draw-cinema-screen','draw-cinema-slides','draw-cinema-blank','draw-cinema-position','draw-cinema-title','draw-cinema-rarity','draw-cinema-empty','draw-cinema-blink','draw-cinema-prompt','draw-cinema-skip'])nodes.set(id,new Node('div',id));
 nodes.get('draw-cinema').hidden=true;
 nodes.get('draw-cinema-playback').hidden=true;
 nodes.get('draw-cinema').copies=[new Node(),new Node()];
 const document={
  visibilityState:'visible',
  body:new Node('body'),
  events:{},
  getElementById:id=>nodes.get(id)||null,
  createElement:tag=>new Node(tag),
  addEventListener(type,handler){this.events[type]=handler;},
 };
 const window={innerWidth:1280,innerHeight:720,events:{},addEventListener(type,handler){this.events[type]=handler;}};
 const motion={matches:reduced,addEventListener(type,handler){this.handler=handler;}};
 const context=vm.createContext({
  console,document,window,reducedMotion:motion,animations,fits,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
  mallRarity:value=>({common:{key:'common',label:'普通'},epic:{key:'epic',label:'史诗'},legendary:{key:'legendary',label:'传奇'},classified:{key:'classified',label:'保密级'}})[value]||{key:'common',label:'普通'},
  fitRotatedImage:(image,photo,width,height)=>fits.push({image,photo,width,height}),
 });
 vm.runInContext(source,context);
 return {nodes,animations,fits,timers,motion,window,document,context,fire(ms){for(const [id,timer] of timers){if(timer.ms===ms){timers.delete(id);timer.fn();return true;}}return false;},reveal(){this.fire(1320);this.fire(720);}};
}
const single=[{title:'午后的教室',rarity:'legendary',width:1600,height:1067,rotation:0,available:true,src:'data:image/svg+xml,single'}];
const ten=Array.from({length:10},(_,index)=>({title:'照片 '+(index+1),rarity:['common','epic','legendary','classified'][index%4],width:index%2?1000:1600,height:index%2?1500:1067,rotation:index===5?90:0,available:true,src:'data:image/svg+xml,'+index}));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const node=(state,id)=>state.nodes.get(id);
const stateOf=state=>vm.runInContext('drawCinemaState',state.context);
(async()=>{
 let s=setup();assert.equal(s.animations.length,0,'No idle animation');assert(node(s,'draw-cinema').hidden);
 await s.context.playDrawCinema([]);assert(node(s,'draw-cinema').hidden,'Empty result skips');
 s=setup({reduced:true});await s.context.playDrawCinema(single);assert(node(s,'draw-cinema').hidden,'Reduced motion skips');assert.equal(s.animations.length,0);

 s=setup();let resolved=false,promise=s.context.playDrawCinema(single);promise.then(()=>{resolved=true;});
 assert(!node(s,'draw-cinema').hidden);assert(s.document.body.classList.contains('draw-cinema-open'));assert.equal(node(s,'draw-cinema-slides').children.length,1);assert(node(s,'draw-cinema-playback').hidden,'Playback waits for the shutter transition');
 assert.equal(s.animations.length,7,'Shutter, copy, flash, zoom, body and blackout');assert.equal(Object.keys(stateOf(s).timers).length,2,'Reveal plus guard');
 s.reveal();assert(!node(s,'draw-cinema-playback').hidden);assert.equal(node(s,'draw-cinema-position').textContent,'01 / 01');assert.equal(node(s,'draw-cinema-title').textContent,'午后的教室');assert.equal(node(s,'draw-cinema-rarity').textContent,'传奇');assert(node(s,'draw-cinema-empty').hidden);assert.equal(node(s,'draw-cinema-prompt').textContent,'点击任意位置 · 完成');
 assert(stateOf(s).ready);assert(node(s,'draw-cinema').classList.contains('is-ready'));assert.equal(s.fits.length,1);assert.equal(s.fits[0].width,stateOf(s).screenWidth);
 await flush();assert(!resolved,'Waiting for the user click');
 s.context.advanceDrawCinema();assert(stateOf(s).finishing);const fade=s.animations.at(-1);assert.deepEqual([...fade.frames].map(frame=>frame.opacity),[1,0]);fade.finish();await flush();await promise;
 assert(resolved);assert(node(s,'draw-cinema').hidden);assert(!s.document.body.classList.contains('draw-cinema-open'));assert.equal(node(s,'draw-cinema-slides').children.length,0);assert(s.animations.every(animation=>animation.cancelled));assert.equal(Object.keys(stateOf(s).timers).length,0);

 s=setup();promise=s.context.playDrawCinema(ten);s.reveal();assert.equal(node(s,'draw-cinema-slides').children.length,10);assert.equal(node(s,'draw-cinema-position').textContent,'01 / 10');assert.equal(node(s,'draw-cinema-prompt').textContent,'点击任意位置 · 查看下一张');assert.equal(s.fits.length,10);
 node(s,'draw-cinema').listeners.click({target:{closest:()=>null}});assert.equal(stateOf(s).index,1);assert.equal(node(s,'draw-cinema-position').textContent,'02 / 10');assert(s.fire(180));
 for(let index=1;index<9;index++){s.context.advanceDrawCinema();assert.equal(node(s,'draw-cinema-position').textContent,String(index+2).padStart(2,'0')+' / 10');assert(s.fire(180));}
 assert.equal(stateOf(s).index,9);assert.equal(node(s,'draw-cinema-prompt').textContent,'点击任意位置 · 完成');s.context.advanceDrawCinema();assert(stateOf(s).finishing);s.animations.at(-1).finish();await flush();await promise;assert(node(s,'draw-cinema').hidden);

 s=setup();s.window.innerWidth=390;s.window.innerHeight=844;promise=s.context.playDrawCinema(ten);s.reveal();const mobile=stateOf(s);assert(mobile.screenWidth>0&&mobile.screenWidth<=390);assert.equal(mobile.screenHeight,Math.round(mobile.screenWidth*3/4));assert(Number.parseFloat(node(s,'draw-cinema-device').style.width)<=390);s.context.cancelDrawCinema();await promise;assert(node(s,'draw-cinema').hidden);

 s=setup();s.window.innerWidth=844;s.window.innerHeight=390;promise=s.context.playDrawCinema(ten);s.reveal();assert(stateOf(s).screenHeight<390);assert(Number.parseFloat(node(s,'draw-cinema-device').style.width)<844);s.context.cancelDrawCinema();await promise;

 s=setup();promise=s.context.playDrawCinema(single);s.reveal();s.document.events.keydown({key:'Enter',preventDefault(){}});assert(stateOf(s).finishing);s.animations.at(-1).finish();await flush();await promise;assert(node(s,'draw-cinema').hidden);

 s=setup();promise=s.context.playDrawCinema(single);s.reveal();node(s,'draw-cinema-skip').listeners.click({stopPropagation(){}});assert(stateOf(s).finishing);s.animations.at(-1).finish();await flush();await promise;assert(node(s,'draw-cinema').hidden);

 s=setup();promise=s.context.playDrawCinema(single);assert(s.fire(8000),'Transition guard scheduled');assert(stateOf(s).finishing);s.animations.at(-1).finish();await flush();await promise;assert(node(s,'draw-cinema').hidden);

 s=setup();promise=s.context.playDrawCinema(ten);s.reveal();s.context.advanceDrawCinema();s.context.cancelDrawCinema();await promise;assert(node(s,'draw-cinema').hidden);assert.equal(Object.keys(stateOf(s).timers).length,0);

 // A cancelled old fade must not dismiss a newer playback when finished rejects.
 s=setup();promise=s.context.playDrawCinema(single);s.reveal();s.context.finishDrawCinema();s.context.cancelDrawCinema();await promise;
 const replacement=s.context.playDrawCinema(ten);await flush();assert(stateOf(s).active&&!node(s,'draw-cinema').hidden,'Old cancellation cannot close replacement');s.context.cancelDrawCinema();await replacement;
 s=setup();s.document.visibilityState='hidden';await s.context.playDrawCinema(single);assert(node(s,'draw-cinema').hidden);
 s=setup();promise=s.context.playDrawCinema(single);s.document.hidden=true;s.document.events.visibilitychange();await promise;assert(node(s,'draw-cinema').hidden);
 s=setup();promise=s.context.playDrawCinema(single);s.motion.handler({matches:true});await promise;assert(node(s,'draw-cinema').hidden);
 const html=fs.readFileSync('public/index.html','utf8'),app=fs.readFileSync('public/app.js','utf8'),css=fs.readFileSync('public/editorial.css','utf8');
 assert.equal((html.match(/id="draw-cinema"/g)||[]).length,1);assert(html.includes('id="draw-cinema-playback"')&&html.includes('id="draw-cinema-screen"')&&html.includes('id="draw-cinema-skip"'));assert(html.indexOf('id="draw-cinema"')<html.indexOf('</body>'));
 assert(app.includes('function playDrawCinema(')&&app.includes('function advanceDrawCinema(')&&app.includes('await playDrawCinema(drawState.entries)'));assert(app.includes('cancelDrawCinema();'));
 assert(css.includes('.draw-cinema-screen')&&css.includes('.draw-cinema-device'));assert(!source.includes('innerHTML'));
 console.log('PASS draw cinema: camera playback, single/ten clicks, keyboard, skip, guard, cancellation and build wiring');
 fs.writeFileSync('verification-draw-cinema-unit.json',JSON.stringify({checkedAt:new Date().toISOString(),cameraPlayback:true,singleClick:true,tenSequential:true,mobileLayout:true,shortLandscape:true,keyboard:true,skip:true,transitionGuard:true,cancellation:true,buildWiring:true,cancelledOldFadeCannotCloseNewPlayback:true,hiddenPageAndReducedMotionCancel:true,localOnly:true,passed:true},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
