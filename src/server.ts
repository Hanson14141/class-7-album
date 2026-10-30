import http from 'node:http';
import {Readable} from 'node:stream';
import {handlePhotoApi} from './photo-api';
import fs from 'node:fs';
import path from 'node:path';

const origin=process.env.CLASS7_ORIGIN || 'https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com';
const publicRoot=path.join(__dirname,'public');
const staticFiles=new Map<string,string>();
function inventory(dir:string,prefix=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name),name=prefix+entry.name;if(entry.isDirectory())inventory(file,name+'/');else staticFiles.set('/api/'+name,file);}}
if(fs.existsSync(publicRoot))inventory(publicRoot);
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.m4a':'audio/mp4'};
http.createServer(async(req,res)=>{
  try{
    const requestPath=req.url||'/';
    const pathname=requestPath.split('?')[0];
    if(req.method==='GET'&&pathname==='/api'){res.writeHead(302,{Location:'/api/'});res.end();return;}
    const staticFile=staticFiles.get(pathname==='/api/'?'/api/index.html':pathname);
    if((req.method==='GET'||req.method==='HEAD')&&staticFile){res.writeHead(200,{'Content-Type':mime[path.extname(staticFile)]||'application/octet-stream','Cache-Control':staticFile.endsWith('.html')?'no-store':'public, max-age=3600','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else fs.createReadStream(staticFile).pipe(res);return;}
    if(pathname==='/api/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,release:'class7-memory',region:'ap-shanghai'}));return;}
    const headers=new Headers();
    for(const name of ['cookie','origin','content-type','x-device-key','x-photo-metadata','if-none-match']){
      const value=req.headers[name];if(typeof value==='string')headers.set(name,value);
    }
    // Never trust externally supplied ChatGPT identity or Cloudflare IP headers.
    headers.set('CF-Connecting-IP',req.socket.remoteAddress||'gateway');
    const init:any={method:req.method,headers};
    if(req.method!=='GET'&&req.method!=='HEAD'){init.body=Readable.toWeb(req);init.duplex='half';}
    const request=new Request(new URL(requestPath,origin),init);
    const result=await handlePhotoApi(request);
    res.statusCode=result.status;
    result.headers.forEach((value,key)=>{if(key!=='set-cookie')res.setHeader(key,value);});
    const cookies=result.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    if(result.body)Readable.fromWeb(result.body as any).pipe(res);else res.end();
  }catch(error){console.error('Request failed',error instanceof Error?error.name:'unknown');res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'服务暂时不可用，请稍后重试。'}));}
}).listen(Number(process.env.PORT||9000),'0.0.0.0');
