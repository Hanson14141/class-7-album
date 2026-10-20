import {env} from 'cloudflare:workers';
import {AccountError,accountAction,accountState,requireAccount,requireAccountProfile,verifiedOwner} from './accounts';

type Profile={device_hash:string;nickname:string};
type Photo={id:string;owner_hash:string;uploader:string;title:string;caption:string;object_key:string;mime:string;bytes:number;width:number;height:number;rotation?:number;created_at:string};
type Comment={id:string;photo_id:string;owner_hash:string;author:string;body:string;created_at:string};
class ApiError extends Error{constructor(public status:number,message:string){super(message);}}
const imageTypes=new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
function attachmentName(title:string,mime:string){
 const extension:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
 const base=title.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,'_').replace(/\.(?:jpe?g|png|webp|gif|avif)$/i,'').replace(/[. ]+$/g,'').trim()||'photo';
 const name=`${base}.${extension[mime]||'jpg'}`;
 return `attachment; filename="photo.${extension[mime]||'jpg'}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const database=()=>{if(!env.DB)throw new ApiError(503,'共享数据库尚未连接，请稍后重试。');return env.DB;};
const bucket=()=>{if(!env.BUCKET)throw new ApiError(503,'照片存储尚未连接，请稍后重试。');return env.BUCKET;};
function writeOrigin(request:Request){const origin=request.headers.get('Origin');if(!origin||origin!==new URL(request.url).origin)throw new ApiError(403,'请在照片集页面中进行操作。');}
const ownerHash=verifiedOwner;
async function profile(request:Request,required=false){const hash=await ownerHash(request);const value=hash?await database().prepare('SELECT device_hash,nickname FROM profiles WHERE device_hash=?').bind(hash).first<Profile>():null;if(required&&!value)throw new ApiError(401,'请先填写你的名字或昵称。');return value;}
async function profileState(request:Request){const current=await profile(request);return {profile:current?{nickname:current.nickname}:null,account:await accountState(request)};}
async function jsonBody(request:Request){if(!request.body)throw new ApiError(400,'请求内容为空。');const reader=request.body.getReader();const chunks:Uint8Array[]=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16000){await reader.cancel();throw new ApiError(413,'输入内容太长。');}chunks.push(value);}const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}try{return JSON.parse(new TextDecoder().decode(body));}catch{throw new ApiError(400,'输入内容无法读取。');}}
function shortText(value:unknown,max:number,required=false){if(typeof value!=='string')throw new ApiError(400,'文字格式不正确。');const text=value.trim();if(text.length>max||text.includes('\0'))throw new ApiError(400,`文字请控制在 ${max} 个字符以内。`);if(required&&!text)throw new ApiError(400,'请填写内容后再提交。');return text;}
function encodeCursor(row:{created_at:string;id:string}){return btoa(JSON.stringify({date:row.created_at,id:row.id}));}
function decodeCursor(value:string|null){if(!value)return null;try{const x=JSON.parse(atob(value));if(typeof x.date!=='string'||typeof x.id!=='string'||x.date.length>40||x.id.length>50)throw Error();return x as {date:string;id:string};}catch{throw new ApiError(400,'分页信息无效，请刷新相册。');}}
function photoView(row:Photo,hash:string|null){return {id:row.id,src:`/api/files/${row.id}`,mime:row.mime,uploader:row.uploader,title:row.title,caption:row.caption,bytes:row.bytes,width:row.width,height:row.height,rotation:row.rotation||0,createdAt:row.created_at,demo:false,shared:true,owned:hash===row.owner_hash};}
async function requirePhoto(id:string){if(!uuid.test(id)||!await database().prepare('SELECT id FROM photos WHERE id=?').bind(id).first())throw new ApiError(404,'这张照片不存在或已被删除。');}

async function insertPhoto(row:Photo){
 const values=(title:string)=>[row.id,row.owner_hash,row.uploader,title,row.caption,row.object_key,row.mime,row.bytes,row.width,row.height,row.created_at,row.rotation||0];
 const columns='id,owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,created_at,rotation';
 if(row.title){await database().prepare(`INSERT INTO photos(${columns}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values(row.title)).run();return row.title;}
 while(true){
  // A transactional batch assigns a number and inserts the photo in one trip.
  // Collisions with an existing custom title are skipped on the next batch.
  const result=await database().batch([
   database().prepare('INSERT INTO photo_name_counters(nickname,last_number) VALUES(?,1) ON CONFLICT(nickname) DO UPDATE SET last_number=last_number+1').bind(row.uploader),
   database().prepare(`INSERT INTO photos(${columns}) SELECT ?,?,?,(? || ' ' || c.last_number),?,?,?,?,?,?,?,? FROM photo_name_counters c WHERE c.nickname=? AND NOT EXISTS(SELECT 1 FROM photos WHERE title=(? || ' ' || c.last_number)) RETURNING title`).bind(...values(row.uploader),row.uploader,row.uploader)
  ]);
  const inserted=result[1].results[0] as {title:string}|undefined;if(inserted)return inserted.title;
 }
}

