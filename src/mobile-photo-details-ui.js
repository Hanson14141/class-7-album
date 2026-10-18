const mobilePhotoMedia=matchMedia('(max-width:700px)');
let captionExpanded=false;
function fitMobilePhotoStory(){
 const caption=$('#lightbox-caption'),button=$('#caption-expand'),mobile=mobilePhotoMedia.matches;
 const longCaption=mobile&&!caption.hidden&&caption.scrollHeight>Math.ceil(parseFloat(getComputedStyle(caption).lineHeight)*3)+2;
 button.hidden=!longCaption;
 button.textContent=captionExpanded?'收起说明':'展开完整说明';
 button.setAttribute('aria-expanded',String(captionExpanded));
 caption.classList.toggle('caption-collapsed',mobile&&!captionExpanded);
}
function resetMobilePhotoStory(){
 captionExpanded=false;
 $('#photo-extra-info').open=!mobilePhotoMedia.matches;
 if(mobilePhotoMedia.matches){$('#photo-details').hidden=false;$('#details-toggle').setAttribute('aria-expanded','true');}
 $('#lightbox-caption').classList.remove('caption-collapsed');
 fitMobilePhotoStory();
}
$('#caption-expand').addEventListener('click',()=>{captionExpanded=!captionExpanded;fitMobilePhotoStory();});
mobilePhotoMedia.addEventListener('change',resetMobilePhotoStory);
new ResizeObserver(fitMobilePhotoStory).observe($('#lightbox-caption'));
resetMobilePhotoStory();
