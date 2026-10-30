const wallSpeedValues=[0.5,1,1.5,2,3];
let wallSpeed=Number(safeRead('class7-wall-speed'))||1;
if(!wallSpeedValues.includes(wallSpeed))wallSpeed=1;
$('#wall-speed').value=String(wallSpeed);
$('#wall-speed').addEventListener('change',()=>{
  const value=Number($('#wall-speed').value);
  if(!wallSpeedValues.includes(value))return;
  wallSpeed=value;safeWrite('class7-wall-speed',String(value));refreshWallMotion();
});
