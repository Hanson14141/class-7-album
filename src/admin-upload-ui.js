let adminUploadTier=null,originalUploadNotice=null;
function configureAdminUpload(tier){
 adminUploadTier=['epic','legendary','classified'].includes(tier)?tier:null;let fields=$('#admin-upload-fields');
 if(!fields){fields=document.createElement('div');fields.id='admin-upload-fields';fields.className='form-field admin-upload-fields';fields.innerHTML='<label for="admin-upload-tier">卡牌稀有度</label><select id="admin-upload-tier"><option value="epic">史诗</option><option value="legendary">传奇</option><option value="classified">保密级</option></select><p id="admin-upload-help"></p>';$('.upload-scroll').prepend(fields);$('#admin-upload-tier').addEventListener('change',event=>{if(!app.busy)adminUploadTier=event.target.value;updateAdminUploadUI();});}
 fields.hidden=!adminUploadTier;updateAdminUploadUI();
}
function updateAdminUploadUI(){
 const field=$('#admin-upload-fields');if(!field)return;const notice=$('#upload-dialog .preview-notice');if(notice){originalUploadNotice??=notice.innerHTML;if(adminUploadTier==='classified')notice.textContent='保密级照片不会出现在照片墙和共享相册中，只在商城低概率刷新；购买后可在库存查看。';else notice.innerHTML=originalUploadNotice;}field.hidden=!adminUploadTier;$('#admin-upload-tier').disabled=app.busy;
 if(adminUploadTier){$('#admin-upload-tier').value=adminUploadTier;$('#upload-title').textContent='上传'+mallRarity(adminUploadTier).label+'卡牌';$('#admin-upload-help').textContent=adminUploadTier==='classified'?'仅管理员、当日刷到该卡的账号及收藏者可查看；购买后也不转为公开。商城初始抽取权重为 3%。':'上传后公开展示，并进入对应稀有度卡池。';if(!app.busy)$('#submit-upload').innerHTML=icon('upload')+'上传卡牌';}
 else{$('#upload-title').textContent='分享你的瞬间';if(!app.busy)$('#submit-upload').innerHTML=icon('upload')+'加入照片墙';}
}
$('#upload-dialog').addEventListener('close',()=>{if(!app.busy){adminUploadTier=null;refreshVaultStatus();}});
