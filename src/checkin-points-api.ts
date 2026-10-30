// Server-owned scores: mutations and their points commit in one transaction.
function normalizePoints(value:any){const r=typeof value==='string'?JSON.parse(value):value;return {awarded:r?.awarded===true,points:Number(r?.points)||0,total:Number(r?.total)||0};}
async function checkinState(accountId:string){
 const row=await database().prepare('SELECT class7_test.reward_points_state(?) AS result').bind(accountId).first<{result:any}>();
 const state=typeof row?.result==='string'?JSON.parse(row.result):row?.result;
 return {checkedIn:state?.checkedIn===true,streak:Number(state?.streak)||0,totalPoints:Number(state?.totalPoints)||0};
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
