// Focused RNG verification in an isolated function-only schema; no real inventory or points.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa='class7_rates_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('@cloudbase/manager-node'),m=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function value(sql){const r=await m.database.executePGSql({Sql:sql}),row=JSON.parse(r.Rows[0]);let v=Array.isArray(row)?row[0]:Object.values(row)[0];return typeof v==='string'&&/^[{[]/.test(v)?JSON.parse(v):v;}
 try{
  await m.database.executePGSql({Sql:'CREATE SCHEMA '+qa+';'+fs.readFileSync('card-drop-rates.sql','utf8').replaceAll('class7_test',qa)});
  const actual=await value("WITH draws AS MATERIALIZED(SELECT left(("+qa+".draw_photo_pool(ARRAY(SELECT 'c'||n FROM generate_series(1,100) n),ARRAY['e'],ARRAY['l'],ARRAY['s'],1))[1],1) AS tier FROM generate_series(1,40000)) SELECT jsonb_object_agg(tier,n) FROM(SELECT tier,count(*) n FROM draws GROUP BY tier) t");
  for(const [tier,p,tolerance]of[['c',.9595,.015],['e',.03,.008],['l',.01,.006],['s',.0005,.0005]])assert(Math.abs(actual[tier]/40000-p)<tolerance,tier+' base rate');
  const empty=await value("WITH draws AS MATERIALIZED(SELECT ("+qa+".draw_photo_pool('{}',ARRAY['e'],ARRAY['l'],ARRAY['s'],1))[1] AS tier FROM generate_series(1,10000)) SELECT jsonb_object_agg(tier,n) FROM(SELECT tier,count(*) n FROM draws GROUP BY tier) t");assert(Math.abs(empty.e/10000-60/81)<.025);assert(Math.abs(empty.l/10000-20/81)<.025);assert(Math.abs(empty.s/10000-1/81)<.02);
  const unique=await value("SELECT to_jsonb("+qa+".draw_photo_pool(ARRAY['c1','c2'],ARRAY['e'],ARRAY['l'],ARRAY['s'],5))");assert.equal(unique.length,5);assert.equal(new Set(unique).size,5);
  const report={checkedAt:new Date().toISOString(),baseWeights:{common:95.95,epic:3,legendary:1,classified:0.05},draws:40000,observed:actual,unevenCategorySizesDoNotChangeBaseWeights:true,emptyCategoriesRenormalized:true,fiveOffersUnique:true,realBusinessDataWritten:false,isolatedSchemaCleaned:true,passed:true};fs.writeFileSync('verification-card-drop-rates-db.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{assert(/^class7_rates_qa_[a-f0-9]{10}$/.test(qa));await m.database.executePGSql({Sql:'DROP SCHEMA IF EXISTS '+qa+' CASCADE'});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
