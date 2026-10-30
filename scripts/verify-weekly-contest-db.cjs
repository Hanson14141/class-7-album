// Isolated private schema only. No production accounts, votes, photos or files.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa='class7_contest_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root});
 const C=require('@cloudbase/manager-node'),manager=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function sql(text){const r=await manager.database.executePGSql({Sql:text});return(r.Rows||[]).map(row=>JSON.parse(row));}
 async function value(text){const rows=await sql(text);const row=rows[0];let v=Array.isArray(row)?row[0]:Object.values(row||{})[0];if(typeof v==='string'&&/^[{[]/.test(v))v=JSON.parse(v);return v;}
 const rewrite=s=>s.replaceAll('class7_test',qa),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const weekly=rewrite(fs.readFileSync('weekly-contest.sql','utf8')).replaceAll('clock_timestamp()',qa+'.test_now()');
 const base=rewrite(fs.readFileSync('schema.sql','utf8').split('-- Private schema:')[0]);
 const link=rewrite(fs.readFileSync('account-linking.sql','utf8')),likes=rewrite(fs.readFileSync('photo-likes.sql','utf8'));
 let created=false,passed=false;
 try{
  await sql(base+`;REVOKE ALL ON SCHEMA ${qa} FROM PUBLIC,anon,authenticated;`);created=true;
  await sql(`CREATE TABLE ${qa}.qa_clock(now_at timestamptz);INSERT INTO ${qa}.qa_clock VALUES('2026-10-18 10:00:00+00');CREATE FUNCTION ${qa}.test_now() RETURNS timestamptz LANGUAGE sql STABLE AS $$SELECT now_at FROM ${qa}.qa_clock$$;`);
  await sql(`INSERT INTO ${qa}.accounts(id,username,owner_hash,password_hash,created_at) SELECT x,'qa_'||x,x,'synthetic-only','2026-10-01' FROM unnest(ARRAY['a','b','c','d']) x;INSERT INTO ${qa}.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) SELECT '00000000-0000-4000-8000-'||lpad(i::text,12,'0'),'a','合成测试','合成 '||i,'','no-file','image/png',1,1,1,'2026-10-18T09:00:00.000Z' FROM generate_series(1,8) i;`);
  await sql(link+likes);
  await sql(`INSERT INTO ${qa}.photo_likes VALUES(${q(id(1))},'a','2026-10-15T01:00:00.000Z');`);
  await sql(weekly);
  const page=async(period='current',cursor=null)=>value(`SELECT ${qa}.weekly_contest_page(${q(period)},${cursor?q(JSON.stringify(cursor))+'::jsonb':'NULL'})`);
  const vote=async(account,n,wanted)=>value(`SELECT ${qa}.set_photo_like(${q(account)},${q(id(n))},${wanted})`);
  const clock=async time=>sql(`UPDATE ${qa}.qa_clock SET now_at=${q(time)}::timestamptz`);
  const score=(data,n)=>Number(data.entries.find(p=>p.photo_id===id(n))?.weekly_votes||0);
  assert.equal((await page()).total,0,'Prelaunch likes excluded');
  assert.equal((await value(`SELECT ${qa}.weekly_contest_page('current','null'::jsonb)`)).total,0,'JSON null is an initial page');
  const boundaries=await value(`SELECT jsonb_build_array(${qa}.contest_week_start('2026-10-18 15:59:59+00'),${qa}.contest_week_start('2026-10-18 16:00:00+00'))`);
  assert.equal(Date.parse(boundaries[0]),Date.parse('2026-10-11T16:00:00Z'));assert.equal(Date.parse(boundaries[1]),Date.parse('2026-10-18T16:00:00Z'));
  await vote('a',2,true);assert.equal(score(await page(),2),1);await vote('a',2,false);assert.equal(score(await page(),2),0);await vote('a',2,true);assert.equal(score(await page(),2),1);
  await vote('a',1,false);await vote('a',1,true);assert.equal(score(await page(),1),0,'Old like cannot become new');
  await vote('a',3,true);await vote('b',3,true);assert.equal(score(await page(),3),2);
  await value(`SELECT ${qa}.link_accounts('a','b')`);assert.equal(score(await page(),3),1,'Linked accounts share one vote');
  await value(`SELECT ${qa}.unlink_account('b','a','qa_a|qa_b')`);assert.equal(score(await page(),3),1,'Unlink retains the existing vote');
  await clock('2026-10-18T15:59:59Z');await vote('c',4,true);const before=await page();
  await clock('2026-10-18T16:00:01Z');await vote('b',2,false);const previous=await page('previous');assert(previous.closed&&previous.available);assert.equal(score(previous,2),score(before,2),'Week sealed before first new-week unlike');assert.equal(score(previous,3),score(before,3));
  await vote('b',2,true);assert.equal(score(await page(),2),0,'Re-like in following week is not new');await vote('c',5,true);assert.equal(score(await page(),5),1);assert.equal(score(await page('previous'),2),score(previous,2),'Historical scores frozen');
  await value(`SELECT ${qa}.link_accounts('c','d')`);assert.equal(score(await page('previous'),4),score(previous,4),'Later linking cannot rewrite last week');
  await sql(`DELETE FROM ${qa}.photos WHERE id=${q(id(3))}`);assert(!((await page('previous')).entries.some(p=>p.photo_id===id(3))),'Deleted photo absent from archives');
  await clock('2026-11-08T10:00:00Z');assert.equal((await page('previous')).total,0,'Skipped inactive weeks remain empty');
  await sql(`INSERT INTO ${qa}.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) SELECT '00000000-0000-4000-8000-'||lpad(i::text,12,'0'),'b','合成测试','合成 '||i,'','no-file','image/png',1,1,1,'2026-11-08T09:00:00.000Z' FROM generate_series(100,239) i;SELECT ${qa}.set_photo_like('b',id,true) FROM ${qa}.photos WHERE title LIKE '合成 %' AND id>=${q(id(100))};`);
  const first=await page();assert.equal(first.entries.length,101);assert.equal(first.total,140);const second=await page('current',{week:first.week,rank:100});assert.equal(second.entries.length,40);assert.equal(Number(second.entries[0].rank),101);assert((await page('current',{week:'wrong',rank:1})).stale);
  const started=first.launchedAt;await sql(weekly);assert.equal((await page()).launchedAt,started);assert.equal((await page()).total,140,'Migration rerun preserves eligibility');
  passed=true;
 }finally{
  if(created){assert(/^class7_contest_qa_[0-9a-f]{10}$/.test(qa));await sql(`DROP SCHEMA ${qa} CASCADE`);}
 }
 const report={checkedAt:new Date().toISOString(),beijingWeekBoundary:true,prelaunchLikesExcluded:true,unlikeRemovesScore:true,reLikeCannotRefreshFirstTime:true,linkedIdentityDeduplicated:true,unlinkRetainsHistory:true,weekSealedBeforeNextMutation:true,historicalResultsFrozen:true,deletedPhotosRemoved:true,skippedWeeksEmpty:true,pagination140Entries:true,migrationIdempotent:true,isolatedSchemaCleaned:true,productionDataWritten:false,passed};
 fs.writeFileSync('verification-weekly-contest-db.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});


