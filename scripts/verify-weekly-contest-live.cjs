// Public read-only checks; never cast votes or upload demonstration pictures.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com/api/';let retries=0;
async function read(route,expected=200){for(let i=0;;i++){const r=await fetch(base+route,{signal:AbortSignal.timeout(45000)});if((r.status===429||r.status>=500)&&i<4){retries++;await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,700*2**i));continue;}assert.equal(r.status,expected,'HTTP '+r.status+' '+route.split('?')[0]);return r;}}
async function get(route,expected){return(await read(route,expected)).json();}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const first=await get('photos?sort=weekly');assert(first.contest&&!first.contest.closed);assert.equal(first.contest.period,'current');
 const bj=new Date(Date.parse(first.contest.start)+8*3600000);assert.equal(bj.getUTCDay(),1);assert.equal(bj.getUTCHours(),0);assert.equal(bj.getUTCMinutes(),0);
 assert.equal(Date.parse(first.contest.end)-Date.parse(first.contest.start),7*86400000);assert(Date.parse(first.contest.statsFrom)>=Date.parse(first.contest.start));assert.equal(first.ownedTotal,0);
 let page=first,all=[],pages=0;while(true){all.push(...page.photos);pages++;assert(page.photos.length<=100);if(!page.nextCursor)break;assert(pages<100);page=await get('photos?sort=weekly&cursor='+encodeURIComponent(page.nextCursor));}
 assert.equal(all.length,first.total);assert.equal(new Set(all.map(p=>p.id)).size,all.length);assert(all.every((p,i)=>p.rank===i+1&&p.weeklyCount>0&&p.weeklyCount<=p.likeCount));assert(all.slice(1).every((p,i)=>all[i].weeklyCount>=p.weeklyCount));
 const previous=await get('photos?sort=weekly&period=previous');assert(previous.contest.closed);if(!first.contest.hasPrevious){assert(!previous.contest.available);assert.equal(previous.total,0);}
 await get('photos?sort=weekly&period=invalid',400);await get('photos?sort=weekly&cursor=invalid',400);await get('photos?sort=weekly&cursor='+encodeURIComponent(btoa(JSON.stringify({week:'stale',rank:1}))),400);
 const normal=await get('photos'),ranked=await get('photos?sort=likes');assert.equal(normal.total,ranked.total);assert(!normal.contest&&!ranked.contest);assert(normal.photos.every(p=>typeof p.likeCount==='number'));
 assert(!/owner_hash|first_liked_at|password_hash/.test(JSON.stringify(first)),'Private voting records not exposed');
 const html=await(await read('')).text();assert.equal(hash(html),hash(fs.readFileSync('public/index.html')));assert(html.includes('id="weekly-contest-nav"'));const assets={html:true};
 for(const name of ['app.js','editorial.css']){const url=html.match(new RegExp('https://[^" ]+/'+name.replace('.','\\.')+'\\?v=[^" ]+'))?.[0];assert(url);const r=await fetch(url,{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(fs.readFileSync('public/'+name)));assets[name]=true;}
 const report={checkedAt:new Date().toISOString(),contestLaunchedAt:first.contest.launchedAt,contestStart:first.contest.start,contestEnd:first.contest.end,firstWeekStatsFrom:first.contest.statsFrom,scoredPhotos:first.total,pages,beijingMondayBoundary:true,positiveWeeklyVotesOnly:true,privateVoterDataHidden:true,previousPeriod:true,invalidInputsRejected:true,existingAlbumPhotos:normal.total,existingLikesAndRankingAvailable:true,assets,retries,realVotesOrPhotosWritten:false,passed:true};
 fs.writeFileSync('deployment-weekly-contest-verified.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
