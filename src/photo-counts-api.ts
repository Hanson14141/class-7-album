// Read counts in the same batch as the requested page; the cursor only limits
// the page query, never the totals or uploader breakdown.
const mineWhere=mine?'WHERE owner_hash=? AND NOT class7_test.photo_is_classified(photos.id)':'WHERE NOT class7_test.photo_is_classified(photos.id)',mineValues=mine?[hash]:[];
const result=await database().batch([
 database().prepare(`SELECT * FROM photos ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,id DESC LIMIT 101`).bind(...values),
 database().prepare(`SELECT count(*) AS n FROM photos ${mineWhere}`).bind(...mineValues),
 database().prepare(`SELECT uploader,count(*) AS n FROM photos ${mineWhere} GROUP BY uploader`).bind(...mineValues),
 database().prepare('SELECT count(*) AS n FROM photos WHERE owner_hash=? AND NOT class7_test.photo_is_classified(photos.id)').bind(hash||'')
]);
const found=result[0].results as Photo[],rows=found.slice(0,100);
const total=Number(result[1].results[0]?.n)||0,ownedTotal=Number(result[3].results[0]?.n)||0;
const uploaders=result[2].results.map((row:{uploader:string;n:number})=>({uploader:row.uploader,total:Number(row.n)||0}));
return response({photos:rows.map(row=>photoView(row,hash)),nextCursor:found.length>100?encodeCursor(rows[rows.length-1]):null,total,ownedTotal,uploaders});
