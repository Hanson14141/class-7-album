// Isolated synthetic records only; never redeem using a real account.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa='class7_vault_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
const q=x=>"'"+String(x).replaceAll("'","''")+"'",rid=()=>crypto.randomUUID();
(async()=>{
 const c=await require('../../cloudbase-tools/node_modules/@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('../../cloudbase-tools/node_modules/@cloudbase/manager-node'),m=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function sql(text){for(let attempt=0;;attempt++){try{const r=await m.database.executePGSql({Sql:text});return(r.Rows||[]).map(row=>JSON.parse(row));}catch(error){if(attempt>=3||!String(error.message).includes('before secure TLS connection was established')){console.error('SQL phase:',text.slice(0,110));throw error;}await new Promise(resolve=>setTimeout(resolve,800*(attempt+1)));}}}
 async function value(text){const row=(await sql(text))[0];let v=Array.isArray(row)?row[0]:Object.values(row||{})[0];if(typeof v==='string'&&(/^[{[]/.test(v)||v==='true'||v==='false'))v=JSON.parse(v);return v;}

 const vm=require('node:vm'),esbuild=require(require.resolve('esbuild',{paths:[root,path.join(root,'../cloudbase-tools')]})),rewrite=s=>s.replaceAll('class7_test',qa),pid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
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
  assert(Math.abs(dist4.c/10000-.82)<.025,'c ~ 82%');
  assert(Math.abs(dist4.e/10000-.10)<.02,'e ~ 10%');
  assert(Math.abs(dist4.l/10000-.05)<.015,'l ~ 5%');
  assert(Math.abs(dist4.s/10000-.03)<.015,'s ~ 3%');

  const dist3=await value("WITH draws AS MATERIALIZED(SELECT ("+qa+".draw_photo_pool(ARRAY['c'],ARRAY['e'],ARRAY['l'],'{}',1))[1] AS tier FROM generate_series(1,10000)) SELECT jsonb_object_agg(tier,n) FROM(SELECT tier,count(*) n FROM draws GROUP BY tier) t");
  assert(Math.abs(dist3.c/10000-(82/97))<.025,'normalized c when s empty');
  assert(Math.abs(dist3.e/10000-(10/97))<.02,'normalized e when s empty');
  assert(Math.abs(dist3.l/10000-(5/97))<.015,'normalized l when s empty');

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
  assert.equal(classifiedItem.price,80);
  assert.equal(classifiedItem.uploader,'保密仓库');

  // Forged price rejection: pass 10 or 30 for classified item -> 409
  await assert.rejects(()=>context.redeem(reqB,{photoId:pid(3),price:10,day:todayRow,requestId:rid()}),e=>e.status===409);
  assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='b'")),100);

  // Insufficient points: set b points to 50
  await sql('UPDATE '+qa+".user_points SET total=50 WHERE account_id='b'");
  await assert.rejects(()=>context.redeem(reqB,{photoId:pid(3),price:80,day:todayRow,requestId:rid()}),e=>e.status===400);

  // Restore points to 100, buy classified photo 3 successfully
  await sql('UPDATE '+qa+".user_points SET total=100 WHERE account_id='b'");
  const buyReqId=rid();
  const buyRes=await(await context.redeem(reqB,{photoId:pid(3),price:80,day:todayRow,requestId:buyReqId})).json();
  assert(buyRes.bought);
  assert.equal(buyRes.price,80);
  assert.equal(buyRes.points.total,20);
  assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='b'")),20);

  // Check photo ownership transfer
  const photoRow=await value('SELECT row_to_json(p) FROM '+qa+'.photos p WHERE id='+q(pid(3)));
  assert.equal(photoRow.owner_hash,'b','owner_hash transferred to buyer');
  assert.equal(photoRow.uploader,'Buyer B','uploader transferred to buyer nickname');

  // Check inventory record
  const invRow=await value('SELECT row_to_json(i) FROM '+qa+".mall_photo_inventory i WHERE account_id='b' AND photo_id="+q(pid(3)));
  assert.equal(invRow.price,80);
  assert.equal(invRow.uploader,'Buyer B');

  // Concurrent retry with same request_id -> duplicate, no extra charge
  const repeatRes=await(await context.redeem(reqB,{photoId:pid(3),price:80,day:todayRow,requestId:buyReqId})).json();
  assert(repeatRes.duplicate);
  assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='b'")),20);

  // Cross-account conflict: account c tries to buy the same classified photo -> rejected already_sold
  currentAccount='c';
  const reqC=new Request('https://qa.invalid/api/mall');
  await assert.rejects(()=>context.redeem(reqC,{photoId:pid(3),price:80,day:todayRow,requestId:rid()}),e=>e.status===409&&e.message.includes('该保密照片已被其他同学率先买走'));
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

  console.log('PASS photo vault verification in isolated schema: definitions, 82/10/5/3 draws, single-buyer claim, anti-resell lock, admin status');
 }finally{
  assert(/^class7_vault_qa_[0-9a-f]{10}$/.test(qa));
  await sql('DROP SCHEMA IF EXISTS '+qa+' CASCADE');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
