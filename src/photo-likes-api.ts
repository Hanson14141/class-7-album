async function photoLikeStates(ids:string[],owner:string|null){
 if(!ids.length)return new Map<string,{likeCount:number;liked:boolean}>();
 const result=await database().prepare('SELECT photo_id,count(DISTINCT (class7_test.canonical_owner(owner_hash),week_start)) AS n,bool_or(week_start=class7_test.contest_week_start(clock_timestamp()) AND class7_test.canonical_owner(owner_hash)=?) AS liked FROM photo_likes WHERE photo_id IN (SELECT jsonb_array_elements_text(?::jsonb)) GROUP BY photo_id').bind(owner||'',JSON.stringify(ids)).all();
 return new Map<string,{likeCount:number;liked:boolean}>(result.results.map((row:any)=>[row.photo_id,{likeCount:Number(row.n)||0,liked:row.liked===true}]));
}
async function addPhotoLikeStates(rows:Photo[],owner:string|null){
 const states=await photoLikeStates(rows.map(row=>row.id),owner);
 for(const row of rows){const state=states.get(row.id);(row as any).like_count=state?.likeCount||0;(row as any).liked=state?.liked===true;}
}
async function photoLikeAction(request:Request,id:string,method:string){
 await requirePhoto(id);
 if(method==='GET'){
  await requirePhoto(id);const states=await photoLikeStates([id],await ownerHash(request));
  return response(states.get(id)||{likeCount:0,liked:false});
 }
 if(method!=='POST')throw new ApiError(404,'没有找到这个接口。');
 const account=await requireAccount(request),data=await jsonBody(request);
 if(typeof data?.liked!=='boolean')throw new ApiError(400,'请指定点赞或取消点赞。');
 const row=await database().prepare('SELECT class7_test.set_photo_like_with_points(?,?,?::boolean) AS state').bind(account.id,id,String(data.liked)).first<{state:any}>();
 const state=typeof row?.state==='string'?JSON.parse(row.state):row?.state;
 if(state?.missing)throw new ApiError(404,'照片已经不存在。');
 if(!state||state.unauthorized)throw new ApiError(401,'请重新登录后再点赞。');
 return response({likeCount:Number(state.likeCount)||0,liked:state.liked===true,points:state.points||null});
}
