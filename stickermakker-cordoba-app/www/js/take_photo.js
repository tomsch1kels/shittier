let stream = null;
let photoDataUrl = null;
let torchOn = false;
let track = null;

document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  const el = {
    video:      document.getElementById('video'),
    canvas:     document.getElementById('canvas'),
    snapshot:   document.getElementById('snapshot'),
    hint:       document.getElementById('hint'),
    step:       document.getElementById('step'),
    shutter:    document.getElementById('btn-shutter'),
    generate:   document.getElementById('btn-generate'),
    flash:      document.getElementById('btn-flash'),
    gallery:    document.getElementById('btn-gallery'),
    retake:     document.getElementById('btn-retake'),
    back:       document.getElementById('btn-back'),
    shortcut:   document.getElementById('btn-shortcut')
  };

  el.shutter.addEventListener('click', () => capture(el));
  el.retake.addEventListener('click', () => resetToLive(el));
  el.flash.addEventListener('click', () => toggleTorch(el));
  el.gallery.addEventListener('click', () => pickFromGallery(el));
  el.generate.addEventListener('click', () => generateSticker());
  el.back.addEventListener('click', () => window.history.back());
  el.shortcut.addEventListener('click', () => takeShortcut());

  startCamera(el);
}

async function takeShortcut() {
    
    localStorage.setItem("titel", "Basisboek bedrijfskunde");
    localStorage.setItem("auteur", "Sytse Douma en Stijn van den Hoogen");

    const res = await fetch('loremInput.json');
    const data = await res.json();
    localStorage.setItem("assessmentResult", JSON.stringify(data));

    window.location.href = 'adjust_category.html';

}

/* ---------- Live camera starten ---------- */

async function startCamera(el) {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1080 },
        height: { ideal: 1440 }
      },
      audio: false
    });

    el.video.srcObject = stream;
    track = stream.getVideoTracks()[0];

    el.hint.textContent = 'Richt op de boekomslag';
    el.shutter.disabled = false;

  } catch (err) {
    console.error('Camera niet beschikbaar:', err);
    el.shutter.disabled = true;
    el.hint.textContent = 'Camera niet beschikbaar — gebruik de galerij';

    // Val terug op de native camera-plugin als die geïnstalleerd is
    if (window.navigator.camera) {
      el.hint.textContent = 'Tik op de sluiter om de camera-app te openen';
      el.shutter.disabled = false;
      el.shutter.onclick = () => openNativeCamera(el);
    }
  }
}

/* ---------- Foto maken ---------- */

function capture(el) {
  if (!stream || !track) return;

  const vw = el.video.videoWidth;
  const vh = el.video.videoHeight;
  if (!vw || !vh) return;

  el.canvas.width = vw;
  el.canvas.height = vh;

  const ctx = el.canvas.getContext('2d');
  ctx.drawImage(el.video, 0, 0, vw, vh);

  photoDataUrl = el.canvas.toDataURL('image/jpeg', 0.92);

  el.snapshot.src = photoDataUrl;
  el.snapshot.hidden = false;
  el.video.hidden = true;

  el.hint.textContent = 'Foto gemaakt — controleer en ga verder';
  el.step.innerHTML = '&#9679; Stap 2 van 2 &middot; Verwerken &amp; genereren';

  el.retake.hidden = false;
  el.generate.disabled = false;

  stopStream();
}

function resetToLive(el) {
  photoDataUrl = null;
  el.snapshot.hidden = true;
  el.snapshot.removeAttribute('src');
  el.video.hidden = false;

  el.retake.hidden = true;
  el.generate.disabled = true;
  el.step.innerHTML = '&#9679; Stap 1 van 2 &middot; Foto maken';

  startCamera(el);
}

function stopStream() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    track = null;
  }
}

/* ---------- Zaklamp ---------- */

async function toggleTorch(el) {
  if (!track) return;
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  if (!caps.torch) {
    el.flash.disabled = true;
    return;
  }
  try {
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    el.flash.classList.toggle('is-active', torchOn);
  } catch (e) {
    console.warn('Zaklamp mislukt:', e);
  }
}

/* ---------- Galerij ---------- */

function pickFromGallery(el) {
  if (window.navigator.camera) {
    navigator.camera.getPicture(
      uri => showExternalPhoto(el, uri),
      msg => console.log('Galerij geannuleerd:', msg),
      {
        sourceType: Camera.PictureSourceType.PHOTOLIBRARY,
        destinationType: Camera.DestinationType.DATA_URL,
        quality: 92,
        correctOrientation: true
      }
    );
    return;
  }

  // Browser-fallback
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => showExternalPhoto(el, reader.result);
    reader.readAsDataURL(file);
  };
  input.click();
}

function showExternalPhoto(el, src) {
  const url = src.startsWith('data:') ? src : 'data:image/jpeg;base64,' + src;
  photoDataUrl = url;

  stopStream();
  el.snapshot.src = url;
  el.snapshot.hidden = false;
  el.video.hidden = true;

  el.hint.textContent = 'Afbeelding gekozen — controleer en ga verder';
  el.step.innerHTML = '&#9679; Stap 2 van 2 &middot; Verwerken &amp; genereren';
  el.retake.hidden = false;
  el.generate.disabled = false;
}

/* ---------- Native camera-fallback ---------- */

function openNativeCamera(el) {
  navigator.camera.getPicture(
    uri => showExternalPhoto(el, uri),
    msg => console.log('Camera geannuleerd:', msg),
    {
      destinationType: Camera.DestinationType.DATA_URL,
      sourceType: Camera.PictureSourceType.CAMERA,
      quality: 92,
      correctOrientation: true,
      saveToPhotoAlbum: false
    }
  );
}

/* ---------- Doorsturen naar de generator ---------- */

function generateSticker() {
  if (!photoDataUrl) return;

  // Tijdelijke opslag zodat het volgende scherm de foto kan oppakken.
  // localStorage is genoeg voor één schermovergang; voor grotere foto's
  // kun je beter het FileSystem- of Preferences-plugin gebruiken.
  try {
    localStorage.setItem('stickerSourcePhoto', photoDataUrl);
  } catch (e) {
    console.warn('Foto te groot voor localStorage:', e);
  }
  // "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAA

  window.location.href = 'generate.html';
}