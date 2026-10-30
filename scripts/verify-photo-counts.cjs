const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com/api/';
const transientResponses=[];
async function read(route){for(let i=0;;i++){const response=await fetch(base+route,{signal:AbortSignal.timeout(45000)});if([429,500,502,503,504].includes(response.status)&&i<4){transientResponses.push(response.status);await response.body?.cancel();await new Promise(r=>setTimeout(r,700*2**i));continue;}assert.equal(response.status,200,'Read-only GET '+route.split('?')[0]);return response;}}
async function get(route){return (await read(route)).json();}
(async()=>{
 const first=await get('photos'),photos=new Map(),pages=[];let page=first;
 while(true){
  assert(Array.isArray(page.uploaders));assert.equal(page.uploaders.reduce((sum,item)=>sum+item.total,0),page.total,'Uploader totals equal album total');
  assert(page.photos.length<=100);pages.push({loaded:page.photos.length,total:page.total});for(const photo of page.photos)photos.set(photo.id,photo);
  if(!page.nextCursor)break;assert(pages.length<100,'Pagination terminates');page=await get('photos?cursor='+encodeURIComponent(page.nextCursor));
 }
 const latest=await get('photos'),stable=pages.every(p=>p.total===first.total)&&latest.total===first.total;
 if(stable){assert.equal(photos.size,first.total,'Every page covers the total exactly');const uploaderCounts=new Map();for(const photo of photos.values())uploaderCounts.set(photo.uploader,(uploaderCounts.get(photo.uploader)||0)+1);for(const item of first.uploaders)assert.equal(uploaderCounts.get(item.uploader),item.total,'Uploader count spans all pages');}
 const mine=await get('photos?mine=1');assert.equal(mine.total,0);assert.equal(mine.photos.length,0);
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),html=Buffer.from(await(await read('')).arrayBuffer());assert.equal(hash(html),hash(fs.readFileSync('public/index.html')));
 const report={checkedAt:new Date().toISOString(),firstPageLoaded:first.photos.length,firstTotal:first.total,latestTotal:latest.total,pages,uniquePhotos:photos.size,uploaderGroups:first.uploaders.length,anonymousOwnedTotal:first.ownedTotal,anonymousMineTotal:mine.total,paginationSnapshotStable:stable,allPageAndUploaderCountsVerified:stable,htmlMatchesLocal:true,transientResponses,passed:true};
 fs.writeFileSync('deployment-photo-counts-verified.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1});
