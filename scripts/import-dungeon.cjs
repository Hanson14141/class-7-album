// Explicit one-time import. Never runs automatically during builds.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=process.argv[2];if(!source)throw Error('Pass the original game HTML path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'src/dungeon-game');fs.mkdirSync(path.join(out,'assets'),{recursive:true});
const original=fs.readFileSync(source,'utf8');let html=original;
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);if(scripts.length!==8)throw Error('Unexpected source layout');
const names=['heroes','enemies','art','tracks','engine','audio','net','ui'];
function replace(s,a,b){if(!s.includes(a))throw Error('Game hook missing: '+a.slice(0,70));return s.replace(a,b);}
let ui=scripts[7];
ui=replace(ui,"if (el.screenLobby) el.screenLobby.classList.remove('hidden');","if (el.screenLobby) el.screenLobby.classList.remove('hidden');");
ui=replace(ui,"el.screenSelect.classList.remove('hidden');\n    el.screenBattle.classList.add('hidden');\n    if (isOnline())", "el.screenSelect.classList.remove('hidden');\n    el.screenBattle.classList.add('hidden');\n    if(el.screenLobby)el.screenLobby.classList.add('hidden');\n    if (isOnline())");
ui=replace(ui,"var myTurnNow = !!(active && active.team === G.PLAYER);","var myTurnNow = isOnline() ? isMyTurn() : !!(active && active.team === G.PLAYER);");
ui=ui.replaceAll("if (!actor || actor.team !== G.PLAYER) return;","if (!actor || (isOnline() ? !isMyTurn() : actor.team !== G.PLAYER)) return;");
ui=ui.replaceAll("if (!cur || cur.team !== G.PLAYER) return;","if (!cur || (isOnline() ? !isMyTurn() : cur.team !== G.PLAYER)) return;");
ui=replace(ui,'var r = G.moveActor(state, dir);','var r = performMove(dir);');
ui=replace(ui,'G.skipTurn(state);\n    afterAction(cur.uid);',"if(isGuest()){remotePending=true;Net.send({t:'skip'});}else G.skipTurn(state);\n    afterAction(cur.uid);");
ui=replace(ui,'var online = {','var remotePending=false;\n  var online = {');
ui=replace(ui,'function afterAction(actorUid) {','function afterAction(actorUid) {\n    if(isGuest() && remotePending){busy=true;renderBattle();return;}');
ui=replace(ui,"if (isGuest()) {\n      Net.send({ t: 'action'", "if (isGuest()) {\n      remotePending=true;\n      Net.send({ t: 'action'");
ui=replace(ui,"if (isGuest()) { Net.send({ t: 'move'", "if (isGuest()) { remotePending=true;Net.send({ t: 'move'");
ui=replace(ui,"if (isGuest()) { Net.send({ t: 'item'", "if (isGuest()) { remotePending=true;Net.send({ t: 'item'");
ui=replace(ui,'state = msg.state;','remotePending=false;\n    state = msg.state;');
ui=replace(ui,'beginOnlineStage(online.myTeam, online.peerTeam, online.seed);','beginOnlineStage(online.myTeam, online.peerTeam, online.seed);\n    pushSync([]);');
ui=replace(ui,"Net.on('peer:action', function (msg) {","function acceptGuestAction(msg){if(!isHost()||!state||state.phase!=='playing')return false;if(busy||msg.revision!==Net.revision()){pushSync([]);return false;}return true;}\n    Net.on('peer:action', function (msg) {\n      if(!acceptGuestAction(msg))return;");
for(const type of ['move','item'])ui=replace(ui,`Net.on('peer:${type}', function (msg) {`,`Net.on('peer:${type}', function (msg) {\n      if(!acceptGuestAction(msg))return;`);
ui=replace(ui,"Net.on('peer:item', function (msg) {", "Net.on('peer:skip',function(msg){if(!acceptGuestAction(msg))return;var cur=G.currentUnit(state);if(cur&&cur.team===G.ENEMY&&G.skipTurn(state).ok)afterAction(cur.uid);});\n    Net.on('peer:item', function (msg) {");
ui=replace(ui,'var events = drainEvents();\n    renderBattle();\n    playEffects(events);', 'if(isGuest()&&remotePending){busy=true;renderBattle();return;}\n    var events = drainEvents();\n    pushSync(events);\n    renderBattle();\n    playEffects(events);');
ui=replace(ui,"el.titleHint.textContent = '联机模式还在开发中，先玩单机吧';","/* Socket.IO lobby is enabled above. */");
ui=replace(ui,"if (!isHost() || !online.myTeam || !online.peerTeam) return;","if (!isHost() || !online.myTeam || !online.peerTeam) return;\n    remotePending=false;");
// Host snapshots are authoritative after start; no account points depend on this relay.
ui=ui.replace('if (!r.ok) return;\n      afterAction(cur.uid);','if (!r.ok){pushSync([]);return;}\n      afterAction(cur.uid);');
for(const method of ['moveActor(state, msg.dir)','useItem(state, msg.item, msg.targetUid)'])ui=replace(ui,'if (G.'+method+'.ok) afterAction(cur.uid);','if (G.'+method+'.ok) afterAction(cur.uid);else pushSync([]);');
ui=replace(ui,"if (!state || state.phase !== 'playing') return false;\n    if (!isOnline()) return true;","if (!state || state.phase !== 'playing') return false;\n    if (!isOnline()) return true;\n    if(Net.state()!=='online')return false;");
scripts[7]=ui;
let assetNumber=0,index=0;
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,()=>{
  const i=index++;if(i===6)return '<script src="socket.io.min.js"></script><script src="config.js"></script><script src="net.js"></script>';
  let code=scripts[i].replace(/data:(image\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g,(_,mime,data)=>{
    const ext=({'image/webp':'webp','image/png':'png','image/jpeg':'jpg','audio/mpeg':'mp3','audio/mp4':'m4a'})[mime]||'bin';
    const file='assets/'+(++assetNumber)+'.'+ext;fs.writeFileSync(path.join(out,file),Buffer.from(data,'base64'));return file;
  });
  fs.writeFileSync(path.join(out,names[i]+'.js'),code);return '<script src="'+names[i]+'.js"></script>';
});
html=html.replace('wss://你的域名/relay','https://联机服务地址').replace('填中继服务器地址，例如 <code>wss://game.example.com/relay</code>。保存后下次自动使用。','云端联机服务已预设，不依赖管理员电脑。断线后请返回大厅重新开始。');
// Socket.IO accepts https:// URLs. The server field is intentionally hidden in the public trial.
html=html.replace('<details class="lobby-server">','<details class="lobby-server" hidden>');
html=html.replace('创建房间后把房间码发给朋友，两人到齐即可开始。','创建房间后复制邀请链接，两人到齐即可开始。云端联机；断线后请返回大厅重新开局。');
html=html.replace('<section id="screen-title"', '<a href="../index.html" style="position:fixed;top:12px;left:16px;z-index:20;color:#d9c9b0;font:14px system-ui">← 照片集</a><section id="screen-title"');
fs.writeFileSync(path.join(out,'index.html'),html);
fs.writeFileSync(path.join(out,'source-info.json'),JSON.stringify({sourceName:path.basename(source),sha256:crypto.createHash('sha256').update(original).digest('hex'),assets:assetNumber,version:'0.85.0-socketio-trial',importedAt:new Date().toISOString()},null,2));
console.log('Imported game; extracted '+assetNumber+' embedded assets.');
