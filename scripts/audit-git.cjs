const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),secrets=['storage-key.json','storage-key-before-release.json'].map(file=>path.join(root,'.private',file)).filter(file=>fs.existsSync(file)).map(file=>JSON.parse(fs.readFileSync(file)).token);
const r=spawnSync('git',['-c','safe.directory='+root,'ls-files','-z'],{cwd:root,encoding:'utf8'});assert.equal(r.status,0);
let count=0;for(const name of r.stdout.split('\0').filter(Boolean)){assert(!/(^|\/)\.private\//.test(name),'Private credentials are tracked');const file=path.join(root,name);if(fs.existsSync(file)){for(const secret of secrets)assert(!fs.readFileSync(file).includes(Buffer.from(secret)),'Service credential found in tracked file');count++;}}
console.log('PASS release audit: '+count+' tracked files; no private credentials');
