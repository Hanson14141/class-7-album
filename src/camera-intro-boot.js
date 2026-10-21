// Runs in the head so a returning tab does not briefly show the camera.
(function(){
 const config=window.class7CameraConfig;
 let seen=false;try{seen=config.skipSession&&sessionStorage.getItem(config.sessionKey)==='1';}catch{}
 document.documentElement.dataset.cameraIntro=seen?'skip':'pending';
 // The camera must not trap visitors if the main script fails to load.
 if(!seen)window.class7CameraBootTimer=setTimeout(()=>{const d=document.getElementById('camera-intro');if(d?.open)d.close();document.documentElement.dataset.cameraIntro='done';},12000);
})();
