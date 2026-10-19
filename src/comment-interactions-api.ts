type CommentInteractionRow=Comment&{reply_to_id:string|null;reply_to_author:string|null;author_username:string|null;parent_body:string|null};

async function commentInteractionRoute(request:Request,parts:string[],url:URL,method:string){
 if(parts[0]==='photos'&&parts.length===2&&method==='GET'){
  if(!uuid.test(parts[1]))throw new ApiError(404,'照片不存在。');
  const owner=await ownerHash(request);
  const row=await database().prepare('SELECT id,class7_test.canonical_owner(owner_hash) AS owner_hash,uploader,title,caption,object_key,mime,bytes,width,height,rotation,created_at FROM photos WHERE id=?').bind(parts[1]).first<Photo>();
  if(!row)throw new ApiError(404,'照片不存在。');
  await addPhotoLikeStates([row],owner);
  return response({photo:await photoView(row,owner)});
 }
 if(parts[0]==='photos'&&parts.length===3&&parts[2]==='comments'){
  const photoId=parts[1];await requirePhoto(photoId);
  if(method==='GET'){
   const hash=await ownerHash(request),cursor=decodeCursor(url.searchParams.get('cursor'));
   let query='SELECT c.id,c.photo_id,class7_test.canonical_owner(c.owner_hash) AS owner_hash,c.author,c.author_username,c.body,c.created_at,c.reply_to_id,c.reply_to_author,p.body AS parent_body FROM comments c LEFT JOIN comments p ON p.id=c.reply_to_id WHERE c.photo_id=?';
   const args:unknown[]=[photoId];
   const focus=url.searchParams.get('focus');
   if(focus){if(!uuid.test(focus))throw new ApiError(400,'留言定位信息无效。');const target=await database().prepare('SELECT id,created_at FROM comments WHERE id=? AND photo_id=?').bind(focus,photoId).first<{id:string;created_at:string}>();if(!target)throw new ApiError(404,'这条留言已被删除。');query+=' AND (c.created_at<? OR (c.created_at=? AND c.id<=?))';args.push(target.created_at,target.created_at,target.id);}
   if(cursor){query+=' AND (c.created_at<? OR (c.created_at=? AND c.id<?))';args.push(cursor.date,cursor.date,cursor.id);}
   query+=' ORDER BY c.created_at DESC,c.id DESC LIMIT 51';
   const results=await database().batch([database().prepare(query).bind(...args),database().prepare('SELECT count(*) AS n FROM comments WHERE photo_id=?').bind(photoId)]);
   const found=results[0].results as CommentInteractionRow[],rows=found.slice(0,50),ids=rows.map(row=>row.id);
   const byId=await commentLikeStates(ids,hash);
   return response({comments:rows.reverse().map(row=>{const state=byId.get(row.id);return {id:row.id,author:row.author,body:row.body,createdAt:row.created_at,mine:class7OwnerMatch(row.owner_hash,hash),replyToId:row.reply_to_id,replyToAuthor:row.reply_to_author,replyToBody:row.parent_body,likeCount:state?.likeCount||0,weeklyCount:state?.weeklyCount||0,liked:state?.liked===true};}),focused:focus||null,total:Number((results[1].results[0] as any)?.n)||0,nextCursor:found.length>50?encodeCursor(found[49]):null});
  }
  if(method==='POST'){
   const account=await requireAccount(request),current=await requireAccountProfile(request),data=await jsonBody(request),body=shortText(data?.body,1000,true);
   const replyToId=data?.replyToId||null;
   if(replyToId!==null&&(!uuid.test(replyToId)||typeof replyToId!=='string'))throw new ApiError(400,'回复目标无效。');
   let parent:{author:string}|null=null;
   if(replyToId){parent=await database().prepare('SELECT author FROM comments WHERE id=? AND photo_id=?').bind(replyToId,photoId).first<{author:string}>();if(!parent)throw new ApiError(409,'原留言已被删除，请刷新后再回复。');}
   const id=crypto.randomUUID(),now=new Date().toISOString();
   // The photo and parent are checked again in the INSERT, so a concurrent delete cannot make an orphan reply.
   const results=await database().batch([database().prepare('INSERT INTO comments(id,photo_id,owner_hash,author,author_username,body,created_at,reply_to_id,reply_to_author) SELECT ?,p.id,?,?,?,?,?,?,? FROM photos p WHERE p.id=? AND (?::text IS NULL OR EXISTS(SELECT 1 FROM comments c WHERE c.id=? AND c.photo_id=p.id)) RETURNING id').bind(id,current.write_owner_hash,current.nickname,account.username,body,now,replyToId,parent?.author||null,photoId,replyToId,replyToId),database().prepare('SELECT class7_test.award_points(?,?,?) AS result WHERE EXISTS(SELECT 1 FROM comments WHERE id=?)').bind(account.id,'comment','comment:'+id,id)]);
   const inserted=results[0].results[0],points=normalizePoints((results[1].results[0] as any)?.result);
   if(!inserted)throw new ApiError(409,'照片或原留言已被删除，请刷新后再试。');
   return response({comment:{id,author:current.nickname,authorUsername:account.username,body,createdAt:now,mine:true,replyToId,replyToAuthor:parent?.author||null,likeCount:0,liked:false},points},201);
  }
 }
 if(parts[0]==='comments'&&parts.length===3&&parts[2]==='likes'){
  const id=parts[1];if(!uuid.test(id))throw new ApiError(404,'留言不存在。');
  if(method==='GET'){
   const states=await commentLikeStates([id],await ownerHash(request));return response(states.get(id)||{likeCount:0,weeklyCount:0,liked:false});
  }
  if(method==='POST'){
   const account=await requireAccount(request),data=await jsonBody(request);
   if(typeof data?.liked!=='boolean')throw new ApiError(400,'请指定点赞或取消点赞。');
   const row=await database().prepare('SELECT class7_test.set_comment_like_with_points(?,?,?::boolean) AS state').bind(account.id,id,String(data.liked)).first<{state:any}>();
   const state=typeof row?.state==='string'?JSON.parse(row.state):row?.state;
   if(state?.missing)throw new ApiError(404,'留言已被删除。');
   if(!state||state.unauthorized)throw new ApiError(401,'请重新登录后再点赞。');
   return response({likeCount:Number(state.likeCount)||0,weeklyCount:Number(state.weeklyCount)||0,liked:state.liked===true,points:state.points||null});
  }
 }
 if(parts[0]==='replies'&&parts[1]==='inbox'&&parts.length===2){
  const account=await requireAccount(request);
  if(method==='POST'){
   const now=new Date().toISOString();
   await database().prepare('INSERT INTO reply_inbox_seen(account_id,seen_at) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET seen_at=excluded.seen_at').bind(account.id,now).run();
   return response({ok:true,seenAt:now});
  }
  if(method==='GET'){
   const seen=await database().prepare('SELECT seen_at FROM reply_inbox_seen WHERE account_id=?').bind(account.id).first<{seen_at:string}>(),since=seen?.seen_at||'1970-01-01T00:00:00.000Z';
   const condition=' FROM comments r JOIN comments parent ON parent.id=r.reply_to_id JOIN photos p ON p.id=r.photo_id LEFT JOIN accounts actor ON actor.owner_hash=r.owner_hash WHERE class7_test.canonical_owner(parent.owner_hash)=? AND class7_test.canonical_owner(r.owner_hash)<>?';
   const result=await database().batch([database().prepare('SELECT r.id,r.photo_id,r.author,r.author_username,r.body,r.created_at,parent.author AS parent_author,parent.body AS parent_body,p.title AS photo_title,actor.username AS actor_username'+condition+' ORDER BY r.created_at DESC,r.id DESC LIMIT 30').bind(account.owner_hash,account.owner_hash),database().prepare('SELECT count(*) AS n'+condition+' AND r.created_at>?').bind(account.owner_hash,account.owner_hash,since)]);
   return response({items:(result[0].results as any[]).map(row=>({id:row.id,photoId:row.photo_id,author:row.author,authorUsername:row.author_username||row.actor_username||'',body:row.body,createdAt:row.created_at,parentAuthor:row.parent_author,parentBody:row.parent_body,photoTitle:row.photo_title})),unread:Number((result[1].results[0] as any)?.n)||0});
  }
 }
 throw new ApiError(404,'没有找到这个接口。');
}
function class7OwnerMatch(value:string,hash:string|null){return !!hash&&value===hash;}
