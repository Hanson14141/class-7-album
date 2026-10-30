// Public, read-only validation. Never creates comments, likes, or photos.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com/api/';
let retries=0;
async function read(route,expected=200){for(let i=0;;i++){const r=await fetch(base+route,{signal:AbortSignal.timeout(45000)});if((r.status===429||r.status>=500)&&i<4){retries++;await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,700*2**i));continue;}assert.equal(r.status,expected,'HTTP '+r.status+' '+route.split('?')[0]);return r;}}
async function get(route,expected){return(await read(route,expected)).json();}
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
(async()=>{
 const counts={};let source=null;
 for(const period of ['current','previous','total']){
  const first=await get('comment-board?period='+period);assert.equal(first.contest.period,period);assert.equal(first.contest.closed,period==='previous');
  const day=new Date(Date.parse(first.contest.start)+8*3600000);assert.equal(day.getUTCDay(),1);assert.equal(day.getUTCHours(),0);
  let page=first,items=[],pages=0;while(true){items.push(...page.entries);pages++;assert(page.entries.length<=50);if(!page.nextCursor)break;assert(pages<100);page=await get('comment-board?period='+period+'&cursor='+encodeURIComponent(page.nextCursor));}
  assert.equal(items.length,first.total);assert.equal(new Set(items.map(x=>x.id)).size,items.length);
  assert(items.every((x,i)=>x.rank===i+1&&x.score>0&&typeof x.weeklyCount==='number'&&typeof x.likeCount==='number'&&x.liked===false));
  assert(items.slice(1).every((x,i)=>items[i].score>=x.score));
  assert(!/owner_hash|authorUsername|password_hash|"voters"/.test(JSON.stringify(items)));
  for(const x of items)assert(x.photo.id&&x.photo.title&&x.photo.src.startsWith('https://'));
  source||=items[0];counts[period]={total:first.total,pages};
 }
 await get('comment-board?period=wrong',400);await get('comment-board?cursor=bad',400);
 await get('comment-board?cursor='+encodeURIComponent(btoa(JSON.stringify({period:'current',week:'stale',rank:1}))),400);
 if(source){const p=await get('photos/'+source.photo.id);assert.equal(p.photo.id,source.photo.id);const c=await get('photos/'+source.photo.id+'/comments?focus='+encodeURIComponent(source.id));assert(c.comments.some(x=>x.id===source.id));assert.equal(c.focused,source.id);assert(c.comments.every(x=>typeof x.weeklyCount==='number'));}
 const album=await get('photos');assert(album.total>0);const weekly=await get('photos?sort=weekly');assert(weekly.contest);
 const html=await(await read('')).text();assert.equal(hash(html),hash(fs.readFileSync('public/index.html')));assert(html.includes('id="comment-contest-nav"'));
 for(const name of ['app.js','editorial.css']){const url=html.match(new RegExp('https://[^" ]+/'+name.replace('.','\\.')+'\\?v=[^" ]+'))?.[0];assert(url);const r=await fetch(url,{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(fs.readFileSync('public/'+name)));}
 const report={checkedAt:new Date().toISOString(),boards:counts,beijingMondayBoundary:true,sourcePhotoAndCommentFocus:!!source,publicCountsOnly:true,invalidInputsRejected:true,photoCount:album.total,photoWeeklyContestPreserved:true,liveAssetsMatch:true,retries,realContentOrVotesWritten:false,passed:true};
 fs.writeFileSync('verification-comment-contest-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
