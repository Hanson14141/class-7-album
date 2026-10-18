import {env} from 'cloudflare:workers';
import {scryptAsync} from '@noble/hashes/scrypt.js';
import {chatGPTSignInPath} from '../app/chatgpt-auth';

export class AccountError extends Error{constructor(public status:number,message:string){super(message);}}
export type Account={id:string;username:string;owner_hash:string;password_hash:string};
const db=()=>{if(!env.DB)throw new AccountError(503,'账号服务尚未连接，请稍后重试。');return env.DB;};
const hex=(bytes:Uint8Array)=>[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
const unhex=(text:string)=>Uint8Array.from(text.match(/../g)||[],x=>parseInt(x,16));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export async function identityHash(seed:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(seed))));}
export async function browserOwner(request:Request){const key=request.headers.get('X-Device-Key')||'';if(!key)return null;if(!/^[a-f0-9]{64}$/.test(key))throw new AccountError(401,'浏览器身份凭证无效。');return identityHash('class7-device:'+key);}
export async function legacyOwners(request:Request){const result:string[]=[];const user=request.headers.get('oai-authenticated-user-id');if(user)result.push(await identityHash('class7-user:'+user));const browser=await browserOwner(request);if(browser)result.push(browser);return [...new Set(result)];}
const cookieName=(request:Request)=>new URL(request.url).protocol==='https:'?'__Host-class7_session':'class7_session';
function sessionToken(request:Request){const name=cookieName(request)+'=';return (request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name))?.slice(name.length)||'';}
export async function signedAccount(request:Request){const token=sessionToken(request);if(!/^[a-f0-9]{64}$/.test(token))return null;return db().prepare('SELECT a.id,a.username,a.owner_hash FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?').bind(await identityHash(token),Date.now()).first<Account>();}
export async function verifiedOwner(request:Request){const account=await signedAccount(request);if(account)return account.owner_hash;const user=request.headers.get('oai-authenticated-user-id');return user?identityHash('class7-user:'+user):browserOwner(request);}
export async function requireAccount(request:Request){const account=await signedAccount(request);if(!account)throw new AccountError(401,'请先登录照片集账号，登录后可跨设备管理照片。');return account;}
export async function requireAccountProfile(request:Request){
 const token=sessionToken(request);if(!/^[a-f0-9]{64}$/.test(token))throw new AccountError(401,'请先登录照片集账号，登录后可跨设备管理照片。');
 const row=await db().prepare('SELECT a.owner_hash,p.nickname FROM account_sessions s JOIN accounts a ON a.id=s.account_id LEFT JOIN profiles p ON p.device_hash=a.owner_hash WHERE s.token_hash=? AND s.expires_at>?').bind(await identityHash(token),Date.now()).first<{owner_hash:string;nickname:string|null}>();
 if(!row)throw new AccountError(401,'请先登录照片集账号，登录后可跨设备管理照片。');if(!row.nickname)throw new AccountError(401,'请先填写你的名字或昵称。');return {device_hash:row.owner_hash,nickname:row.nickname};
}
export async function accountState(request:Request){
 const account=await signedAccount(request);let legacyPhotos=0,legacyComments=0;
 for(const owner of await legacyOwners(request)){const rows=await db().batch([db().prepare('SELECT count(*) AS n FROM photos WHERE owner_hash=?').bind(owner),db().prepare('SELECT count(*) AS n FROM comments WHERE owner_hash=?').bind(owner)]);legacyPhotos+=Number((rows[0].results[0] as {n?:number}|undefined)?.n||0);legacyComments+=Number((rows[1].results[0] as {n?:number}|undefined)?.n||0);}
 return {signedIn:!!account,username:account?.username||'',legacyPhotos,legacyComments,legacySignInUrl:chatGPTSignInPath('/?restore=1')};
}
function username(value:unknown){if(typeof value!=='string')throw new AccountError(400,'请填写登录账号。');const name=value.trim().toLowerCase();if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(name))throw new AccountError(400,'账号用 3–32 位英文字母、数字、下划线、点或短横线，以字母或数字开头。');return name;}
function password(value:unknown){if(typeof value!=='string'||value.length<6||value.length>128)throw new AccountError(400,'密码请使用 6–128 个字符。');return value;}
let hashing=false;
async function passwordHash(value:string,salt=hex(crypto.getRandomValues(new Uint8Array(16)))){
 if(hashing)throw new AccountError(429,'账号服务正忙，请稍后再试。');
 hashing=true;try{const key=await scryptAsync(value,unhex(salt),{N:32768,r:8,p:3,dkLen:32,maxmem:48*1024*1024,asyncTick:10});return `scrypt$32768$8$3$${salt}$${hex(key)}`;}finally{hashing=false;}
}
async function passwordMatches(value:string,stored:string){const parts=stored.split('$');if(parts.length!==6||parts.slice(0,4).join('$')!=='scrypt$32768$8$3'||!/^[a-f0-9]{32}$/.test(parts[4])||!/^[a-f0-9]{64}$/.test(parts[5]))return false;const actual=(await passwordHash(value,parts[4])).split('$')[5];let mismatch=0;for(let i=0;i<actual.length;i++)mismatch|=actual.charCodeAt(i)^parts[5].charCodeAt(i);return mismatch===0;}
async function limit(request:Request,name:string){const ip=request.headers.get('CF-Connecting-IP')||'local';for(const [scope,max]of [[`ip:${ip}`,200],[`user:${name}`,10]] as const){const key=await identityHash('class7-auth:'+scope),now=Date.now(),cutoff=now-15*60*1000;const row=await db().prepare('INSERT INTO auth_limits(key,window_start,hits) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN window_start<? THEN 1 ELSE hits+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END RETURNING hits').bind(key,now,cutoff,cutoff).first<{hits:number}>();if(!row||row.hits>max)throw new AccountError(429,'尝试次数较多，请 15 分钟后再试。');}}
function cookie(request:Request,token:string,age:number){return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
function result(data:unknown,request:Request,token?:string,status=200){const headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(token!==undefined)headers['Set-Cookie']=cookie(request,token,token?30*86400:0);return Response.json(data,{status,headers});}
async function newSession(request:Request,account:Account){const token=random(),now=Date.now();await db().batch([db().prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(await identityHash(sessionToken(request))),db().prepare('DELETE FROM account_sessions WHERE expires_at<=?').bind(now),db().prepare('DELETE FROM auth_limits WHERE window_start<?').bind(now-86400000),db().prepare('INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').bind(await identityHash(token),account.id,now+30*86400000),db().prepare('DELETE FROM auth_limits WHERE key=?').bind(await identityHash('class7-auth:user:'+account.username))]);return token;}
async function linkLegacy(request:Request,account:Account){let photos=0,comments=0;for(const owner of await legacyOwners(request)){if(owner===account.owner_hash)continue;const now=new Date().toISOString();const rows=await db().batch([
 db().prepare('INSERT INTO profiles(device_hash,nickname,created_at,updated_at) SELECT ?,nickname,?,? FROM profiles WHERE device_hash=? ON CONFLICT(device_hash) DO NOTHING').bind(account.owner_hash,now,now,owner),
 db().prepare('UPDATE photos SET owner_hash=? WHERE owner_hash=?').bind(account.owner_hash,owner),
 db().prepare('UPDATE comments SET owner_hash=? WHERE owner_hash=?').bind(account.owner_hash,owner),
 db().prepare('DELETE FROM profiles WHERE device_hash=?').bind(owner)
 ]);photos+=rows[1].meta.changes||0;comments+=rows[2].meta.changes||0;}return {linkedPhotos:photos,linkedComments:comments};}

export async function accountAction(request:Request,action:string,readJson:(request:Request)=>Promise<any>){
 if(request.method!=='POST')throw new AccountError(404,'账号操作不存在。');
 if(action==='logout'){const token=sessionToken(request);if(token)await db().prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(await identityHash(token)).run();return result({ok:true},request,'');}
 if(action==='link-existing'){const account=await requireAccount(request);return result(await linkLegacy(request,account),request);}
 if(action!=='register'&&action!=='login')throw new AccountError(404,'账号操作不存在。');
 const data=await readJson(request),name=username(data?.username);await limit(request,name);const secret=password(data?.password);
 if(action==='register'){
  if(await signedAccount(request))throw new AccountError(409,'请先退出当前账号，再注册另一个账号。');
  if(typeof data.nickname!=='string'||!data.nickname.trim()||data.nickname.trim().length>40||data.nickname.includes('\0'))throw new AccountError(400,'请填写 1–40 个字符的昵称。');
  if(await db().prepare('SELECT id FROM accounts WHERE username=?').bind(name).first())throw new AccountError(409,'这个账号名已被使用，请换一个。');
  const id=crypto.randomUUID(),owner=await identityHash('class7-account:'+id),hash=await passwordHash(secret),now=new Date().toISOString();
  const account={id,username:name,owner_hash:owner,password_hash:hash};
  try{await db().batch([db().prepare('INSERT INTO accounts(id,username,owner_hash,password_hash,created_at) VALUES(?,?,?,?,?)').bind(id,name,owner,hash,now),db().prepare('INSERT INTO profiles(device_hash,nickname,created_at,updated_at) VALUES(?,?,?,?)').bind(owner,data.nickname.trim(),now,now)]);}catch(error){if(String(error).includes('UNIQUE'))throw new AccountError(409,'这个账号名已被使用，请换一个。');throw error;}
  const token=await newSession(request,account);return result({ok:true},request,token,201);
 }
 const account=await db().prepare('SELECT id,username,owner_hash,password_hash FROM accounts WHERE username=?').bind(name).first<Account>();
 const valid=await passwordMatches(secret,account?.password_hash||'scrypt$32768$8$3$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000');
 if(!account||!valid)throw new AccountError(401,'账号或密码不正确。');
 return result({ok:true},request,await newSession(request,account));
}
