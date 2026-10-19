// 签到 + 积分：后端路由与加分 helper
// 用 function 声明（非 const 箭头），拼接后同模块可直接调用

async function awardPoints(accountId:string,reason:string,refId:string)
 :Promise<{awarded:boolean;points:number;total:number}>{
 const row=await database().prepare('SELECT class7_test.award_points(?,?,?) AS result')
  .bind(accountId,reason,refId).first<{result:any}>();
 const r=typeof row?.result==='string'?JSON.parse(row.result):row?.result;
 return {awarded:r?.awarded===true,points:Number(r?.points)||0,total:Number(r?.total)||0};
}

async function checkinRoute(request:Request,method:string){
 if(method==='GET'){
  let account:{id:string}|null=null;
  try{account=await requireAccount(request);}catch{}
  if(!account)return response({checkedIn:false,streak:0,totalPoints:0});
  const row=await database().prepare(
   'SELECT total,streak,last_checkin_date FROM class7_test.user_points WHERE account_id=?')
   .bind(account.id).first<{total:number;streak:number;last_checkin_date:string}>();
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
  return response({checkedIn:row?.last_checkin_date===today,
   streak:Number(row?.streak)||0,totalPoints:Number(row?.total)||0});
 }
 if(method!=='POST')throw new ApiError(404,'没有找到这个接口。');
 const account=await requireAccount(request);
 const row=await database().prepare('SELECT class7_test.do_checkin(?) AS result')
  .bind(account.id).first<{result:any}>();
 const result=typeof row?.result==='string'?JSON.parse(row.result):row?.result;
 return response(result);
}
