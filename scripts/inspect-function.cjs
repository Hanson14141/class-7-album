const {spawnSync}=require('node:child_process');const path=require('node:path');
const cli=require('./cli-path.cjs');
const r=spawnSync(process.execPath,[cli,'fn','detail','class7-photo-api','-e','class7-memory-d0gcpjaqu47530c54','--json'],{encoding:'utf8'});
if(r.status!==0)throw Error('Function detail unavailable');
const value=JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
function walk(x,p=''){if(!x||typeof x!=='object')return;for(const [k,v]of Object.entries(x)){if(/environment|variable|secret|key|code|url/i.test(k))continue;if(/concurr|qps|limit|state|runtime|memory|type|status|name|time/i.test(k))console.log(p+k,JSON.stringify(v).slice(0,200));else if(typeof v==='object')walk(v,p+k+'.');}}
walk(value);
