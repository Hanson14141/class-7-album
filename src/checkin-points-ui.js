// Daily check-in and score display; ignore requests from previous identities.
(function(){
 const button=$('#checkin-button'),label=$('#checkin-label'),badge=$('#points-badge');
 let requestVersion=0,pointsRevision=0,busy=false,refreshAfterCheckin=false,lastIdentity=null,state={checkedIn:false,streak:0,totalPoints:0},timer;
 function mergeTotal(value,revision){const total=Math.max(0,Number(value)||0);return revision===pointsRevision?total:state.totalPoints;}
 function render(){label.textContent=busy?'签到中…':state.checkedIn?'已签到 ✓':'签到';button.disabled=busy||state.checkedIn;button.title='每日签到 +10 分，每连续7天额外 +30 分'+(state.streak?' · 已连续 '+state.streak+' 天':'');badge.textContent=state.totalPoints;badge.hidden=state.totalPoints<=0;badge.setAttribute('aria-label','积分 '+state.totalPoints);}
 async function refresh(force=false){
  const key=(app.account?.signedIn?app.account.username:'')+'|'+ownershipGeneration,changed=key!==lastIdentity;
  if(busy&&!changed){if(force)refreshAfterCheckin=true;return;}if(!force&&!changed)return;
  lastIdentity=key;busy=false;if(changed){pointsRevision=0;refreshAfterCheckin=false;}
  const version=++requestVersion,generation=ownershipGeneration,revision=pointsRevision;
  if(!app.account?.signedIn){state={checkedIn:false,streak:0,totalPoints:0};busy=false;render();return;}
  if(changed)state={checkedIn:false,streak:0,totalPoints:0};render();
  try{const data=await api('/checkin');if(version!==requestVersion||generation!==ownershipGeneration)return;state={...data,totalPoints:mergeTotal(data.totalPoints,revision)};render();}catch{if(version===requestVersion){button.title='签到状态暂时不可用，点击可重试';}}
 }
 async function checkin(){
  if(!app.account?.signedIn){openLogin(checkin);return;}if(busy)return;
  busy=true;const version=++requestVersion,generation=ownershipGeneration,revision=pointsRevision;render();
  try{const data=await api('/checkin',{method:'POST',json:{}});if(version!==requestVersion||generation!==ownershipGeneration)return;state={checkedIn:!!data.checkedIn,streak:Number(data.streak)||0,totalPoints:mergeTotal(data.total,revision)};if(!data.duplicate)toast('+'+data.pointsAwarded+' 分，已连续 '+data.streak+' 天');else toast('今天已经签到');}
  catch(error){if(version===requestVersion)toast(error.message||'签到失败，请重试。');}
  finally{if(version===requestVersion){busy=false;render();if(refreshAfterCheckin){refreshAfterCheckin=false;refresh(true);}}}
 }
 function schedule(){clearTimeout(timer);const bj=Date.now()+8*3600000,next=Math.floor(bj/86400000)*86400000+86400000-8*3600000;timer=setTimeout(()=>{refresh(true);schedule();},Math.max(1000,next-Date.now()+200));}
 button.addEventListener('click',checkin);
 document.addEventListener('class7:points',event=>{if(app.account?.signedIn){pointsRevision++;state.totalPoints=Math.max(0,Number(event.detail.total)||0);render();}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
 const original=updateProfile;updateProfile=function(){original();refresh();};
 schedule();
})();
