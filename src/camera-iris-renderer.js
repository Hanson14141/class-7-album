// One alpha surface for the entire iris; opaque metal is painted directly.
// This factory is self-contained so the same drawing code runs in a worker or fallback.
function cameraIrisPainter(canvas){
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
 if(!ctx)throw Error('Canvas 2D unavailable');
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 const rad=a=>a*Math.PI/180;
 const point=(x,y,a)=>[x*Math.cos(rad(a))-y*Math.sin(rad(a)),x*Math.sin(rad(a))+y*Math.cos(rad(a))];
 const sector=(a,b)=>{const q1=point(40,-15,a),q2=point(40,-15,b),p1=point(130,0,a),p2=point(130,0,b),p=new Path2D();p.moveTo(0,0);p.quadraticCurveTo(...q1,...p1);p.arc(0,0,130,rad(a),rad(b));p.quadraticCurveTo(...q2,0,0);p.closePath();return p;};
 const body=new Path2D('M-18-100Q18 0-18 100H220V-100Z');
 const front=new Path2D('M-18-100Q18 0-18 100');
 const seam=new Path2D();seam.moveTo(0,0);seam.quadraticCurveTo(...point(40,-15,-40),...point(130,0,-40));
 const wedge=sector(-40,40),returned=sector(-40,-20),disc=new Path2D();disc.arc(0,0,82,0,Math.PI*2);
 const gray=n=>'rgb('+n+','+n+','+n+')';
 const paints=[52,48,44,49,45,41].map(n=>{const g=ctx.createLinearGradient(-20,-82,95,70);g.addColorStop(0,gray(n+15));g.addColorStop(.45,gray(n));g.addColorStop(1,gray(n-12));return g;});
 return function draw(progress){
  const p=Math.max(0,Math.min(1,progress)),size=canvas.width;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,size,size);
  if(p>=1)return;
  ctx.save();ctx.translate(size/2,size/2);ctx.scale(size/240,size/240);
  ctx.beginPath();ctx.arc(0,0,112,0,Math.PI*2);ctx.moveTo(81,0);ctx.arc(0,0,81,0,Math.PI*2);ctx.fillStyle='#181818';ctx.fill('evenodd');
  ctx.strokeStyle='#191919';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,111,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#e9e9e9';ctx.lineWidth=20;ctx.beginPath();ctx.arc(0,0,99,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#3b3b3b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,86,0,Math.PI*2);ctx.stroke();
  ctx.clip(disc);
  ctx.rotate(rad(-60*smooth((p-.04)/.96)));
  const opening=92*Math.pow(smooth((p-.12)/.84),1.8);
  // Continuous backing closes antialiased seams between separately clipped leaves.
  // Its curved hexagonal opening follows the six moving front edges, slightly inset.
  const inset=Math.max(0,opening-.45),x=2*inset/(1+Math.sqrt(1+.0024*inset)),y=x/Math.sqrt(3);
  ctx.beginPath();ctx.arc(0,0,82,0,Math.PI*2);ctx.closePath();
  if(inset>0){
   ctx.moveTo(x,-y);
   for(let i=0;i<6;i++){const control=point(2*inset-x,0,i*60),end=point(x,y,i*60);ctx.quadraticCurveTo(...control,...end);}
   ctx.closePath();
  }
  ctx.fillStyle='#242424';ctx.fill('evenodd');
  const leaf=(i,clip)=>{
   ctx.save();ctx.rotate(rad(i*60));ctx.clip(clip);ctx.translate(opening,0);
   // Every leaf is fully opaque. Only its geometrical opening is transparent.
   ctx.fillStyle=paints[i];ctx.fill(body);
   ctx.strokeStyle='#747474';ctx.globalAlpha=.45;ctx.lineWidth=.65;ctx.stroke(front);ctx.globalAlpha=1;
   ctx.clip(body);ctx.translate(-opening,0);
   ctx.strokeStyle='#080808';ctx.lineWidth=2.4;ctx.globalAlpha=.85;ctx.stroke(seam);
   ctx.translate(.65,.5);ctx.strokeStyle='#b6b6b6';ctx.lineWidth=.55;ctx.globalAlpha=.6;ctx.stroke(seam);
   ctx.restore();
  };
  for(let i=0;i<6;i++)leaf(i,wedge);
  leaf(0,returned);
  const coreAlpha=1-smooth((p-.1)/.14);
  if(coreAlpha>0){ctx.globalAlpha=coreAlpha;ctx.fillStyle='#07080a';ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();}
  ctx.restore();ctx.globalAlpha=1;
 };
}
// A viewport-sized matte avoids scaling an enormous SVG texture with the lens.
function cameraMattePainter(canvas,geometry){
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});if(!ctx)throw Error('Canvas matte unavailable');
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 return p=>{const w=canvas.width,h=canvas.height,r=82*geometry.scale*Math.pow(geometry.end/geometry.scale,smooth((p-.04)/.96))*w/geometry.width;ctx.clearRect(0,0,w,h);if(r>=Math.hypot(w,h)/2)return;ctx.beginPath();ctx.rect(0,0,w,h);ctx.moveTo(w/2+r,h/2);ctx.arc(w/2,h/2,r,0,Math.PI*2);ctx.fillStyle='#08090b';ctx.fill('evenodd');};
}
function createCameraIrisRenderer(original,matte,geometry){
 let canvas=original,worker=null,blobUrl=null,raf=0,stopped=false,startedAt=0,duration=0,draw=null,finishResolve=null;
 const cover=document.getElementById('camera-iris-cover');
 const epoch=()=>performance.timeOrigin+performance.now();
 const ready=()=>{if(cover)cover.hidden=true;document.getElementById('camera-intro')?.classList.add('iris-ready');};
 const workerProgram=`
 const makePainter=(`+cameraIrisPainter.toString()+`),makeMatte=(`+cameraMattePainter.toString()+`);
 let draw,frame=0,start=0,duration=0,count=0,totalDraw=0,maxDraw=0;
 const cancel=()=>{if(typeof cancelAnimationFrame==='function')cancelAnimationFrame(frame);clearTimeout(frame);};
 const schedule=f=>typeof requestAnimationFrame==='function'?requestAnimationFrame(f):setTimeout(f,1000/120);
 const tick=()=>{const now=performance.now(),p=Math.min(1,(performance.timeOrigin+now-start)/duration);draw(p);const cost=performance.now()-now;count++;totalDraw+=cost;maxDraw=Math.max(maxDraw,cost);if(p<1)frame=schedule(tick);else postMessage({type:'finished',stats:{frames:count,meanDrawMs:totalDraw/count,maxDrawMs:maxDraw}});};
 onmessage=e=>{try{const m=e.data;if(m.type==='init'){const iris=makePainter(m.canvas),matte=makeMatte(m.matte,m.geometry);draw=p=>{matte(p);iris(p);};draw(0);postMessage({type:'ready'});}if(m.type==='start'){cancel();start=m.start;duration=m.duration;tick();}if(m.type==='finish'){cancel();draw(1);postMessage({type:'finished',stats:{frames:count,meanDrawMs:totalDraw/count,maxDrawMs:maxDraw}});}}catch(error){postMessage({type:'failed'});}};
 `;
 const tick=()=>{if(stopped)return;const p=Math.min(1,(epoch()-startedAt)/duration);draw(p);if(p<1)raf=requestAnimationFrame(tick);else{finishResolve?.();finishResolve=null;}};
 const fallback=()=>{
  if(stopped)return;
  worker?.terminate();worker=null;
  if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null;}
  // A transferred canvas cannot regain a main-thread context: replace only this surface.
  if(!draw){
   const replacement=document.createElement('canvas');replacement.id=canvas.id;replacement.className=canvas.className;replacement.width=canvas.width;replacement.height=canvas.height;
   canvas.replaceWith(replacement);canvas=replacement;
   const matteReplacement=document.createElement('canvas');matteReplacement.id=matte.id;matteReplacement.width=matte.width;matteReplacement.height=matte.height;matte.replaceWith(matteReplacement);matte=matteReplacement;
   const iris=cameraIrisPainter(canvas),surround=cameraMattePainter(matte,geometry);draw=p=>{surround(p);iris(p);};
  }
  canvas.dataset.renderer='main-thread';draw(startedAt?Math.min(1,(epoch()-startedAt)/duration):0);ready();
  if(startedAt)tick();
 };
 try{
  if(typeof Worker!=='function'||typeof original.transferControlToOffscreen!=='function')throw Error('Use main-thread canvas');
  blobUrl=URL.createObjectURL(new Blob([workerProgram],{type:'text/javascript'}));worker=new Worker(blobUrl);
  worker.onmessage=e=>{
   if(stopped)return;
   if(e.data.type==='ready'){ready();if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null;}}
   if(e.data.type==='failed'){try{fallback();}catch{document.getElementById('camera-intro')?.close();}}
   if(e.data.type==='finished'){if(e.data.stats)canvas.dataset.drawStats=JSON.stringify(e.data.stats);finishResolve?.();finishResolve=null;}
  };
  worker.onerror=()=>{try{fallback();}catch{document.getElementById('camera-intro')?.close();}};
  canvas.dataset.renderer='worker';const transferred=original.transferControlToOffscreen(),matteTransfer=matte.transferControlToOffscreen();worker.postMessage({type:'init',canvas:transferred,matte:matteTransfer,geometry},[transferred,matteTransfer]);
 }catch{fallback();}
 return {
  start(ms,elapsed=0){duration=ms;startedAt=epoch()-elapsed;if(worker)worker.postMessage({type:'start',start:startedAt,duration});else tick();},
  finish(){return new Promise(resolve=>{finishResolve=resolve;if(worker)worker.postMessage({type:'finish'});else{cancelAnimationFrame(raf);draw(1);finishResolve=null;resolve();}});},
  destroy(){stopped=true;cancelAnimationFrame(raf);worker?.terminate();if(blobUrl)URL.revokeObjectURL(blobUrl);finishResolve?.();finishResolve=null;}
 };
}

