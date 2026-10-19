// 签到 + 积分：前端交互
// 页面加载后拉状态，点击签到，登录变化后刷新

(function(){
 const checkinBtn=$('#checkin-button');
 const checkinLabel=$('#checkin-label');
 const pointsBadge=$('#points-badge');

 // 更新按钮和徽标显示
 function renderCheckin(state){
  if(state.checkedIn){
   checkinLabel.textContent='已签到 ✓';
   checkinBtn.disabled=true;
  }else{
   checkinLabel.textContent='签到';
   checkinBtn.disabled=false;
  }
  if(state.totalPoints>0){
   pointsBadge.textContent=state.totalPoints;
   pointsBadge.hidden=false;
  }else{
   pointsBadge.hidden=true;
  }
 }

 // 从服务端拉取签到状态
 async function refreshCheckin(){
  try{
   const data=await api('/checkin');
   renderCheckin(data);
  }catch{
   // 未登录或网络错误：显示默认状态
   renderCheckin({checkedIn:false,streak:0,totalPoints:0});
  }
 }

 // 执行签到
 async function doCheckin(){
  if(!app.account?.signedIn){
   openLogin(()=>doCheckin());
   return;
  }
  checkinBtn.disabled=true;
  checkinLabel.textContent='签到中…';
  try{
   const data=await api('/checkin',{method:'POST',json:{}});
   renderCheckin({checkedIn:true,totalPoints:Number(data.total)||0});
   if(!data.duplicate){
    toast('+'+data.pointsAwarded+' 分，已连续 '+data.streak+' 天');
   }
  }catch(err){
   toast(err.message||'签到失败');
   refreshCheckin();
  }
 }

 checkinBtn.addEventListener('click',doCheckin);

 // 挂到 updateProfile 链：登录/退出/切换账号时自动刷新
 const _updateProfile=updateProfile;
 updateProfile=function(){_updateProfile();refreshCheckin();};

 // 首次加载
 refreshCheckin();
})();
