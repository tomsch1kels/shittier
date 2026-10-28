document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  const el = {
    back:       document.getElementById('btn-back'),
    continue:   document.getElementById('btn-continue')
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

/* ---------- Hulpfuncties -------------------------------------- */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Zet willekeurige JSON-structuur om naar platte tekst met echte newlines.
 * Voorbeeld: {"Titel": "Foo", "Auteur": "Bar"} → "Foo\nBar"
 */
function verzamelTekst(data) {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(verzamelTekst).filter(Boolean).join('\n');
  if (typeof data === 'object') return Object.values(data).map(verzamelTekst).filter(Boolean).join('\n');
  return String(data);
}

/**
 * Haalt de waarde van één veld op uit LLM-tekst of JSON-object.
 * Ondersteunt: -, *, •, –, · als opsommingsteken, nummering (1. / 1)),
 * markdown (**vet**, __vet__, *cursief*, `code`), : of ： als scheiding,
 * en zowel LF als CRLF regeleindes.
 * Geeft null terug als het veld niet gevonden wordt.
 */
function getValueFromBookState(tekst, fieldName) {
  if (!tekst || !fieldName) return null;

  // Accepteer ook objecten/arrays rechtstreeks (convert naar platte tekst)
  if (typeof tekst !== 'string') tekst = verzamelTekst(tekst);
  if (!tekst) return null;

  const label = escapeRegex(String(fieldName).trim());

  const regex = new RegExp(
    '(?:^|\\r?\\n)' +                    // begin van een regel
    '[ \\t>]*' +                         // inspringing of quote-marker
    '(?:[-*•–·]|\\d{1,3}[.)])?' +        // optioneel opsommingsteken of nummer
    '[ \\t]*' +
    '(?:\\*\\*|__|\\*|_|`)?' +           // openingsmarkdown
    label +
    '(?!\\p{L}|\\p{N})' +                // geen half woord matchen (Prijs ≠ PrijsIncl)
    '(?:\\*\\*|__|\\*|_|`)?' +           // sluitmarkdown
    '[ \\t]*[:：][ \\t]*' +              // dubbele punt (ASCII of full-width)
    '([^\\r\\n]*)',                      // waarde: rest van de regel
    'iu'                                 // i = ignoreCase, u = unicode
  );

  const m = tekst.match(regex);
  if (!m) return null;

  return m[1]
    .replace(/[ \t]+$/, '')          // spaties/tabs aan het eind
    .replace(/[*_`]+$/, '')          // markdown aan het eind
    .replace(/^[*]+/, '')            // ✓ sterretjes aan het BEGIN (één of meer)
    .trim();
}

/* ---------- Foto Upload & Analyse ---------------------------- */

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

    if (!res.ok) throw new Error('Server gaf status ' + res.status);

    // ⚠️ CRUCIAAL: Eerst tekst ophalen, dan pas parsen naar JSON
    const ruweTekst = await res.text();
    console.log('Ruw antwoord van server:', ruweTekst);

    let result;
    try {
      result = JSON.parse(ruweTekst);
    } catch (e) {
      // Geen geldige JSON? Gebruik de tekst zelf
      result = ruweTekst;
    }

    // Veldwaarden uitlezen uit het antwoord (werk met string-waarden, niet null checks)
    let titel  = getValueFromBookState(result, 'Titel');
    let auteur = getValueFromBookState(result, 'Auteur');


    if (titel === null)  titel  = 'Titel niet gevonden.';
    if (auteur === null) auteur = 'Auteur niet gevonden.';  // ← Was !== (fout!), nu ===

    console.log("Titel:", titel);
    console.log("Auteur:", auteur);

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

/* ---------- Overlay Helper ----------------------------------- */

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

  // JSON/nette tekst formatteren
  let formattedText;
  if (typeof data === 'string') {
    formattedText = data;
  } else {
    formattedText = JSON.stringify(data, null, 2);
  }

  overlay.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-family: sans-serif; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
      <strong style="color: #fff; font-size: 14px;">🎯 JEV API Resultaat</strong>
      <button id="close-api-result" style="background: #ef4444; border: none; color: white; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">✕ Sluiten</button>
    </div>
    <pre style="white-space: pre-wrap; word-break: break-all; margin: 0; color: #e2e8f0;">${formattedText}</pre>
  `;

  document.body.appendChild(overlay);

  // Sluitknop functionaliteit
  document.getElementById('close-api-result').onclick = () => overlay.remove();
}