const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa='class7_words_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
const q=x=>"'"+String(x).replaceAll("'","''")+"'",id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('@cloudbase/manager-node'),m=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function sql(text){const r=await m.database.executePGSql({Sql:text});return(r.Rows||[]).map(row=>JSON.parse(row));}
 async function value(text){const rows=await sql(text),row=rows[0];let v=Array.isArray(row)?row[0]:Object.values(row||{})[0];if(typeof v==='string'&&/^[{[]/.test(v))v=JSON.parse(v);return v;}
 const rewrite=s=>s.replaceAll('class7_test',qa).replaceAll('clock_timestamp()',qa+'.test_now()'),migration=rewrite(fs.readFileSync('comment-contest.sql','utf8'));
 let created=false;
 try{
  created=true;await sql(`CREATE SCHEMA ${qa};CREATE TABLE ${qa}.qa_clock(now_at timestamptz);INSERT INTO ${qa}.qa_clock VALUES('2026-10-19T04:00:00Z');CREATE FUNCTION ${qa}.test_now() RETURNS timestamptz LANGUAGE sql STABLE AS $$SELECT now_at FROM ${qa}.qa_clock$$;`);
  await sql(rewrite(fs.readFileSync('schema.sql','utf8').split('-- Comment contest integration')[0]));
  await sql(`INSERT INTO ${qa}.accounts(id,username,owner_hash,password_hash,created_at) SELECT x,'qa_'||x,x,'synthetic','2026-01-01' FROM unnest(ARRAY['a','b','c']) x;INSERT INTO ${qa}.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) VALUES(${q(id(1))},'a','合成','来源照片','','no-file','image/png',1,1,1,'2026-01-01');INSERT INTO ${qa}.comments(id,photo_id,owner_hash,author,body,created_at) SELECT '00000000-0000-4000-8000-'||lpad(n::text,12,'0'),${q(id(1))},'a','合成评论作者','评论 '||n,'2026-10-19T03:00:00.000Z' FROM generate_series(10,89) n;INSERT INTO ${qa}.comment_likes VALUES(${q(id(10))},'a','2026-10-18T01:00:00Z'),(${q(id(11))},'b','2026-10-19T01:00:00Z');`);
  await sql(migration);
  const vote=(account,n,wanted)=>value(`SELECT ${qa}.set_comment_like(${q(account)},${q(id(n))},${wanted})`),page=(period='current',cursor=null)=>value(`SELECT ${qa}.comment_contest_page(${q(period)},${cursor?q(JSON.stringify(cursor))+'::jsonb':'NULL'})`),clock=at=>sql(`UPDATE ${qa}.qa_clock SET now_at=${q(at)}::timestamptz`);
  assert.equal(Number((await page()).total),1,'Existing current-week votes count');
  assert.equal((await vote('a',10,true)).likeCount,2,'Old comment can receive a fresh weekly vote');assert.equal((await vote('a',10,true)).likeCount,2);
  assert.equal((await vote('b',10,true)).weeklyCount,2);assert.equal((await vote('a',10,false)).likeCount,2,'Only this week is cancelled');assert.equal((await vote('a',10,true)).weeklyCount,2);
  const before=await page();assert.equal(before.entries[0].comment_id,id(10));
  await clock('2026-10-25T16:00:01Z');await vote('b',10,false);const past=await page('previous');assert.equal(Number(past.entries[0].weekly_votes),2);assert.equal((await page()).total,0);
  assert.equal((await vote('a',10,true)).likeCount,4);assert.equal((await vote('a',10,true)).weeklyCount,1);
  await value(`SELECT ${qa}.link_accounts('a','b')`);assert.equal((await vote('b',10,true)).likeCount,3,'Link deduplicates within each week');
  await value(`SELECT ${qa}.unlink_account('b','a','qa_a|qa_b')`);assert.equal((await vote('b',10,true)).likeCount,3,'Unlink retains weekly history');assert.equal(JSON.stringify(await page('previous')),JSON.stringify(past),'Historical scores are fixed');
  await sql(`SELECT ${qa}.set_comment_like('b',id,true) FROM ${qa}.comments`);
  const first=await page();assert.equal(first.total,80);assert.equal(first.entries.length,51);const second=await page('current',{week:first.week,period:'current',rank:50});assert.equal(second.entries.length,30);assert.equal(Number(second.entries[0].rank),51);
  assert.equal((await page('total')).total,80);assert((await page('current',{week:'stale',period:'current',rank:1})).stale);
  await sql(migration);assert.equal((await page()).total,80,'Migration is idempotent');assert.equal((await vote('missing',10,true)).unauthorized,true);
  await sql(`DELETE FROM ${qa}.comments WHERE id=${q(id(10))}`);assert.equal((await page()).total,79);assert(!(await page('previous')).entries.some(entry=>entry.comment_id===id(10)),'Deleted comment removed from snapshots');
  await sql(`ALTER TABLE ${qa}.qa_clock ADD COLUMN ticks integer DEFAULT 0;CREATE OR REPLACE FUNCTION ${qa}.test_now() RETURNS timestamptz LANGUAGE plpgsql VOLATILE AS $$DECLARE n integer;BEGIN UPDATE ${qa}.qa_clock SET ticks=ticks+1 RETURNING ticks INTO n;RETURN CASE WHEN n=1 THEN '2026-11-01T15:59:59.999Z'::timestamptz ELSE '2026-11-01T16:00:00.001Z'::timestamptz END;END $$;`);
  await vote('b',11,false);assert.equal(Number(await value(`SELECT ticks FROM ${qa}.qa_clock`)),1,'One vote has one cutoff');const boundary=await page('previous');assert(!boundary.entries.some(entry=>entry.comment_id===id(11)),'Last cancellation precedes sealing');
  fs.writeFileSync('verification-comment-contest-db.json',JSON.stringify({checkedAt:new Date().toISOString(),oldVotesPreserved:true,weeklyRelike:true,oneVotePerLinkedIdentity:true,onlyCurrentWeekCancelled:true,historyFrozen:true,pagination80:true,totalLeaderboard:true,migrationIdempotent:true,deletionSafe:true,midnightSingleCutoff:true,productionDataWritten:false,isolatedSchemaCleaned:true,passed:true},null,2));console.log('PASS weekly comment voting, current/previous/total boards, links, pagination and midnight');
 }finally{if(created){assert(/^class7_words_qa_[0-9a-f]{10}$/.test(qa));await sql(`DROP SCHEMA IF EXISTS ${qa} CASCADE`);}}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
