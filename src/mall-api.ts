const mallPrices={common:10,epic:20,legendary:30,classified:80};
function mallPrice(tier:string){return tier==='classified'?80:tier==='legendary'?30:tier==='epic'?20:10;}
// Daily offers and purchases are selected and priced by the database.
async function mallAccount(request:Request){try{return await requireAccount(request);}catch(error){if(error instanceof AccountError&&error.status===401)return null;throw error;}}
async function mallPhotoView(row:any){return {photoId:row.photo_id,title:row.title,uploader:row.uploader,caption:row.caption||'',rarity:['epic','legendary','classified'].includes(row.rarity)?row.rarity:'common',width:Number(row.width)||1,height:Number(row.height)||1,rotation:Number(row.rotation)||0,available:row.available!==false,src:row.available===false?null:'/api/files/'+encodeURIComponent(row.photo_id)};}
async function mallItemsRoute(request:Request){
 const account=await mallAccount(request);
 if(!account)return response({signedIn:false,items:[],totalPoints:null,inventoryTotal:0,prices:mallPrices});
 const dayRow=await database().prepare('SELECT class7_test.photo_mall_day(?) AS result').bind(account.id).first<{result:any}>();
 const day=typeof dayRow?.result==='string'?JSON.parse(dayRow.result):dayRow?.result;
 const batch=await database().batch([
  database().prepare('SELECT p.*,r.rarity,p.id AS photo_id,EXISTS(SELECT 1 FROM class7_test.mall_photo_inventory i WHERE i.account_id=o.account_id AND i.photo_id=o.photo_id) AS owned FROM class7_test.mall_photo_offers o JOIN photos p ON p.id=o.photo_id LEFT JOIN class7_test.photo_rarities r ON r.photo_id=p.id WHERE o.account_id=? AND o.day=?::date ORDER BY md5(o.account_id||o.day::text||o.photo_id),o.photo_id').bind(account.id,day.day),
  database().prepare('SELECT count(*) AS n FROM class7_test.mall_photo_inventory WHERE account_id=?').bind(account.id),
  database().prepare("SELECT * FROM(WITH owned AS(SELECT photo_id FROM class7_test.mall_photo_inventory WHERE account_id=?),roster AS(SELECT id AS photo_id FROM photos UNION SELECT photo_id FROM owned) SELECT COALESCE(r.rarity,'common') AS rarity,count(*) AS total,count(o.photo_id) AS owned FROM roster p LEFT JOIN class7_test.photo_rarities r USING(photo_id) LEFT JOIN owned o USING(photo_id) GROUP BY COALESCE(r.rarity,'common')) AS collection").bind(account.id)
 ]);
 const score=await checkinState(account.id);
 return response({signedIn:true,...day,prices:mallPrices,totalPoints:score.totalPoints,inventoryTotal:Number((batch[1].results[0] as any)?.n)||0,collection:(batch[2].results as any[]).map(r=>({rarity:r.rarity,total:Number(r.total),owned:Number(r.owned)})),items:await Promise.all((batch[0].results as any[]).map(async row=>{
  const view=await mallPhotoView(row);
  const owned=row.owned===true;
  if(row.rarity==='classified'&&!owned)view.uploader='保密仓库';
  return {...view,owned,price:mallPrice(row.rarity)};
 }))});
}
async function mallRedeemRoute(request:Request,data:any){
 const account=await requireAccount(request),photoId=typeof data?.photoId==='string'?data.photoId:'',requestId=typeof data?.requestId==='string'?data.requestId:'',day=typeof data?.day==='string'?data.day:'';
 if(!uuid.test(photoId)||!uuid.test(requestId)||(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day))throw new ApiError(400,'购买信息无效，请刷新商城。');
 if(![10,20,30,80].includes(data?.price))throw new ApiError(409,'价格已更新，请刷新商城后重新确认。');
 const row=await database().prepare('SELECT class7_test.buy_mall_photo(?,?,?::date,?::uuid,?::integer) AS result').bind(account.id,photoId,day,requestId,data.price).first<{result:any}>();
 const result=typeof row?.result==='string'?JSON.parse(row.result):row?.result;
 if(!result?.bought){const messages:Record<string,string>={already_sold:'该保密照片已被其他同学率先买走。',expired:'今日照片已更新，请刷新后重新选择。',not_offered:'这张照片不在今日货架中。',missing:'原作者已移除这张照片。',insufficient:'积分不足，这张照片需要 '+Number(result?.price||0)+' 积分。',price_changed:'价格已更新，请刷新商城后重新确认。'};throw new ApiError(result?.error==='insufficient'?400:409,messages[result?.error]||'暂时无法购买，请刷新重试。');}
 return response({bought:true,alreadyOwned:result.alreadyOwned===true,duplicate:result.duplicate===true,inventoryId:result.id,price:Number(result.price),points:{total:Number(result.total)||0,spent:true}});
}
async function mallInventoryRoute(request:Request){
 const account=await requireAccount(request),url=new URL(request.url),cursor=decodeCursor(url.searchParams.get('cursor'));
 if(cursor&&(!uuid.test(cursor.id)||!Number.isFinite(Date.parse(cursor.date))))throw new ApiError(400,'分页信息无效，请刷新库存。');
 const query='SELECT i.*,CASE WHEN p.id IS NOT NULL THEN p.caption ELSE i.caption END AS caption,r.rarity,p.width,p.height,p.rotation,(p.id IS NOT NULL) AS available FROM class7_test.mall_photo_inventory i LEFT JOIN photos p ON p.id=i.photo_id LEFT JOIN class7_test.photo_rarities r ON r.photo_id=i.photo_id WHERE i.account_id=?'+(cursor?' AND (i.created_at,i.id)<(?::timestamptz,?::uuid)':'')+' ORDER BY i.created_at DESC,i.id DESC LIMIT 21';
 const rows=(await database().prepare(query).bind(account.id,...(cursor?[cursor.date,cursor.id]:[])).all()).results as any[];
 const page=rows.slice(0,20),count=await database().prepare('SELECT count(*) AS n FROM class7_test.mall_photo_inventory WHERE account_id=?').bind(account.id).first<any>();
 return response({entries:await Promise.all(page.map(async row=>({...await mallPhotoView(row),inventoryId:row.id,price:Number(row.price),purchasedAt:row.created_at}))),total:Number(count?.n)||0,nextCursor:rows.length>20?encodeCursor(page[page.length-1]):null});
}
// Legacy goods are withdrawn; this read-only endpoint preserves existing records.
async function mallRedemptionsRoute(request:Request){const account=await requireAccount(request);const rows=await database().prepare('SELECT id,item_name,price,created_at FROM class7_test.mall_redemptions WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT 50').bind(account.id).all();return response({redemptions:rows.results});}
async function vaultStatusRoute(request:Request){
 const account=await mallAccount(request);
 if(!account)return response({admin:false,stock:0});
 const admin=await database().prepare('SELECT 1 FROM class7_test.photo_vault_admins WHERE username=?').bind(account.username).first();
 if(!admin)return response({admin:false,stock:0});
 const stockRow=await database().prepare('SELECT count(*)::int AS stock FROM class7_test.photos p WHERE class7_test.photo_in_vault(p.id)').first<{stock:number}>();
 return response({admin:true,stock:Number(stockRow?.stock)||0});
}
