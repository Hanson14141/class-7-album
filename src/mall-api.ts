// Points mall routes. Prices and stock limits come from the build-time MALL_ITEMS
// manifest (mall-goods/*.json), never from the request body.
type MallItem={id:string;name:string;description:string;price:number;stock:number|null;enabled:boolean;images:{src:string;alt:string}[]};
declare const MALL_ITEMS:MallItem[];
async function mallItemsRoute(request:Request){
 const counts=await database().prepare('SELECT item_id,count(*) AS n FROM class7_test.mall_redemptions GROUP BY item_id').all();
 const used=new Map<string,number>((counts.results as any[]).map(row=>[row.item_id,Number(row.n)||0]));
 const items=MALL_ITEMS.filter(item=>item.enabled).map(item=>({id:item.id,name:item.name,description:item.description,price:item.price,stock:item.stock,images:item.images,remaining:item.stock==null?null:Math.max(0,item.stock-(used.get(item.id)||0))}));
 let totalPoints:number|null=null;
 try{const account=await requireAccount(request);totalPoints=(await checkinState(account.id)).totalPoints;}catch(error){if(!(error instanceof AccountError&&error.status===401))throw error;}
 return response({items,totalPoints});
}
async function mallRedeemRoute(request:Request,data:any){
 const account=await requireAccount(request);
 const id=typeof data?.itemId==='string'?data.itemId:'';
 const item=MALL_ITEMS.find(entry=>entry.id===id&&entry.enabled);
 if(!item)throw new ApiError(404,'这个商品不存在或已下架。');
 const row=await database().prepare('SELECT class7_test.redeem_mall_item(?,?,?,?,?) AS result').bind(account.id,item.id,item.name,item.price,item.stock).first<{result:any}>();
 const result=typeof row?.result==='string'?JSON.parse(row.result):row?.result;
 if(!result?.redeemed){
  if(result?.error==='sold_out')throw new ApiError(409,'这件商品刚刚兑完了。');
  if(result?.error==='insufficient')throw new ApiError(400,'积分不足，还差 '+(item.price-(Number(result.total)||0))+' 分。');
  throw new ApiError(400,'暂时无法兑换，请稍后重试。');
 }
 return response({redeemed:true,item:{id:item.id,name:item.name,price:item.price},points:{total:Number(result.total)||0}});
}
async function mallRedemptionsRoute(request:Request){
 const account=await requireAccount(request);
 const rows=await database().prepare('SELECT id,item_id,item_name,price,created_at FROM class7_test.mall_redemptions WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT 50').bind(account.id).all();
 return response({redemptions:(rows.results as any[]).map(row=>({id:row.id,itemId:row.item_id,itemName:row.item_name,price:Number(row.price)||0,createdAt:row.created_at}))});
}
