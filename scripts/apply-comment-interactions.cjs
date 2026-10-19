// Install private comment replies, votes and inbox in the configured environment.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json'),'utf8'));
if(config.envId!=='class7-memory-d0gcpjaqu47530c54')throw Error('Confirm the target CloudBase environment before applying this migration');
const linking=fs.readFileSync(path.join(root,'account-linking.sql'),'utf8'),start=linking.indexOf('CREATE OR REPLACE FUNCTION class7_test.unlink_account(');
if(start<0||!linking.slice(start).includes('comment_likes'))throw Error('Linked-account integration is missing');
const sql='BEGIN;\n'+fs.readFileSync(path.join(root,'comment-interactions.sql'),'utf8')+'\n'+linking.slice(start)+'\nCOMMIT;';
const cli=require('./cli-path.cjs');
const result=spawnSync(process.execPath,[cli,'db','execute','-e',config.envId,'--sql',sql,'--json'],{stdio:'inherit'});
if(result.status!==0)throw Error('Comment migration failed; database transaction rolled back');
console.log('Private comment replies, likes and inbox installed; existing data preserved');
