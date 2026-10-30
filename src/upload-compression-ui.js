function compressionMessage(entry){
  const compressor=window.Class7PhotoCompression;
  if(entry.compressionStatus)return entry.compressionStatus;
  if(!compressor)return '';
  const original=compressor.formatBytes(entry.file.size);
  if($('#auto-compress')?.checked&&entry.file.size>compressor.threshold){
    return entry.preparedUpload?original+' → '+compressor.formatBytes(entry.preparedUpload.file.size):original+' · 上传时压缩';
  }
  return original+' · 原文件';
}
function renderCompressionNote(entry,thumb){
  const note=document.createElement('span');note.className='upload-size-note';note.id=entry.noteId+'-size';note.setAttribute('aria-live','polite');note.textContent=compressionMessage(entry);thumb.append(note);
}
function setCompressionStatus(entry,text){entry.compressionStatus=text;const note=document.getElementById(entry.noteId+'-size');if(note)note.textContent=text;}
async function prepareUploadFile(entry,dimensions){
  if(!$('#auto-compress')?.checked)return {file:entry.file,...dimensions};
  const compressor=window.Class7PhotoCompression;if(!compressor)throw new Error('压缩功能尚未载入，请刷新页面后重试。');
  if(entry.file.size<=compressor.threshold)return {file:entry.file,...dimensions};
  try{
    if(!entry.preparedUpload){setCompressionStatus(entry,'等待压缩…');entry.preparedUpload=await compressor.prepare(entry.file,dimensions,text=>setCompressionStatus(entry,text));}
    setCompressionStatus(entry,compressor.formatBytes(entry.file.size)+' → '+compressor.formatBytes(entry.preparedUpload.file.size));
    return entry.preparedUpload;
  }catch(error){setCompressionStatus(entry,'压缩未完成 · 可重试');throw error;}
}
$('#auto-compress').checked=safeRead('class7-auto-compress')!=='off';
$('#auto-compress').addEventListener('change',()=>{if(app.busy)return;safeWrite('class7-auto-compress',$('#auto-compress').checked?'on':'off');for(const entry of app.files)entry.compressionStatus='';renderSelection();});
