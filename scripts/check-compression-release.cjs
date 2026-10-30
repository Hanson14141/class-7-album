const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com';
async function request(url){for(let n=0;;n++){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(r.status===429&&n<4){await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,700*2**n));continue;}assert.equal(r.status,200);return r;}}
(async()=>{
 const html=await(await request(base+'/api/')).text();assert(html.includes('id="auto-compress" checked'));assert(html.includes('超过 12 MB 时压缩至 6 MB 以内'));
 const resources=[...html.matchAll(/(?:src|href)="(https:[^"]+)"/g)].map(m=>m[1]);
 for(const name of ['photo-compression.js','app.js','editorial.css']){const url=resources.find(u=>new URL(u).pathname==='/'+name);assert(url);const bytes=Buffer.from(await(await request(url)).arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'public',name))).digest('hex'));}
 const photos=await(await request(base+'/api/photos')).json(),saved=JSON.parse(fs.readFileSync(path.join(root,'.private/pre-compression-photo-manifest.json'))),current=new Map(photos.photos.map(p=>[p.id,p.bytes]));for(const item of saved)assert.equal(current.get(item.id),item.bytes,'Existing photo retained');
 const report=JSON.parse(fs.readFileSync(path.join(root,'verification-compression-6mb.json')));report.release={verifiedAt:new Date().toISOString(),liveUrl:base+'/api/',staticAssetHashesMatch:true,compressionOptionPresent:true,existingPhotoIdsAndSizesRetained:saved.length};fs.writeFileSync(path.join(root,'verification-compression-6mb.json'),JSON.stringify(report,null,2));
 console.log('PASS live compression option, published asset hashes, '+saved.length+' existing photos retained');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
