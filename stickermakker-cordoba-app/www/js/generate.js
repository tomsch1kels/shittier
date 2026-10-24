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
  try {
    // Optioneel: toon een melding dat de foto wordt verstuurd
    showTemporaryResult({ status: "Bezig met analyseren..." });

    // Converteer DataURL → Blob
    const response = await fetch(photoDataUrl);
    const blob = await response.blob();
    
    const formData = new FormData();
    formData.append('image', blob, 'canvas.jpg'); // filename is verplicht voor Flask
    
    const res = await fetch('https://shittier.onrender.com/find', {
      method: 'POST',
      body: formData
    });
    
    const result = await res.json();
    console.log(result);

    // Toon het resultaat tijdelijk netjes in de UI
    showTemporaryResult(result);

  } catch (error) {
    console.error("Upload error:", error);
    showTemporaryResult({ error: error.message });
  }
}

// Helperfunctie om het JSON-resultaat tijdelijk op het scherm te tonen
function showTemporaryResult(data) {
  // Verwijder eventuele bestaande overlay
  let existing = document.getElementById('api-result-overlay');
  if (existing) existing.remove();

  // Maak een modern, zwevend element aan
  const overlay = document.createElement('div');
  overlay.id = 'api-result-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    right: 20px;
    max-height: 70vh;
    background: rgba(15, 23, 42, 0.95);
    color: #38bdf8;
    padding: 16px;
    border-radius: 12px;
    z-index: 99999;
    overflow-y: auto;
    font-family: monospace;
    font-size: 12px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(56, 189, 248, 0.3);
  `;

  // JSON netjes formatteren met inspringing
  const formattedJson = JSON.stringify(data, null, 2);

  overlay.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-family: sans-serif; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
      <strong style="color: #fff; font-size: 14px;">🎯 JEV API Resultaat</strong>
      <button id="close-api-result" style="background: #ef4444; border: none; color: white; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">✕ Sluiten</button>
    </div>
    <pre style="white-space: pre-wrap; word-break: break-all; margin: 0; color: #e2e8f0;">${formattedJson}</pre>
  `;

  document.body.appendChild(overlay);

  // Sluitknop functionaliteit
  document.getElementById('close-api-result').onclick = () => overlay.remove();

  // Automatisch verdwijnen na 12 seconden (tijdelijk zichtbaar)
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.remove();
    }
  }, 12000);
}