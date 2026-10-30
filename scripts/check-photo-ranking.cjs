// Exercise the actual ranking SQL in PostgreSQL using read-only derived-table fixtures.
// No test accounts, photos, likes or schema objects are created.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..');process.chdir(root);
const envId='class7-memory-d0gcpjaqu47530c54';
(async()=>{
 const cred=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root});
 const CloudBase=require('@cloudbase/manager-node');const Manager=CloudBase.default||CloudBase;
 const manager=new Manager({envId,region:'ap-shanghai',secretId:cred.secretId,secretKey:cred.secretKey,token:cred.token});
 const photos=Array.from({length:237},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),owner_hash:i%3?'other':'mine',uploader:i%2?'乙':'甲',title:'合成图 '+i,caption:'',object_key:'synthetic',mime:'image/png',bytes:1,width:1,height:1,rotation:0,created_at:new Date(1760000000000+i*1000).toISOString()}));
 const likes=[];photos.forEach((p,i)=>{for(let n=0;n<(i===236?20:i%7);n++)likes.push({photo_id:p.id,owner_hash:'vote-'+n});});likes.push({...likes[0]});
 const esc=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
 const photoFixture=`(SELECT * FROM jsonb_to_recordset(${esc(photos)}) AS fixture(id text,owner_hash text,uploader text,title text,caption text,object_key text,mime text,bytes bigint,width bigint,height bigint,rotation bigint,created_at text))`;
 const likeFixture=`(SELECT * FROM jsonb_to_recordset(${esc(likes)}) AS fixture(photo_id text,owner_hash text))`;
 const platformSource=fs.readFileSync('src/platform.ts','utf8');const platformCode=require('esbuild').transformSync(platformSource.slice(platformSource.indexOf('export function bindQuery'),platformSource.indexOf('export class Statement')),{loader:'ts',format:'cjs'}).code;
 const platformModule={exports:{}};vm.runInNewContext(platformCode,{module:platformModule,exports:platformModule.exports,require,process,Buffer,fetch,URL,AbortSignal,TransformStream});
 const bind=platformModule.exports.bindQuery;let owner=null,queries=0;
 const database={prepare(sql){return{sql,values:[],bind(...values){this.values=values;return this;}};},async batch(statements){queries++;
  const stmts=statements.map(s=>bind(s.sql.replaceAll('FROM photos p','FROM '+photoFixture+' p').replace(/FROM photos(?=\s|$)/g,'FROM '+photoFixture+' photos').replace('FROM photo_likes GROUP','FROM '+likeFixture+' photo_likes GROUP'),s.values));
  const hex=Buffer.from(JSON.stringify(stmts)).toString('hex');const result=await manager.database.executePGSql({Role:'service_role',Sql:`SELECT class7_test.execute_batch(convert_from(decode('${hex}','hex'),'UTF8')::jsonb) AS batch`});let row=JSON.parse(result.Rows[0]),out=Array.isArray(row)?row[0]:row.batch;if(typeof out==='string')out=JSON.parse(out);return out;
 }};
 class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
 const code=require('esbuild').transformSync(fs.readFileSync('src/photo-ranking-api.ts','utf8'),{loader:'ts'}).code;
 const context={ownerHash:async()=>owner,shortText:(s,n)=>{assert(s.length<=n);return s;},response:x=>x,database:()=>database,photoView:async p=>({id:p.id,likeCount:Number(p.like_count),liked:p.liked}),uuid:/^[0-9a-f-]{36}$/i,ApiError,URL,btoa,atob};vm.createContext(context);vm.runInContext(code+'\nthis.run=rankedPhotos;',context);
 async function page(params){return context.run({},new URL('https://qa.invalid/api/photos?sort=likes&'+params));}
 const count=p=>new Set(likes.filter(l=>l.photo_id===p.id).map(l=>l.owner_hash)).size,sort=(a,b)=>count(b)-count(a)||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id);
 let all=[],next='',pages=0;do{const data=await page(next?'cursor='+encodeURIComponent(next):'');all.push(...data.photos);next=data.nextCursor;assert(data.photos.length<=100);pages++;assert(pages<5);}while(next);
 assert.deepEqual(Array.from(all,p=>p.id),photos.slice().sort(sort).map(p=>p.id));assert.equal(new Set(all.map(p=>p.id)).size,237);assert(all.every((p,i)=>p.rank===i+1));assert.equal(all[0].likeCount,20);
 const filtered=await page('uploader='+encodeURIComponent('甲'));assert.deepEqual(Array.from(filtered.photos,p=>p.id),photos.filter(p=>p.uploader==='甲').sort(sort).slice(0,100).map(p=>p.id));assert.equal(Number(filtered.uploaders.find(x=>x.uploader==='甲').total),119);
 await assert.rejects(()=>page('cursor=invalid'),e=>e.status===400);await assert.rejects(()=>page('uploader='+encodeURIComponent('乙')+'&cursor='+encodeURIComponent(filtered.nextCursor)),e=>e.status===400);
 const anon=await page('mine=1');assert.equal(anon.photos.length,0);owner='mine';const mine=await page('mine=1');assert.deepEqual(Array.from(mine.photos,p=>p.id),photos.filter(p=>p.owner_hash==='mine').sort(sort).map(p=>p.id));
 const report={checkedAt:new Date().toISOString(),syntheticPhotos:237,pages,globalDescending:true,stableTieOrder:true,keysetPagination:true,duplicateVoteDeduplicated:true,uploaderFilter:true,mineFilter:true,invalidCursorRejected:true,queries,cloudDataWritten:false,passed:true};fs.writeFileSync('verification-photo-ranking-sql.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(error=>{console.error(error.message);process.exitCode=1;});




