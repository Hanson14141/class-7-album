let commentReplyTarget=null,replyInboxVersion=0,replyInboxTask=null,replyInboxTaskGeneration=-1;
const pendingCommentLikes=new Set();
function resetCommentReply(){commentReplyTarget=null;$('#comment-reply-target').hidden=true;$('#comment-reply-target-name').textContent='';$('#send-comment').textContent='发送留言';}
function chooseCommentReply(item){
 withProfile(()=>{commentReplyTarget={id:item.id,author:item.author};$('#comment-reply-target-name').textContent='回复 '+item.author;$('#comment-reply-target').hidden=false;$('#send-comment').textContent='发送回复';$('#comment-body').focus();});
}
function renderComments(){
 const list=$('#comment-list');list.replaceChildren();
 if(!app.comments.length){const empty=document.createElement('p');empty.className='comment-empty';empty.textContent='还没有留言。让第一句话，从你开始。';list.append(empty);}
 for(const item of app.comments){
  const article=document.createElement('article');article.className='comment';article.id='comment-'+item.id;if(item.replyToId)article.classList.add('is-reply');if(commentFocus?.id===item.id)article.classList.add('comment-focused');
  const head=document.createElement('div');head.className='comment-head';const author=document.createElement('strong');author.textContent=item.author;const time=document.createElement('time');time.dateTime=item.createdAt;time.textContent=commentTime(item.createdAt);head.append(author,time);article.append(head);
  if(item.replyToAuthor){const context=document.createElement('div');context.className='comment-reply-context';context.textContent='回复 '+item.replyToAuthor+(item.replyToBody?' · '+item.replyToBody.slice(0,70):'');article.append(context);}
  const body=document.createElement('p');body.textContent=item.body;if(item.body)article.append(body);const emoji=commentEmojiNode(item.emoji);if(emoji)article.append(emoji);
  const tools=document.createElement('div');tools.className='comment-tools';
  tools.append(makeCommentLikeButton(item));
  const reply=document.createElement('button');reply.type='button';reply.className='comment-tool';reply.textContent='回复';reply.addEventListener('click',()=>chooseCommentReply(item));tools.append(reply);
  if(item.mine){const remove=document.createElement('button');remove.type='button';remove.className='comment-tool';remove.textContent='删除';remove.setAttribute('aria-label','删除自己在 '+time.textContent+' 的留言');remove.addEventListener('click',async()=>{if(remove.dataset.confirm!=='yes'){remove.textContent='确认删除';remove.dataset.confirm='yes';return;}remove.disabled=true;try{await api('/comments/'+item.id,{method:'DELETE'});if(commentReplyTarget?.id===item.id)resetCommentReply();if(app.commentPhoto)await loadComments();refreshReplyInbox();}catch(e){commentError(e);remove.disabled=false;}});tools.append(remove);}
  article.append(tools);list.append(article);
 }
 $('#older-comments').hidden=!app.commentCursor;
}
async function setCommentLiked(id,desired){
 refreshCommentVoteWeek();const item=findCommentLikeItem(id);if(!item||pendingCommentLikes.has(id))return;
 if(!app.account?.signedIn){openLogin(()=>setCommentLiked(id,true));return;}
 const before={liked:item.liked===true,likeCount:Number(item.likeCount)||0,weeklyCount:Number(item.weeklyCount)||0},wanted=typeof desired==='boolean'?desired:!before.liked,generation=ownershipGeneration,week=commentVoteWeek,delta=Number(wanted)-Number(before.liked);
 pendingCommentLikes.add(id);storeCommentLikeState(id,{liked:wanted,likeCount:Math.max(0,before.likeCount+delta),weeklyCount:Math.max(0,before.weeklyCount+delta)});
 try{const state=await api('/comments/'+encodeURIComponent(id)+'/likes',{method:'POST',json:{liked:wanted}});if(generation===ownershipGeneration&&week===commentVoteWeek)storeCommentLikeState(id,state);}
 catch(error){if(generation===ownershipGeneration&&week===commentVoteWeek){storeCommentLikeState(id,before);if($('#lightbox').open)commentError(error);else commentBoardStatus(error.message||'点赞未保存，请重试。',true);}}
 finally{pendingCommentLikes.delete(id);const current=findCommentLikeItem(id);if(current)storeCommentLikeState(id,current);if((generation!==ownershipGeneration||week!==commentVoteWeek)&&$('#lightbox').open)loadComments().catch(commentError);}
}
function renderReplyBadge(count){const badge=$('#reply-badge');badge.hidden=!count;badge.textContent=count>99?'99+':String(count);$('#reply-inbox-button').setAttribute('aria-label',count?'回复我的，'+count+' 条未读':'回复我的');}
async function refreshReplyInbox(){
 const button=$('#reply-inbox-button');button.hidden=!app.account?.signedIn;
 if(!app.account?.signedIn){replyInboxVersion++;renderReplyBadge(0);$('#reply-inbox-list').replaceChildren();return;}
 if(replyInboxTask&&replyInboxTaskGeneration===ownershipGeneration)return replyInboxTask;
 const version=++replyInboxVersion,generation=ownershipGeneration;
 replyInboxTaskGeneration=generation;
 const task=(async()=>{
  try{const data=await api('/replies/inbox');if(version!==replyInboxVersion||generation!==ownershipGeneration||!app.account?.signedIn)return false;renderReplyBadge(data.unread);renderReplyInbox(data.items);$('#reply-inbox-error').hidden=true;return true;}
  catch(error){if($('#reply-inbox').open){$('#reply-inbox-error').textContent=error.message||'回复暂时无法读取';$('#reply-inbox-error').hidden=false;}return false;}
  finally{if(replyInboxTask===task)replyInboxTask=null;}
 })();
 replyInboxTask=task;return task;
}
function renderReplyInbox(items){
 const list=$('#reply-inbox-list');list.replaceChildren();
 if(!items.length){const empty=document.createElement('p');empty.className='reply-inbox-empty';empty.textContent='暂时没有人回复你的留言。';list.append(empty);return;}
 for(const item of items){const button=document.createElement('button');button.type='button';button.className='reply-inbox-item';const head=document.createElement('strong');head.textContent=item.author+(item.authorUsername?' · @'+item.authorUsername:'')+' 回复了你';const meta=document.createElement('small');meta.textContent=(item.photoTitle||'照片')+' · '+commentTime(item.createdAt);const text=document.createElement('p');text.textContent=item.body;button.append(head,meta,text);button.addEventListener('click',()=>openReplyPhoto(item.photoId,item.id));list.append(button);}
}
async function openReplyPhoto(photoId,replyId){
 closeDialog('reply-inbox');
 await openCommentPhoto(photoId,replyId);
}
$('#reply-inbox-button').addEventListener('click',async()=>{
 if(!app.account?.signedIn){openLogin();return;}showDialog('reply-inbox');if(!await refreshReplyInbox())return;
 try{await api('/replies/inbox',{method:'POST'});renderReplyBadge(0);}catch(error){$('#reply-inbox-error').textContent=error.message||'未读状态未保存';$('#reply-inbox-error').hidden=false;}
});
$('#cancel-comment-reply').addEventListener('click',resetCommentReply);
setInterval(()=>{if(!document.hidden&&app.account?.signedIn)refreshReplyInbox();},120000);
