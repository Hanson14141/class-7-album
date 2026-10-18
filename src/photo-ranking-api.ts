// Aggregate votes once in PostgreSQL, then page by (votes, date, id).
// No browser-side full-album download or per-photo count requests.
async function rankedPhotos(request:Request,url:URL){
 const owner=await ownerHash(request),mine=url.searchParams.get('mine')==='1',uploader=shortText(url.searchParams.get('uploader')||'',40);
 if(mine&&!owner)return response({photos:[],nextCursor:null,total:0,ownedTotal:0,uploaders:[]});
 const scope=JSON.stringify([mine,encodeURIComponent(uploader)]);let cursor:any=null;
 const raw=url.searchParams.get('cursor');
 if(raw){try{cursor=JSON.parse(atob(raw));}catch{throw new ApiError(400,'排行游标无效，请刷新。');}
  if(cursor.scope!==scope||!Number.isSafeInteger(cursor.likes)||cursor.likes<0||!Number.isSafeInteger(cursor.seen)||cursor.seen<0||typeof cursor.date!=='string'||!uuid.test(cursor.id))throw new ApiError(400,'排行已变化，请刷新。');
 }
 const where:string[]=[],values:unknown[]=[owner||''];
 if(mine){where.push('class7_test.canonical_owner(p.owner_hash)=?');values.push(owner);}
 if(uploader){where.push('p.uploader=?');values.push(uploader);}
 if(cursor){where.push('(COALESCE(v.like_count,0)<? OR (COALESCE(v.like_count,0)=? AND (p.created_at<? OR (p.created_at=? AND p.id<?))))');values.push(cursor.likes,cursor.likes,cursor.date,cursor.date,cursor.id);}
 const base=mine?'WHERE class7_test.canonical_owner(owner_hash)=?':'',baseValues=mine?[owner]:[];
 const result=await database().batch([
  database().prepare(`SELECT p.id,class7_test.canonical_owner(p.owner_hash) AS owner_hash,p.uploader,p.title,p.caption,p.object_key,p.mime,p.bytes,p.width,p.height,p.rotation,p.created_at,COALESCE(v.like_count,0) AS like_count,COALESCE(v.liked,false) AS liked
   FROM photos p LEFT JOIN (SELECT photo_id,count(DISTINCT class7_test.canonical_owner(owner_hash)) AS like_count,bool_or(class7_test.canonical_owner(owner_hash)=?) AS liked FROM photo_likes GROUP BY photo_id) v ON v.photo_id=p.id ${where.length?'WHERE '+where.join(' AND '):''}
   ORDER BY COALESCE(v.like_count,0) DESC,p.created_at DESC,p.id DESC LIMIT 101`).bind(...values),
  database().prepare(`SELECT count(*) AS n FROM photos ${base}`).bind(...baseValues),
  database().prepare(`SELECT uploader,count(*) AS n FROM photos ${base} GROUP BY uploader`).bind(...baseValues),
  database().prepare('SELECT count(*) AS n FROM photos WHERE class7_test.canonical_owner(owner_hash)=?').bind(owner||'')
 ]);
 const found=result[0].results as (Photo&{like_count:number;liked:boolean})[],rows=found.slice(0,100),seen=cursor?.seen||0,last=rows.at(-1);
 return response({photos:await Promise.all(rows.map(async(row,index)=>({...await photoView(row,owner),rank:seen+index+1}))),
  nextCursor:found.length>100&&last?btoa(JSON.stringify({scope,likes:Number(last.like_count),date:last.created_at,id:last.id,seen:seen+rows.length})):null,
  total:Number(result[1].results[0]?.n)||0,ownedTotal:Number(result[3].results[0]?.n)||0,
  uploaders:result[2].results.map((row:any)=>({uploader:row.uploader,total:Number(row.n)||0}))});
}
