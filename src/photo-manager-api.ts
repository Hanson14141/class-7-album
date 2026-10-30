// Administrator-only, paginated metadata. No per-photo signing or whole-album download.
async function adminPhotosRoute(request:Request){
 await requirePhotoAdmin(request);const url=new URL(request.url),search=shortText(url.searchParams.get('search')||'',100),rarity=url.searchParams.get('rarity')||'all';
 if(!['all','common','epic','legendary','classified'].includes(rarity))throw new ApiError(400,'卡牌等级筛选无效。');
 const scope=encodeURIComponent(JSON.stringify([search,rarity])),raw=url.searchParams.get('cursor');let cursor:any=null;
 if(raw){try{cursor=JSON.parse(atob(raw));}catch{throw new ApiError(400,'分页无效，请刷新照片管理。');}
  if(!cursor||cursor.scope!==scope||typeof cursor.date!=='string'||cursor.date.length>40||!Number.isFinite(Date.parse(cursor.date))||!uuid.test(cursor.id))throw new ApiError(400,'筛选条件已变化，请重新查询。');
 }
 const filters:string[]=[],values:unknown[]=[];
 if(search){filters.push("strpos(lower(p.title||' '||p.uploader),lower(?))>0");values.push(search);}
 if(rarity!=='all'){filters.push("COALESCE(r.rarity,'common')=?");values.push(rarity);}
 const pageFilters=[...filters],pageValues=[...values];if(cursor){pageFilters.push('(p.created_at<? OR (p.created_at=? AND p.id<?))');pageValues.push(cursor.date,cursor.date,cursor.id);}
 const from=' FROM photos p LEFT JOIN class7_test.photo_rarities r ON r.photo_id=p.id';
 const results=await database().batch([
  database().prepare("SELECT p.id,p.title,p.caption,p.uploader,p.width,p.height,p.rotation,p.created_at,COALESCE(r.rarity,'common') AS rarity"+from+(pageFilters.length?' WHERE '+pageFilters.join(' AND '):'')+' ORDER BY p.created_at DESC,p.id DESC LIMIT 13').bind(...pageValues),
  database().prepare('SELECT count(*) AS n'+from+(filters.length?' WHERE '+filters.join(' AND '):'')).bind(...values)
 ]);
 const found=results[0].results as any[],photos=found.slice(0,12),last=photos.at(-1);
 return response({photos:photos.map(p=>({id:p.id,title:p.title,caption:p.caption,uploader:p.uploader,width:Number(p.width),height:Number(p.height),rotation:Number(p.rotation)||0,rarity:p.rarity,src:'/api/files/'+encodeURIComponent(p.id)})),total:Number(results[1].results[0]?.n)||0,nextCursor:found.length>12&&last?btoa(JSON.stringify({scope,date:last.created_at,id:last.id})):null});
}
