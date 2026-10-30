const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com/api/';
let retries=0;
async function read(path,status=200,options={}){for(let i=0;;i++){const r=await fetch(base+path,{...options,signal:AbortSignal.timeout(45000)});if((r.status===429||r.status>=500)&&i<4){retries++;await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,800*2**i));continue;}assert.equal(r.status,status,'HTTP '+r.status+' '+path);return r;}}
async function get(path,status,options){return(await read(path,status,options)).json();}
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
(async()=>{
 const state=await get('checkin');assert.deepEqual(state,{checkedIn:false,streak:0,totalPoints:0});
 await get('points',401);await get('checkin',401,{method:'POST',headers:{Origin:new URL(base).origin,'Content-Type':'application/json'},body:'{}'});
 await get('checkin',403,{method:'POST',headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json'},body:'{}'});
 const album=await get('photos');assert(album.total>0);const weekly=await get('photos?sort=weekly');assert(weekly.contest);const comments=await get('comment-board');assert(Array.isArray(comments.entries));
 const html=await(await read('')).text();assert.equal(hash(html),hash(fs.readFileSync('public/index.html')));for(const id of ['checkin-button','points-badge','weekly-contest-nav','comment-contest-nav'])assert(html.includes('id="'+id+'"'));
 for(const name of ['app.js','editorial.css']){const url=html.match(new RegExp('https://[^" ]+/'+name.replace('.','\\.')+'\\?v=[^" ]+'))?.[0];assert(url);const r=await fetch(url,{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(fs.readFileSync('public/'+name)));}
 const report={checkedAt:new Date().toISOString(),anonymousCheckinState:true,privatePointsRequireLogin:true,anonymousMutationRejected:true,crossOriginRejected:true,photoCount:album.total,photoContestPreserved:true,commentContestPreserved:true,liveHtmlJsCssMatch:true,retries,realAccountsOrContentWritten:false,passed:true};fs.writeFileSync('verification-checkin-points-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
