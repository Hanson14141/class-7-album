import http from 'node:http';
import { Server } from 'socket.io';
import { attachGameRelay } from './game-relay.mjs';
// Standalone deployment template; never mount this into the photo API implicitly.
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/health')res.end(JSON.stringify({ok:true,service:'class7-dungeon-relay'}));else {res.statusCode=404;res.end('{}');}});
const origins=(process.env.GAME_ORIGINS||'https://class7-memory-d0gcpjaqu47530c54-1509361747.ap-shanghai.app.tcloudbase.com').split(',');
const io=new Server(server,{maxHttpBufferSize:131072,cors:{origin:origins,methods:['GET','POST']}});
attachGameRelay(io);
server.listen(Number(process.env.PORT||9000),'0.0.0.0');
