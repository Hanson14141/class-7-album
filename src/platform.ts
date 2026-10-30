import CloudBase from '@cloudbase/manager-node';

function manager(){return new CloudBase({envId:process.env.CLASS7_ENV_ID,region:'ap-shanghai',secretId:process.env.TENCENTCLOUD_SECRETID,secretKey:process.env.TENCENTCLOUD_SECRETKEY,token:process.env.TENCENTCLOUD_SESSIONTOKEN||process.env.TENCENTCLOUD_TOKEN});}
export function bindQuery(sql:string,values:unknown[]){
  let index=0,quote=false,out='';
  for(let i=0;i<sql.length;i++){
    const ch=sql[i];
    if(ch==="'"){out+=ch;if(quote&&sql[i+1]==="'"){out+=sql[++i];continue;}quote=!quote;continue;}
    if(ch==='?'&&!quote){const value=values[index];if(index>=values.length)throw Error('Missing SQL parameter');if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Invalid integer');out+='$'+(++index)+(typeof value==='number'?'::bigint':'::text');}else out+=ch;
  }
  if(index!==values.length)throw Error('Unexpected SQL parameters');
  return {query:out,params:values};
}
export class Statement{
  constructor(public database:Database,public sql:string,public values:unknown[]=[]){ }
  bind(...values:unknown[]){return new Statement(this.database,this.sql,values);}
  async all(){return (await this.database.batch([this]))[0];}
  async first<T=Record<string,unknown>>(column?:string):Promise<T|null>{const r=await this.all();const row=r.results[0];return (row?(column?row[column]:row):null) as T|null;}
  async run(){return this.all();}
}
export class Database{
  prepare(sql:string){return new Statement(this,sql);}
  async batch(statements:Statement[]){
    const payload=JSON.stringify(statements.map(s=>bindQuery(s.sql,s.values)));
    // Hex encoding keeps the outer Cloud API SQL literal independent of user text.
    const hex=Buffer.from(payload).toString('hex');
    const result=await manager().database.executePGSql({Role:'service_role',Sql:`SELECT class7_test.execute_batch(convert_from(decode('${hex}','hex'),'UTF8')::jsonb) AS batch`});
    if(!result.Rows?.[0])throw Error('Empty database response');
    const row=JSON.parse(result.Rows[0]);let batch=Array.isArray(row)?row[0]:row.batch;
    if(typeof batch==='string')batch=JSON.parse(batch);
    if(!Array.isArray(batch))throw Error('Invalid database response');
    return batch;
  }
}
const storageOrigin=()=>`https://${process.env.CLASS7_ENV_ID}.api.tcloudbasegateway.com`;
const objectPath=(key:string)=>'/v1/storages/object/'+encodeURIComponent(process.env.CLASS7_STORAGE_BUCKET||'class7-test')+'/'+key.split('/').map(encodeURIComponent).join('/');
function storageHeaders(extra:Record<string,string>={}){if(!process.env.CLASS7_STORAGE_KEY)throw Error('Storage configuration missing');return {Authorization:'Bearer '+process.env.CLASS7_STORAGE_KEY,...extra};}
async function storageRequest(key:string,init:RequestInit={}){return fetch(storageOrigin()+objectPath(key),{...init,headers:storageHeaders(init.headers as Record<string,string>||{}),signal:AbortSignal.timeout(60000)});}
const signedCache=new Map<string,{url:string,until:number}>();
const pendingSigns=new Map<string,Promise<string>>(),signWaiters:Array<()=>void>=[];let activeSigns=0;
function cachedObjectUrl(key:string){
 const cached=signedCache.get(key);if(!cached)return null;
 if(cached.until<=Date.now()){signedCache.delete(key);return null;}
 signedCache.delete(key);signedCache.set(key,cached);return cached.url;
}
async function signingSlot<T>(operation:()=>Promise<T>):Promise<T>{
 if(activeSigns<3)activeSigns++;else await new Promise<void>(resolve=>signWaiters.push(resolve));
 try{return await operation();}finally{const next=signWaiters.shift();if(next)next();else activeSigns--;}
}
async function signedObjectUrl(key:string,upload=false):Promise<string>{
 const cached=upload?null:cachedObjectUrl(key);if(cached)return cached;
 const operationKey=(upload?'upload:':'read:')+key,existing=pendingSigns.get(operationKey);if(existing)return existing;
 const work=signingSlot(async()=>{
  const endpoint=objectPath(key).replace('/object/','/object/'+(upload?'upload/sign/':'sign/'));
  for(let attempt=0;;attempt++){
   const result=await fetch(storageOrigin()+endpoint,{method:'POST',headers:storageHeaders({'Content-Type':'application/json','x-upsert':'false'}),body:JSON.stringify({expiresIn:3600}),signal:AbortSignal.timeout(10000)});
   if(!result.ok){const retryable=result.status===429||[500,502,503,504].includes(result.status);await result.body?.cancel();if(retryable&&attempt<2){await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));continue;}throw Error('Storage signing HTTP '+result.status);}
   const data=await result.json();const value=upload?(data.fullURL||data.url):(data.fullSignedURL||data.signedURL);
   if(typeof value!=='string')throw Error('Missing signed object URL');
   const url=new URL(value,storageOrigin());if(url.origin!==storageOrigin())throw Error('Unexpected storage host');
   if(!upload){signedCache.set(key,{url:url.href,until:Date.now()+50*60000});while(signedCache.size>800)signedCache.delete(signedCache.keys().next().value!);}
   return url.href;
  }
 }).finally(()=>pendingSigns.delete(operationKey));pendingSigns.set(operationKey,work);return work;
}
export const env={DB:new Database(),BUCKET:{
  cachedUrl:cachedObjectUrl,
  signedUrl:(key:string)=>signedObjectUrl(key),
  signUpload:(key:string)=>signedObjectUrl(key,true),
  async head(key:string){const result=await storageRequest(key,{method:'HEAD'});if(result.status===404)return null;if(!result.ok)throw Error('Storage metadata HTTP '+result.status);return {size:Number(result.headers.get('Content-Length')),mime:result.headers.get('Content-Type')?.split(';')[0]};},
  async put(key:string,body:ReadableStream,options?:{httpMetadata?:{contentType?:string}}){
    let size=0;const meter=new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){size+=chunk.byteLength;controller.enqueue(chunk);}});
    const result=await storageRequest(key,{method:'POST',headers:{'Content-Type':options?.httpMetadata?.contentType||'application/octet-stream','x-upsert':'false'},body:body.pipeThrough(meter),duplex:'half'} as RequestInit);
    if(!result.ok)throw Error('Storage upload HTTP '+result.status);
    return {size,fileID:key};
  },
  async get(key:string){
    const result=await storageRequest(key);
    if(result.status===404)return null;
    if(!result.ok)throw Error('Storage download HTTP '+result.status);
    const length=result.headers.get('Content-Length');if(length===null)throw Error('Missing storage length');
    return {size:Number(length),body:result.body,httpEtag:result.headers.get('ETag')||'"'+key.replace(/[^a-zA-Z0-9-]/g,'')+'"'};
  },
  async delete(key:string){const result=await storageRequest(key,{method:'DELETE'});if(!result.ok&&result.status!==404)throw Error('Storage delete HTTP '+result.status);signedCache.delete(key);}
}};
