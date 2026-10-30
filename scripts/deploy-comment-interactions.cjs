// Deploy already-built static assets first, then the API that references them.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
(async()=>{
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root});
 const env={...process.env,TENCENTCLOUD_SECRETID:c.secretId,TENCENTCLOUD_SECRETKEY:c.secretKey,TENCENTCLOUD_SESSIONTOKEN:c.token||'',TENCENTCLOUD_TOKEN:c.token||''};
 const cli=require('./cli-path.cjs'),environment='class7-memory-d0gcpjaqu47530c54';
 const steps=[
  ['hosting','deploy','hosting','-e',environment,'--verify','--json'],
  ['fn','deploy','class7-photo-api','--httpFn','--force','--install-dependency','true','--deployMode','zip','--yes','--json','--config-file','.private/cloudbaserc.json']
 ];
 for(const args of process.env.CLASS7_DEPLOY_FUNCTION_ONLY==='1'?steps.slice(1):steps){
  const r=spawnSync(process.execPath,[cli,...args],{env,stdio:'inherit'});
  if(r.status!==0)throw Error('CloudBase deployment failed (exit '+r.status+')');
 }
 console.log('Comment interaction release deployed to '+environment);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
