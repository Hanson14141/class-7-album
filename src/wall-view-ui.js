// Desktop browsing preference is independent of the established phone layout.
const desktopWallMedia=matchMedia('(min-width:701px)');
let desktopWallView=safeRead('class7-desktop-wall-view')==='flow'?'flow':'complete';
function completeWallView(){return desktopWallMedia.matches&&desktopWallView==='complete';}
function updateWallViewUI(){
 const complete=completeWallView(),button=$('#wall-view-toggle');
 $('#photo-wall').closest('.wall-shell').classList.toggle('complete-wall',complete);
 button.textContent=complete?'切换流动照片墙':'切换完整浏览';
 button.setAttribute('aria-pressed',String(complete));
 button.title=complete?'当前为完整浏览，点击切换自动流动':'当前为自动流动，点击完整浏览所有照片';
 $('.gallery-hint').hidden=complete;
}
$('#wall-view-toggle').addEventListener('click',()=>{
 desktopWallView=completeWallView()?'flow':'complete';
 safeWrite('class7-desktop-wall-view',desktopWallView);
 renderWall({preserveOrder:true});
});
desktopWallMedia.addEventListener('change',()=>renderWall({preserveOrder:true}));
updateWallViewUI();
