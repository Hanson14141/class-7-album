// Read-only verification of every public page; do not print identifiers or signed URLs.
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com/api/';
(async()=>{
 const root=require('node:path').resolve(__dirname,'..');process.chdir(root);
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('@cloudbase/manager-node');
 const m=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 const rows=await m.database.executePGSql({Sql:"SELECT jsonb_build_object('total',(SELECT count(*) FROM class7_test.photos WHERE NOT class7_test.photo_is_classified(id)),'classified',COALESCE(jsonb_agg(p.id),'[]'::jsonb),'collected',count(*) FILTER(WHERE EXISTS(SELECT 1 FROM class7_test.mall_photo_inventory i WHERE i.photo_id=p.id))) FROM class7_test.photos p WHERE class7_test.photo_is_classified(p.id)"});
 const row=JSON.parse(rows.Rows[0]);let expected=Array.isArray(row)?row[0]:Object.values(row)[0];if(typeof expected==='string')expected=JSON.parse(expected);
 const hidden=new Set(expected.classified),found=new Set();let cursor=null,total=0,pages=0;
 do{const r=await fetch(base+'photos'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200,'Public page '+(pages+1));const data=await r.json();total=data.total;for(const photo of data.photos){assert(!hidden.has(photo.id),'Classified photo leaked');assert(!found.has(photo.id),'Duplicate page item');found.add(photo.id);}cursor=data.nextCursor;assert(++pages<100);}while(cursor);
 assert.equal(total,expected.total);assert.equal(found.size,total);assert(hidden.size>0);
 let next=0;await Promise.all(Array.from({length:3},async()=>{const ids=[...hidden];while(next<ids.length){const id=ids[next++];for(const path of ['files/','photos/']){const r=await fetch(base+path+id,{redirect:'manual',signal:AbortSignal.timeout(45000)});assert.equal(r.status,404,'Anonymous classified read');await r.body?.cancel();}}}));
 const id=[...hidden][0];for(const path of ['files/'+id+'?raw=1','photos/'+id+'/comments','photos/'+id+'/likes']){const r=await fetch(base+path,{redirect:'manual'});assert.equal(r.status,404);await r.body?.cancel();}
 // Public image resolution still works, including attachment downloads; no original is downloaded here.
 const publicId=[...found][0];for(const query of ['', '?download=photo.jpg']){const r=await fetch(base+'files/'+publicId+query,{redirect:'manual'});assert.equal(r.status,302);if(query)assert(new URL(r.headers.get('Location')).searchParams.has('download'));await r.body?.cancel();}
 const report={checkedAt:new Date().toISOString(),publicTotal:total,pages,classifiedPhotos:hidden.size,previouslyCollectedClassified:Number(expected.collected),allClassifiedExcluded:true,allPublicPages200:true,anonymousClassifiedImageDetailRawCommentLikeBlocked:true,publicImageAndDownloadResolve:true,realDataWritten:false,passed:true};fs.writeFileSync('verification-classified-private-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
