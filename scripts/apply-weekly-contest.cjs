const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json'))),cli=require('./cli-path.cjs');
if(config.envId!=='class7-memory-d0gcpjaqu47530c54')throw Error('Confirm the deployment environment before applying this migration');
const linking=fs.readFileSync(path.join(root,'account-linking.sql'),'utf8'),start=linking.indexOf('CREATE OR REPLACE FUNCTION class7_test.unlink_account(');
if(start<0||!linking.slice(start).includes('photo_like_history'))throw Error('Weekly history unlink integration missing');
const likes=fs.readFileSync(path.join(root,'photo-likes.sql'),'utf8'),likeStart=likes.indexOf('CREATE OR REPLACE FUNCTION class7_test.set_photo_like('),likeEnd=likes.indexOf('CREATE OR REPLACE FUNCTION class7_test.unlink_account(',likeStart);
if(likeStart<0||likeEnd<0)throw Error('Like function integration missing');
const sql='BEGIN;\nLOCK TABLE class7_test.account_owner_links,class7_test.photos,class7_test.photo_likes IN ACCESS EXCLUSIVE MODE;\n'+fs.readFileSync(path.join(root,'weekly-contest.sql'),'utf8')+'\n'+likes.slice(likeStart,likeEnd)+'\n'+linking.slice(start)+'\nCOMMIT;';
const result=spawnSync(process.execPath,[cli,'db','execute','-e',config.envId,'--sql',sql,'--json'],{encoding:'utf8',maxBuffer:200000});
if(result.status!==0){console.error('Weekly contest setup failed; transaction rolled back');process.exit(result.status||1);}
console.log('Applied private weekly contest records and vote history; existing photos, votes and links preserved');
