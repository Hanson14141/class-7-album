// Exercise the merged filter and the actual built page loader with synthetic pages.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/photo-ranking-ui.js','utf8'),built=fs.readFileSync('public/app.js','utf8');
const filter=source.slice(source.indexOf('let uploaderFilterEpoch='),source.indexOf("$('#photo-order').addEventListener"));
const loader=built.slice(built.indexOf('async function loadCloud('),built.indexOf('\nasync function refreshPhotos('));
assert(filter&&loader);
function fixture(){
 const photos=Array.from({length:367},(_,i)=>({id:String(i),uploader:i>=120?'later':'early'}));
 const state={view:'all',filter:'',cloud:photos.slice(0,100),minePhotos:[],nextCursor:'100',mineCursor:'100'},calls=[],errors=[];
 const c=vm.createContext({app:state,URLSearchParams,ownershipGeneration:0,photoOrderEpoch:0,photoPageVersions:{all:1,mine:1},ranked:false,
  rankingActive:()=>c.ranked,weeklyActive:()=>false,refreshFilter(){},renderWall(){},refreshPhotos:async()=>{},acceptPhotoCounts(){},$:()=>({hidden:false}),toast:x=>errors.push(x),reloadPhotoOrder:async()=>calls.push('ranking'),
  api:async path=>{calls.push(path);const u=new URL(path,'https://synthetic.invalid'),offset=Number(u.searchParams.get('cursor'))||0;return {photos:photos.slice(offset,offset+100),nextCursor:offset+100<photos.length?String(offset+100):null};}});
 vm.runInContext(loader+'\n'+filter,c);return {c,state,calls,errors};
}
(async()=>{
 let f=fixture();await f.c.changePhotoFilter('later');assert.equal(f.state.cloud.length,367);assert.equal(f.state.cloud.filter(p=>p.uploader==='later').length,247);assert.equal(f.calls.length,3);assert.equal(f.state.nextCursor,null);
 f=fixture();await f.c.changePhotoFilter('');assert.equal(f.calls.length,0,'Unfiltered homepage stays lazy');
 f=fixture();f.c.ranked=true;await f.c.changePhotoFilter('later');assert.equal(f.calls.join(), 'ranking','Ranked mode keeps server filtering');
 f=fixture();f.state.view='mine';await f.c.changePhotoFilter('later');assert(f.calls.every(p=>p.includes('mine=1')));assert.equal(f.state.cloud.length,100);
 f=fixture();f.c.api=async()=>{f.calls.push('same');return {photos:[],nextCursor:'100'};};await f.c.changePhotoFilter('later');assert.equal(f.calls.length,1,'Repeated cursor terminates');
 for(const reason of ['clear','other-filter','view','identity','order','reload']){
  f=fixture();let release;f.c.api=path=>{f.calls.push(path);return new Promise(resolve=>{release=()=>resolve({photos:[{id:'slow',uploader:'later'}],nextCursor:'200'});});};
  const pending=f.c.changePhotoFilter('later');assert(release);
  if(reason==='clear')await f.c.changePhotoFilter('');
  if(reason==='other-filter'){f.state.nextCursor=null;await f.c.changePhotoFilter('other');}
  if(reason==='view')f.state.view='mine';
  if(reason==='identity')f.c.ownershipGeneration++;
  if(reason==='order'){f.c.photoOrderEpoch++;f.c.ranked=true;}
  if(reason==='reload')f.c.photoPageVersions.all++;
  release();await pending;assert.equal(f.calls.length,1,reason+' stops old loop');
  if(['identity','order','reload'].includes(reason))assert(!f.state.cloud.some(p=>p.id==='slow'),reason+' rejects stale page');
 }
 f=fixture();f.c.api=async()=>{throw Error('synthetic failure');};await f.c.changePhotoFilter('later');assert.equal(f.errors.join(),'synthetic failure');
 const report={checkedAt:new Date().toISOString(),syntheticOnly:true,actualBuiltLoader:true,lateUploaderFullyLoaded:true,unfilteredHomepageStaysLazy:true,rankedUsesServerFilter:true,mineScopePreserved:true,repeatedCursorStops:true,clearAndFilterAndViewStopOldLoop:true,identityAndOrderAndReloadRejectStalePages:true,networkErrorHandled:true,passed:true};
 fs.writeFileSync('verification-uploader-filter-unit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