export async function handlePhotoApi(request:Request){
 try{
  const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean).slice(1),method=request.method;
  if(method!=='GET')writeOrigin(request);
  if(parts[0]==='profile'&&parts.length===1){
   if(method==='GET')return response(await profileState(request));
   if(method==='POST'){const hash=await ownerHash(request);if(!hash)throw new ApiError(401,'请允许浏览器记住你的身份后重试。');const data=await jsonBody(request);const nickname=shortText(data.nickname,40,true).replace(/\s+/g,' ');const now=new Date().toISOString();await database().prepare('INSERT INTO profiles(device_hash,nickname,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(device_hash) DO UPDATE SET nickname=excluded.nickname,updated_at=excluded.updated_at').bind(hash,nickname,now,now).run();return response({profile:{nickname}});}
  }
  if(parts[0]==='vault'&&parts.length===2&&parts[1]==='status'&&method==='GET')return await vaultStatusRoute(request);
   const isVault=parts[0]==='vault'&&parts.length===2&&parts[1]==='photos'&&method==='POST';
   if(isVault){parts[0]='photos';parts.length=1;}
   if(parts[0]==='account'&&parts.length===2)return await accountAction(request,parts[1],jsonBody);
  if(parts[0]==='photos'&&parts.length===1){
   if(method==='GET'){
    const hash=await ownerHash(request),cursor=decodeCursor(url.searchParams.get('cursor')),mine=url.searchParams.get('mine')==='1';
    if(mine&&!hash)return response({photos:[],nextCursor:null,total:0});
    const where:string[]=[],values:unknown[]=[];if(mine){where.push('owner_hash=?');values.push(hash);}else{where.push('NOT class7_test.photo_in_vault(photos.id)');}if(cursor){where.push('(created_at<? OR (created_at=? AND id<?))');values.push(cursor.date,cursor.date,cursor.id);}
    const result=await database().batch([database().prepare(`SELECT * FROM photos ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,id DESC LIMIT 101`).bind(...values),database().prepare(`SELECT count(*) AS n FROM photos ${mine?'WHERE owner_hash=?':'WHERE NOT class7_test.photo_in_vault(photos.id)'}`).bind(...(mine?[hash]:[]))]);
    const found=result[0].results as Photo[],rows=found.slice(0,100),count=result[1].results[0] as {n:number}|undefined;
    return response({photos:rows.map(row=>photoView(row,hash)),nextCursor:found.length>100?encodeCursor(rows[rows.length-1]):null,total:count?.n||0});
   }
   if(method==='POST'){
    const current=await requireAccountProfile(request);
     if(isVault){
      const account=await requireAccount(request);
      const admin=await database().prepare('SELECT 1 FROM class7_test.photo_vault_admins WHERE username=?').bind(account.username).first();
      if(!admin)throw new ApiError(403,'只有保密仓库管理员可以上传照片。');
     }const mime=(request.headers.get('Content-Type')||'').split(';')[0].toLowerCase();if(!imageTypes.has(mime)||!request.body)throw new ApiError(415,'请上传 JPG、PNG、WebP、GIF 或 AVIF 图片。');
    let meta;try{const encoded=request.headers.get('X-Photo-Metadata')||'';if(encoded.length>12000)throw Error();meta=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))));}catch{throw new ApiError(400,'照片信息无法读取。');}
    let title=shortText(meta.title,100);const caption=shortText(meta.caption,500);const width=Number(meta.width),height=Number(meta.height);if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>100000||height>100000)throw new ApiError(400,'照片尺寸无效。');
    const rotation=meta.rotation??0;if(![0,90,180,270].includes(rotation))throw new ApiError(400,'照片旋转角度无效。');
    const id=crypto.randomUUID(),key='photos/'+id,now=new Date().toISOString();
    const stored=await bucket().put(key,request.body,{httpMetadata:{contentType:mime}});if(!stored||!stored.size){if(stored)await bucket().delete(key);throw new ApiError(400,'照片文件为空。');}
    try{title=await insertPhoto({id,owner_hash:current.device_hash,uploader:current.nickname,title,caption,object_key:key,mime,bytes:stored.size,width,height,rotation,created_at:now});if(isVault)await database().prepare("INSERT INTO class7_test.photo_rarities(photo_id,rarity) VALUES(?,'classified') ON CONFLICT(photo_id) DO UPDATE SET rarity='classified'").bind(id).run();}catch(e){await bucket().delete(key);throw e;}
    return response({photo:photoView({id,owner_hash:current.device_hash,uploader:current.nickname,title,caption,object_key:key,mime,bytes:stored.size,width,height,rotation,created_at:now},current.device_hash)},201);
   }
  }
  if(parts[0]==='photos'&&parts.length===3&&parts[2]==='caption'&&method==='POST'){
   const current=(await profile(request,true))!,data=await jsonBody(request),caption=shortText(data?.caption,500);
   const row=await database().prepare('SELECT owner_hash FROM photos WHERE id=?').bind(parts[1]).first<{owner_hash:string}>();if(!row)throw new ApiError(404,'照片已经不存在。');if(row.owner_hash!==current.device_hash)throw new ApiError(403,'只能修改自己上传照片的说明。');
   const updated=await database().prepare('UPDATE photos SET caption=? WHERE id=? AND owner_hash=? RETURNING *').bind(caption,parts[1],current.device_hash).first<Photo>();if(!updated)throw new ApiError(404,'照片已经不存在。');
   return response({photo:photoView(updated,current.device_hash)});
  }
  if(parts[0]==='photos'&&parts.length===3&&parts[2]==='rotation'&&method==='POST'){
   const current=(await profile(request,true))!,data=await jsonBody(request);if(data.turn!==1&&data.turn!==-1)throw new ApiError(400,'请每次向左或向右旋转 90°。');
   const row=await database().prepare('SELECT owner_hash FROM photos WHERE id=?').bind(parts[1]).first<{owner_hash:string}>();if(!row)throw new ApiError(404,'照片已经不存在。');if(row.owner_hash!==current.device_hash)throw new ApiError(403,'只能调整自己上传的照片。');
   // Atomic relative update preserves simultaneous turns from two tabs.
   const updated=await database().prepare('UPDATE photos SET rotation=(rotation+?+360)%360 WHERE id=? AND owner_hash=? RETURNING *').bind(data.turn*90,parts[1],current.device_hash).first<Photo>();if(!updated)throw new ApiError(404,'照片已经不存在。');
   return response({photo:photoView(updated,current.device_hash)});
  }
  if(parts[0]==='photos'&&parts.length===2&&method==='DELETE'){
   const current=(await profile(request,true))!;const row=await database().prepare('SELECT * FROM photos WHERE id=?').bind(parts[1]).first<Photo>();if(!row)throw new ApiError(404,'照片已经不存在。');if(row.owner_hash!==current.device_hash)throw new ApiError(403,'只能删除自己上传的照片。');
   await database().batch([database().prepare('DELETE FROM comments WHERE photo_id=?').bind(row.id),database().prepare('DELETE FROM photos WHERE id=? AND owner_hash=?').bind(row.id,current.device_hash)]);await bucket().delete(row.object_key);return response({ok:true});
  }
  if(parts[0]==='files'&&parts.length===2&&method==='GET'){
   const row=await database().prepare('SELECT object_key,mime,title FROM photos WHERE id=?').bind(parts[1]).first<{object_key:string;mime:string;title:string}>();if(!row)throw new ApiError(404,'照片不存在。');const file=await bucket().get(row.object_key);if(!file)throw new ApiError(404,'照片文件不存在。');const download=url.searchParams.get('download')==='1';if(!download&&request.headers.get('If-None-Match')===file.httpEtag)return new Response(null,{status:304,headers:{ETag:file.httpEtag,'Cache-Control':'private, max-age=3600'}});
   const headers:Record<string,string>={'Content-Type':row.mime,'Content-Length':String(file.size),'Cache-Control':download?'private, no-store':'private, max-age=3600',ETag:file.httpEtag,'X-Content-Type-Options':'nosniff'};
   if(download)headers['Content-Disposition']=attachmentName(row.title,row.mime);
   return new Response(file.body,{headers});
  }
  if(parts[0]==='photos'&&parts.length===3&&parts[2]==='comments'){
   const photoId=parts[1];await requirePhoto(photoId);
   if(method==='GET'){
    const hash=await ownerHash(request),cursor=decodeCursor(url.searchParams.get('cursor'));let query='SELECT * FROM comments WHERE photo_id=?';const args:unknown[]=[photoId];if(cursor){query+=' AND (created_at<? OR (created_at=? AND id<?))';args.push(cursor.date,cursor.date,cursor.id);}query+=' ORDER BY created_at DESC,id DESC LIMIT 51';
    const result=await database().prepare(query).bind(...args).all<Comment>();const rows=result.results.slice(0,50);const count=await database().prepare('SELECT count(*) AS n FROM comments WHERE photo_id=?').bind(photoId).first<{n:number}>();
    return response({comments:rows.reverse().map(row=>({id:row.id,author:row.author,body:row.body,createdAt:row.created_at,mine:row.owner_hash===hash})),total:count?.n||0,nextCursor:result.results.length>50?encodeCursor(result.results[49]):null});
   }
   if(method==='POST'){
    await requireAccount(request);const current=(await profile(request,true))!,data=await jsonBody(request);const body=shortText(data.body,1000,true);const id=crypto.randomUUID(),now=new Date().toISOString();await database().prepare('INSERT INTO comments(id,photo_id,owner_hash,author,body,created_at) VALUES(?,?,?,?,?,?)').bind(id,photoId,current.device_hash,current.nickname,body,now).run();return response({comment:{id,author:current.nickname,body,createdAt:now,mine:true}},201);
   }
  }
  if(parts[0]==='comments'&&parts.length===2&&method==='DELETE'){
   const current=(await profile(request,true))!;const row=await database().prepare('SELECT owner_hash FROM comments WHERE id=?').bind(parts[1]).first<{owner_hash:string}>();if(!row)throw new ApiError(404,'评论已经不存在。');if(row.owner_hash!==current.device_hash)throw new ApiError(403,'只能删除自己的评论。');await database().prepare('DELETE FROM comments WHERE id=? AND owner_hash=?').bind(parts[1],current.device_hash).run();return response({ok:true});
  }
  throw new ApiError(404,'没有找到这个接口。');
 }catch(error){if(error instanceof ApiError||error instanceof AccountError)return response({error:error.message},error.status);console.error('Photo API error',error instanceof Error?error.message:'unknown error');return response({error:'服务暂时不可用，请稍后重试。'},500);}
}
