// Deterministic fake gateway only; no real photos, credentials or cloud calls.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const esbuild=require(require.resolve('esbuild',{paths:[process.cwd(),path.join(__dirname,'../../cloudbase-tools')]}));
(async()=>{
 let active=0,peak=0,now=1000;const calls=new Map(),delays=[];
 class Clock extends Date{static now(){return now;}}
 const origin='https://synthetic-env.api.tcloudbasegateway.com';
 const fetchFake=async(url)=>{const key=decodeURIComponent(new URL(url).pathname.split('/').at(-1));calls.set(key,(calls.get(key)||0)+1);active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;
  if(key==='retry'&&calls.get(key)<=2)return new Response('',{status:429});
  if(key==='always-limited')return new Response('',{status:429});
  if(key==='bad-request')return new Response('',{status:400});
  return Response.json({fullSignedURL:key==='wrong-host'?'https://other.invalid/file':origin+'/read/'+key,fullURL:origin+'/upload/'+key});
 };
 const mod={exports:{}};vm.runInNewContext(esbuild.transformSync(fs.readFileSync('src/platform.ts','utf8'),{loader:'ts',format:'cjs'}).code,{module:mod,exports:mod.exports,require:()=>class{},process:{env:{CLASS7_ENV_ID:'synthetic-env',CLASS7_STORAGE_KEY:'synthetic-only'}},Buffer,URL,Date:Clock,fetch:fetchFake,AbortSignal,TransformStream,setTimeout:(f,delay)=>{delays.push(delay);return setTimeout(f,1);}});
 const storage=mod.exports.env.BUCKET;
 await Promise.all(Array.from({length:40},(_,i)=>storage.signedUrl('queued-'+i)));assert.equal(peak,3);
 await Promise.all(Array.from({length:20},()=>storage.signedUrl('same')));assert.equal(calls.get('same'),1);assert.equal(storage.cachedUrl('same'),origin+'/read/same');
 await storage.signedUrl('retry');assert.equal(calls.get('retry'),3);assert.deepEqual(delays.slice(-2),[350,700]);
 await assert.rejects(()=>storage.signedUrl('always-limited'),/429/);assert.equal(calls.get('always-limited'),3);
 await assert.rejects(()=>storage.signedUrl('bad-request'),/400/);assert.equal(calls.get('bad-request'),1);
 await assert.rejects(()=>storage.signedUrl('wrong-host'),/Unexpected storage host/);assert.equal(storage.cachedUrl('wrong-host'),null);
 assert.equal(await storage.signUpload('same'),origin+'/upload/same');assert.equal(storage.cachedUrl('same'),origin+'/read/same');
 now+=51*60000;assert.equal(storage.cachedUrl('same'),null);await storage.signedUrl('same');assert.equal(calls.get('same'),3);
 await Promise.all(Array.from({length:805},(_,i)=>storage.signedUrl('bounded-'+i)));assert.equal(storage.cachedUrl('bounded-0'),null);assert.equal(storage.cachedUrl('bounded-804'),origin+'/read/bounded-804');assert.equal(peak,3);
 console.log('PASS signing: concurrency 3, duplicate coalescing, bounded 429 retries, cache expiry/eviction, upload separation and failure cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
