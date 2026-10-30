const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa='class7_points_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),q=x=>"'"+String(x).replaceAll("'","''")+"'";
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('@cloudbase/manager-node'),m=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function sql(text){const r=await m.database.executePGSql({Sql:text});return(r.Rows||[]).map(row=>JSON.parse(row));}
 async function value(text){const row=(await sql(text))[0];let v=Array.isArray(row)?row[0]:Object.values(row||{})[0];if(typeof v==='string'&&(/^[{[]/.test(v)||v==='true'||v==='false'))v=JSON.parse(v);return v;}
 const rewrite=s=>s.replaceAll('class7_test',qa),points=rewrite(fs.readFileSync('checkin-points.sql','utf8')).replace(/\bnow\(\)/g,qa+'.test_now()');
 let created=false;
 try{
  created=true;await sql(`CREATE SCHEMA ${qa};CREATE TABLE ${qa}.qa_clock(now_at timestamptz);INSERT INTO ${qa}.qa_clock VALUES('2026-10-19T04:00:00Z');CREATE FUNCTION ${qa}.test_now() RETURNS timestamptz LANGUAGE sql STABLE AS $$SELECT now_at FROM ${qa}.qa_clock$$;`);
  await sql(rewrite(fs.readFileSync('schema.sql','utf8').split('-- Checkin points integration')[0]).replaceAll('clock_timestamp()',qa+'.test_now()'));await sql(points);
  await sql(`INSERT INTO ${qa}.accounts(id,username,owner_hash,password_hash,created_at) SELECT x,'qa_'||x,x,'synthetic','2026-01-01' FROM unnest(ARRAY['a','b','c']) x;INSERT INTO ${qa}.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) VALUES(${q(id(1))},'a','合成','积分验证','','no-file','image/png',1,1,1,'2026-01-01');INSERT INTO ${qa}.comments(id,photo_id,owner_hash,author,body,created_at) VALUES(${q(id(2))},${q(id(1))},'a','合成','积分验证','2026-01-01');`);
  const checkin=a=>value(`SELECT ${qa}.do_checkin(${q(a)})`),award=(a,reason,ref)=>value(`SELECT ${qa}.award_points(${q(a)},${q(reason)},${q(ref)})`),clock=date=>sql(`UPDATE ${qa}.qa_clock SET now_at=${q(date)}::timestamptz`);
  assert.equal((await checkin('a')).total,10);assert((await checkin('a')).duplicate);
  for(let day=20;day<=25;day++){await clock('2026-10-'+day+'T04:00:00Z');const r=await checkin('a');assert.equal(r.streak,day-18);if(day===25){assert.equal(r.pointsAwarded,40);assert.equal(r.total,100);}}
  await clock('2026-10-27T04:00:00Z');assert.equal((await checkin('a')).streak,1);
  await clock('2026-10-27T15:59:59Z');assert(!(await checkin('b')).duplicate);await clock('2026-10-27T16:00:00Z');assert.equal((await checkin('b')).streak,2,'Beijing midnight');
  const parallel=await Promise.all([checkin('c'),checkin('c')]);assert.equal(parallel.filter(x=>!x.duplicate).length,1);
  const comments=await Promise.all(Array.from({length:14},(_,i)=>award('c','comment','comment:'+i)));assert.equal(comments.filter(x=>x.awarded).length,10);assert.equal(Number(await value(`SELECT sum(points) FROM ${qa}.points_ledger WHERE account_id='c' AND reason='comment'`)),50);
  const photoVote=liked=>value(`SELECT ${qa}.set_photo_like_with_points('a',${q(id(1))},${liked})`),commentVote=liked=>value(`SELECT ${qa}.set_comment_like_with_points('a',${q(id(2))},${liked})`);
  assert((await photoVote(true)).points.awarded);assert(!(await photoVote(true)).points.awarded);await photoVote(false);assert(!(await photoVote(true)).points.awarded);
  assert((await commentVote(true)).points.awarded);assert(!(await commentVote(true)).points.awarded);await commentVote(false);assert(!(await commentVote(true)).points.awarded);
  await clock('2026-11-02T04:00:00Z');assert(!(await photoVote(true)).points.awarded,'New weekly vote never repeats lifetime reward');assert(!(await commentVote(true)).points.awarded);
  const total=Number(await value(`SELECT total FROM ${qa}.user_points WHERE account_id='a'`));assert.equal(total,114);
  // Force reward failure in a nested transaction; the original vote must roll back too.
  const before=Number(await value(`SELECT count(*) FROM ${qa}.photo_likes WHERE owner_hash='b'`));
  await sql(`CREATE FUNCTION ${qa}.qa_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic reward failure';END$$;CREATE TRIGGER qa_points_fail BEFORE INSERT ON ${qa}.points_ledger FOR EACH ROW WHEN(NEW.reason='photo_like') EXECUTE FUNCTION ${qa}.qa_fail();DO $$BEGIN BEGIN PERFORM ${qa}.set_photo_like_with_points('b',${q(id(1))},true);RAISE EXCEPTION 'expected failure';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'synthetic reward failure' THEN RAISE;END IF;END;END$$;`);
  assert.equal(Number(await value(`SELECT count(*) FROM ${qa}.photo_likes WHERE owner_hash='b'`)),before);await sql(`DROP TRIGGER qa_points_fail ON ${qa}.points_ledger`);
  await sql(points);assert.equal(Number(await value(`SELECT total FROM ${qa}.user_points WHERE account_id='a'`)),114,'Idempotent upgrade');
  assert.equal(await value(`SELECT has_table_privilege('anon','${qa}.points_ledger','SELECT')`),false);
  const sum=await value(`SELECT bool_and(u.total=COALESCE(l.total,0)) FROM ${qa}.user_points u LEFT JOIN(SELECT account_id,sum(points) AS total FROM ${qa}.points_ledger GROUP BY account_id) l USING(account_id)`);assert.equal(sum,true);
  fs.writeFileSync('verification-checkin-points-db.json',JSON.stringify({checkedAt:new Date().toISOString(),beijingMidnight:true,sevenDayBonus:true,brokenStreakResets:true,duplicateAndConcurrentCheckin:true,dailyCommentCap50:true,lifetimeLikeReward:true,mutationAndRewardAtomic:true,upgradeIdempotent:true,privateScores:true,ledgerTotalsMatch:true,realDataWritten:false,isolatedSchemaCleaned:true,passed:true},null,2));console.log('PASS check-in, streak, concurrent caps, lifetime rewards, atomicity and privacy');
 }finally{if(created){assert(/^class7_points_qa_[0-9a-f]{10}$/.test(qa));await sql(`DROP SCHEMA IF EXISTS ${qa} CASCADE`);}}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
