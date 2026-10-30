let weeklyContest=null,contestPeriod='current';
function weeklyActive(){return $('#photo-order').value==='weekly';}
function contestDate(value){return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).format(new Date(value));}
function applyContestLayout(){
 const active=!app.commentBoardOpen&&weeklyActive();document.body.classList.toggle('contest-mode',active);$('#weekly-contest').hidden=!active;
 $('#weekly-contest-nav').classList.toggle('active',active);
 if(active)$('#weekly-contest-nav').setAttribute('aria-current','page');else $('#weekly-contest-nav').removeAttribute('aria-current');
 for(const tab of $$('.nav-tab')){const chosen=!active&&tab.dataset.view===app.view;tab.classList.toggle('active',chosen);if(chosen)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
 $('#ranking-note').hidden=!rankingActive()||active;
 syncCommentBoardNav();
}
function acceptWeeklyContest(data){weeklyContest=data.contest;const owned=Number(data.ownedTotal);if(Number.isSafeInteger(owned)&&owned>=0)albumPhotoCounts.owned=owned;}
function renderWeeklyContest(){
 applyContestLayout();const active=weeklyActive();$('#wall-shell').hidden=active&&app.visible.filter(photo=>photo.rank>3).length===0;
 if(!active)return;
 $('#gallery-title').textContent='本期排行';$('#photo-count').textContent=weeklyContest?String(weeklyContest.total):'—';
 const loaded=app.visible.length,total=weeklyContest?.total||0;$('#load-more-photos').textContent='加载更多参赛照片（已显示 '+loaded+' / 共 '+total+' 张）';
 $('#photo-count').setAttribute('aria-label','本期共 '+total+' 张获得有效点赞的照片');
 $('#photo-count').title='本期共 '+total+' 张参赛照片，已加载 '+loaded+' 张';
 $('#contest-current').setAttribute('aria-pressed',String(contestPeriod==='current'));$('#contest-previous').setAttribute('aria-pressed',String(contestPeriod==='previous'));
 $('#contest-previous').disabled=!weeklyContest?.hasPrevious;
 $('#contest-dates').textContent=weeklyContest?contestDate(weeklyContest.start)+' — '+contestDate(Date.parse(weeklyContest.end)-1)+' · 北京时间':'正在读取本期大赛…';
 $('#contest-state').textContent=weeklyContest?(weeklyContest.closed?'已结算':'进行中 · 刷新更新'):'请稍候';
 const firstPeriod=weeklyContest&&!weeklyContest.closed&&Date.parse(weeklyContest.statsFrom)>Date.parse(weeklyContest.start);$('#contest-first-period').hidden=!firstPeriod;
 if(firstPeriod)$('#contest-first-period').textContent='首期自 '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(weeklyContest.statsFrom))+' 开始计分，已有赞保留在总榜。';
 const podium=$('#contest-podium');podium.replaceChildren();
 for(let place=1;place<=3;place++){
  const photo=app.visible.find(p=>p.rank===place),card=document.createElement(photo?'button':'div');card.className='contest-card'+(photo?'':' contest-vacant');
  const name=['冠军','亚军','季军'][place-1],heading=document.createElement('div');heading.className='contest-place';const number=document.createElement('strong');number.textContent='0'+place;const label=document.createElement('span');label.textContent=name;heading.append(number,label);
  const imageBox=document.createElement('div');imageBox.className='contest-image';card.append(heading,imageBox);
  if(photo){card.type='button';card.dataset.photoId=photo.id;card.setAttribute('aria-label',name+'，'+photo.title+'，本期 '+photo.weeklyCount+' 个赞');
   const image=document.createElement('img');image.alt=photo.title;image.decoding='async';image.src=photo.src;imageBox.append(image);
   const title=document.createElement('h3');title.className='contest-card-title';title.textContent=photo.title;
   const votes=document.createElement('p');votes.className='contest-votes';const count=document.createElement('strong');count.textContent=String(photo.weeklyCount);votes.append(count,document.createTextNode('本期赞'));card.append(title,votes);
   card.addEventListener('click',()=>openPhoto(photo.id));podium.append(card);fitRotatedImage(image,photo,imageBox.clientWidth,imageBox.clientHeight);
  }else{imageBox.textContent=app.cloudLoaded?(weeklyContest?.closed?'本期暂无照片':'席位待定'):'正在统计';podium.append(card);}
 }
 const empty=app.cloudLoaded&&total===0;$('#contest-empty').hidden=!empty;
 $('#contest-empty-message').textContent=weeklyContest?.closed?'本期没有获得有效点赞的照片。':'本周还没有有效点赞，以前赞过的照片也能再选。';
}
async function openWeeklyContest(){if(app.bulkBusy)return;closeCommentBoard();photoOrder='weekly';contestPeriod='current';app.view='all';app.filter='';safeWrite('class7-photo-order',photoOrder);await reloadPhotoOrder();}
$('#weekly-contest-nav').addEventListener('click',openWeeklyContest);
for(const [id,period] of [['contest-current','current'],['contest-previous','previous']])$('#'+id).addEventListener('click',async()=>{if(contestPeriod===period)return;contestPeriod=period;await reloadPhotoOrder();});
$('#contest-explore').addEventListener('click',async()=>{photoOrder='random';safeWrite('class7-photo-order',photoOrder);await reloadPhotoOrder();});
applyContestLayout();
