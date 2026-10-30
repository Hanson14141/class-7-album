const crypto=require('node:crypto'),zlib=require('node:zlib'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com';
const user=JSON.parse(fs.readFileSync(path.join(__dirname,'../.private/test-users.json')));
function crc32(b){let c=0xffffffff;for(const byte of b){c^=byte;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const n=Buffer.from(type),l=Buffer.alloc(4),c=Buffer.alloc(4);l.writeUInt32BE(data.length);c.writeUInt32BE(crc32(Buffer.concat([n,data])));return Buffer.concat([l,n,data,c]);}
async function fetchRetry(url,options){for(let n=0;;n++){const r=await fetch(url,{...options,signal:AbortSignal.timeout(120000)});if(r.status!==429||n===4)return r;await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,800*2**n));}}
(async()=>{
 const medium=process.argv.includes('--medium'),reportFile=path.join(__dirname,medium?'../verification-medium.json':'../verification-large.json');
 const width=medium?1024:2048,height=medium?768:2048,head=Buffer.alloc(13);head.writeUInt32BE(width);head.writeUInt32BE(height,4);head[8]=8;head[9]=2;
 const raw=crypto.randomBytes((width*3+1)*height);for(let i=0;i<height;i++)raw[i*(width*3+1)]=0;
 const bytes=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',head),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
 const headers={Cookie:user.cookie,Origin:base,'Content-Type':'image/png','X-Photo-Metadata':Buffer.from(JSON.stringify({title:'大原图传输测试',caption:'自动验证后删除的合成随机图片',width,height})).toString('base64')};
 const started=Date.now(),response=await fetchRetry(base+'/api/photos',{method:'POST',headers,body:bytes});const text=await response.text();if(response.status!==201){const report={testedAt:new Date().toISOString(),bytes:bytes.length,status:response.status,body:text.slice(0,250),passed:false};fs.writeFileSync(reportFile,JSON.stringify(report,null,2));throw Error('Large upload HTTP '+response.status+': '+text.slice(0,250));}const result=JSON.parse(text);const photo=result.photo;console.log('PASS original upload',bytes.length,'bytes',Date.now()-started,'ms');
 try{const originalHash=crypto.createHash('sha256').update(bytes).digest('hex');for(const [kind,url]of [['download',photo.src],['save-picker',base+'/api/files/'+photo.id+'?raw=1']]){const r=await fetchRetry(url);assert.equal(r.status,200);const hash=crypto.createHash('sha256');let length=0;for await(const part of r.body){hash.update(part);length+=part.length;}assert.equal(length,bytes.length);assert.equal(hash.digest('hex'),originalHash);console.log('PASS large '+kind+' hash matches');}
 fs.writeFileSync(reportFile,JSON.stringify({testedAt:new Date().toISOString(),bytes:bytes.length,width,height,passed:true,checks:'stream upload, original download SHA256, same-origin save-picker SHA256',uploadMs:Date.now()-started},null,2));}
 finally{const r=await fetchRetry(base+'/api/photos/'+photo.id,{method:'DELETE',headers:{Cookie:user.cookie,Origin:base}});assert.equal(r.status,200);console.log('PASS large test fixture removed');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
