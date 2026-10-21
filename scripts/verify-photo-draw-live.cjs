const fs=require('node:fs'),assert=require('node:assert/strict');
const base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com/api/';
(async()=>{
 async function get(path,status=200,options={}){for(let i=0;;i++){const r=await fetch(base+path,{...options,signal:AbortSignal.timeout(45000)});if((r.status===429||r.status>=500)&&i<3){await r.body?.cancel();await new Promise(t=>setTimeout(t,500*(i+1)));continue;}assert.equal(r.status,status,path);return r;}}
 const config=await(await get('draw')).json();assert.equal(config.signedIn,false);assert.deepEqual(config.prices,{single:10,ten:90});assert.deepEqual(config.weights,{common:82,epic:10,legendary:5,classified:3});assert.deepEqual(config.pity,{legendary:30,classified:50});assert(!('entries' in config)&&!('totalPoints' in config));
 await get('draw',401,{method:'POST',headers:{Origin:new URL(base).origin,'Content-Type':'application/json'},body:JSON.stringify({count:1,cost:10,requestId:crypto.randomUUID()})});
 await get('draw',403,{method:'POST',headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json'},body:'{}'});
 const html=await(await get('')).text();for(const id of['draw-nav','draw-board','draw-single','draw-ten','draw-legendary-progress','draw-classified-progress','draw-retry'])assert(html.includes('id="'+id+'"'));assert(html.includes('十连抽'));assert(html.includes('整次单抽或十连不扣分'));
 const report={checkedAt:new Date().toISOString(),pricesAndWeightsAndPity:true,anonymousStateContainsNoPrivateData:true,anonymousDraw401:true,crossOriginDraw403:true,drawPageDeployed:true,realAccountPointsOrDrawsUsed:false,passed:true};fs.writeFileSync('verification-photo-draw-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
