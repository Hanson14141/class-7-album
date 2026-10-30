const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {token}=JSON.parse(fs.readFileSync(path.join(__dirname,'../.private/storage-key.json')));
const url='https://class7-memory-d0gcpjaqu47530c54.api.tcloudbasegateway.com/v1/storages/object/class7-test/photos/storage-probe-'+Date.now();
const headers={Authorization:'Bearer '+token};
(async()=>{const bytes=Buffer.from('Synthetic private storage probe');const upload=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','x-upsert':'false'},body:bytes});
if(!upload.ok){console.log('Upload error',upload.status,(await upload.text()).slice(0,600));process.exitCode=1;return;}
console.log('PASS native PG storage upload');
const signature=await fetch(url.replace('/object/','/object/sign/'),{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:3600})});const signed=await signature.json();console.log('Signed download HTTP',signature.status,'fields',Object.keys(signed),'host',new URL(signed.fullSignedURL||signed.signedURL,url).origin);
const signUpload=await fetch(url.replace('/object/','/object/upload/sign/'),{method:'POST',headers:{...headers,'Content-Type':'application/json','x-upsert':'false'},body:'{}'});const uploadData=await signUpload.json();
const uploadUrl=new URL(uploadData.fullURL||uploadData.url,url).href;
const cors=await fetch(uploadUrl,{method:'OPTIONS',headers:{Origin:'https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type'}});console.log('Upload CORS',cors.status,'allowOrigin',cors.headers.get('Access-Control-Allow-Origin'),'body',(await cors.text()).slice(0,600));
const head=await fetch(url,{method:'HEAD',headers});console.log('Native HEAD',head.status,head.headers.get('Content-Length'),head.headers.get('Content-Type'));
try{const file=await fetch(url,{headers});if(!file.ok)console.log('Download error',file.status,(await file.text()).slice(0,600));assert.equal(file.status,200);assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);console.log('PASS private download bytes');const unauth=await fetch(url);assert.equal(unauth.status,404);console.log('PASS unauthenticated private object blocked');}
finally{const deleted=await fetch(url,{method:'DELETE',headers});assert.equal(deleted.status,200);console.log('PASS native storage deletion');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
