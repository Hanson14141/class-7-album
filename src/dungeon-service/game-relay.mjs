export function attachGameRelay(io) {
  const game=io.of('/dungeon');
  const rooms=new Map();
  game.on('connection', socket=>{
    const room=socket.handshake.auth?.room;
    if(typeof room!=='string'||!/^[A-Z0-9]{4,8}$/.test(room)){socket.emit('packet',{t:'error',message:'房间码无效'});socket.disconnect();return;}
    let members=rooms.get(room);
    if(!members){if(rooms.size>=50){socket.disconnect();return;}members=new Map();rooms.set(room,members);}
    const seat=[...members.values()].includes('host')?'guest':'host';
    if(members.size>=2){socket.emit('packet',{t:'error',code:'room_full',message:'房间已满，最多两人'});socket.disconnect();return;}
    members.set(socket.id,seat);socket.join(room);
    const peers=()=>game.to(room).emit('packet',{t:'peers',host:[...members.values()].includes('host'),guest:[...members.values()].includes('guest')});
    socket.emit('packet',{t:'seated',seat});peers();
    let count=0,at=Date.now();
    socket.on('packet',(msg)=>{
      if(Date.now()-at>10000){at=Date.now();count=0;}
      if(++count>120){socket.disconnect();return;}
      if(!msg||typeof msg!=='object'||Array.isArray(msg))return;
      if(!['team','start','sync','action','move','item','skip','probe'].includes(msg.t))return;
      if(['start','sync'].includes(msg.t)&&seat!=='host')return;
      if(['action','move','item','skip'].includes(msg.t)&&seat!=='guest')return;
      if(msg.t==='team'&&(!Array.isArray(msg.team)||msg.team.length!==4||msg.team.some(x=>typeof x!=='string'||x.length>50)))return;
      socket.to(room).emit('packet',{t:'msg',seat,body:msg});
    });
    socket.on('disconnect',()=>{members.delete(socket.id);if(!members.size)rooms.delete(room);else{game.to(room).emit('packet',{t:'left',seat});peers();}});
  });
}
