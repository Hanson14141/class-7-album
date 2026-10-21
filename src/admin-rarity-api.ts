async function requirePhotoAdmin(request:Request){
 const account=await requireAccount(request);
 const admin=await database().prepare('SELECT 1 FROM class7_test.photo_vault_admins WHERE username=?').bind(account.username).first();
 if(!admin)throw new ApiError(403,'只有管理员可以设置卡牌等级。');
 return account;
}
async function adminPhotoRarityRoute(request:Request,id:string){
 const account=await requirePhotoAdmin(request);
 if(!uuid.test(id))throw new ApiError(404,'照片不存在。');
 if(request.method==='GET'){
  const photo=await database().prepare("SELECT p.id AS photo_id,COALESCE(r.rarity,'common') AS rarity FROM photos p LEFT JOIN class7_test.photo_rarities r ON r.photo_id=p.id WHERE p.id=?").bind(id).first<{photo_id:string;rarity:string}>();
  if(!photo)throw new ApiError(404,'照片不存在或已被删除。');
  return response({photoId:photo.photo_id,rarity:photo.rarity});
 }
 const data=await jsonBody(request);
 if(!['common','epic','legendary','classified'].includes(data?.rarity))throw new ApiError(400,'请选择普通、史诗、传奇或保密级。');
 const row=await database().prepare('SELECT class7_test.set_admin_photo_rarity(?,?,?) AS result').bind(account.id,id,data.rarity).first<{result:any}>();
 const result=typeof row?.result==='string'?JSON.parse(row.result):row?.result;
 if(result?.error==='unauthorized')throw new ApiError(403,'管理员权限已变更，请刷新后重试。');
 if(result?.error==='missing')throw new ApiError(404,'照片不存在或已被删除。');
 if(!result||result.error)throw new ApiError(400,'卡牌等级未保存，请刷新后重试。');
 return response(result);
}
