(function(root){
  'use strict';
  const threshold=12000000,target=6000000,maxSide=8192,maxPixels=24000000;
  let queue=Promise.resolve();
  const encode=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('浏览器未能生成压缩图片。')),type,quality));
  async function animated(file){
    if(file.type==='image/gif')return true;
    const bytes=new Uint8Array(await file.slice(0,1048576).arrayBuffer()),view=new DataView(bytes.buffer);
    const text=(at,n)=>String.fromCharCode(...bytes.subarray(at,at+n));
    if(file.type==='image/webp'){
      for(let p=12;p+8<=bytes.length;){const type=text(p,4),size=view.getUint32(p+4,true);if(type==='ANIM'||type==='ANMF'||(type==='VP8X'&&(bytes[p+8]&2)))return true;p+=8+size+(size%2);}
    }
    if(file.type==='image/png'){
      for(let p=8;p+8<=bytes.length;){const size=view.getUint32(p),type=text(p+4,4);if(type==='acTL')return true;if(type==='IDAT')break;p+=12+size;}
    }
    if(file.type==='image/avif'&&text(0,Math.min(256,bytes.length)).includes('avis'))return true;
    return false;
  }
  async function decode(file,width,height){
    if(typeof createImageBitmap==='function'){
      try{return await createImageBitmap(file,{imageOrientation:'from-image',resizeWidth:width,resizeHeight:height,resizeQuality:'high'});}catch{}
    }
    const url=URL.createObjectURL(file),image=new Image();
    try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('这张图片无法解码，请换一张可正常打开的照片。'));image.src=url;});return image;}finally{URL.revokeObjectURL(url);}
  }
  async function compress(file,dimensions,onProgress=()=>{}){
    if(file.size<=threshold)return {file,width:dimensions.width,height:dimensions.height,compressed:false,sourceBytes:file.size};
    if(await animated(file))throw new Error('这张动图超过 12 MB，自动压缩会丢失动画。请关闭“自动压缩大照片”后上传原文件，或另选静态照片。');
    const sourceWidth=Number(dimensions.width),sourceHeight=Number(dimensions.height);
    if(!Number.isSafeInteger(sourceWidth)||!Number.isSafeInteger(sourceHeight)||sourceWidth<1||sourceHeight<1)throw new Error('照片尺寸无法读取。');
    // Preserve normal photo dimensions; cap unusually large canvases for device memory.
    const scale=Math.min(1,maxSide/Math.max(sourceWidth,sourceHeight),Math.sqrt(maxPixels/(sourceWidth*sourceHeight)));
    let width=Math.max(1,Math.round(sourceWidth*scale)),height=Math.max(1,Math.round(sourceHeight*scale));
    let bitmap,canvas;onProgress('正在压缩…');
    try{
      bitmap=await decode(file,width,height);canvas=document.createElement('canvas');
      let type=file.type==='image/jpeg'?'image/jpeg':'image/webp';
      for(let pass=0;pass<8;pass++){
        canvas.width=width;canvas.height=height;
        const context=canvas.getContext('2d');if(!context)throw new Error('此浏览器暂不支持照片压缩。');
        context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,width,height);
        let blob;
        for(const quality of [0.92,0.88,0.84,0.80]){
          blob=await encode(canvas,type,quality);
          // Unsupported WebP encoders return PNG; keep transparency in that fallback.
          if(blob.size<=target){
            const extension=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
            const name=(file.name||'photo').replace(/\.[^.]*$/,'')+'.'+extension;
            const result=new File([blob],name,{type:blob.type,lastModified:file.lastModified||Date.now()});
            return {file:result,width,height,compressed:true,sourceBytes:file.size};
          }
          if(blob.type==='image/png')break;
        }
        const shrink=Math.min(0.82,Math.sqrt(target/blob.size)*0.92);
        const nextWidth=Math.max(1,Math.floor(width*shrink)),nextHeight=Math.max(1,Math.floor(height*shrink));
        if(nextWidth===width&&nextHeight===height)break;width=nextWidth;height=nextHeight;onProgress('正在调整尺寸并压缩…');
      }
      throw new Error('这张图片暂时无法压到 6 MB 以内，请换一张照片或关闭自动压缩后重试。');
    }finally{bitmap?.close?.();if(canvas){canvas.width=1;canvas.height=1;}}
  }
  function prepare(file,dimensions,onProgress){
    if(file.size<=threshold)return Promise.resolve({file,width:dimensions.width,height:dimensions.height,compressed:false,sourceBytes:file.size});
    const task=queue.then(()=>compress(file,dimensions,onProgress));queue=task.catch(()=>{});return task;
  }
  root.Class7PhotoCompression=Object.freeze({threshold,target,prepare,formatBytes:value=>value<1000000?(value/1000).toFixed(1)+' KB':(value/1000000).toFixed(1)+' MB'});
})(window);
