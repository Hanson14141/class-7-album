const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const envId='class7-memory-d0gcpjaqu47530c54';
 const c=await require('@cloudbase/toolbox').getCredentialWithoutCheck({cwd:root});
 const M=require('@cloudbase/manager-node');
 const m=new (M.default||M)({envId,region:'ap-shanghai',secretId:c.secretId,secretKey:c.secretKey,token:c.token});
 const status=await m.commonService('tcbr','2022-02-17').call({Action:'DescribeEnvBaseInfo',Param:{EnvId:envId}});
 const report={checkedAt:new Date().toISOString(),environment:status};
 try{
  const d=await m.cloudrun.detail({serverName:'class7-dungeon-relay'});
  // Keep operational information, excluding runtime environment variables.
  report.service={BaseInfo:d.BaseInfo,ServerConfig:{Cpu:d.ServerConfig?.Cpu,Mem:d.ServerConfig?.Mem,MinNum:d.ServerConfig?.MinNum,MaxNum:d.ServerConfig?.MaxNum,Port:d.ServerConfig?.Port,OpenAccessTypes:d.ServerConfig?.OpenAccessTypes},OnlineVersionInfos:d.OnlineVersionInfos,DeployInfo:d.DeployInfo};
 }catch(e){report.serviceError=e.message;}
 fs.writeFileSync(path.join(root,'verification-dungeon-cloud-status.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
