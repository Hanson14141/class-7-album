const assert=require('node:assert/strict');const crypto=require('node:crypto');const zlib=require('node:zlib');const fs=require('node:fs');const path=require('node:path');
const base=process.env.CLASS7_TEST_URL||'https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com';
const run=crypto.randomBytes(5).toString('hex');const password=String(crypto.randomInt(100000,1000000));
function crc32(b){let c=0xffffffff;for(const byte of b){c^=byte;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function png(w,h,color){const chunk=(type,data)=>{const name=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([len,name,data,crc]);};const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=2;const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){for(let x=0;x<w;x++)for(let c=0;c<3;c++)raw[y*(w*3+1)+1+x*3+c]=Math.round(Math.min(255,color[c]+50*x/w+25*y/h));}return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',head),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
let rateRetries=0;
async function fetchRetry(url,options){for(let n=0;;n++){const r=await fetch(url,options);if(r.status!==429||n>=4)return r;rateRetries++;await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,700*2**n+Math.random()*250));}}
async function request(url,{cookie,json,origin=base,headers={},...options}={}){const h=new Headers(headers);if(cookie)h.set('Cookie',cookie);if(options.method&&options.method!=='GET')h.set('Origin',origin);if(json!==undefined){h.set('Content-Type','application/json');options.body=JSON.stringify(json);}let r;for(let retry=0;;retry++){r=await fetch(base+url,{...options,headers:h,signal:AbortSignal.timeout(45000)});if(r.status!==429||retry>=4)break;rateRetries++;await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,700*2**retry+Math.random()*250));}const text=await r.text();let data;try{data=JSON.parse(text);}catch{throw Error(`Non JSON response ${r.status}: ${text.slice(0,100)}`);}return {status:r.status,data,cookie:r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};}
function expect(result,status,label){assert.equal(result.status,status,`${label}: ${JSON.stringify(result.data).slice(0,500)}`);console.log('PASS '+label);return result;}
async function main(){
  const first=expect(await request('/api/photos'),200,'anonymous list');
  const username='test_'+run;
  const a=expect(await request('/api/account/register',{method:'POST',json:{username,password,nickname:'测试照片'}}),201,'register with six digit password');
  assert(a.cookie.includes('class7_session'));
  const userB=expect(await request('/api/account/register',{method:'POST',json:{username:'other_'+run,password,nickname:'测试照片'}}),201,'same nickname is a separate account');
  fs.mkdirSync(path.join(__dirname,'../.private'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../.private/test-users.json'),JSON.stringify({username,password,cookie:a.cookie,otherCookie:userB.cookie}));
  const shapes=[[600,820,[30,70,70]],[820,560,[100,60,35]],[620,700,[40,55,100]]];
  const original=shapes.map(([w,h,c])=>({width:w,height:h,bytes:png(w,h,c)}));
  fs.mkdirSync(path.join(__dirname,'../.private/fixtures'),{recursive:true});original.forEach((f,i)=>fs.writeFileSync(path.join(__dirname,'../.private/fixtures/synthetic-'+(i+1)+'.png'),f.bytes));
  const photos=await Promise.all(original.map(async(file,index)=>{
    const meta=Buffer.from(JSON.stringify({title:'',caption:'CloudBase 免费测试图片 '+(index+1),width:file.width,height:file.height,rotation:index===1?90:0})).toString('base64');
    const r=expect(await request('/api/photos',{method:'POST',cookie:a.cookie,headers:{'Content-Type':'image/png','X-Photo-Metadata':meta},body:file.bytes}),201,'original upload '+(index+1));
    assert.equal(r.data.photo.bytes,file.bytes.length);return r.data.photo;
  }));
  assert.equal(new Set(photos.map(p=>p.title)).size,3);console.log('PASS three concurrent uploads and unique numbered titles');
  for(let i=0;i<photos.length;i++){const target=new URL(photos[i].src);target.searchParams.set('download',photos[i].title+'.png');const r=await fetchRetry(target,{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),original[i].bytes);assert(r.headers.get('Content-Disposition')?.includes('attachment'));const raw=await fetchRetry(base+'/api/files/'+photos[i].id+'?raw=1');assert.equal(raw.status,200);assert.deepEqual(Buffer.from(await raw.arrayBuffer()),original[i].bytes);}console.log('PASS original download and save-picker bytes match');
  const target=photos[0];
  expect(await request('/api/photos/'+target.id+'/caption',{method:'POST',cookie:userB.cookie,json:{caption:'cannot edit'}}),403,'other account cannot edit caption');
  expect(await request('/api/photos/'+target.id,{method:'DELETE',cookie:userB.cookie}),403,'other account cannot delete');
  expect(await request('/api/photos/'+target.id+'/caption',{method:'POST',cookie:a.cookie,origin:'https://example.invalid',json:{caption:'csrf'}}),403,'cross origin write rejected');
  const caption='上传后补写说明\n其他人可见';
  expect(await request('/api/photos/'+target.id+'/caption',{method:'POST',cookie:a.cookie,json:{caption}}),200,'owner edits multiline caption');
  const comment=expect(await request('/api/photos/'+target.id+'/comments',{method:'POST',cookie:userB.cookie,json:{body:'测试留言：其他账号可以交流。'}}),201,'other user comments');
  const shared=expect(await request('/api/photos/'+target.id+'/comments'),200,'anonymous reads shared comments');assert(shared.data.comments.some(c=>c.id===comment.data.comment.id));
  const rotations=await Promise.all([1,1].map(turn=>request('/api/photos/'+target.id+'/rotation',{method:'POST',cookie:a.cookie,json:{turn}})));rotations.forEach(r=>expect(r,200,'concurrent relative rotation'));
  const publicList=expect(await request('/api/photos'),200,'public list after edits');const updated=publicList.data.photos.find(p=>p.id===target.id);assert.equal(updated.rotation,180);assert.equal(updated.caption,caption);assert.equal(updated.owned,false);
  const login=expect(await request('/api/account/login',{method:'POST',json:{username,password}}),200,'relogin restores identity');
  const mine=expect(await request('/api/photos?mine=1',{cookie:login.cookie}),200,'relogin restores ownership');assert.equal(mine.data.photos.filter(p=>photos.some(q=>q.id===p.id)).length,3);
  const fake=expect(await request('/api/photos?mine=1',{headers:{'oai-authenticated-user-id':username}}),200,'untrusted platform header ignored');assert.equal(fake.data.photos.length,0);
  expect(await request('/api/comments/'+comment.data.comment.id,{method:'DELETE',cookie:login.cookie}),403,'cannot delete another user comment');
  expect(await request('/api/comments/'+comment.data.comment.id,{method:'DELETE',cookie:userB.cookie}),200,'comment author can delete');
  // One extra disposable test photo verifies deletion without removing the wall fixtures.
  const extra=expect(await request('/api/photos',{method:'POST',cookie:login.cookie,headers:{'Content-Type':'image/png','X-Photo-Metadata':Buffer.from(JSON.stringify({title:'删除测试',caption:'临时测试',width:original[0].width,height:original[0].height})).toString('base64')},body:original[0].bytes}),201,'temporary delete fixture');
  expect(await request('/api/photos/'+extra.data.photo.id,{method:'DELETE',cookie:login.cookie}),200,'owner deletes temporary photo');
  const deleted=await fetchRetry(base+'/api/files/'+extra.data.photo.id);assert.equal(deleted.status,404);console.log('PASS deleted original unavailable');
  const logout=expect(await request('/api/account/logout',{method:'POST',cookie:login.cookie}),200,'logout');assert(logout.cookie.includes('class7_session='));
  const report={testedAt:new Date().toISOString(),base,photos:photos.map(p=>({id:p.id,title:p.title,bytes:p.bytes})),rateRetries,checks:'register,3 concurrent originals with rate-limit backoff,unique names,download bytes,save-picker bytes,ownership,CSRF,comments,caption,rotation,relogin,spoofed header,delete,logout',priorTotal:first.data.total};
  fs.writeFileSync(path.join(__dirname,'../verification.json'),JSON.stringify(report,null,2));
  console.log('PASS complete HTTP workflow; only synthetic test fixtures stored');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
