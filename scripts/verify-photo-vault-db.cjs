// Isolated synthetic records only; never redeem using a real account.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa='class7_vault_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
const q=x=>"'"+String(x).replaceAll("'","''")+"'",rid=()=>crypto.randomUUID();
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('@cloudbase/manager-node'),m=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function sql(text){for(let attempt=0;;attempt++){try{const r=await m.database.executePGSql({Sql:text});return(r.Rows||[]).map(row=>JSON.parse(row));}catch(error){if(attempt>=3||!String(error.message).includes('before secure TLS connection was established')){console.error('SQL phase:',text.slice(0,110));throw error;}await new Promise(resolve=>setTimeout(resolve,800*(attempt+1)));}}}
 async function value(text){const row=(await sql(text))[0];let v=Array.isArray(row)?row[0]:Object.values(row||{})[0];if(typeof v==='string'&&(/^[{[]/.test(v)||v==='true'||v==='false'))v=JSON.parse(v);return v;}

 const vm=require('node:vm'),esbuild=require('esbuild'),rewrite=s=>s.replaceAll('class7_test',qa),pid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 try{
  console.log('Creating isolated vault schema');await sql(rewrite(fs.readFileSync('schema.sql','utf8')));console.log('Schema ready');
  await sql('INSERT INTO '+qa+".accounts(id,username,owner_hash,password_hash,created_at) VALUES('a','qa_a','a','synthetic','2026-01-01'),('b','qa_b','b','synthetic','2026-01-01'),('c','qa_c','c','synthetic','2026-01-01');");
  await sql('INSERT INTO '+qa+".profiles(device_hash,nickname,created_at,updated_at) VALUES('a','Buyer A','2026-01-01','2026-01-01'),('b','Buyer B','2026-01-01','2026-01-01'),('c','Buyer C','2026-01-01','2026-01-01');");
  for(let n=1;n<=8;n++)await sql('INSERT INTO '+qa+'.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) VALUES('+q(pid(n))+",'a','Original Uploader','QA "+n+"','caption','no-file-"+n+"','image/png',1,600,400,'2026-01-01')");

  // 1. Check photo_in_vault definition
  assert.equal(await value('SELECT '+qa+'.photo_in_vault('+q(pid(1))+')'),false,'Normal photo is not in vault');
  await sql('INSERT INTO '+qa+".photo_rarities VALUES("+q(pid(1))+",'classified')");
  assert.equal(await value('SELECT '+qa+'.photo_in_vault('+q(pid(1))+')'),true,'Classified photo with no inventory is in vault');
  await sql('INSERT INTO '+qa+".mall_photo_inventory(account_id,photo_id,request_id,title,uploader,caption,price) VALUES('a',"+q(pid(1))+","+q(rid())+",'QA 1','Synthetic','caption',80)");
  assert.equal(await value('SELECT '+qa+'.photo_in_vault('+q(pid(1))+')'),false,'Classified photo with inventory is no longer in vault');

  // 2. Sampling 10,000 draws
  const dist4=await value("WITH draws AS MATERIALIZED(SELECT ("+qa+".draw_photo_pool(ARRAY['c'],ARRAY['e'],ARRAY['l'],ARRAY['s'],1))[1] AS tier FROM generate_series(1,10000)) SELECT jsonb_object_agg(tier,n) FROM(SELECT tier,count(*) n FROM draws GROUP BY tier) t");
  assert(Math.abs(dist4.c/10000-.9595)<.025,'c ~ 95.95%');
  assert(Math.abs(dist4.e/10000-.03)<.02,'e ~ 3%');
  assert(Math.abs(dist4.l/10000-.01)<.015,'l ~ 1%');
  assert(Math.abs(dist4.s/10000-.0005)<.0015,'s ~ 0.05%');

  const dist3=await value("WITH draws AS MATERIALIZED(SELECT ("+qa+".draw_photo_pool(ARRAY['c'],ARRAY['e'],ARRAY['l'],'{}',1))[1] AS tier FROM generate_series(1,10000)) SELECT jsonb_object_agg(tier,n) FROM(SELECT tier,count(*) n FROM draws GROUP BY tier) t");
  assert(Math.abs(dist3.c/10000-(1919/1999))<.025,'normalized c when s empty');
  assert(Math.abs(dist3.e/10000-(60/1999))<.02,'normalized e when s empty');
  assert(Math.abs(dist3.l/10000-(20/1999))<.015,'normalized l when s empty');

  // Compile real platform & mall-api
  const platform=esbuild.transformSync(rewrite(fs.readFileSync('src/platform.ts','utf8').split('const storageOrigin=')[0]),{loader:'ts',format:'cjs'}).code;
  const pm={exports:{}};vm.runInNewContext(platform,{module:pm,exports:pm.exports,require(){return class{constructor(){return m;}};},process,Buffer,Error});const db=new pm.exports.Database();
  let currentAccount='b';class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
  const context=vm.createContext({Response,Request,URL,crypto,Buffer,btoa,atob,ApiError,AccountError:ApiError,uuid:/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,database:()=>db,response:(x,status=200)=>Response.json(x,{status}),requireAccount:async()=>{if(!currentAccount)throw new ApiError(401,'login');return{id:currentAccount,username:'qa_'+currentAccount,owner_hash:currentAccount};},requireAccountProfile:async()=>({device_hash:currentAccount,write_owner_hash:currentAccount,nickname:'Buyer '+currentAccount.toUpperCase()}),jsonBody:r=>r.json(),ownerHash:async()=>currentAccount,requirePhoto:async id=>{if(!await db.prepare('SELECT id FROM photos WHERE id=?').bind(id).first())throw new ApiError(404,'missing');},shortText:(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())throw new ApiError(400,'invalid text');return v.trim();},decodeCursor:()=>null,encodeCursor:()=>null,normalizePoints:v=>v||null,bucket:()=>({signedUrl:async()=>'/synthetic-only'})});
  context.checkinState=async()=>({totalPoints:100});
  const source=rewrite(fs.readFileSync('src/mall-api.ts','utf8'))+'\nglobalThis.shop=mallItemsRoute;globalThis.inventory=mallInventoryRoute;globalThis.redeem=mallRedeemRoute;globalThis.vaultStatus=vaultStatusRoute;';vm.runInContext(esbuild.transformSync(source,{loader:'ts'}).code,context);

  // Setup account b with 100 points, account c with 100 points
  await sql('INSERT INTO '+qa+".user_points(account_id,total) VALUES('b',100),('c',100);INSERT INTO "+qa+".points_ledger(account_id,points,reason,ref_id) VALUES('b',100,'qa','init'),('c',100,'qa','init');");
  // Set photo 3 to classified
  await sql('INSERT INTO '+qa+".photo_rarities VALUES("+q(pid(3))+",'classified')");
  const todayRow=await value('SELECT (now() AT TIME ZONE \'Asia/Shanghai\')::date::text');
  await sql('INSERT INTO '+qa+".mall_photo_days(account_id,day) VALUES('b',"+q(todayRow)+"),('c',"+q(todayRow)+") ON CONFLICT DO NOTHING;");
  await sql('INSERT INTO '+qa+".mall_photo_offers(account_id,day,photo_id) VALUES('b',"+q(todayRow)+","+q(pid(3))+"),('c',"+q(todayRow)+","+q(pid(3))+");");

  // Shop check: uploader should be '保密仓库' for unbought classified photo
  const reqB=new Request('https://qa.invalid/api/mall');
  currentAccount='b';
  let shopB=await(await context.shop(reqB)).json();
  const classifiedItem=shopB.items.find(x=>x.photoId===pid(3));
  assert(classifiedItem);
  assert.equal(classifiedItem.price,40);
  assert.equal(Number(await value('SELECT price FROM '+qa+".mall_photo_inventory WHERE account_id='a' AND photo_id="+q(pid(1)))),80,'Historical paid price is preserved');
  await assert.rejects(()=>context.redeem(reqB,{photoId:pid(3),price:80,day:todayRow,requestId:rid()}),e=>e.status===409,'Old 80 point client must refresh');
  assert.equal(classifiedItem.uploader,'Original Uploader');

  // Forged price rejection: pass 10 or 30 for classified item -> 409
  await assert.rejects(()=>context.redeem(reqB,{photoId:pid(3),price:10,day:todayRow,requestId:rid()}),e=>e.status===409);
  assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='b'")),100);

  // Insufficient points: set b points to 30
  await sql('UPDATE '+qa+".user_points SET total=30 WHERE account_id='b'");
  await assert.rejects(()=>context.redeem(reqB,{photoId:pid(3),price:40,day:todayRow,requestId:rid()}),e=>e.status===400);

  // Restore points to 100, buy classified photo 3 successfully
  await sql('UPDATE '+qa+".user_points SET total=100 WHERE account_id='b'");
  const buyReqId=rid();
  const buyRes=await(await context.redeem(reqB,{photoId:pid(3),price:40,day:todayRow,requestId:buyReqId})).json();
  assert(buyRes.bought);
  assert.equal(buyRes.price,40);
  assert.equal(buyRes.points.total,60);
  assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='b'")),60);

  // Check photo ownership transfer
  const photoRow=await value('SELECT row_to_json(p) FROM '+qa+'.photos p WHERE id='+q(pid(3)));
  assert.equal(photoRow.owner_hash,'b','owner_hash transferred to buyer');
  assert.equal(photoRow.uploader,'Buyer B','uploader transferred to buyer nickname');

  // Check inventory record
  const invRow=await value('SELECT row_to_json(i) FROM '+qa+".mall_photo_inventory i WHERE account_id='b' AND photo_id="+q(pid(3)));
  assert.equal(invRow.price,40);
  assert.equal(invRow.uploader,'Buyer B');

  // Concurrent retry with same request_id -> duplicate, no extra charge
  const repeatRes=await(await context.redeem(reqB,{photoId:pid(3),price:40,day:todayRow,requestId:buyReqId})).json();
  assert(repeatRes.duplicate);
  assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='b'")),60);

  // Cross-account conflict: account c tries to buy the same classified photo -> rejected already_sold
  currentAccount='c';
  const reqC=new Request('https://qa.invalid/api/mall');
  await assert.rejects(()=>context.redeem(reqC,{photoId:pid(3),price:40,day:todayRow,requestId:rid()}),e=>e.status===409&&e.message.includes('该保密照片已被其他同学率先买走'));
  assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='c'")),100,'Account C was not charged');

  // Vault status route check
  currentAccount='b';
  let vs=await(await context.vaultStatus(reqB)).json();
  assert.equal(vs.admin,false);
  assert.equal(vs.stock,0);
  // Add b to photo_vault_admins
  await sql('INSERT INTO '+qa+".photo_vault_admins VALUES('qa_b')");
  // Set photo 4 to classified (unbought)
  await sql('INSERT INTO '+qa+".photo_rarities VALUES("+q(pid(4))+",'classified')");
  vs=await(await context.vaultStatus(reqB)).json();
  assert.equal(vs.admin,true);
  assert.equal(vs.stock,1);


  // Execute the actual generated HTTP source with the service_role binder and synthetic storage.
  let writes=0,signs=0;const fakeBucket={signedUrl:async()=>{signs++;return 'https://qa.invalid/object';},put:async()=>{writes++;return {size:1};},get:async()=>({body:new Uint8Array([0]),size:1}),delete:async()=>{}};
  const http=vm.createContext({module:{exports:{}},exports:{},Response,Request,URL,crypto,Buffer,btoa,atob,Uint8Array,TextDecoder,console,env:{DB:db,BUCKET:fakeBucket},AccountError:ApiError,verifiedOwner:async()=>currentAccount,requireAccount:context.requireAccount,requireAccountProfile:context.requireAccountProfile});
  vm.runInContext(esbuild.transformSync(rewrite(fs.readFileSync('src/photo-api.ts','utf8').replace(/^import .*;\r?\n/gm,'')),{loader:'ts',format:'cjs'}).code,http);
  const handle=http.module.exports.handlePhotoApi,metadata=Buffer.from(JSON.stringify({title:'',caption:'synthetic vault',width:32,height:32,rotation:0})).toString('base64');
  const upload=()=>handle(new Request('https://qa.invalid/api/vault/photos',{method:'POST',headers:{Origin:'https://qa.invalid','Content-Type':'image/png','X-Photo-Metadata':metadata},body:new Uint8Array([0])}));
  currentAccount='c';assert.equal((await upload()).status,403);assert.equal(writes,0,'Non-admin cannot write storage');
  currentAccount='b';const stored=await upload();assert.equal(stored.status,201);const hiddenId=(await stored.json()).photo.id;assert.equal(await value('SELECT '+qa+'.photo_in_vault('+q(hiddenId)+')'),true,'Photo and rarity atomically inserted with service_role');
  for(const rarity of ['epic','legendary','classified']){const meta=Buffer.from(JSON.stringify({title:'admin '+rarity,caption:'',width:32,height:32,rotation:90,rarity})).toString('base64'),r=await handle(new Request('https://qa.invalid/api/admin/photos',{method:'POST',headers:{Origin:'https://qa.invalid','Content-Type':'image/png','X-Photo-Metadata':meta},body:new Uint8Array([0])}));assert.equal(r.status,201);const data=await r.json();assert.equal(data.rarity,rarity);assert.equal(data.vault,rarity==='classified');assert.equal(await value('SELECT rarity FROM '+qa+'.photo_rarities WHERE photo_id='+q(data.photo.id)),rarity);}
  currentAccount='c';assert.equal((await handle(new Request('https://qa.invalid/api/admin/photos',{method:'POST',headers:{Origin:'https://qa.invalid','Content-Type':'image/png','X-Photo-Metadata':metadata},body:new Uint8Array([0])}))).status,403,'Normal accounts cannot use admin upload');
  currentAccount=null;for(const route of ['files/'+hiddenId,'files/'+hiddenId+'?raw=1','photos/'+hiddenId,'photos/'+hiddenId+'/comments','photos/'+hiddenId+'/likes'])assert.equal((await handle(new Request('https://qa.invalid/api/'+route))).status,404,'Classified direct access is private');
  const signCountBefore=signs,publicList=await(await handle(new Request('https://qa.invalid/api/photos'))).json();assert(!publicList.photos.some(p=>[hiddenId,pid(1),pid(3)].includes(p.id)));assert.equal(publicList.total,7,'All classified photos are excluded, including already purchased cards');assert.equal(signs,signCountBefore,'Album metadata performs zero storage signing calls');
  currentAccount='c';assert.equal((await handle(new Request('https://qa.invalid/api/files/'+hiddenId))).status,404,'Un-offered account cannot read classified photo');assert.equal((await handle(new Request('https://qa.invalid/api/files/'+pid(3)))).status,404,'Old offer cannot read a card sold to someone else');
  await sql('INSERT INTO '+qa+".mall_photo_offers(account_id,day,photo_id) VALUES('c',"+q(todayRow)+','+q(hiddenId)+')');
  assert.equal((await handle(new Request('https://qa.invalid/api/files/'+hiddenId))).status,302,'Today offered account can read unsold classified card');
  currentAccount='a';assert.equal((await handle(new Request('https://qa.invalid/api/files/'+pid(1)))).status,302,'Existing collector can still view owned classified card');
  currentAccount='b';assert.equal((await handle(new Request('https://qa.invalid/api/files/'+pid(3)))).status,302,'New buyer can view purchased classified card in inventory');currentAccount=null;assert.equal((await handle(new Request('https://qa.invalid/api/files/'+pid(3)))).status,404,'Purchased classified card never becomes public');
  const download=await handle(new Request('https://qa.invalid/api/files/'+pid(2)+'?download=photo.png'));assert.equal(download.status,302);assert(new URL(download.headers.get('Location')).searchParams.has('download'),'Gateway fallback preserves download disposition');
  await sql('SELECT '+qa+'.set_photo_like('+q('b')+','+q(hiddenId)+',true)');
  currentAccount=null;const ranked=await(await handle(new Request('https://qa.invalid/api/photos?sort=weekly'))).json();assert(!ranked.photos.some(p=>p.id===hiddenId));assert.equal(ranked.total,0,'Classified cards excluded from public weekly rankings');
  const privateEmojiComment=rid();await sql('INSERT INTO '+qa+'.comments(id,photo_id,owner_hash,author,body,created_at,emoji_photo_id,emoji_title) VALUES('+q(privateEmojiComment)+','+q(pid(2))+",'a','Synthetic','','2026-01-01',"+q(pid(1))+",'secret title')");
  const emojiComments=await(await handle(new Request('https://qa.invalid/api/photos/'+pid(2)+'/comments'))).json(),redacted=emojiComments.comments.find(c=>c.id===privateEmojiComment).emoji;assert.equal(redacted.private,true);assert.equal(redacted.photoId,null);assert(!JSON.stringify(redacted).includes('secret title'));
  // Unified library: authenticated search/filter/page queries must not mutate anything.
  currentAccount=null;assert.equal((await handle(new Request('https://qa.invalid/api/admin/photos'))).status,401);
  currentAccount='c';assert.equal((await handle(new Request('https://qa.invalid/api/admin/photos'))).status,403);
  currentAccount='b';
  for(let n=10;n<=16;n++)await sql('INSERT INTO '+qa+'.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) VALUES('+q(pid(n))+",'a','Original Uploader','分页测试 "+n+"','','unchanged-file-"+n+"','image/png',1,32,32,'2025-01-01')");
  const managed=await(await handle(new Request('https://qa.invalid/api/admin/photos'))).json();assert.equal(managed.total,19);assert.equal(managed.photos.length,12);assert(managed.nextCursor);
  const nextManaged=await(await handle(new Request('https://qa.invalid/api/admin/photos?cursor='+encodeURIComponent(managed.nextCursor)))).json();assert.equal(nextManaged.photos.length,7);assert.equal(new Set([...managed.photos,...nextManaged.photos].map(p=>p.id)).size,19,'No page duplicates');assert.equal(nextManaged.nextCursor,null);
  const searched=await(await handle(new Request('https://qa.invalid/api/admin/photos?search='+encodeURIComponent('分页测试')))).json();assert.equal(searched.total,7,'Unicode title search');
  const authorSearch=await(await handle(new Request('https://qa.invalid/api/admin/photos?search='+encodeURIComponent('Original Uploader')))).json();assert(authorSearch.total>=7);
  const tierPage=await(await handle(new Request('https://qa.invalid/api/admin/photos?rarity=classified'))).json();assert(tierPage.total>0&&tierPage.photos.every(p=>p.rarity==='classified'));
  assert.equal((await handle(new Request('https://qa.invalid/api/admin/photos?rarity=forged'))).status,400);
  assert.equal((await handle(new Request('https://qa.invalid/api/admin/photos?search=changed&cursor='+encodeURIComponent(managed.nextCursor)))).status,400,'Cursor tied to filters');
  assert.equal((await handle(new Request('https://qa.invalid/api/admin/photos?search='+encodeURIComponent("' OR 1=1 --")))).status,200,'Search is bound data');
  // Existing-photo editor: same photo/file and every interaction/ownership row survive all four tiers.
  const editUrl='https://qa.invalid/api/admin/photos/'+pid(1)+'/rarity';
  const edit=(rarity,origin='https://qa.invalid')=>handle(new Request(editUrl,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({rarity})}));
  currentAccount=null;assert.equal((await handle(new Request(editUrl))).status,401);assert.equal((await edit('epic')).status,401);
  currentAccount='c';assert.equal((await handle(new Request(editUrl))).status,403);assert.equal((await edit('epic')).status,403);
  assert.equal((await value('SELECT '+qa+'.set_admin_photo_rarity(\'c\','+q(pid(1))+',\'epic\')')).error,'unauthorized','SQL rechecks the administrator');
  currentAccount='b';assert.equal((await edit('epic','https://untrusted.invalid')).status,403);assert.equal((await edit('forged')).status,400);
  assert.equal((await handle(new Request('https://qa.invalid/api/admin/photos/'+pid(999)+'/rarity'))).status,404);
  await sql('INSERT INTO '+qa+'.comments(id,photo_id,owner_hash,author,body,created_at) VALUES('+q(rid())+','+q(pid(1))+",'a','Synthetic','Keep this comment','2026-01-01');SELECT "+qa+'.set_photo_like(\'a\','+q(pid(1))+',true)');
  const preserved=['accounts','photos','comments','photo_likes','comment_likes','mall_photo_inventory','mall_photo_days','mall_photo_offers','user_points','points_ledger'];
  const fingerprint=()=>value('SELECT jsonb_object_agg(name,hash) FROM('+preserved.map(t=>"SELECT '"+t+"' AS name,md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) AS hash FROM "+qa+'.'+t+' x').join(' UNION ALL ')+') hashes');
  const before=await fingerprint(),writesBeforeEdit=writes;
  for(const rarity of ['common','epic','legendary','classified']){const r=await edit(rarity);assert.equal(r.status,200);const state=await r.json();assert.equal(state.photoId,pid(1));assert.equal(state.rarity,rarity);assert.equal((await(await handle(new Request(editUrl))).json()).rarity,rarity);}
  const repeated=await(await edit('classified')).json();assert.equal(repeated.changed,false);
  assert.deepEqual(await fingerprint(),before,'Photo, comments, likes, inventory, owner and points unchanged');assert.equal(writes,writesBeforeEdit,'Changing rarity never writes a file');
  // Two genuinely simultaneous buyers: one succeeds, neither deadlocks or pays twice.
  await sql('INSERT INTO '+qa+".photo_rarities VALUES("+q(pid(5))+",'classified');UPDATE "+qa+".user_points SET total=100 WHERE account_id IN ('b','c');INSERT INTO "+qa+".mall_photo_offers(account_id,day,photo_id) VALUES('b',"+q(todayRow)+','+q(pid(5))+"),('c',"+q(todayRow)+','+q(pid(5))+')');
  const race=await Promise.all(['b','c'].map(a=>value('SELECT '+qa+'.buy_mall_photo('+q(a)+','+q(pid(5))+','+q(todayRow)+'::date,'+q(rid())+'::uuid,40)')));
  assert.equal(race.filter(r=>r.bought).length,1);assert.equal(race.filter(r=>r.error==='already_sold').length,1);
  await sql('INSERT INTO '+qa+".accounts(id,username,owner_hash,password_hash,created_at) VALUES('d','qa_d','d','synthetic','2026-01-01');INSERT INTO "+qa+".photo_rarities VALUES("+q(pid(6))+",'epic'),("+q(pid(7))+",'legendary');");
  await sql('INSERT INTO '+qa+".mall_photo_inventory(account_id,photo_id,request_id,title,uploader,caption,price) SELECT 'd',id,gen_random_uuid(),title,uploader,caption,10 FROM "+qa+'.photos');
  const earned=await db.prepare('SELECT '+qa+'.unlock_collection_sets(?) AS earned').bind('d').first();assert.equal(earned.earned.length,4,'All four nonempty sets award achievements');
  await sql('INSERT INTO '+qa+".photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) VALUES("+q(pid(9))+",'a','Synthetic','new card','','no-file','image/png',1,32,32,'2026-01-01')");
  const retained=await db.prepare('SELECT '+qa+'.unlock_collection_sets(?) AS earned').bind('d').first();assert.equal(retained.earned.length,4,'New cards cannot revoke earned achievements');
  fs.writeFileSync('verification-photo-vault-db.json',JSON.stringify({checkedAt:new Date().toISOString(),isolatedSyntheticOnly:true,actualApiAndServiceRole:true,adminManagerSearchFilterPagination:true,adminManagerPermissions:true,existingPhotoRarityEditorAllTiers:true,existingPhotoRarityEditorPermissions:true,existingPhotoIdFileOwnerVotesCommentsAndInventoryPreserved:true,atomicAdminUpload:true,adminEpicLegendaryClassifiedUpload:true,nonAdminTierUploadRejected:true,nonAdminUploadRejected:true,classifiedAnonymousReadsBlocked:true,publicListExcludesAllClassified:true,purchasedClassifiedStillPrivate:true,classifiedEmojiRedacted:true,publicMetadataPerformsZeroSigning:true,publicCountsExcludeClassified:true,weeklyRanksExcludeClassified:true,offeredAccountCanView:true,parallelPurchaseOneWinner:true,privateRarityWritesRestricted:true,fourSetAchievements:true,achievementsPersistAfterNewCards:true,passed:true},null,2));
  console.log('PASS isolated schema: four-tier editor, permissions, existing data/file preservation, weighted draws and exclusive purchases');
 }finally{
  assert(/^class7_vault_qa_[0-9a-f]{10}$/.test(qa));
  await sql('DROP SCHEMA IF EXISTS '+qa+' CASCADE');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
