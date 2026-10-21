const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const result=spawnSync('git',['-c','safe.directory='+root,'-C',root,'ls-files','-z'],{encoding:'utf8'});let files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','.private','node_modules','public','hosting'].includes(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else files.push(path.relative(root,f).split(path.sep).join('/'));}}
if(result.status===0&&result.stdout.trim())files=result.stdout.split('\0').filter(Boolean);else walk(root);
for(const name of files){
 assert(!/(^|\/)(?:\.private|node_modules|\.git)(?:\/|$)/.test(name),'Private/runtime folder in source');
 assert(!/(^|\/)\.env(?:$|\.(?!example$))/.test(name),'Environment secret file in source');
 const text=fs.readFileSync(path.join(root,name)).toString();
 assert(!/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/.test(text),'JWT-like credential found');
 assert(!/\bAKID[A-Za-z0-9]{24,}\b/.test(text),'Tencent credential found');
 assert(!/-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----/.test(text),'Private key found');
}
console.log('PASS '+files.length+' source files; no private directories or common credential patterns');
