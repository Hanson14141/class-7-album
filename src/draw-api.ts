const drawPrices={single:10,ten:90};
function drawResult(value:any){return typeof value==='string'?JSON.parse(value):value;}
async function drawStateRoute(request:Request){
 const account=await mallAccount(request);
 if(!account)return response({signedIn:false,totalPoints:null,totalDraws:0,legendaryMisses:0,classifiedMisses:0,prices:drawPrices});
 const state=await database().prepare('SELECT total_draws,legendary_misses,classified_misses FROM class7_test.photo_draw_state WHERE account_id=?').bind(account.id).first<any>();
 const score=await checkinState(account.id);
 return response({signedIn:true,totalPoints:Number(score.totalPoints)||0,totalDraws:Number(state?.total_draws)||0,legendaryMisses:Number(state?.legendary_misses)||0,classifiedMisses:Number(state?.classified_misses)||0,prices:drawPrices});
}
async function drawCardsRoute(request:Request){
 const account=await requireAccount(request),data=await jsonBody(request),count=Number(data?.count);
 if(![1,10].includes(count)||typeof data?.requestId!=='string'||!uuid.test(data.requestId))throw new ApiError(400,'抽卡请求无效，请刷新后重试。');
 const cost=count===10?drawPrices.ten:drawPrices.single;
 if(data?.cost!==cost)throw new ApiError(409,'抽卡价格已更新，请刷新后重新确认。');
 const row=await database().prepare('SELECT class7_test.draw_photos(?,?,?::uuid,?::integer) AS result').bind(account.id,count,data.requestId,cost).first<{result:any}>();
 const result=drawResult(row?.result);
 if(!result?.ok){const messages:Record<string,string>={insufficient:'积分不足，本次抽卡未扣分。',price_changed:'抽卡价格已更新，请刷新后重新确认。',request_conflict:'本次请求编号已用于其他抽卡，请刷新后重试。',classified_empty:'保密卡池不足，无法兑现本次保底；整次未扣分。',legendary_empty:'传奇及以上卡池不足，无法兑现本次保底；整次未扣分。',pool_empty:'没有可抽取的新照片，整次未扣分。'};throw new ApiError(result?.error==='insufficient'?400:409,messages[result?.error]||'抽卡未完成，请稍后重试。');}
 const entries=Array.isArray(result.entries)?result.entries:[];
 let views:any[]=[];
 if(entries.length){
  const ids=entries.map((entry:any)=>entry.inventoryId);
  if(ids.some((id:string)=>!uuid.test(id)))throw new ApiError(500,'抽卡结果无法读取，请使用原请求重试。');
  const query='SELECT i.*,CASE WHEN p.id IS NOT NULL THEN p.caption ELSE i.caption END AS caption,r.rarity,p.width,p.height,p.rotation,(p.id IS NOT NULL) AS available FROM class7_test.mall_photo_inventory i LEFT JOIN photos p ON p.id=i.photo_id LEFT JOIN class7_test.photo_rarities r ON r.photo_id=i.photo_id WHERE i.account_id=? AND i.id IN ('+ids.map(()=>'?').join(',')+')';
  const rows=(await database().prepare(query).bind(account.id,...ids).all()).results as any[];
  const byId=new Map(rows.map(row=>[row.id,row]));
  views=await Promise.all(entries.map(async(entry:any)=>{const row=byId.get(entry.inventoryId);if(!row)throw new ApiError(500,'抽卡结果暂时无法读取，请使用原请求重试。');return {...await mallPhotoView(row),inventoryId:row.id,price:Number(row.price),guaranteed:entry.guaranteed||null,drawNumber:Number(entry.drawNumber)};}));
 }
 return response({...result,entries:views,totalPoints:Number(result.totalPoints)||0,points:{total:Number(result.totalPoints)||0,spent:true},prices:drawPrices});
}
