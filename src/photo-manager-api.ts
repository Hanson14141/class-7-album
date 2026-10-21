function managerCursor(value:any){return btoa(encodeURIComponent(JSON.stringify(value)));}
function readManagerCursor(value:string|null){
 if(!value)return null;
 try{const cursor=JSON.parse(decodeURIComponent(atob(value)));if(typeof cursor.date!=='string'||!Number.isFinite(Date.parse(cursor.date))||typeof cursor.id!=='string'||!uuid.test(cursor.id)||typeof cursor.search!=='string'||typeof cursor.rarity!=='string')throw Error();return cursor;}catch{throw new ApiError(400,'分页信息无效，请刷新照片管理。');}
}
async function adminPhotosRoute(request:Request){
 await requirePhotoAdmin(request);
 const url=new URL(request.url),search=(url.searchParams.get('search')||'').trim(),rarity=url.searchParams.get('rarity')||'all';
 if(search.length>100||search.includes('\0'))throw new ApiError(400,'搜索内容请控制在 100 个字符以内。');
 if(!['all','common','epic','legendary','classified'].includes(rarity))throw new ApiError(400,'卡牌等级筛选无效。');
 const cursor=readManagerCursor(url.searchParams.get('cursor'));
 if(cursor&&(cursor.search!==search||cursor.rarity!==rarity))throw new ApiError(400,'筛选条件已变化，请重新查询。');
 const where:string[]=[],values:any[]=[];
 if(search){where.push("strpos(lower(p.title||' '||p.uploader),lower(?))>0");values.push(search);}
 if(rarity!=='all'){where.push("COALESCE(r.rarity,'common')=?");values.push(rarity);}
 const filter=where.length?' WHERE '+where.join(' AND '):'';
 const pageWhere=[...where],pageValues=[...values];
 if(cursor){pageWhere.push('(p.created_at,p.id)<(?::timestamptz,?::uuid)');pageValues.push(cursor.date,cursor.id);}
 const batch=await database().batch([
  database().prepare('SELECT p.*,p.id AS photo_id,COALESCE(r.rarity,\'common\') AS rarity FROM photos p LEFT JOIN class7_test.photo_rarities r ON r.photo_id=p.id'+(pageWhere.length?' WHERE '+pageWhere.join(' AND '):'')+' ORDER BY p.created_at DESC,p.id DESC LIMIT 13').bind(...pageValues),
  database().prepare('SELECT count(*) AS n FROM photos p LEFT JOIN class7_test.photo_rarities r ON r.photo_id=p.id'+filter).bind(...values)
 ]);
 const rows=batch[0].results as any[],page=rows.slice(0,12);
 return response({photos:await Promise.all(page.map(async row=>({...await mallPhotoView(row),id:row.photo_id}))),total:Number((batch[1].results[0] as any)?.n)||0,nextCursor:rows.length>12?managerCursor({date:page[page.length-1].created_at,id:page[page.length-1].photo_id,search,rarity}):null});
}
