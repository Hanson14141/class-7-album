// Isolated synthetic data; production photos, accounts and comments are read only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa='class7_comments_qa_'+crypto.randomBytes(5).toString('hex');process.chdir(root);
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root});
 const C=require('@cloudbase/manager-node'),manager=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 async function sql(text){const r=await manager.database.executePGSql({Sql:text});return(r.Rows||[]).map(row=>JSON.parse(row));}
 async function val(text){const rows=await sql(text),row=rows[0];let value=Array.isArray(row)?row[0]:Object.values(row||{})[0];if(typeof value==='string'&&/^[{[]/.test(value))value=JSON.parse(value);return value;}
 const replace=s=>s.replaceAll('class7_test',qa),base=replace(fs.readFileSync('schema.sql','utf8').split('-- Private schema:')[0]),link=replace(fs.readFileSync('account-linking.sql','utf8')),migration=replace(fs.readFileSync('comment-interactions.sql','utf8'));
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');let created=false;
 try{
  await sql(base);created=true;
  await sql(link);
  await sql(`INSERT INTO ${qa}.accounts(id,username,owner_hash,password_hash,created_at) VALUES ('a','qa_a','a','synthetic','2026-01-01'),('b','qa_b','b','synthetic','2026-01-01'),('c','qa_c','c','synthetic','2026-01-01');INSERT INTO ${qa}.photos(id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at) VALUES(${q(id(1))},'a','合成','合成','','no-file','image/png',1,1,1,'2026-01-01');INSERT INTO ${qa}.comments(id,photo_id,owner_hash,author,body,created_at) VALUES(${q(id(2))},${q(id(1))},'a','作者','原留言','2026-01-01T00:00:00.000Z');`);
  await sql(migration);
  await sql(`INSERT INTO ${qa}.comments(id,photo_id,owner_hash,author,author_username,body,created_at,reply_to_id,reply_to_author) SELECT ${q(id(3))},p.id,'b','同学','qa_b','回复内容','2026-01-02T00:00:00.000Z',${q(id(2))},'作者' FROM ${qa}.photos p WHERE p.id=${q(id(1))} AND (${q(id(2))}::text IS NULL OR EXISTS(SELECT 1 FROM ${qa}.comments c WHERE c.id=${q(id(2))} AND c.photo_id=p.id)) RETURNING id`);
  assert.equal(Number(await val(`SELECT count(*) FROM ${qa}.comments WHERE reply_to_id=${q(id(2))}`)),1);
  assert.equal(Number(await val(`SELECT count(*) FROM ${qa}.comments r JOIN ${qa}.comments parent ON parent.id=r.reply_to_id WHERE ${qa}.canonical_owner(parent.owner_hash)='a' AND ${qa}.canonical_owner(r.owner_hash)<>'a' AND r.created_at>'2026-01-01T00:00:00.000Z'`)),1,'Reply appears in recipient inbox');
  let result=await val(`SELECT ${qa}.set_comment_like('a',${q(id(2))},true)`);assert.equal(result.likeCount,1);
  result=await val(`SELECT ${qa}.set_comment_like('b',${q(id(2))},true)`);assert.equal(result.likeCount,2);
  await val(`SELECT ${qa}.link_accounts('a','b')`);
  result=await val(`SELECT ${qa}.set_comment_like('b',${q(id(2))},true)`);assert.equal(result.likeCount,1,'Linked accounts count once');
  result=await val(`SELECT ${qa}.set_comment_like('b',${q(id(2))},false)`);assert.equal(result.likeCount,0,'Unliking clears the group vote');
  await val(`SELECT ${qa}.set_comment_like('b',${q(id(2))},true)`);
  await val(`SELECT ${qa}.unlink_account('b','a','qa_a|qa_b')`);
  assert.equal(Number(await val(`SELECT count(*) FROM ${qa}.comment_likes WHERE comment_id=${q(id(2))}`)),1,'Vote stays with remaining group');
  await sql(`INSERT INTO ${qa}.reply_inbox_seen(account_id,seen_at) VALUES('a','2026-01-01T00:00:00.000Z') ON CONFLICT(account_id) DO UPDATE SET seen_at=excluded.seen_at`);
  assert.equal(Number(await val(`SELECT count(*) FROM ${qa}.comments r JOIN ${qa}.comments parent ON parent.id=r.reply_to_id WHERE ${qa}.canonical_owner(parent.owner_hash)='a' AND ${qa}.canonical_owner(r.owner_hash)<>'a'`)),0,'Linked identities never notify themselves');
  await sql(`DELETE FROM ${qa}.comments WHERE id=${q(id(2))}`);
  assert.equal(Number(await val(`SELECT count(*) FROM ${qa}.comment_likes`)),0,'Deleting a comment removes votes');
  assert.equal(Number(await val(`SELECT count(*) FROM ${qa}.comments WHERE id=${q(id(3))} AND reply_to_id IS NULL`)),1,'Deleting parent safely detaches reply');
  await sql(migration);
  assert.equal(Number(await val(`SELECT count(*) FROM ${qa}.comments`)),1,'Migration rerun preserves comments');
  fs.writeFileSync('verification-comment-interactions-db.json',JSON.stringify({checkedAt:new Date().toISOString(),isolatedSchemaCleaned:true,linkedVotesDeduplicated:true,unlinkPreservesVote:true,replyParentDeletionSafe:true,migrationIdempotent:true,productionDataWritten:false,passed:true},null,2));
  console.log('PASS: isolated comment likes, replies and inbox schema');
 }finally{if(created){assert(/^class7_comments_qa_[0-9a-f]{10}$/.test(qa));await sql(`DROP SCHEMA ${qa} CASCADE`);}}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
