// Totals describe all matching records, independently of the loaded page.
let albumPhotoCounts={all:null,mine:null,owned:null};
function resetPhotoCounts(){albumPhotoCounts={all:null,mine:null,owned:null};}
function acceptPhotoCounts(data,mine){
 const total=Number(data.total);
 if(!Number.isSafeInteger(total)||total<0)return;
 const uploaders=Array.isArray(data.uploaders)?new Map(data.uploaders.map(item=>[item.uploader,Number(item.total)])):null;
 albumPhotoCounts[mine?'mine':'all']={total,uploaders};
 const owned=Number(data.ownedTotal);
 if(Number.isSafeInteger(owned)&&owned>=0)albumPhotoCounts.owned=owned;
 if(mine)albumPhotoCounts.owned=total;
}
function photoTotalForView(mine,uploader=''){
 const source=app.photos.filter(photo=>(mine?isMine(photo):!photo.local)&&(!uploader||photo.uploader===uploader));
 const legacy=mine?source.filter(photo=>photo.local).length:0,counts=albumPhotoCounts[mine?'mine':'all'];
 if(mine&&!uploader&&albumPhotoCounts.owned!==null)return albumPhotoCounts.owned+legacy;
 if(counts&&(!uploader||counts.uploaders))return (uploader?counts.uploaders.get(uploader)||0:counts.total)+legacy;
 return source.length;
}
function adjustPhotoCounts(photo,delta){
 if(photo.local)return;
 const adjust=counts=>{if(!counts)return;counts.total=Math.max(0,counts.total+delta);if(counts.uploaders)counts.uploaders.set(photo.uploader,Math.max(0,(counts.uploaders.get(photo.uploader)||0)+delta));};
 adjust(albumPhotoCounts.all);
 if(isMine(photo)){adjust(albumPhotoCounts.mine);if(albumPhotoCounts.owned!==null)albumPhotoCounts.owned=Math.max(0,albumPhotoCounts.owned+delta);}
}
function renderPhotoCount(){
 const mine=app.view==='mine',total=photoTotalForView(mine,app.filter),loaded=app.visible.length;
 $('#photo-count').textContent=String(total);
 $('#photo-count').title='共 '+total+' 张照片，已加载 '+loaded+' 张';
 $('#photo-count').setAttribute('aria-label','共 '+total+' 张照片');
 $('#load-more-photos').textContent='加载更多照片（已显示 '+loaded+' / 共 '+total+' 张）';
}
