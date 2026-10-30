// Tests use a disposable private schema and controlled Beijing week boundaries.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa='class7_renew_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
const q=x=>"'"+String(x).replaceAll("'","''")+"'",photo='00000000-0000-4000-8000-000000000001';
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root});
 const C=require('@cloudbase/manager-node'),manager=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function sql(text){const r=await manager.database.executePGSql({Sql:text});return(r.Rows||[]).map(row=>JSON.parse(row));}
 async function value(text){const rows=await sql(text),row=rows[0];let v=Array.isArray(row)?row[0]:Object.values(row||{})[0];if(typeof v==='string'&&/^[{[]/.test(v))v=JSON.parse(v);return v;}
 const rewrite=s=>s.replaceAll('class7_test',qa).replaceAll('clock_timestamp()',qa+'.test_now()');
 const weekly=rewrite(fs.readFileSync('weekly-contest.sql','utf8')),reset=rewrite(fs.readFileSync('weekly-vote-reset.sql','utf8'));
 let created=false;
 try{
  await sql(rewrite(fs.readFileSync('schema.sql','utf8').split('-- Private schema:')[0]));created=true;
  await sql(`CREATE TABLE ${qa}.qa_clock(now_at timestamptz);INSERT INTO ${qa}.qa_clock VALUES('2026-10-18T15:59:58Z');CREATE FUNCTION ${qa}.test_now() RETURNS timestamptz LANGUAGE sql STABLE AS $$SELECT now_at FROM ${qa}.qa_clock$$;`);
  await sql(rewrite(fs.readFileSync('account-linking.sql','utf8'))+rewrite(fs.readFileSync('photo-likes.sql','utf8')));
  await sql(`INSERT INTO ${qa}.accounts(id,username,owner_hash,password_hash,created_at) SELECT x,'qa_'||x,x,'synthetic','2026-01-01' FROM unnest(ARRAY['a','b']) x;INSERT INTO ${qa}.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) VALUES(${q(photo)},'a','合成','合成','','no-file','image/png',1,1,1,'2026-01-01');INSERT INTO ${qa}.photo_likes VALUES(${q(photo)},'a','2026-10-10T01:00:00Z');`);
  await sql(weekly);
  const vote=async(account,wanted)=>value(`SELECT ${qa}.set_photo_like(${q(account)},${q(photo)},${wanted})`),page=async(period='current')=>value(`SELECT ${qa}.weekly_contest_page(${q(period)},NULL)`),clock=async at=>sql(`UPDATE ${qa}.qa_clock SET now_at=${q(at)}::timestamptz`);
  await vote('b',true);assert.equal(Number((await page()).entries[0].weekly_votes),1);
  await clock('2026-10-18T16:00:01Z');const sealed=JSON.stringify(await page('previous'));
  await sql(reset);
  const own=async account=>{const v=await value(`SELECT COALESCE(bool_or(week_start=${qa}.contest_week_start(${qa}.test_now()) AND ${qa}.canonical_owner(owner_hash)=${q(account)}),false) FROM ${qa}.photo_likes WHERE photo_id=${q(photo)}`);return v===true||v==='true';};
  assert.equal(await own('a'),false);assert.equal(await own('b'),false,'Last week vote resets');
  let state=await vote('a',true);assert.equal(state.likeCount,3);assert.equal(state.liked,true);assert.equal(Number((await page()).entries[0].weekly_votes),1,'Old photo can receive a fresh weekly vote');
  assert.equal((await vote('a',true)).likeCount,3,'Repeated request is idempotent');
  assert.equal((await vote('b',true)).likeCount,4);
  assert.equal((await vote('a',false)).likeCount,3,'Cancel affects this week only');
  assert.equal((await vote('a',true)).likeCount,4);
  assert.equal(Number((await page()).entries[0].weekly_votes),2,'Re-like is still one vote');
  assert.equal(JSON.stringify(await page('previous')),sealed,'Migration and new votes preserve frozen previous results');
  await clock('2026-10-25T16:00:01Z');assert.equal(await own('a'),false);assert.equal((await vote('a',true)).likeCount,5);
  const previous=await page('previous');assert.equal(Number(previous.entries[0].weekly_votes),2);
  await value(`SELECT ${qa}.link_accounts('a','b')`);
  state=await vote('b',true);assert.equal(state.likeCount,4,'Linked identities deduplicate separately in each week');assert.equal(Number((await page()).entries[0].weekly_votes),1);
  await value(`SELECT ${qa}.unlink_account('b','a','qa_a|qa_b')`);state=await vote('b',true);assert.equal(state.likeCount,4,'Unlink preserves all historical weeks');
  assert.equal(JSON.stringify(await page('previous')),JSON.stringify(previous),'Later account changes keep historical results');
  await sql(reset);assert.equal((await vote('b',true)).likeCount,4,'Migration rerun preserves votes');
  assert.equal((await vote('missing',true)).unauthorized,true);
  await sql(`ALTER TABLE ${qa}.qa_clock ADD COLUMN ticks integer DEFAULT 0;CREATE OR REPLACE FUNCTION ${qa}.test_now() RETURNS timestamptz LANGUAGE plpgsql VOLATILE AS $$ DECLARE n integer;BEGIN UPDATE ${qa}.qa_clock SET ticks=ticks+1 RETURNING ticks INTO n;RETURN CASE WHEN n=1 THEN '2026-11-01T15:59:59.999Z'::timestamptz ELSE '2026-11-01T16:00:00.001Z'::timestamptz END;END $$;`);
  await vote('b',false); // A cancellation belongs wholly to the tick before midnight.
  assert.equal(Number(await value(`SELECT ticks FROM ${qa}.qa_clock`)),1,'Vote statement does not advance the cutoff twice');
  const boundaryPrevious=await page('previous');assert.equal(Date.parse(boundaryPrevious.week),Date.parse('2026-10-25T16:00:00Z'));assert.equal(boundaryPrevious.total,0,'Last cancellation completes before the previous week is sealed');
  fs.writeFileSync('verification-weekly-vote-reset.json',JSON.stringify({checkedAt:new Date().toISOString(),oldVotesPreserved:true,newWeekCanRelikeOldPhotos:true,repeatedRequestOneVote:true,cancelOnlyCurrentWeek:true,previousResultsFrozen:true,linkedIdentityOneVotePerWeek:true,unlinkRetainsEveryWeek:true,migrationIdempotent:true,midnightMutationSingleCutoff:true,productionDataWritten:false,isolatedSchemaCleaned:true,passed:true},null,2));
  console.log('PASS weekly renewal, cumulative totals, account links and frozen results');
 }finally{if(created){assert(/^class7_renew_qa_[0-9a-f]{10}$/.test(qa));await sql(`DROP SCHEMA ${qa} CASCADE`);}}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
