// Pass SQL in memory to the official CLI; avoids Windows command-line limits.
const fs=require('node:fs'),cli=require('./cli-path.cjs'),environment=process.argv[2];
if(!environment||!/^[a-z0-9-]+$/.test(environment))throw Error('A CloudBase environment ID is required');
const sql=fs.readFileSync(0,'utf8');if(!sql.trim())throw Error('SQL input is empty');
process.argv=[process.execPath,cli,'db','execute','-e',environment,'--sql',sql,'--json'];
require(cli);
