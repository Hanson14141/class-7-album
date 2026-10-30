// Idempotent, free-tier migration. Keeps existing photos, accounts and comments.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
process.chdir(root);
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root});
 const C=require('@cloudbase/manager-node');
 const manager=new(C.default||C)({envId:'class7-memory-d0gcpjaqu47530c54',region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 const linking=fs.readFileSync('account-linking.sql','utf8');
 const start=linking.indexOf('CREATE OR REPLACE FUNCTION class7_test.unlink_account(');
 if(start<0||!linking.slice(start).includes('comment_likes'))throw Error('Linked-account migration integration missing');
 const migration=fs.readFileSync('comment-interactions.sql','utf8');
 const sql='BEGIN;\n'+migration+'\n'+linking.slice(start)+'\nCOMMIT;';
 await manager.database.executePGSql({Sql:sql});
 const checked=await manager.database.executePGSql({Sql:"SELECT count(*) AS n FROM class7_test.comments"});
 const parsed=JSON.parse(checked.Rows[0]),row=Array.isArray(parsed)?parsed[0]:parsed;
 console.log('Comment replies, private likes and reply inbox installed; existing comments: '+Number(row.n||0));
})().catch(e=>{console.error('Migration failed:',e.message);process.exitCode=1;});
