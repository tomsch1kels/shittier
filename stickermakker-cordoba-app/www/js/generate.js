document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  const el = {
    back:       document.getElementById('btn-back'),
    continue:       document.getElementById('btn-continue')
  };

  el.back.addEventListener('click', () => window.history.back());
  el.continue.addEventListener('click', () => goToAdjust(el));

  connect(el);
}

function goToAdjust(el) {
  window.location.href = 'adjust_category.html';

}


function connect(el) {
  const foto = localStorage.getItem('stickerSourcePhoto');

  if (foto) {
    uploadFoto(foto);
  } else {
    console.log('Geen foto gevonden in localStorage');
  }
}

function getValueFromBookState(jsonData, fieldName) {
    try {
        // Optioneel: parse als het een string is
        var data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

        if (!data.book_state) {
            throw new Error('book_state niet gevonden in JSON');
        }

        var bookState = data.book_state;
        var escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var regex = new RegExp('- ' + escapedFieldName + ':\\s*(.+?)(?=\\n|$)', 'i');
        var match = bookState.match(regex);

        if (!match || !match[1]) {
            throw new Error(fieldName + ' niet gevonden in book_state');
        }

        return match[1].trim();
    } catch (err) {
        console.error('Fout bij ophalen ' + fieldName + ':', err.message);
        return null;
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


    var titel = getValueFromBookState(result, 'Titel');
    var auteur = getValueFromBookState(result, 'Auteur');

    if (titel === null) {
        titel = "Titel niet gevonden.";
    }

    if (auteur !== null) {
        auteur = "Auteur niet gevonden.";
    }

    console.log("Titel: " + titel);
    console.log("Auteur: " + auteur);

    localStorage.setItem("titel", titel);
    localStorage.setItem("auteur", auteur);

    localStorage.setItem("assessmentResult", JSON.stringify(result));

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
    top: 90px;
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

}