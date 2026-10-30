// Only one hovered desktop card updates, at most once per pointer animation frame.
let resetMallCardHover=()=>{};
(function(){
 const grid=$('#mall-items'),media=matchMedia('(min-width:701px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
 let card=null,rect=null,frame=0,x=0,y=0;
 function reset(){cancelAnimationFrame(frame);frame=0;if(card){card.classList.remove('is-hovered');for(const key of ['--card-rx','--card-ry','--card-light-x','--card-light-y'])card.style.removeProperty(key);}card=null;rect=null;}
 function paint(){frame=0;if(!card||!media.matches||!card.isConnected){reset();return;}const px=Math.max(0,Math.min(1,(x-rect.left)/rect.width)),py=Math.max(0,Math.min(1,(y-rect.top)/rect.height));card.style.setProperty('--card-rx',((.5-py)*12).toFixed(2)+'deg');card.style.setProperty('--card-ry',((px-.5)*12).toFixed(2)+'deg');card.style.setProperty('--card-light-x',(px*100).toFixed(1)+'%');card.style.setProperty('--card-light-y',(py*100).toFixed(1)+'%');}
 resetMallCardHover=reset;
 grid.addEventListener('pointermove',event=>{
  if(!media.matches||event.pointerType!=='mouse'){reset();return;}
  const next=event.target.closest('.mall-card');if(!next||!grid.contains(next)){reset();return;}
  if(card!==next){reset();card=next;rect=card.getBoundingClientRect();card.classList.add('is-hovered');}
  x=event.clientX;y=event.clientY;if(!frame)frame=requestAnimationFrame(paint);
 });
 grid.addEventListener('pointerleave',reset);grid.addEventListener('pointercancel',reset);grid.addEventListener('focusin',reset);
 grid.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse')reset();});
 media.addEventListener('change',reset);window.addEventListener('resize',reset);window.addEventListener('scroll',reset,{passive:true,capture:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
 new MutationObserver(()=>{if(card&&!card.isConnected)reset();}).observe(grid,{childList:true});
})();
