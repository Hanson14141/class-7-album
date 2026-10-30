const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),target=path.join(root,'public/game');
const config=JSON.parse(fs.readFileSync(path.join(root,'src/dungeon-config.json'),'utf8'));
if(config.server&&!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(config.server))throw Error('Invalid dungeon server URL');
fs.mkdirSync(target,{recursive:true});
fs.cpSync(path.join(root,'src/dungeon-game'),target,{recursive:true});
fs.copyFileSync(path.join(root,'src/dungeon-net.js'),path.join(target,'net.js'));
const mediaOrigin='https://class7-memory-d0gcpjaqu47530c54-1509361747.tcloudbaseapp.com/game/';
for(const name of ['art.js','tracks.js']){
  const file=path.join(target,name);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('"assets/','"'+mediaOrigin+'assets/'));
}
fs.writeFileSync(path.join(target,'config.js'),'window.DUNGEON_SERVER='+JSON.stringify(config.server)+';\n');
const crypto=require('node:crypto'),indexFile=path.join(target,'index.html');
fs.writeFileSync(indexFile,fs.readFileSync(indexFile,'utf8').replace(/<script src="([^"?]+\.js)"/g,(_,name)=>{
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(target,name))).digest('hex').slice(0,12);
  return '<script src="'+name+'?v='+hash+'"';
}));
console.log('Built on-demand dungeon assets and Socket.IO adapter');
