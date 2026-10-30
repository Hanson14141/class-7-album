// Isolated synthetic records only; never redeem using a real account.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa='class7_photomall_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
const q=x=>"'"+String(x).replaceAll("'","''")+"'",rid=()=>crypto.randomUUID();
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('@cloudbase/manager-node'),m=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function sql(text){for(let attempt=0;;attempt++){try{const r=await m.database.executePGSql({Sql:text});return(r.Rows||[]).map(row=>JSON.parse(row));}catch(error){if(attempt>=3||!String(error.message).includes('before secure TLS connection was established'))throw error;await new Promise(resolve=>setTimeout(resolve,800*(attempt+1)));}}}
 async function value(text){const row=(await sql(text))[0];let v=Array.isArray(row)?row[0]:Object.values(row||{})[0];if(typeof v==='string'&&(/^[{[]/.test(v)||v==='true'||v==='false'))v=JSON.parse(v);return v;}

 const rewrite=s=>s.replaceAll('class7_test',qa),photoSql=rewrite(fs.readFileSync('photo-mall.sql','utf8')).replace(/\bnow\(\)/g,qa+'.test_now()');
 const day=a=>value('SELECT '+qa+'.photo_mall_day('+q(a)+')'),buy=(a,p,d,r=rid())=>value('SELECT '+qa+'.buy_mall_photo('+q(a)+','+q(p)+','+q(d)+'::date,'+q(r)+'::uuid)'),pid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const offers=a=>value("SELECT jsonb_agg(photo_id ORDER BY photo_id) FROM "+qa+".mall_photo_offers WHERE account_id="+q(a)+" AND day=(SELECT (now_at AT TIME ZONE 'Asia/Shanghai')::date FROM "+qa+".qa_clock)");
 try{
  const stale=await sql("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'class7_photomall_qa_%'");for(const row of stale){const name=Array.isArray(row)?row[0]:row.schema_name;if(/^class7_photomall_qa_[0-9a-f]{10}$/.test(name))await sql('DROP SCHEMA '+name+' CASCADE');}
  await sql(rewrite(fs.readFileSync('schema.sql','utf8')));
  await sql('CREATE TABLE '+qa+'.qa_clock(now_at timestamptz);INSERT INTO '+qa+".qa_clock VALUES('2026-10-19T15:59:59Z');CREATE FUNCTION "+qa+'.test_now() RETURNS timestamptz LANGUAGE sql STABLE AS $$SELECT now_at FROM '+qa+'.qa_clock$$;');await sql(photoSql);
  await sql('INSERT INTO '+qa+".accounts(id,username,owner_hash,password_hash,created_at) SELECT x,'qa_'||x,x,'synthetic','2026-01-01' FROM unnest(ARRAY['a','b','c']) x;INSERT INTO "+qa+".user_points(account_id,total) SELECT x,CASE WHEN x='c' THEN 5 ELSE 100 END FROM unnest(ARRAY['a','b','c']) x;INSERT INTO "+qa+".points_ledger(account_id,points,reason,ref_id) SELECT account_id,total,'qa','initial' FROM "+qa+'.user_points;');
  for(let n=1;n<=8;n++)await sql('INSERT INTO '+qa+'.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) VALUES('+q(pid(n))+",'a','Synthetic','QA "+n+"','caption','no-file-"+n+"','image/png',1,1,1,'2026-01-01')");
  assert.equal((await buy('a',pid(1),'2026-10-19')).error,'not_offered');
  const d=await day('a');assert.equal(d.day,'2026-10-19');const first=await offers('a');assert.equal(first.length,5);await day('a');assert.deepEqual(await offers('a'),first,'Refresh cannot reroll');
  await day('b');const b=await offers('b'),r=rid();const duplicate=await Promise.all([buy('b',b[0],d.day,r),buy('b',b[0],d.day,r)]);assert(duplicate.every(x=>x.bought));assert.equal(duplicate.filter(x=>x.duplicate).length,1);
  assert((await buy('b',b[0],d.day)).alreadyOwned);assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='b'")),90);
  for(const p of first)assert((await buy('a',p,d.day)).bought);assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='a'")),50);assert.equal(Number(await value('SELECT count(*) FROM '+qa+".mall_photo_inventory WHERE account_id='a'")),5);
  await day('c');const cc=await offers('c');assert.equal((await buy('c',cc[0],d.day)).error,'insufficient');assert.equal(Number(await value('SELECT count(*) FROM '+qa+".mall_photo_inventory WHERE account_id='c'")),0);
  await sql('UPDATE '+qa+".qa_clock SET now_at='2026-10-19T16:00:00Z'");assert.equal((await buy('b',b[1],d.day)).error,'expired');
  const next=await day('a');assert.equal(next.day,'2026-10-20');const more=await offers('a');assert.equal(more.length,3);assert(more.every(p=>!first.includes(p)),'Never offer an owned photo');
  // Inventory INSERT failure must undo deduction and ledger insertion.
  const before=Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='a'"));
  await sql('CREATE FUNCTION '+qa+".fail_record() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'qa rollback';END$$;CREATE TRIGGER fail_record BEFORE INSERT ON "+qa+'.mall_photo_inventory FOR EACH ROW EXECUTE FUNCTION '+qa+'.fail_record();DO $$BEGIN BEGIN PERFORM '+qa+'.buy_mall_photo(\'a\','+q(more[0])+','+q(next.day)+'::date,'+q(rid())+"::uuid);RAISE EXCEPTION 'missing failure';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'qa rollback' THEN RAISE;END IF;END;END$$;DROP TRIGGER fail_record ON "+qa+'.mall_photo_inventory;');
  assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='a'")),before);
  await sql('DELETE FROM '+qa+'.photos WHERE id='+q(first[0]));assert.equal(Number(await value('SELECT count(*) FROM '+qa+".mall_photo_inventory WHERE account_id='a'")),5,'Deleted original keeps purchase record');await day('a');assert.deepEqual(await offers('a'),more);
  await sql(photoSql);assert.equal(Number(await value('SELECT total FROM '+qa+".user_points WHERE account_id='a'")),50);
  for(const table of ['mall_photo_days','mall_photo_offers','mall_photo_inventory'])assert.equal(await value("SELECT has_table_privilege('anon',"+q(qa+'.'+table)+",'SELECT')"),false);
  assert.equal(await value("SELECT has_function_privilege('anon',"+q(qa+'.buy_mall_photo(text,text,date,uuid)')+",'EXECUTE')"),false);
  assert.equal(await value('SELECT bool_and(u.total=l.total) FROM '+qa+'.user_points u JOIN(SELECT account_id,sum(points) total FROM '+qa+'.points_ledger GROUP BY account_id) l USING(account_id)'),true);
  const report={checkedAt:new Date().toISOString(),dailyFiveFixed:true,priceTen:true,beijingMidnight:true,excludesOwnedPhotos:true,smallPoolHandled:true,retriesAndRepeatedPurchaseChargeOnce:true,insufficientPointsNoPurchase:true,atomicRollback:true,inventorySurvivesOriginalRemoval:true,privateInventory:true,ledgerMatches:true,idempotentUpgrade:true,realDataWritten:false,isolatedSchemaCleaned:true,passed:true};fs.writeFileSync('verification-photo-mall-db.json',JSON.stringify(report,null,2));console.log('PASS daily photo shop: fixed5,10points, midnight, inventory, no duplicate charge, rollback, privacy');
 }finally{assert(/^class7_photomall_qa_[0-9a-f]{10}$/.test(qa));await sql('DROP SCHEMA IF EXISTS '+qa+' CASCADE');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
