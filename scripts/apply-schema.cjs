const{spawnSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..'),cli=require('./cli-path.cjs');
const sql=fs.readFileSync(path.join(root,'schema.sql'),'utf8');
const r=spawnSync(process.execPath,[cli,'db','execute','-e','class7-memory-d0gcpjaqu47530c54','--sql',sql,'--json'],{encoding:'utf8'});
process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status;
