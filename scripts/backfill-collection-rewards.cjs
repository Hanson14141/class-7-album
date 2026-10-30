// Explicit owner-authorized data operation. Never run automatically during deploy.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),campaign='collection-rewards-backfill-20261021-001';process.chdir(root);
(async()=>{
 const config=JSON.parse(fs.readFileSync('cloudbaserc.json','utf8'));
 if(config.envId!=='class7-memory-d0gcpjaqu47530c54')throw Error('Unauthorized target');
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root}),C=require('@cloudbase/manager-node'),m=new(C.default||C)({envId:config.envId,region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 const sql=`BEGIN;
 SELECT pg_advisory_xact_lock(72407180371002);
 DO $op$ DECLARE v_account record;before_json jsonb;after_json jsonb;rewards jsonb:='[]'::jsonb;bonus integer;
 BEGIN
 IF EXISTS(SELECT 1 FROM class7_test.admin_card_adjustments WHERE campaign='${campaign}')THEN RETURN;END IF;
 SELECT jsonb_agg(jsonb_build_object('accountId',a.id,'total',COALESCE(p.total,0),'collected',(SELECT count(DISTINCT photo_id)FROM class7_test.mall_photo_inventory i WHERE i.account_id=a.id)))INTO before_json FROM class7_test.accounts a LEFT JOIN class7_test.user_points p ON p.account_id=a.id;
 FOR v_account IN SELECT id FROM class7_test.accounts ORDER BY id LOOP
  bonus:=class7_test.award_collection_rewards(v_account.id);
  IF bonus>0 THEN rewards:=rewards||jsonb_build_array(jsonb_build_object('accountId',v_account.id,'points',bonus));END IF;
 END LOOP;
 SELECT jsonb_agg(to_jsonb(p))INTO after_json FROM class7_test.user_points p;
 INSERT INTO class7_test.admin_card_adjustments(campaign,before_state,result)VALUES('${campaign}',before_json,
  jsonb_build_object('recipients',jsonb_array_length(rewards),'totalPoints',(SELECT COALESCE(sum((r->>'points')::integer),0)FROM jsonb_array_elements(rewards)r),'grants',rewards,'afterPoints',after_json,'rule','20 points per 20 distinct inventory photos; each block once'));
 END $op$;
 COMMIT;
 SELECT jsonb_build_object('campaign',campaign,'createdAt',created_at,'beforeState',before_state,'result',result)FROM class7_test.admin_card_adjustments WHERE campaign='${campaign}';`;
 const raw=await m.database.executePGSql({Sql:sql});const row=JSON.parse(raw.Rows[0]);let receipt=Array.isArray(row)?row[0]:Object.values(row)[0];if(typeof receipt==='string')receipt=JSON.parse(receipt);
 fs.mkdirSync('.private',{recursive:true});fs.writeFileSync('.private/'+campaign+'-receipt.json',JSON.stringify(receipt,null,2));
 console.log(JSON.stringify({campaign,recipients:receipt.result.recipients,totalPoints:receipt.result.totalPoints,receiptSavedPrivately:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
