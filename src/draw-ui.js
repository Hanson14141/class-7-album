// The server owns RNG, spending, inventory and pity. Requests retain their id after ambiguous errors.
const drawState={identity:null,generation:0,epoch:0,loading:false,busy:false,pending:null,totalPoints:null,totalDraws:0,legendaryMisses:0,classifiedMisses:0,entries:[],pointsRevision:0};
function drawPendingKey(){return 'class7-draw-pending:'+app.account?.username;}
function saveDrawPending(){try{if(drawState.pending)sessionStorage.setItem(drawPendingKey(),JSON.stringify(drawState.pending));else sessionStorage.removeItem(drawPendingKey());}catch{}}
function drawStatus(message,error=false){const p=$('#draw-status');p.textContent=message;p.hidden=!message;p.classList.toggle('is-error',error);}
function renderDraw(){
 const signed=!!app.account?.signedIn;$('#draw-points').textContent=signed&&drawState.totalPoints!==null?String(drawState.totalPoints):'—';$('#draw-login').hidden=signed;
 $('#draw-legendary-left').textContent='最多 '+(30-drawState.legendaryMisses)+' 抽';$('#draw-classified-left').textContent='最多 '+(50-drawState.classifiedMisses)+' 抽';
 $('#draw-legendary-progress').value=drawState.legendaryMisses;$('#draw-classified-progress').value=drawState.classifiedMisses;
 $('#draw-total').textContent=drawState.totalDraws?'已抽 '+drawState.totalDraws+' 次 · 保底跨天保留':'单抽与十连共用保底 · 进度永久保留';
 for(const [id,cost]of[['draw-single',10],['draw-ten',90]])$('#'+id).disabled=drawState.loading||drawState.busy||!!drawState.pending||(signed&&Number(drawState.totalPoints)<cost);
 $('#draw-retry').hidden=!signed||!drawState.pending;$('#draw-retry').disabled=drawState.busy||drawState.loading;
 $('#draw-board').setAttribute('aria-busy',String(drawState.busy||drawState.loading));
}
function renderDrawResults(){
 const wrap=$('#draw-results');wrap.replaceChildren();$('#draw-results-heading').textContent=drawState.entries.length?'本次收藏':'你的下一张回忆';
 if(!drawState.entries.length){const p=document.createElement('p');p.className='draw-placeholder';p.textContent='抽到的照片会直接收进「我的库存」。';wrap.append(p);return;}
 for(const item of drawState.entries){const card=document.createElement('article');card.className='mall-card';card.dataset.rarity=mallRarity(item.rarity).key;card.append(mallPicture(item));const body=document.createElement('div');body.className='mall-card-body';const badge=document.createElement('span');badge.className='mall-rarity';badge.textContent=mallRarity(item.rarity).label+(item.rarity==='classified'?' · 独占':'');const title=document.createElement('h3');title.textContent=item.title;body.append(badge,title);if(item.caption){const p=document.createElement('p');p.className='mall-card-caption';p.textContent=item.caption;body.append(p);}const note=document.createElement('p');note.className='draw-guaranteed';note.textContent='第 '+item.drawNumber+' 抽'+(item.guaranteed?' · 保底获得':'')+' · 已入库';body.append(note);card.append(body);wrap.append(card);}
}
function syncDrawLayout(){const open=!!app.drawOpen;document.body.classList.toggle('draw-board-mode',open);$('#draw-board').hidden=!open;const nav=$('#draw-nav');nav.classList.toggle('active',open);if(open){nav.setAttribute('aria-current','page');for(const n of $$('.nav-tab,#weekly-contest-nav,#comment-contest-nav,#mall-nav')){n.classList.remove('active');n.removeAttribute('aria-current');}}else nav.removeAttribute('aria-current');}
function closeDraw(){if(!app.drawOpen)return;cancelDrawCinema();app.drawOpen=false;drawState.epoch++;drawState.loading=false;syncDrawLayout();applyContestLayout();refreshWallMotion();}
async function openDraw(){if(app.bulkBusy)return;closeMall();closeCommentBoard();app.drawOpen=true;app.selecting=false;app.selected.clear();updateBulkUI();syncDrawLayout();refreshWallMotion();await loadDraw();}
async function loadDraw(){
 const epoch=++drawState.epoch,generation=ownershipGeneration,revision=drawState.pointsRevision;drawState.loading=true;renderDraw();
 try{const data=await api('/draw');if(epoch!==drawState.epoch||generation!==ownershipGeneration||!app.drawOpen)return;for(const k of['totalDraws','legendaryMisses','classifiedMisses'])drawState[k]=Number(data[k])||0;if(revision===drawState.pointsRevision)drawState.totalPoints=Number(data.totalPoints)||0;drawStatus(drawState.pending?'上次抽卡结果尚未确认，请重试查询；不会重复扣分。':'');}
 catch(error){if(epoch===drawState.epoch&&generation===ownershipGeneration)drawStatus(error.message||'抽卡状态暂时无法读取。',true);}
 finally{if(epoch===drawState.epoch&&generation===ownershipGeneration){drawState.loading=false;renderDraw();}}
}
async function performDraw(count,retry=false){
 if(drawState.busy||drawState.loading)return;if(!app.account?.signedIn){openLogin(()=>{if(app.drawOpen)loadDraw();});return;}
 if(drawState.pending&&!retry)return;
 if(!retry){drawState.pending={count,cost:count===10?90:10,requestId:crypto.randomUUID()};saveDrawPending();}
 if(!drawState.pending)return;const generation=ownershipGeneration,request={...drawState.pending};drawState.busy=true;drawStatus('正在收集这一刻…');renderDraw();
 try{const result=await api('/draw',{method:'POST',json:request});if(generation!==ownershipGeneration)return;drawState.pending=null;saveDrawPending();for(const k of['totalPoints','totalDraws','legendaryMisses','classifiedMisses'])drawState[k]=Number(result[k])||0;drawState.entries=result.entries||[];renderDrawResults();$('#draw-result-note').textContent=(result.duplicate?'已找回本次结果 · ':'')+request.count+' 张 · '+result.cost+' 积分';mallState.summaryLoaded=false;mallState.inventory=[];mallState.cursor=null;drawStatus('已加入我的库存。');await playDrawCinema(drawState.entries);if(generation!==ownershipGeneration)return;if(result.duplicate&&app.drawOpen)await loadDraw();}
 catch(error){if(generation!==ownershipGeneration)return;if(error.status&&error.status<500){drawState.pending=null;saveDrawPending();}drawStatus(drawState.pending?'结果暂时无法确认。请点击重试查询，同一次抽卡不会重复扣分。':error.message||'抽卡未完成。',true);}
 finally{if(generation===ownershipGeneration){drawState.busy=false;renderDraw();}}
}
function refreshDrawIdentity(){
 const identity=(app.account?.signedIn?app.account.username:'')+'|'+ownershipGeneration;if(drawState.identity===identity)return;cancelDrawCinema();
 drawState.identity=identity;drawState.pointsRevision++;drawState.epoch++;drawState.loading=false;drawState.busy=false;drawState.pending=null;drawState.entries=[];drawState.totalPoints=null;drawState.totalDraws=0;drawState.legendaryMisses=0;drawState.classifiedMisses=0;
 if(app.account?.signedIn)try{const pending=JSON.parse(sessionStorage.getItem(drawPendingKey())||'null');if(pending&&[1,10].includes(pending.count)&&pending.cost===(pending.count===10?90:10)&&/^[a-f0-9-]{36}$/i.test(pending.requestId))drawState.pending=pending;}catch{}
 $('#draw-result-note').textContent='';drawStatus('');renderDrawResults();renderDraw();if(app.drawOpen)loadDraw();
}
$('#draw-nav').addEventListener('click',openDraw);for(const nav of $$('.nav-tab,#weekly-contest-nav,#comment-contest-nav,#mall-nav'))nav.addEventListener('click',()=>{if(!app.bulkBusy)closeDraw();},true);
$('#draw-single').addEventListener('click',()=>performDraw(1));$('#draw-ten').addEventListener('click',()=>performDraw(10));$('#draw-retry').addEventListener('click',()=>performDraw(drawState.pending?.count,true));$('#draw-inventory').addEventListener('click',()=>{closeDraw();mallState.mode='inventory';openMall();});
const drawProfileHook=updateProfile;updateProfile=function(){drawProfileHook();refreshDrawIdentity();};const drawLayoutHook=applyContestLayout;applyContestLayout=function(){drawLayoutHook();syncDrawLayout();};
document.addEventListener('class7:points',event=>{if(app.account?.signedIn){drawState.pointsRevision++;drawState.totalPoints=Math.max(0,Number(event.detail.total)||0);if(app.drawOpen)renderDraw();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&app.drawOpen&&!drawState.busy)loadDraw();});
refreshDrawIdentity();
