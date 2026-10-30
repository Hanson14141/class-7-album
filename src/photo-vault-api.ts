// Classification is private even after purchase. Availability remains independently exclusive.
async function assertVaultAccess(request:Request,id:string){
 if(!uuid.test(id))throw new ApiError(404,'照片不存在。');
 const classified=await database().prepare('SELECT class7_test.photo_is_classified(?) AS hidden').bind(id).first<{hidden:boolean}>();if(!classified?.hidden)return;
 const account=await mallAccount(request);if(!account)throw new ApiError(404,'照片不存在。');
 const allowed=await database().prepare("SELECT 1 WHERE EXISTS(SELECT 1 FROM class7_test.photo_vault_admins WHERE username=?) OR EXISTS(SELECT 1 FROM class7_test.mall_photo_inventory WHERE account_id=? AND photo_id=?) OR (class7_test.photo_in_vault(?) AND EXISTS(SELECT 1 FROM class7_test.mall_photo_offers WHERE account_id=? AND photo_id=? AND day=(now() AT TIME ZONE 'Asia/Shanghai')::date))").bind(account.username,account.id,id,id,account.id,id).first();
 if(!allowed)throw new ApiError(404,'照片不存在。');
}
