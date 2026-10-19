// Milestones use the server's complete inventory count, never the loaded page.
const collectionMilestones=[
 {count:20,title:'新手收藏者'},
 {count:40,title:'老手收藏家'},
 {count:60,title:'大份收集家'}
];
function collectionProgress(value){
 const count=Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
 const earned=collectionMilestones.filter(item=>count>=item.count),next=collectionMilestones.find(item=>count<item.count)||null;
 return {count,earned,next,title:earned.at(-1)?.title||'尚未获得称号',progress:Math.min(60,count),remaining:next?next.count-count:0};
}
function renderCollectionProgress(){
 const section=$('#mall-collection-progress');
 section.hidden=!app.account?.signedIn||mallState.mode!=='inventory'||!mallState.summaryLoaded;
 if(section.hidden)return;
 const state=collectionProgress(mallState.total);
 $('#collection-total').textContent=state.count;
 $('#collection-current-title').textContent=state.title;
 $('#collection-next').textContent=state.next?'再收藏 '+state.remaining+' 张，解锁「'+state.next.title+'」':'三个收藏成就已全部解锁';
 const grid=$('#collection-rarity-progress');grid.replaceChildren();for(const tier of mallRarities){const stats=mallState.collection.find(x=>x.rarity===tier.key)||{owned:0,total:0};const cell=document.createElement('div');cell.className='collection-tier';cell.dataset.rarity=tier.key;const label=document.createElement('span');label.textContent=tier.label;const count=document.createElement('strong');count.textContent=stats.owned+' / '+stats.total;const meter=document.createElement('progress');meter.max=Math.max(1,stats.total);meter.value=stats.owned;meter.setAttribute('aria-label',tier.label+'照片已收藏 '+stats.owned+' 张，共 '+stats.total+' 张');cell.append(label,count,meter);grid.append(cell);}
 for(const item of collectionMilestones){const node=$('[data-collection-goal="'+item.count+'"]'),unlocked=state.count>=item.count;node.classList.toggle('is-unlocked',unlocked);$('.collection-achievement-state',node).textContent=unlocked?'已解锁':'未解锁';}
}
function notifyCollectionMilestone(before,after){const unlocked=collectionMilestones.filter(item=>before<item.count&&after>=item.count);if(unlocked.length)toast('解锁收藏成就：'+unlocked.at(-1).title);}
