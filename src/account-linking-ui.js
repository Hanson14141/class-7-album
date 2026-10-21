function renderLinkedAccounts(){
 const names=app.account?.linkedAccounts||[],summary=$('#linked-accounts-summary');
 summary.hidden=names.length<2;summary.textContent='已关联账号：'+names.join('、');
 $('#account-link-current').textContent=app.account?.signedIn?'当前登录账号：'+app.account.username+'。请填写另一个登录账号；填写自己不会找回旧照片。':'';
 renderUnlinkAccounts(names);
}
$('#account-link-form').addEventListener('submit',async event=>{
 event.preventDefault();if(app.accountBusy)return;
 app.accountBusy=true;$('#link-account-submit').disabled=true;$('#account-link-result').hidden=true;
 try{
  const data=await api('/account/link-account',{method:'POST',json:{username:$('#link-account-name').value,password:$('#link-account-password').value}});
  $('#link-account-password').value='';
  const names=(data.linkedAccounts||[]).join('、'),count=Number(data.managedPhotos||0);
  $('#account-link-result').textContent=(data.alreadyLinked?'这两个账号此前已关联。':'关联成功。')+'账号：'+names+'；当前可管理 '+count+' 张照片。'+(count===0?'这组账号暂无照片，请确认关联的是原来上传照片的账号。':'');
  $('#account-link-result').hidden=false;$('#account-link-details').open=false;
  try{await refreshIdentity();await reloadOwnership();toast('账号已关联，当前可管理 '+count+' 张照片');}
  catch{toast('关联已保存，照片列表暂未刷新，请刷新网页查看。');}
 }catch(error){$('#account-link-result').textContent=error.message;$('#account-link-result').hidden=false;}
 finally{$('#link-account-password').value='';app.accountBusy=false;$('#link-account-submit').disabled=false;}
});
$('#login-dialog').addEventListener('close',()=>{$('#link-account-password').value='';});

let unlinkPreview=null,unlinkPreviewVersion=0,unlinkMemberKey='';
function resetUnlinkPreview(){
 unlinkPreview=null;unlinkPreviewVersion++;$('#unlink-confirm-panel').hidden=true;
 $('#unlink-account-password').value='';$('#unlink-account-password').disabled=true;
 $('#unlink-account-consent').checked=false;$('#unlink-account-consent').disabled=true;$('#unlink-account-submit').disabled=true;
}
function renderUnlinkAccounts(names){
 const others=names.filter(name=>name!==app.account?.username),key=[app.account?.username||'',...names].join('|');
 $('#account-unlink-details').hidden=others.length===0;
 if(key===unlinkMemberKey)return;unlinkMemberKey=key;resetUnlinkPreview();
 const select=$('#unlink-account-name');select.replaceChildren();
 for(const name of others){const option=document.createElement('option');option.value=name;option.textContent=name;select.append(option);}
}
$('#unlink-account-name').addEventListener('change',resetUnlinkPreview);
$('#unlink-account-preview').addEventListener('click',async()=>{
 if(app.accountBusy)return;resetUnlinkPreview();const version=unlinkPreviewVersion;
 const account=app.account?.username,target=$('#unlink-account-name').value;
 $('#unlink-account-preview').disabled=true;$('#account-unlink-result').hidden=true;
 try{
  const preview=await api('/account/unlink-preview',{method:'POST',json:{username:target}});
  if(version!==unlinkPreviewVersion||account!==app.account?.username||target!==$('#unlink-account-name').value)return;
  unlinkPreview=preview;$('#unlink-impact').textContent='将移除 '+preview.username+'。现有 '+preview.retainedPhotos+' 张共享照片继续由 '+preview.currentUsername+' 及其余关联账号管理。被移除账号仍能正常登录，但不再管理这些照片和留言。';
  $('#unlink-confirm-panel').hidden=false;$('#unlink-account-password').disabled=false;$('#unlink-account-consent').disabled=false;$('#unlink-account-submit').disabled=false;
 }catch(error){$('#account-unlink-result').textContent=error.message;$('#account-unlink-result').hidden=false;}
 finally{$('#unlink-account-preview').disabled=false;}
});
$('#account-unlink-form').addEventListener('submit',async event=>{
 event.preventDefault();if(app.accountBusy||!unlinkPreview)return;
 app.accountBusy=true;$('#unlink-account-submit').disabled=true;$('#account-unlink-result').hidden=true;
 try{
  const data=await api('/account/unlink-account',{method:'POST',json:{username:unlinkPreview.username,groupVersion:unlinkPreview.groupVersion,password:$('#unlink-account-password').value,confirmed:$('#unlink-account-consent').checked}});
  resetUnlinkPreview();$('#account-unlink-details').open=false;
  $('#account-unlink-result').textContent='已解除与 '+data.removedAccount+' 的关联。'+data.retainedPhotos+' 张照片保留在当前账号及其余关联账号下，照片和留言均未删除。';$('#account-unlink-result').hidden=false;
  identityRequest++;ownershipGeneration++;
  try{await refreshIdentity();await reloadOwnership();toast('已解除关联，照片保留在当前账号下');}
  catch{toast('解除关联已保存，请刷新页面更新照片列表。');}
 }catch(error){$('#account-unlink-result').textContent=error.message;$('#account-unlink-result').hidden=false;}
 finally{$('#unlink-account-password').value='';app.accountBusy=false;$('#unlink-account-submit').disabled=!unlinkPreview;}
});
$('#login-dialog').addEventListener('close',resetUnlinkPreview);
