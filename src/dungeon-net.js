/* Socket.IO adapter preserving the game's Net event interface. No account cookies. */
var Net=(function(){
  var cfg={base:window.DUNGEON_SERVER||'',reconnect:false},socket=null,status='idle',seat=null,room='',handlers={},revision=0;
  function emit(t,m){(handlers[t]||[]).slice().forEach(function(f){try{f(m);}catch(e){console.warn('[game net]',e);}});}
  function state(s){status=s;emit('state',{state:s,seat:seat,room:room});}
  function close(){if(socket){socket.removeAllListeners();socket.disconnect();socket=null;}seat=null;state('closed');}
  function connect(code){close();room=code;revision=0;state('connecting');
    if(!cfg.base||typeof io!=='function'){emit('error',{message:'联机服务暂不可用，仍可使用单机模式'});state('closed');return;}
    socket=io(cfg.base+'/dungeon',{transports:['websocket'],reconnection:false,timeout:12000,auth:{room:code}});
    socket.on('connect',function(){state('online');});
    socket.on('packet',function(msg){if(msg.t==='seated'){seat=msg.seat;emit('seated',msg);return;}
      if(msg.t==='msg'){var body=msg.body;if(body.t==='sync')revision=body.revision||0;emit('peer:'+body.t,body);return;}emit(msg.t,msg);});
    socket.on('connect_error',function(){emit('error',{message:'联机连接失败，请检查网络或稍后重试'});state('closed');});
    socket.on('disconnect',function(){state('closed');emit('left',{message:'连接中断，请返回大厅重新开始'});});
  }
  return {connect:connect,close:close,send:function(msg){if(!socket||!socket.connected){emit('error',{message:'连接已断开，请重新加入房间'});return false;}if(msg.t==='sync')msg.revision=++revision;else if(['action','move','item','skip'].indexOf(msg.t)>=0)msg.revision=revision;socket.emit('packet',msg);return true;},
    on:function(t,f){(handlers[t]||(handlers[t]=[])).push(f);},off:function(t,f){handlers[t]=(handlers[t]||[]).filter(function(h){return h!==f;});},config:function(c){Object.assign(cfg,c);},hasServer:function(){return !!cfg.base;},seat:function(){return seat;},room:function(){return room;},state:function(){return status;},revision:function(){return revision;}};
})();
window.Net=Net;
