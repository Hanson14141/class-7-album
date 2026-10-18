async function weeklyContestPhotos(request:Request,url:URL){
 const period=url.searchParams.get('period')||'current';
 if(!['current','previous'].includes(period))throw new ApiError(400,'请选择本周或上周。');
 let cursor:any=null;const raw=url.searchParams.get('cursor');
 if(raw){try{cursor=JSON.parse(atob(raw));}catch{throw new ApiError(400,'大赛分页已失效，请刷新。');}
  if(typeof cursor.week!=='string'||cursor.week.length>80||!Number.isSafeInteger(cursor.rank)||cursor.rank<0||cursor.rank>999999999)throw new ApiError(400,'大赛分页已失效，请刷新。');
 }
 const owner=await ownerHash(request),result=await database().batch([
  database().prepare('SELECT class7_test.weekly_contest_page(?,?::jsonb) AS contest').bind(period,cursor?JSON.stringify(cursor):null),
  database().prepare('SELECT count(*) AS n FROM photos WHERE class7_test.canonical_owner(owner_hash)=?').bind(owner||'')
 ]);
 let contest=result[0].results[0]?.contest;if(typeof contest==='string')contest=JSON.parse(contest);
 if(!contest)throw new ApiError(503,'每周大赛暂时无法读取，请稍后刷新。');
 if(contest.stale)throw new ApiError(400,'已经进入新一周，请刷新大赛。');
 const entries=contest.entries.slice(0,100),last=entries.at(-1);let rows:any[]=[];
 if(entries.length){const page=await database().prepare(`SELECT p.id,class7_test.canonical_owner(p.owner_hash) AS owner_hash,p.uploader,p.title,p.caption,p.object_key,p.mime,p.bytes,p.width,p.height,p.rotation,p.created_at,
  score.weekly_votes,score.rank,COALESCE(v.like_count,0) AS like_count,COALESCE(v.liked,false) AS liked
  FROM jsonb_to_recordset(?::jsonb) AS score(photo_id text,weekly_votes bigint,total_votes bigint,rank bigint)
  JOIN photos p ON p.id=score.photo_id
  LEFT JOIN (SELECT photo_id,count(DISTINCT class7_test.canonical_owner(owner_hash)) AS like_count,bool_or(class7_test.canonical_owner(owner_hash)=?) AS liked FROM photo_likes GROUP BY photo_id) v ON v.photo_id=p.id
  ORDER BY score.rank`).bind(JSON.stringify(entries),owner||'').all();rows=page.results;}
 const {entries:_privateEntries,week,...meta}=contest;
 return response({photos:await Promise.all(rows.map(async row=>({...await photoView(row,owner),rank:Number(row.rank),weeklyCount:Number(row.weekly_votes)}))),
  total:Number(contest.total),ownedTotal:Number(result[1].results[0]?.n)||0,uploaders:[],
  nextCursor:contest.entries.length>100&&last?btoa(JSON.stringify({week,rank:Number(last.rank)})):null,
  contest:{...meta,period}});
}
