// Milestones use the server's complete inventory count, never the loaded page.
const collectionMilestones=[
 {count:30,title:'新手收藏者'},
 {count:60,title:'老手收藏家'},
 {count:90,title:'大份收集家'}
];
function collectionProgress(value){
 const count=Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
 const earned=collectionMilestones.filter(item=>count>=item.count),next=collectionMilestones.find(item=>count<item.count)||null;
 return {count,earned,next,title:earned.at(-1)?.title||'尚未获得称号',progress:Math.min(90,count),remaining:next?next.count-count:0};
}
const collectionSetTitles={common:'超越常人的恒心',epic:'史到临头',legendary:'高三七班没有活着的传奇',classified:'黑暗往事'};
function collectionSetProgress(tier,stats,earned=[]){const total=Math.max(0,Number(stats?.total)||0),owned=Math.max(0,Number(stats?.owned)||0);const required=tier==='classified'?1:total;return {title:collectionSetTitles[tier],total,owned,required,unlocked:earned.some(x=>x.rarity===tier),complete:required>0&&owned>=required};}
function renderCollectionProgress(){
 const section=$('#mall-collection-progress');
 section.hidden=!app.account?.signedIn||mallState.mode!=='inventory'||!mallState.summaryLoaded;
 if(section.hidden)return;
 const state=collectionProgress(mallState.total);
 $('#collection-total').textContent=state.count;
 $('#collection-current-title').textContent=state.title;
 $('#collection-next').textContent=state.next?'再收藏 '+state.remaining+' 张，解锁「'+state.next.title+'」':'三个收藏成就已全部解锁';
 const grid=$('#collection-rarity-progress');grid.replaceChildren();for(const tier of mallRarities){const stats=mallState.collection.find(x=>x.rarity===tier.key)||{owned:0,total:0};const cell=document.createElement('div');cell.className='collection-tier';cell.dataset.rarity=tier.key;const label=document.createElement('span');label.textContent=tier.label;const count=document.createElement('strong');count.textContent=stats.owned+' / '+stats.total;const meter=document.createElement('progress');meter.max=Math.max(1,stats.total);meter.value=stats.owned;meter.setAttribute('aria-label',tier.label+'照片已收藏 '+stats.owned+' 张，共 '+stats.total+' 张');const achievement=collectionSetProgress(tier.key,stats,mallState.setAchievements),title=document.createElement('span'),status=document.createElement('span');title.className='collection-set-title';title.textContent=achievement.title;status.className='collection-set-state';status.textContent=achievement.unlocked?'已达成':tier.key==='classified'?'拥有 1 张保密卡解锁':stats.total>0?'集齐解锁':'卡池暂无照片';cell.classList.toggle('is-complete',achievement.unlocked);cell.append(label,count,meter,title,status);grid.append(cell);}
 for(const item of collectionMilestones){const node=$('[data-collection-goal="'+item.count+'"]'),unlocked=state.count>=item.count;node.classList.toggle('is-unlocked',unlocked);$('.collection-achievement-state',node).textContent=unlocked?'已解锁':'未解锁';}
}
function notifyCollectionMilestone(before,after){const unlocked=collectionMilestones.filter(item=>before<item.count&&after>=item.count);if(unlocked.length)toast('解锁收藏成就：'+unlocked.at(-1).title);}
