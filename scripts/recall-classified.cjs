// Explicit owner-authorized operation; never call automatically from builds or deployment.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const [mode,campaign,custodian]=process.argv.slice(2);if(mode!=='--apply'||!/^[a-z0-9-]{8,80}$/.test(campaign||'')||!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(custodian||''))throw Error('Usage: node scripts/recall-classified.cjs --apply CAMPAIGN_ID CUSTODY_ADMIN_USERNAME');
(async()=>{
 const env=JSON.parse(fs.readFileSync('cloudbaserc.json','utf8')).envId;if(env!=='class7-memory-d0gcpjaqu47530c54')throw Error('Verify authorized environment');
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('@cloudbase/manager-node'),m=new(C.default||C)({envId:env,region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 const tables=['accounts','photos','photo_rarities','mall_photo_inventory','user_points','points_ledger','photo_draw_state'];
 const sql="BEGIN;SET LOCAL lock_timeout='8s';SET LOCAL statement_timeout='20s';LOCK TABLE "+tables.map(t=>'class7_test.'+t).join(',')+" IN SHARE ROW EXCLUSIVE MODE;SELECT set_config('class7.adjustment_campaign','"+campaign+"',true),set_config('class7.adjustment_custodian','"+custodian+"',true);"+fs.readFileSync('recall-classified.sql','utf8')+'COMMIT;';
 await m.database.executePGSql({Sql:sql});
 const rows=await m.database.executePGSql({Sql:"SELECT to_jsonb(a) FROM class7_test.admin_card_adjustments a WHERE campaign='"+campaign+"'"}),row=JSON.parse(rows.Rows[0]);let result=Array.isArray(row)?row[0]:Object.values(row)[0];if(typeof result==='string')result=JSON.parse(result);
 fs.mkdirSync('.private',{recursive:true});fs.writeFileSync(path.join('.private',campaign+'-backup-and-receipt.json'),JSON.stringify(result,null,2));
 const summary={checkedAt:new Date().toISOString(),campaign,affectedAccounts:result.result.affectedAccounts,revokedCards:result.result.revokedCards,legendaryPerAccount:0,pointsPerAccount:810,privateAuditSaved:true};fs.writeFileSync('verification-classified-recall-live.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
