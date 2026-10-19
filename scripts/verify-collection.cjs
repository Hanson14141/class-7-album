// Pure milestone boundaries and real hover controller with controlled pointer frames.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/mall-collection-ui.js','utf8'),messages=[];
const c=vm.createContext({toast:x=>messages.push(x)});vm.runInContext(source,c);
for(const [count,title,next,earned] of [[0,'尚未获得称号',20,0],[19,'尚未获得称号',20,0],[20,'新手收藏者',40,1],[39,'新手收藏者',40,1],[40,'老手收藏家',60,2],[59,'老手收藏家',60,2],[60,'大份收集家',null,3],[75,'大份收集家',null,3]]){
 const state=c.collectionProgress(count);assert.equal(state.count,count);assert.equal(state.title,title);assert.equal(state.next?.count||null,next);assert.equal(state.earned.length,earned);assert.equal(state.progress,Math.min(count,60));
}
for(const bad of [-1,NaN,Infinity,1.5])assert.equal(c.collectionProgress(bad).count,0);
c.notifyCollectionMilestone(19,20);assert.equal(messages.pop(),'解锁收藏成就：新手收藏者');c.notifyCollectionMilestone(20,20);assert.equal(messages.length,0);c.notifyCollectionMilestone(59,60);assert.equal(messages.pop(),'解锁收藏成就：大份收集家');
const events={},windowEvents={},frames=new Map(),media={matches:true,addEventListener(k,f){this.changed=f;}},documentEvents={};let seq=0,observer;
const grid={addEventListener(k,f){events[k]=f;},contains(){return true;}};
const card=()=>{const flags=new Set(),styles=new Map();return {isConnected:true,flags,styles,classList:{add:x=>flags.add(x),remove:x=>flags.delete(x)},style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)},getBoundingClientRect:()=>({left:0,top:0,width:200,height:300})};};
const hovered=card(),other=card();const h=vm.createContext({$:()=>grid,matchMedia:()=>media,requestAnimationFrame:f=>{const id=++seq;frames.set(id,f);return id;},cancelAnimationFrame:id=>frames.delete(id),window:{addEventListener(k,f){windowEvents[k]=f;}},document:{hidden:false,addEventListener(k,f){documentEvents[k]=f;}},MutationObserver:class{constructor(f){observer=f;}observe(){}}});
vm.runInContext(fs.readFileSync('src/mall-card-hover.js','utf8'),h);
const move=(target=hovered,type='mouse',x=200,y=0)=>events.pointermove({target:{closest:()=>target},pointerType:type,clientX:x,clientY:y});
assert.equal(frames.size,0,'No idle animation loop');move();move();move();assert.equal(frames.size,1,'At most one pending frame');for(const [id,f] of frames){frames.delete(id);f();}assert.equal(frames.size,0);assert.equal(hovered.styles.get('--card-rx'),'6.00deg');assert.equal(hovered.styles.get('--card-ry'),'6.00deg');assert(hovered.flags.has('is-hovered'));
move(other);assert(!hovered.flags.has('is-hovered'));assert.equal(hovered.styles.size,0);assert(other.flags.has('is-hovered'));events.pointerleave();assert.equal(frames.size,0);assert.equal(other.styles.size,0);
move(hovered,'touch');assert.equal(frames.size,0);assert(!hovered.flags.has('is-hovered'));
media.matches=false;move();assert.equal(frames.size,0);media.matches=true;move();windowEvents.scroll();assert.equal(frames.size,0);assert.equal(hovered.styles.size,0);
move();hovered.isConnected=false;observer();assert.equal(frames.size,0);assert(!hovered.flags.has('is-hovered'));
fs.writeFileSync('verification-collection-unit.json',JSON.stringify({checkedAt:new Date().toISOString(),milestoneBoundaries:true,exactTitles:true,completionBeyondSixty:true,noDuplicateUnlockToast:true,onlyOneActiveCard:true,oneFramePerPointerBurst:true,noIdleAnimation:true,touchDisabled:true,mediaChangeDisabled:true,scrollAndRemovalCleanup:true,localOnly:true,passed:true},null,2));
console.log('PASS collection thresholds, exact titles, hover scheduling, touch/media gates and cleanup');
