// Server-owned scores: mutations and their points commit in one transaction.
function normalizePoints(value:any){const r=typeof value==='string'?JSON.parse(value):value;return {awarded:r?.awarded===true,points:Number(r?.points)||0,total:Number(r?.total)||0};}
async function checkinState(accountId:string){
 const row=await database().prepare("SELECT total,CASE WHEN last_checkin_date>=(now() AT TIME ZONE 'Asia/Shanghai')::date-1 THEN streak ELSE 0 END AS streak,last_checkin_date=(now() AT TIME ZONE 'Asia/Shanghai')::date AS checked_in FROM class7_test.user_points WHERE account_id=?").bind(accountId).first<any>();
 return {checkedIn:row?.checked_in===true,streak:Number(row?.streak)||0,totalPoints:Number(row?.total)||0};
}
async function checkinRoute(request:Request,method:string){
 if(method==='GET'){
  let account;try{account=await requireAccount(request);}catch(error){if(error instanceof AccountError&&error.status===401)return response({checkedIn:false,streak:0,totalPoints:0});throw error;}
  return response(await checkinState(account.id));
 }
 if(method!=='POST')throw new ApiError(404,'没有找到这个接口。');
 const account=await requireAccount(request),row=await database().prepare('SELECT class7_test.do_checkin(?) AS result').bind(account.id).first<{result:any}>();
 return response(typeof row?.result==='string'?JSON.parse(row.result):row?.result);
}
async function pointsRoute(request:Request,method:string){if(method!=='GET')throw new ApiError(404,'没有找到这个接口。');const account=await requireAccount(request);return response(await checkinState(account.id));}
