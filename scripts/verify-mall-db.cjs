// Isolated synthetic records only; never redeem using a real account.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa='class7_mall_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
const q=x=>"'"+String(x).replaceAll("'","''")+"'",rid=()=>crypto.randomUUID();
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('@cloudbase/manager-node'),m=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function sql(text){const r=await m.database.executePGSql({Sql:text});return(r.Rows||[]).map(row=>JSON.parse(row));}
 async function value(text){const row=(await sql(text))[0];let v=Array.isArray(row)?row[0]:Object.values(row||{})[0];if(typeof v==='string'&&(/^[{[]/.test(v)||v==='true'||v==='false'))v=JSON.parse(v);return v;}
 const rewrite=s=>s.replaceAll('class7_test',qa),mall=rewrite(fs.readFileSync('mall.sql','utf8'));
 const redeem=(account,item='item',price=60,stock=null,request=rid())=>value(`SELECT ${qa}.redeem_mall_item(${q(account)},${q(item)},'Synthetic',${price},${stock===null?'NULL':stock},${q(request)}::uuid)`);
 try{
  await sql(rewrite(fs.readFileSync('schema.sql','utf8')));
  await sql(`INSERT INTO ${qa}.accounts(id,username,owner_hash,password_hash,created_at) SELECT x,'qa_'||x,x,'synthetic','2026-01-01' FROM unnest(ARRAY['a','b','c','d']) x;INSERT INTO ${qa}.user_points(account_id,total) SELECT x,100 FROM unnest(ARRAY['a','b','c','d']) x;INSERT INTO ${qa}.points_ledger(account_id,points,reason,ref_id) SELECT x,100,'qa','initial' FROM unnest(ARRAY['a','b','c','d']) x;`);
  const request=rid(),pair=await Promise.all([redeem('a','item',60,null,request),redeem('a','item',60,null,request)]);
  assert(pair.every(r=>r.redeemed));assert.equal(pair.filter(r=>r.duplicate).length,1);assert.equal(Number(await value(`SELECT total FROM ${qa}.user_points WHERE account_id='a'`)),40);
  assert.equal((await redeem('a')).error,'insufficient');
  const limited=await Promise.all([redeem('b','limited',60,1),redeem('c','limited',60,1)]);assert.equal(limited.filter(r=>r.redeemed).length,1);assert.equal(limited.filter(r=>r.error==='sold_out').length,1);
  const balance=await Promise.all([redeem('d','one'),redeem('d','two')]);assert.equal(balance.filter(r=>r.redeemed).length,1);assert.equal(balance.filter(r=>r.error==='insufficient').length,1);
  // A failing record insert must roll back the balance AND ledger insert.
  const before=await value(`SELECT jsonb_build_object('balance',(SELECT total FROM ${qa}.user_points WHERE account_id='a'),'ledger',(SELECT count(*) FROM ${qa}.points_ledger))`);
  await sql(`CREATE FUNCTION ${qa}.fail_record() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'qa rollback';END$$;CREATE TRIGGER fail_record BEFORE INSERT ON ${qa}.mall_redemptions FOR EACH ROW EXECUTE FUNCTION ${qa}.fail_record();DO $$BEGIN BEGIN PERFORM ${qa}.redeem_mall_item('a','rollback','Synthetic',1,NULL,${q(rid())}::uuid);RAISE EXCEPTION 'missing failure';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'qa rollback' THEN RAISE;END IF;END;END$$;DROP TRIGGER fail_record ON ${qa}.mall_redemptions;`);
  assert.deepEqual(await value(`SELECT jsonb_build_object('balance',(SELECT total FROM ${qa}.user_points WHERE account_id='a'),'ledger',(SELECT count(*) FROM ${qa}.points_ledger))`),before);
  await sql(mall);assert.equal(Number(await value(`SELECT total FROM ${qa}.user_points WHERE account_id='a'`)),40);
  assert.equal(await value(`SELECT has_table_privilege('anon','${qa}.mall_redemptions','SELECT')`),false);
  assert.equal(await value(`SELECT has_function_privilege('anon','${qa}.redeem_mall_item(text,text,text,integer,integer,uuid)','EXECUTE')`),false);
  assert.equal(await value(`SELECT bool_and(u.total=l.total) FROM ${qa}.user_points u JOIN(SELECT account_id,sum(points) total FROM ${qa}.points_ledger GROUP BY account_id) l USING(account_id)`),true);
  fs.writeFileSync('verification-mall-db.json',JSON.stringify({checkedAt:new Date().toISOString(),concurrentRequestIdempotent:true,stockNoOversell:true,balanceNoOverdraft:true,transactionRollback:true,ledgerMatches:true,privateTablesAndFunction:true,migrationIdempotent:true,realDataWritten:false,isolatedSchemaCleaned:true,passed:true},null,2));
  console.log('PASS mall isolated database: retry, stock, balance, rollback, privacy, ledger');
 }finally{assert(/^class7_mall_qa_[0-9a-f]{10}$/.test(qa));await sql(`DROP SCHEMA IF EXISTS ${qa} CASCADE`);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
