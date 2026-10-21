async function linkedAccountNames(owner:string){
 const rows=await db().prepare('SELECT username FROM accounts WHERE class7_test.canonical_owner(owner_hash)=? ORDER BY username').bind(owner).all();
 return rows.results.map(row=>String((row as {username:string}).username));
}

async function unlinkContext(request:Request,data:any){
 const current=await requireAccount(request),name=username(data?.username);
 if(name===current.username)throw new AccountError(400,'请选择另一个已关联账号。');
 const target=await db().prepare('SELECT id,username,class7_test.canonical_owner(owner_hash) AS owner_hash FROM accounts WHERE username=?').bind(name).first<Account>();
 if(!target||target.owner_hash!==current.owner_hash)throw new AccountError(409,'该账号已不在当前关联组，请刷新后重试。');
 const names=await linkedAccountNames(current.owner_hash);
 const count=await db().prepare('SELECT count(*) AS n FROM photos WHERE class7_test.canonical_owner(owner_hash)=?').bind(current.owner_hash).first<{n:number}>();
 return {current,target,names,photos:Number(count?.n||0)};
}
async function unlinkAccountAction(request:Request,data:any,preview:boolean){
 const context=await unlinkContext(request,data);
 if(preview)return result({username:context.target.username,currentUsername:context.current.username,retainedPhotos:context.photos,groupVersion:context.names.join('|')},request);
 if(data?.confirmed!==true||typeof data?.groupVersion!=='string')throw new AccountError(400,'请先查看解除影响并勾选确认。');
 await limit(request,context.current.username);
 const secret=password(data?.password),stored=await db().prepare('SELECT password_hash FROM accounts WHERE id=?').bind(context.current.id).first<{password_hash:string}>();
 if(!stored||!await passwordMatches(secret,stored.password_hash))throw new AccountError(403,'当前登录账号的密码不正确。');
 const verified=await requireAccount(request);if(verified.id!==context.current.id)throw new AccountError(401,'登录状态已变化，请重新打开账号窗口。');
 const row=await db().prepare('SELECT class7_test.unlink_account(?,?,?) AS unlinked').bind(context.current.id,context.target.id,data.groupVersion).first<{unlinked:any}>();
 const unlinked=typeof row?.unlinked==='string'?JSON.parse(row.unlinked):row?.unlinked;
 if(!unlinked||unlinked.invalid||unlinked.notLinked||unlinked.stale)throw new AccountError(409,'账号关联状态已变化，请重新查看解除影响。');
 return result({ok:true,...unlinked,removedAccount:context.target.username},request);
}
async function linkVerifiedAccount(request:Request,data:any){
 const current=await requireAccount(request),name=username(data?.username),secret=password(data?.password);
 if(name===current.username)throw new AccountError(409,'这是当前登录账号，不能关联自己。请先登录原来上传照片的账号，再填写另一个要关联的登录账号。');
 await limit(request,name);
 const target=await db().prepare('SELECT id,username,owner_hash,password_hash FROM accounts WHERE username=?').bind(name).first<Account>();
 const valid=await passwordMatches(secret,target?.password_hash||'scrypt$32768$8$3$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000');
 if(!target||!valid)throw new AccountError(403,'要关联的账号或密码不正确。');
 // Recheck the source session immediately before granting shared management.
 const verified=await requireAccount(request);if(verified.id!==current.id)throw new AccountError(401,'登录状态已变化，请重新打开账号窗口。');
 const row=await db().prepare('SELECT class7_test.link_accounts(?,?) AS linked').bind(current.id,target.id).first<{linked:any}>();
 if(!row?.linked)throw new AccountError(503,'账号暂未关联，请稍后重试。');
 const linked=typeof row.linked==='string'?JSON.parse(row.linked):row.linked;
 const updated=await requireAccount(request);
 const count=await db().prepare('SELECT count(*) AS n FROM photos WHERE class7_test.canonical_owner(owner_hash)=?').bind(updated.owner_hash).first<{n:number}>();
 return result({ok:true,...linked,managedPhotos:Number(count?.n||0),linkedAccounts:await linkedAccountNames(updated.owner_hash)},request);
}
