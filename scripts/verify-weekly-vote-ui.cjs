const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let now=Date.parse('2026-10-18T15:59:59.900Z');const RealDate=Date;
class ClockDate extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const elements=new Map(),photo={id:'p',liked:true,likeCount:4};
const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,open:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(){}});return elements.get(id);};
const context=vm.createContext({Date:ClockDate,Set,Map,Math,Number,app:{photos:[photo],cloud:[photo],minePhotos:[],visible:[photo],lightboxIndex:0,account:{signedIn:true}},$:element,ownershipGeneration:1,setTimeout:()=>1,clearTimeout(){},document:{hidden:false,addEventListener(){}},withProfile:fn=>fn(),openLogin(){},toast(){},api:async()=>({likeCount:4,liked:false})});
vm.runInContext(fs.readFileSync('src/photo-likes-ui.js','utf8'),context);
assert.equal(vm.runInContext('photoVoteWeekKey()',context),Date.parse('2026-10-11T16:00:00Z'));
now=Date.parse('2026-10-18T16:00:00.100Z');
assert.equal(vm.runInContext('refreshPhotoVoteWeek()',context),true);
assert.equal(photo.liked,false);assert.equal(photo.likeCount,4,'Cumulative total does not reset');
assert.equal(element('#photo-like-label').textContent,'本周点赞');assert.equal(element('#photo-like-button').attrs['aria-pressed'],'false');
assert.equal(vm.runInContext('refreshPhotoVoteWeek()',context),false);
assert.equal(vm.runInContext('photoVoteWeekKey()',context),Date.parse('2026-10-18T16:00:00Z'));
const report={checkedAt:new Date().toISOString(),beijingMondayBoundary:true,openPageVoteStateResets:true,cumulativeTotalPreserved:true,passed:true};
fs.writeFileSync('verification-weekly-vote-ui.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
