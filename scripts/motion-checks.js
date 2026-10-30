// Local QA only: never bundled into the deployed application.
window.runWallLayoutCheck=async()=>{
 const card=document.querySelector('.photo-card'),photo=app.visible.find(p=>p.id===card?.dataset.photoId);if(!card||!photo)throw Error('Photos are not ready');
 const original=photo.width;photo.width=photo.height*.85;scheduleImageLayout();await new Promise(resolve=>setTimeout(resolve,250));
 const preserved=card===document.querySelector(`[data-photo-id="${photo.id}"]`);
 photo.width=original;scheduleImageLayout();await new Promise(resolve=>setTimeout(resolve,250));
 return {samePhotoNodePreserved:preserved,originalAspectRestored:true};
};
