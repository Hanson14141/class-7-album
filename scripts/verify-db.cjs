const{spawnSync}=require('node:child_process');const path=require('node:path');
const cli=require('./cli-path.cjs');
const authQuery='INSERT INTO auth_limits(key,window_start,hits) VALUES($1::text,$2::bigint,1) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN auth_limits.window_start<$3::bigint THEN 1 ELSE auth_limits.hits+1 END,window_start=CASE WHEN auth_limits.window_start<$4::bigint THEN excluded.window_start ELSE auth_limits.window_start END RETURNING hits';
const payload=JSON.stringify([
 {query:authQuery,params:['class7-synthetic-auth-check',1000,0,0]},
 {query:authQuery,params:['class7-synthetic-auth-check',1000,0,0]},
 {query:'DELETE FROM auth_limits WHERE key=$1::text',params:['class7-synthetic-auth-check']},
 {query:'INSERT INTO photo_name_counters(nickname,last_number) VALUES($1::text,$2::bigint) ON CONFLICT(nickname) DO UPDATE SET last_number=photo_name_counters.last_number+1',params:['class7-synthetic-db-check',1]},
 {query:'SELECT last_number FROM photo_name_counters WHERE nickname=$1::text',params:['class7-synthetic-db-check']},
 {query:'DELETE FROM photo_name_counters WHERE nickname=$1::text',params:['class7-synthetic-db-check']}
]);
const sql=`SELECT class7_test.execute_batch(convert_from(decode('${Buffer.from(payload).toString('hex')}','hex'),'UTF8')::jsonb)`;
const r=spawnSync(process.execPath,[cli,'db','execute','-e','class7-memory-d0gcpjaqu47530c54','--role','service_role','--sql',sql,'--json'],{encoding:'utf8'});process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status;
