async function commentLikeStates(ids:string[],owner:string|null){
 if(!ids.length)return new Map<string,{likeCount:number;weeklyCount:number;liked:boolean}>();
 const result=await database().prepare('SELECT comment_id,count(DISTINCT (class7_test.canonical_owner(owner_hash),week_start)) AS n,count(DISTINCT class7_test.canonical_owner(owner_hash)) FILTER(WHERE week_start=class7_test.contest_week_start(clock_timestamp())) AS weekly,COALESCE(bool_or(week_start=class7_test.contest_week_start(clock_timestamp()) AND class7_test.canonical_owner(owner_hash)=?),false) AS liked FROM comment_likes WHERE comment_id IN (SELECT jsonb_array_elements_text(?::jsonb)) GROUP BY comment_id').bind(owner||'',JSON.stringify(ids)).all();
 return new Map((result.results as any[]).map(row=>[row.comment_id,{likeCount:Number(row.n)||0,weeklyCount:Number(row.weekly)||0,liked:row.liked===true}]));
}

async function commentContestPhotos(request:Request,url:URL){
 const period=url.searchParams.get('period')||'current';if(!['current','previous','total'].includes(period))throw new ApiError(400,'请选择本周、上周或总赞榜。');
 let cursor:any=null;const raw=url.searchParams.get('cursor');
 if(raw){try{cursor=JSON.parse(atob(raw));}catch{throw new ApiError(400,'评论榜分页无效，请刷新。');}
  if(!cursor||typeof cursor.week!=='string'||cursor.week.length>80||cursor.period!==period||!Number.isSafeInteger(cursor.rank)||cursor.rank<0||cursor.rank>999999999)throw new ApiError(400,'评论榜分页无效，请刷新。');
 }
 const owner=await ownerHash(request),result=await database().prepare('SELECT class7_test.comment_contest_page(?,?::jsonb) AS contest').bind(period,cursor?JSON.stringify(cursor):null).first<{contest:any}>();
 const contest=typeof result?.contest==='string'?JSON.parse(result.contest):result?.contest;
 if(!contest)throw new ApiError(503,'评论榜暂时无法读取。');if(contest.stale)throw new ApiError(400,'榜单周次已变化，请刷新。');
 const page=contest.entries.slice(0,50),ids=page.map((item:any)=>item.comment_id);let rows:any[]=[];
 if(ids.length){const data=await database().prepare('SELECT c.id,c.author,c.body,c.created_at,c.reply_to_author,p.id AS photo_id,p.title AS photo_title,p.uploader,p.object_key,p.width,p.height,p.rotation FROM comments c JOIN photos p ON p.id=c.photo_id WHERE c.id IN (SELECT jsonb_array_elements_text(?::jsonb))').bind(JSON.stringify(ids)).all();rows=data.results;}
 const states=await commentLikeStates(ids,owner),sources=new Map<string,any>();for(const row of rows)sources.set(row.photo_id,row);
 // Reuse signing cache and cap work; image downloads are viewport queued in UI.
 const unique=[...sources.values()],urls=new Map<string,string>();let next=0;
 await Promise.all(Array.from({length:Math.min(4,unique.length)},async()=>{while(next<unique.length){const row=unique[next++];urls.set(row.photo_id,await bucket().signedUrl(row.object_key));}}));
 const byId=new Map(rows.map(row=>[row.id,row]));
 const entries=page.flatMap((score:any)=>{const row=byId.get(score.comment_id);if(!row)return [];const state=states.get(row.id)||{likeCount:0,weeklyCount:0,liked:false};return [{id:row.id,author:row.author,body:row.body,createdAt:row.created_at,replyToAuthor:row.reply_to_author||null,rank:Number(score.rank),score:Number(period==='total'?score.total_votes:score.weekly_votes),...state,photo:{id:row.photo_id,title:row.photo_title,uploader:row.uploader,src:urls.get(row.photo_id),width:row.width,height:row.height,rotation:row.rotation||0}}];});
 const {entries:_entries,week,...meta}=contest,last=page.at(-1);
 return response({entries,total:Number(contest.total)||0,nextCursor:contest.entries.length>50&&last?btoa(JSON.stringify({week,period,rank:Number(last.rank)})):null,contest:meta});
}
