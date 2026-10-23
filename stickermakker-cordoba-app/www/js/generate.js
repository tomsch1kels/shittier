document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  const el = {
    connect:       document.getElementById('btn-connect'),
    back:       document.getElementById('btn-back')
  };

  el.connect.addEventListener('click', () => connect());
  el.back.addEventListener('click', () => window.history.back());

}


function connect(el) {
  const foto = sessionStorage.getItem('stickerSourcePhoto');

  if (foto) {
    uploadFoto(foto);
  } else {
    console.log('Geen foto gevonden in sessionStorage');
  }
}
async function uploadFoto(photoDataUrl) {
  // Converteer DataURL → Blob
  const response = await fetch(photoDataUrl);
  const blob = await response.blob();
  
  const formData = new FormData();
  formData.append('image', blob, 'canvas.jpg'); // filename is verplicht voor Flask
  
  const res = await fetch('https://imagecheckerapi.onrender.com/find', {
    method: 'POST',
    body: formData
  });
  
  console.log(await res.json());
}