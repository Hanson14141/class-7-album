const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const origin='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function get(url,options={}){for(let n=0;;n++){try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,url+' HTTP status');return r;}catch(e){if(n>=2)throw e;await new Promise(r=>setTimeout(r,700));}}}
(async()=>{
  const checked=[];
  for(const f of ['index.html','game/index.html','game/net.js','game/config.js','game/ui.js','game/engine.js']){
    const response=await get(origin+'/api/'+f),remote=Buffer.from(await response.arrayBuffer());
    assert.equal(hash(remote),hash(fs.readFileSync(path.join(root,'public',f))),f+' deployed hash');checked.push(f);
  }
  const main=await (await get(origin+'/api/')).text();assert(main.includes('id="dungeon-nav"'));
  const game=fs.readFileSync(path.join(root,'public/game/index.html'),'utf8');
  for(const [,file]of game.matchAll(/<script src="([^"]+)"/g)){const r=await get(origin+'/api/game/'+file,{method:'HEAD'});assert(r.headers.get('content-type').includes('javascript'));}
  for(const ext of ['webp','mp3']){
    const asset=fs.readdirSync(path.join(root,'public/game/assets')).find(f=>f.endsWith('.'+ext));assert(asset);
    const r=await get('https://class7-memory-d0gcpjaqu47530c54-1509361747.tcloudbaseapp.com/game/assets/'+asset,{method:'HEAD'});assert(r.headers.get('content-type').startsWith(ext==='webp'?'image/':'audio/'));
  }
  const report={checkedAt:new Date().toISOString(),origin,checked,liveNavigation:true,scriptMime:true,mediaMime:true,readOnly:true,passed:true};
  fs.writeFileSync(path.join(root,'verification-dungeon-live.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
