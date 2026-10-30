// Explicit deployment only. Never invoke from build or install hooks.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const plan=JSON.parse(fs.readFileSync(path.join(root,'src/dungeon-service/deployment-plan.json'),'utf8'));
 if(plan.environment!=='class7-memory-d0gcpjaqu47530c54'||plan.serverConfig.MaxNum!==1||plan.serverConfig.Cpu!==0.25||plan.serverConfig.Mem!==0.5)throw Error('Review the authorized deployment plan');
 const cred=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root});
 const Manager=require('@cloudbase/manager-node');
 const manager=new (Manager.default||Manager)({envId:plan.environment,region:plan.region,secretId:cred.secretId,secretKey:cred.secretKey,token:cred.token});
 const billing=await manager.env.describeBillingInfo({EnvId:plan.environment});
 const item=billing.EnvBillingInfoList.find(x=>x.EnvId===plan.environment);
 if(!item||item.EnableOverrun!==false)throw Error('Stop: overrun billing must be disabled first');
 const result=await manager.cloudrun.deploy({serverName:plan.serviceName,targetPath:path.join(root,'src/dungeon-service'),deployInfo:{ReleaseType:'FULL'},serverConfig:{...plan.serverConfig,Dockerfile:'Dockerfile',BuildDir:'',InstallDependency:false}});
 fs.writeFileSync(path.join(root,'deployment-dungeon-cloud.json'),JSON.stringify({submittedAt:new Date().toISOString(),plan,result},null,2));
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
