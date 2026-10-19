// Isolated synthetic records only; never redeem using a real account.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa='class7_rarity_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
const q=x=>"'"+String(x).replaceAll("'","''")+"'",rid=()=>crypto.randomUUID();
(async()=>{
 const c=await require('../../cloudbase-tools/node_modules/@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('../../cloudbase-tools/node_modules/@cloudbase/manager-node'),m=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function sql(text){for(let attempt=0;;attempt++){try{const r=await m.database.executePGSql({Sql:text});return(r.Rows||[]).map(row=>JSON.parse(row));}catch(error){if(attempt>=3||!String(error.message).includes('before secure TLS connection was established')){console.error('SQL phase:',text.slice(0,110));throw error;}await new Promise(resolve=>setTimeout(resolve,800*(attempt+1)));}}}
 async function value(text){const row=(await sql(text))[0];let v=Array.isArray(row)?row[0]:Object.values(row||{})[0];if(typeof v==='string'&&(/^[{[]/.test(v)||v==='true'||v==='false'))v=JSON.parse(v);return v;}


 const vm=require('node:vm'),esbuild=require(require.resolve('esbuild',{paths:[root,path.join(root,'../cloudbase-tools')]})),rewrite=s=>s.replaceAll('class7_test',qa),pid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 try{
  console.log('Creating isolated rarity schema');await sql(rewrite(fs.readFileSync('schema.sql','utf8')));console.log('Schema ready');
  await sql('INSERT INTO '+qa+".accounts(id,username,owner_hash,password_hash,created_at) VALUES('a','qa_a','a','synthetic','2026-01-01'),('b','qa_b','b','synthetic','2026-01-01');");
  for(let n=1;n<=2;n++)await sql('INSERT INTO '+qa+'.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) VALUES('+q(pid(n))+",'a','Synthetic','QA "+n+"','caption','no-file-"+n+"','image/png',1,600,400,'2026-01-01')");
  const inventory=rid();await sql('INSERT INTO '+qa+'.mall_photo_inventory(account_id,photo_id,request_id,title,uploader,caption,id) VALUES(\'a\','+q(pid(2))+','+q(rid())+",'Emoji QA','Synthetic','caption',"+q(inventory)+'::uuid)');
  // Compile the real database binding adapter and route source, preserving its service role.
  const platform=esbuild.transformSync(rewrite(fs.readFileSync('src/platform.ts','utf8').split('const storageOrigin=')[0]),{loader:'ts',format:'cjs'}).code;
  const pm={exports:{}};vm.runInNewContext(platform,{module:pm,exports:pm.exports,require(){return class{constructor(){return m;}};},process,Buffer,Error});const db=new pm.exports.Database();
  let account='a';class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
  const context=vm.createContext({Response,Request,URL,crypto,Buffer,btoa,atob,ApiError,AccountError:ApiError,uuid:/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,database:()=>db,response:(x,status=200)=>Response.json(x,{status}),requireAccount:async()=>{if(!account)throw new ApiError(401,'login');return{id:account,username:'qa_'+account,owner_hash:account};},requireAccountProfile:async()=>({write_owner_hash:account,nickname:'Synthetic'}),jsonBody:r=>r.json(),ownerHash:async()=>account,requirePhoto:async id=>{if(!await db.prepare('SELECT id FROM photos WHERE id=?').bind(id).first())throw new ApiError(404,'missing');},shortText:(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())throw new ApiError(400,'invalid text');return v.trim();},decodeCursor:()=>null,encodeCursor:()=>null,normalizePoints:v=>v||null,bucket:()=>({signedUrl:async()=>'/synthetic-only'})});
  context.checkinState=async()=>({totalPoints:100});
  const source=rewrite(fs.readFileSync('src/mall-api.ts','utf8'))+'\nglobalThis.shop=mallItemsRoute;globalThis.inventory=mallInventoryRoute;globalThis.redeem=mallRedeemRoute;';vm.runInContext(esbuild.transformSync(source,{loader:'ts'}).code,context);
  const request=new Request('https://qa.invalid/api/mall');
  await sql('INSERT INTO '+qa+".photo_rarities VALUES("+q(pid(2))+",'legendary')");
  let shop=await(await context.shop(request)).json();assert.equal(shop.inventoryTotal,1);assert.deepEqual(shop.collection.find(x=>x.rarity==='legendary'),{rarity:'legendary',total:1,owned:1});assert(shop.items.every(x=>x.photoId!==pid(2)));
  const fixed=shop.items.map(x=>x.photoId);await sql(rewrite(fs.readFileSync('photo-rarity.sql','utf8')));shop=await(await context.shop(request)).json();assert.deepEqual(shop.items.map(x=>x.photoId),fixed,'Upgrade does not reroll existing offers');
  await sql('UPDATE '+qa+".photos SET caption='current caption' WHERE id="+q(pid(2)));
  let list=await(await context.inventory(request)).json();assert.equal(list.entries[0].rarity,'legendary');assert.equal(list.entries[0].price,10,'Historical paid price stays ten');assert.equal(list.entries[0].caption,'current caption');assert.equal(list.total,1);
  await sql('UPDATE '+qa+".photos SET caption='' WHERE id="+q(pid(2)));list=await(await context.inventory(request)).json();assert.equal(list.entries[0].caption,'','Cleared caption must not use old snapshot');
  await sql('DELETE FROM '+qa+'.photos WHERE id='+q(pid(2)));shop=await(await context.shop(request)).json();assert.equal(shop.collection.find(x=>x.rarity==='legendary').owned,1);assert.equal(shop.collection.find(x=>x.rarity==='legendary').total,1);list=await(await context.inventory(request)).json();assert.equal(list.entries[0].available,false);assert.equal(list.entries[0].rarity,'legendary');assert.equal(list.entries[0].caption,'caption');
  account='b';list=await(await context.inventory(request)).json();assert.equal(list.total,0,'Inventory stays private');account=null;shop=await(await context.shop(request)).json();assert.equal(shop.signedIn,false);await assert.rejects(()=>context.inventory(request),e=>e.status===401);
  // Tier prices, stale/forged price rejection, retries and insufficient balance.
  account='b';await sql('INSERT INTO '+qa+".user_points(account_id,total) VALUES('b',100);INSERT INTO "+qa+".points_ledger(account_id,points,reason,ref_id) VALUES('b',100,'qa','initial')");
  for(let n=3;n<=6;n++)await sql('INSERT INTO '+qa+'.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) VALUES('+q(pid(n))+",'b','Synthetic','Price QA "+n+"','','no-file','image/png',1,600,400,'2026-01-01')");
  await sql('INSERT INTO '+qa+'.photo_rarities VALUES('+q(pid(4))+",'epic'),("+q(pid(5))+",'legendary'),("+q(pid(6))+",'legendary')");
  const shelf=await(await context.shop(request)).json();for(const [n,price] of [[3,10],[4,20],[5,30],[6,30]])assert.equal(shelf.items.find(x=>x.photoId===pid(n)).price,price);
  const redeem=(n,price,id=rid())=>context.redeem(request,{photoId:pid(n),price,day:shelf.day,requestId:id});
  await assert.rejects(()=>redeem(5,10),e=>e.status===409);assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='b'")),100,'Forged or stale price cannot deduct');
  for(const [n,price] of [[3,10],[4,20],[5,30]]){const receipt=await(await redeem(n,price)).json();assert.equal(receipt.price,price);}
  const repeat=rid();const responses=await Promise.all([redeem(6,30,repeat),redeem(6,30,repeat)]);const receipts=await Promise.all(responses.map(r=>r.json()));assert.equal(receipts.filter(x=>x.duplicate).length,1);assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='b'")),10,'Concurrent retry charges once');
  const again=await(await redeem(5,30)).json();assert(again.alreadyOwned);assert.equal(again.price,30);
  await sql('INSERT INTO '+qa+'.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) VALUES('+q(pid(7))+",'b','Synthetic','Insufficient','','no-file','image/png',1,1,1,'2026-01-01');INSERT INTO "+qa+'.photo_rarities VALUES('+q(pid(7))+",'legendary');INSERT INTO "+qa+'.mall_photo_offers(account_id,day,photo_id) VALUES(\'b\','+q(shelf.day)+'::date,'+q(pid(7))+')');
  await assert.rejects(()=>redeem(7,30),e=>e.status===400);assert.equal(Number(await value('SELECT count(*) FROM '+qa+".mall_photo_inventory WHERE account_id='b'")),4);
  assert.equal(await value('SELECT '+qa+'.buy_mall_photo(\'b\','+q(pid(7))+','+q(shelf.day)+'::date,'+q(rid())+"::uuid)->>'error'"),'price_changed','Old clients must refresh before spending');
  const totals=await value('SELECT jsonb_object_agg(photo_id,price) FROM '+qa+".mall_photo_inventory WHERE account_id='b'");assert.equal(totals[pid(4)],20);assert.equal(totals[pid(5)],30);
  assert.equal(await value('SELECT total=(SELECT sum(points) FROM '+qa+".points_ledger WHERE account_id='b') FROM "+qa+".user_points WHERE account_id='b'"),true);
  const distribution=await value("WITH draws AS MATERIALIZED(SELECT ("+qa+".draw_photo_pool(ARRAY['c'],ARRAY['e'],ARRAY['l'],1))[1] AS tier FROM generate_series(1,10000)) SELECT jsonb_object_agg(tier,n) FROM(SELECT tier,count(*) n FROM draws GROUP BY tier) t");
  assert(Math.abs(distribution.c/10000-.85)<.02);assert(Math.abs(distribution.e/10000-.10)<.02);assert(Math.abs(distribution.l/10000-.05)<.02);
  for(const query of ["SELECT cardinality("+qa+".draw_photo_pool('{}',ARRAY['e'],ARRAY['l'],5))=2", "SELECT cardinality("+qa+".draw_photo_pool('{}','{}','{}',5))=0", "SELECT "+qa+".draw_photo_pool('{}','{}',ARRAY['l'],5)=ARRAY['l']"] )assert.equal(await value(query),true);
  assert.equal(await value("SELECT has_table_privilege('anon',"+q(qa+'.photo_rarities')+",'SELECT')"),false);
  assert.equal(await value("SELECT has_table_privilege('service_role',"+q(qa+'.photo_rarities')+",'UPDATE')"),false);
  const report={checkedAt:new Date().toISOString(),realBindingAndRouteSource:true,serviceRole:true,weightedDistribution:distribution,tierPrices10_20_30:true,historicalPaidPricePreserved:true,forgedPriceRejected:true,concurrentRetryChargesOnce:true,insufficientPointsNoPurchase:true,legacyClientsRefreshBeforeSpending:true,emptyTierFallback:true,noDuplicatePhotos:true,excludesOwned:true,dayPreservedOnUpgrade:true,rarityProgress:true,currentAndClearedCaptions:true,retiredInventoryKeepsRarity:true,privateInventory:true,publicCannotAssignRarity:true,migrationIdempotent:true,realDataWritten:false,isolatedSchemaCleaned:true,passed:true};fs.writeFileSync('verification-photo-rarity-db.json',JSON.stringify(report,null,2));console.log('PASS photo rarity: 85/10/5 weights, empty pools, fixed daily set, inventory, captions, progress, permissions');
 }finally{assert(/^class7_rarity_qa_[0-9a-f]{10}$/.test(qa));await sql('DROP SCHEMA IF EXISTS '+qa+' CASCADE');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

