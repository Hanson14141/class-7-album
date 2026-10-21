async function assertVaultAccess(request:Request,photoId:string){
 if(!uuid.test(photoId))throw new ApiError(404,'照片不存在。');
 const classified=await database().prepare('SELECT class7_test.photo_is_classified(?) AS value').bind(photoId).first<{value:boolean}>();
 if(!classified||classified.value!==true)return;
 const account=await mallAccount(request);
 if(!account)throw new ApiError(404,'照片不存在。');
 const access=await database().prepare("SELECT EXISTS(SELECT 1 FROM class7_test.photo_vault_admins a WHERE a.username=?) OR EXISTS(SELECT 1 FROM class7_test.mall_photo_inventory i WHERE i.account_id=? AND i.photo_id=?) OR EXISTS(SELECT 1 FROM class7_test.mall_photo_offers o WHERE o.account_id=? AND o.photo_id=? AND o.day=(now() AT TIME ZONE 'Asia/Shanghai')::date) AS allowed").bind(account.username,account.id,photoId,account.id,photoId).first<{allowed:boolean}>();
 if(!access?.allowed)throw new ApiError(404,'照片不存在。');
}
