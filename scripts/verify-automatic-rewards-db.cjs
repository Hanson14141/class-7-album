// Real PostgreSQL functions in a disposable synthetic schema, never real accounts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa='class7_reward_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
const q=x=>"'"+String(x).replaceAll("'","''")+"'",id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const rewrite=s=>s.replaceAll('class7_test',qa).replaceAll('clock_timestamp()',qa+'.test_now()');
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('@cloudbase/manager-node'),m=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function sql(s){for(let i=0;;i++){try{return (await m.database.executePGSql({Sql:s})).Rows?.map(JSON.parse)||[];}catch(e){if(i>2||!String(e.message).includes('before secure TLS'))throw e;}}}
 async function value(s){const r=(await sql(s))[0];let v=Array.isArray(r)?r[0]:Object.values(r||{})[0];return typeof v==='string'&&/^[{[]/.test(v)?JSON.parse(v):v;}
 const balance=a=>value(`SELECT total FROM ${qa}.user_points WHERE account_id=${q(a)}`),clock=at=>sql(`UPDATE ${qa}.qa_clock SET at_time=${q(at)}::timestamptz`);
 const collection=a=>value(`SELECT ${qa}.award_collection_rewards(${q(a)})`);
 async function inventory(a,first,last){await sql(`INSERT INTO ${qa}.mall_photo_inventory(id,account_id,photo_id,request_id,title,uploader,caption,price) SELECT gen_random_uuid(),${q(a)},'20000000-0000-4000-8000-'||lpad(n::text,12,'0'),gen_random_uuid(),'synthetic','synthetic','',10 FROM generate_series(${first},${last})n ON CONFLICT(account_id,photo_id)DO NOTHING`);}
 try{
  await sql(`CREATE SCHEMA ${qa};CREATE TABLE ${qa}.qa_clock(at_time timestamptz);INSERT INTO ${qa}.qa_clock VALUES('2026-10-21T04:00:00Z');CREATE FUNCTION ${qa}.test_now()RETURNS timestamptz LANGUAGE sql STABLE AS $$SELECT at_time FROM ${qa}.qa_clock$$;`);
  await sql(rewrite(fs.readFileSync('schema.sql','utf8')));
  const names=['a','alias','b','c','d','collector','draw','shop',...Array.from({length:7},(_,i)=>'v'+i)];
  await sql(`INSERT INTO ${qa}.accounts(id,username,owner_hash,password_hash,created_at)SELECT n,'qa_'||n,n,'synthetic','2026-01-01'FROM unnest(ARRAY[${names.map(q)}])n;INSERT INTO ${qa}.user_points(account_id,total)SELECT id,10 FROM ${qa}.accounts;INSERT INTO ${qa}.account_owner_links VALUES('alias','a');
   INSERT INTO ${qa}.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at)SELECT '20000000-0000-4000-8000-'||lpad(n::text,12,'0'),CASE n WHEN 1 THEN 'a' WHEN 2 THEN 'alias' WHEN 3 THEN 'b' ELSE 'd' END,'synthetic','synthetic','caption','no-file-'||n,'image/png',1,600,800,'2026-01-01'FROM generate_series(1,120)n;
   INSERT INTO ${qa}.photo_rarities(photo_id,rarity)VALUES(${q(id(5))},'classified');
   INSERT INTO ${qa}.comments(id,photo_id,owner_hash,author,body,created_at)VALUES(${q(id(201))},${q(id(1))},'a','synthetic','one','2026-01-01'),(${q(id(202))},${q(id(1))},'c','synthetic','two','2026-01-02'),(${q(id(203))},${q(id(1))},'b','synthetic','three','2026-01-03'),(${q(id(204))},${q(id(5))},'d','synthetic','hidden','2026-01-04');`);
  // Week and canonical-person boundaries; hidden entries cannot win.
  for(const [n,votes]of[[1,5],[2,4],[3,3],[4,2],[5,7]])await sql(`INSERT INTO ${qa}.photo_likes(photo_id,owner_hash,created_at,voted_at,week_start)SELECT ${q(id(n))},'v'||n,'2026-10-21T05:00:00Z','2026-10-21T05:00:00Z','2026-10-18T16:00:00Z'FROM generate_series(0,${votes-1})n`);
  for(const [n,votes]of[[201,5],[202,4],[203,3],[204,7]])await sql(`INSERT INTO ${qa}.comment_likes(comment_id,owner_hash,created_at,voted_at,week_start)SELECT ${q(id(n))},'v'||n,'2026-10-21T05:00:00Z','2026-10-21T05:00:00Z','2026-10-18T16:00:00Z'FROM generate_series(0,${votes-1})n`);
  await sql(`INSERT INTO ${qa}.contest_weeks VALUES('2026-10-11T16:00:00Z','2026-10-18T16:00:00Z','2026-10-11T16:00:00Z','2026-10-18T16:00:00Z');INSERT INTO ${qa}.contest_results VALUES('2026-10-11T16:00:00Z',${q(id(4))},99,99,1);`);
  await clock('2026-10-25T15:59:59Z');await value(`SELECT ${qa}.reward_points_state('a')`);assert.equal(Number(await balance('a')),10);assert.equal(Number(await value(`SELECT count(*)FROM ${qa}.weekly_reward_grants`)),0);
  await clock('2026-10-25T16:00:01Z');
  // Deliberate failure proves finalization, grants and balances roll back together.
  await sql(`CREATE OR REPLACE FUNCTION ${qa}.fail_reward()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.reason='weekly_comment_top3'THEN RAISE EXCEPTION 'synthetic reward failure';END IF;RETURN NEW;END$$;CREATE TRIGGER fail_reward BEFORE INSERT ON ${qa}.points_ledger FOR EACH ROW EXECUTE FUNCTION ${qa}.fail_reward();`);
  let failed=false;try{await value(`SELECT ${qa}.reward_points_state('a')`);}catch{failed=true;}assert(failed);assert.equal(Number(await balance('a')),10);assert.equal(Number(await value(`SELECT count(*)FROM ${qa}.weekly_reward_grants`)),0);
  await sql(`DROP TRIGGER fail_reward ON ${qa}.points_ledger`);
  await Promise.all(Array.from({length:6},()=>value(`SELECT ${qa}.reward_points_state('a')`)));
  assert.equal(Number(await balance('a')),190);assert.equal(Number(await balance('b')),190);assert.equal(Number(await balance('c')),100);assert.equal(Number(await balance('d')),10);assert.equal(Number(await balance('alias')),10);
  assert.equal(Number(await value(`SELECT count(*)FROM ${qa}.weekly_reward_grants`)),5);assert.equal(Number(await value(`SELECT count(*)FROM ${qa}.weekly_reward_periods`)),2);
  assert.equal(Number(await value(`SELECT count(*)FROM ${qa}.points_ledger WHERE reason IN('weekly_photo_top3','weekly_comment_top3')`)),5);
  await sql(`DELETE FROM ${qa}.photos WHERE id=${q(id(1))}`);await value(`SELECT ${qa}.reward_points_state('a')`);assert.equal(Number(await balance('a')),190);assert.equal(Number(await balance('d')),10,'No replacement after deletion');
  // Existing stock and every threshold, replay, concurrent claims, inventory shrink.
  await inventory('collector',20,64);assert.equal(Number(await collection('collector')),40);assert.equal(Number(await balance('collector')),50);
  await Promise.all(Array.from({length:6},()=>collection('collector')));assert.equal(Number(await balance('collector')),50);
  await inventory('collector',65,79);assert.equal(Number(await collection('collector')),20);assert.equal(Number(await balance('collector')),70);
  await sql(`DELETE FROM ${qa}.mall_photo_inventory WHERE account_id='collector' AND photo_id<${q(id(40))}`);await collection('collector');await inventory('collector',20,39);assert.equal(Number(await collection('collector')),0,'Re-acquiring old threshold cannot farm');
  await inventory('collector',80,99);assert.equal(Number(await collection('collector')),20);assert.equal(Number(await balance('collector')),90);
  // Actual draw wrapper: ten crosses two thresholds and reports the credited balance.
  await inventory('draw',20,57);await collection('draw');await sql(`UPDATE ${qa}.user_points SET total=1000 WHERE account_id='draw'`);
  const request=crypto.randomUUID(),draw=await value(`SELECT ${qa}.draw_photos('draw',10,${q(request)}::uuid,90)`);assert(draw.ok);assert.equal(draw.collectionReward,20);assert.equal(draw.totalPoints,930);
  const again=await value(`SELECT ${qa}.draw_photos('draw',10,${q(request)}::uuid,90)`);assert(again.duplicate);assert.equal(again.totalPoints,930);assert.equal(again.collectionReward,0);
  // Shop wrapper uses its established total field, preserving the public API.
  await inventory('shop',20,38);await sql(`UPDATE ${qa}.user_points SET total=1000 WHERE account_id='shop'`);
  const day=await value(`SELECT (${qa}.photo_mall_day('shop')->>'day')`),offer=await value(`SELECT photo_id FROM ${qa}.mall_photo_offers WHERE account_id='shop' LIMIT 1`),tier=await value(`SELECT COALESCE((SELECT rarity FROM ${qa}.photo_rarities WHERE photo_id=${q(offer)}),'common')`),price={common:10,epic:20,legendary:30,classified:40}[tier];
  const bought=await value(`SELECT ${qa}.buy_mall_photo('shop',${q(offer)},${q(day)}::date,${q(crypto.randomUUID())}::uuid,${price})`);assert(bought.bought);assert.equal(bought.collectionReward,20);assert.equal(bought.total,1020-price);
  await sql(rewrite(fs.readFileSync('automatic-rewards.sql','utf8')));await value(`SELECT ${qa}.reward_points_state('a')`);assert.equal(Number(await balance('a')),190,'Reinstall does not reissue');
  await clock('2026-11-08T16:00:01Z');await value(`SELECT ${qa}.reward_points_state('a')`);assert.equal(Number(await balance('a')),190,'Empty skipped weeks do not award');
  assert.equal(String(await value(`SELECT has_table_privilege('service_role','${qa}.weekly_reward_grants','INSERT')`)),'false');assert.equal(String(await value(`SELECT has_function_privilege('anon','${qa}.reward_points_state(text)','EXECUTE')`)),'false');
  const report={checkedAt:new Date().toISOString(),isolatedSyntheticOnly:true,beijingMondayBoundary:true,noHistoricalAwards:true,canonicalPersonOncePerBoard:true,twoBoards180:true,classifiedExcluded:true,noFourthPlacePromotion:true,weeklyTransactionRollback:true,concurrentAwardsUnique:true,collectionExisting45Awards40:true,collectionEvery20:true,collectionCannotRefarmAfterRemoval:true,drawAndShopIncludeBonusInBalance:true,drawRetryNoDoubleAward:true,emptyWeeksNoAwards:true,migrationReplaySafe:true,privateTablesAndFunctions:true,passed:true};fs.writeFileSync('verification-automatic-rewards-db.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await m.database.executePGSql({Sql:'DROP SCHEMA IF EXISTS '+qa+' CASCADE'});}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
