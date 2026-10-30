const drawConfig={prices:{single:10,ten:90},weights:{common:95.95,epic:3,legendary:1,classified:0.05},pity:{legendary:50,classified:null}};
async function drawStateRoute(request:Request){
 const account=await mallAccount(request);if(!account)return response({...drawConfig,signedIn:false});
 const row=await database().prepare('SELECT total_draws,legendary_misses,classified_misses FROM class7_test.photo_draw_state WHERE account_id=?').bind(account.id).first<any>();
 const score=await checkinState(account.id);
 return response({...drawConfig,signedIn:true,totalPoints:score.totalPoints,totalDraws:Number(row?.total_draws)||0,legendaryMisses:Number(row?.legendary_misses)||0,classifiedMisses:Number(row?.classified_misses)||0});
}
async function drawCardsRoute(request:Request){
 const account=await requireAccount(request),data=await jsonBody(request);
 if(![1,10].includes(data?.count)||typeof data.requestId!=='string'||!uuid.test(data.requestId))throw new ApiError(400,'抽卡信息无效，请重新选择。');
 const cost=data.count===10?90:10;if(data.cost!==cost)throw new ApiError(409,'价格已更新，请刷新后重新确认。');
 const row=await database().prepare('SELECT class7_test.draw_photos(?,?::integer,?::uuid,?::integer) AS result').bind(account.id,data.count,data.requestId,cost).first<{result:any}>();
 const result=typeof row?.result==='string'?JSON.parse(row.result):row?.result;
 if(!result?.ok){const messages:Record<string,string>={insufficient:'积分不足，本次需要 '+cost+' 积分。',classified_empty:'暂无可获取的保密卡，无法兑现保底，本次未扣分。',legendary_empty:'暂无可获取的传奇或保密卡，无法兑现保底，本次未扣分。',pool_empty:'可获取的新卡不足，本次未扣分。',request_conflict:'这次请求已用于其他抽卡，请先查看结果。',price_changed:'价格已更新，请刷新后重试。'};throw new ApiError(result?.error==='insufficient'?400:409,messages[result?.error]||'抽卡未完成，请重试。');}
 const rows=(await database().prepare('SELECT i.*,p.width,p.height,p.rotation,(p.id IS NOT NULL) AS available,CASE WHEN p.id IS NOT NULL THEN p.caption ELSE i.caption END AS caption FROM class7_test.mall_photo_inventory i LEFT JOIN photos p ON p.id=i.photo_id WHERE i.account_id=? AND i.id=ANY(?::uuid[])').bind(account.id,'{'+result.entries.map((item:any)=>item.inventoryId).join(',')+'}').all()).results as any[];
 const entries=await Promise.all(result.entries.map(async(item:any)=>{const stored=rows.find(r=>r.id===item.inventoryId);return stored?{...await mallPhotoView({...stored,rarity:item.rarity}),...item,price:Number(stored.price),purchasedAt:stored.created_at}:null;}));

 return response({...result,entries:entries.filter(Boolean),points:{total:result.totalPoints,spent:true}});
}
