// Owner-operated metadata only. Input: [{photoId:"UUID",rarity:"legendary"}].
// Keep the real catalog in an ignored local file, not in the source archive.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'cloudbaserc.json'),'utf8'));
if(config.envId!=='class7-memory-d0gcpjaqu47530c54')throw Error('Verify the target environment before adapting this script');
if(!process.argv[2])throw Error('Usage: node scripts/set-photo-rarity.cjs /absolute/path/to/private-catalog.json');
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(!Array.isArray(input)||!input.length||input.length>1000)throw Error('Expected 1–1000 catalog entries');
const entries=new Map();
for(const x of input){if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x.photoId)||!['common','epic','legendary','classified'].includes(x.rarity))throw Error('Invalid photoId or rarity');if(entries.has(x.photoId)&&entries.get(x.photoId)!==x.rarity)throw Error('Conflicting rarity');entries.set(x.photoId,x.rarity);}
const values=[...entries].map(([id,tier])=>"('"+id+"','"+tier+"')").join(',');
const sql="BEGIN;CREATE TEMP TABLE tier_input(photo_id text,rarity text) ON COMMIT DROP;INSERT INTO tier_input VALUES "+values+";DO $$ BEGIN IF EXISTS(SELECT 1 FROM tier_input t LEFT JOIN class7_test.photos p ON p.id=t.photo_id WHERE p.id IS NULL) THEN RAISE EXCEPTION 'Catalog contains unavailable photos';END IF;END $$;INSERT INTO class7_test.photo_rarities SELECT * FROM tier_input ON CONFLICT(photo_id) DO UPDATE SET rarity=excluded.rarity;COMMIT;";
const result=spawnSync(process.execPath,[path.join(__dirname,'execute-sql.cjs'),config.envId],{input:sql,encoding:'utf8',maxBuffer:1000000});
if(result.status!==0){console.error(result.stderr||result.stdout||'Classification failed');process.exit(result.status||1);}
console.log('Updated rarity for '+entries.size+' photos; original files and ownership unchanged');
