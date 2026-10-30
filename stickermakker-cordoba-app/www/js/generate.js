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

async function connect(el) {
  const foto = localStorage.getItem('stickerSourcePhoto');
  if (!foto) {
    console.log('Geen foto gevonden in localStorage');
    return;
  }
  const klein = await verkleinAfbeelding(foto, 1200, 0.85);
  uploadFoto(klein);
}

/* ---------- Hulpfuncties -------------------------------------- */

function verkleinAfbeelding(dataUrl, maxZijde = 1200, kwaliteit = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const schaal = Math.min(1, maxZijde / Math.max(img.width, img.height));
      const w = Math.round(img.width * schaal);
      const h = Math.round(img.height * schaal);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      resolve(canvas.toDataURL('image/jpeg', kwaliteit));
    };
    img.onerror = () => reject(new Error('Kon afbeelding niet laden'));
    img.src = dataUrl;
  });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Zet willekeurige JSON-structuur om naar platte tekst met echte newlines.
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
 */
function getValueFromBookState(tekst, fieldName) {
  if (!tekst || !fieldName) return null;

  if (typeof tekst !== 'string') tekst = verzamelTekst(tekst);
  if (!tekst) return null;

  const label = escapeRegex(String(fieldName).trim());

  const regex = new RegExp(
    '(?:^|\\r?\\n)' +                      // begin van een regel
    '[ \\t>]*' +                           // inspringing of quote-marker
    '(?:[-*•–·]|\\d{1,3}[.)])?' +        // optioneel opsommingsteken of nummer
    '[ \\t]*' +
    '(?:\\*\\*|__|\\*|_|`)?' +            // openingsmarkdown
    label +
    '(?!\\p{L}|\\p{N})' +                  // geen half woord matchen
    '(?:\\*\\*|__|\\*|_|`)?' +            // sluitmarkdown
    '[ \\t]*[:：][ \\t]*' +                 // dubbele punt
    '([^\\r\\n]*)',                        // waarde: rest van de regel
    'iu'                                   // i = ignoreCase, u = unicode
  );

  const m = tekst.match(regex);
  if (!m) return null;

  return m[1]
    .replace(/[ \t]+$/, '')          // spaties/tabs aan het eind
    .replace(/[*_`]+$/, '')          // markdown aan het eind
    .replace(/^[*]+/, '')            // sterretjes aan het BEGIN
    .trim();
}

/* ---------- Foto Upload & Analyse (Direct vanuit JS) --------- */

async function uploadFoto(photoDataUrl) {
  try {
    if (!CONFIG.GEMINI_API_KEY || !CONFIG.JEV_API_KEY) {
      throw new Error("Zorg dat zowel GEMINI_API_KEY als JEV_API_KEY zijn ingesteld in generate.js!");
    }

    showTemporaryResult({ status: "📸 Foto wordt geanalyseerd door Gemini..." });
    console.log("📸 Foto wordt geanalyseerd door Gemini...");

    // Splits base64 data URL om de pure base64 string te krijgen
    const base64Data = photoDataUrl.split(',')[1];
    if (!base64Data) {
      throw new Error("Ongeldige foto data URL.");
    }

    // ---------------------------------------------------------
    // STAP 1: Gemini API aanroepen via REST v1beta
    // ---------------------------------------------------------
    const startGemini = performance.now();
    
    // Je kunt 'gemini-1.5-flash' gebruiken (of 'gemini-2.5-flash' / 'gemini-3.5-flash-lite' indien ondersteund door je endpoint)
const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${CONFIG.GEMINI_API_KEY}`;    
    const geminiPayload = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Data
              }
            },
            {
              text: `Analyseer deze foto van het boek. Extraheer de volgende gegevens in een compacte Nederlandse tekst:
- Titel
- Auteur
- Staat/Conditie (bijv. vergeelde pagina's, leesvouwen, hoekschade, nieuwstaat, etc.)
- Details (formaat, hardcover/paperback, eventuele opvallende kenmerken)

Geef alleen deze beschrijving terug zonder extra beleefdheidsflosfels.`
            }
          ]
        }
      ]
    };

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API error (${geminiRes.status}): ${errText}`);
    }

    const geminiJson = await geminiRes.json();
    const book_state = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!book_state) {
      throw new Error("Geen geldig antwoord ontvangen van Gemini.");
    }

    const endGemini = performance.now();
    const geminiDuration = Number(((endGemini - startGemini) / 1000).toFixed(2));
    console.log(`⏱️ Gemini call duurde: ${geminiDuration} seconden`);
    console.log("\n--- GEMINI EXTRACTION (BOOK STATE) ---\n", book_state);

    // ---------------------------------------------------------
    // STAP 2: JEV Decision API aanroepen via OpenRouter
    // ---------------------------------------------------------
    showTemporaryResult({ status: "⏳ JEV Decision API wordt aangeroepen...", book_state });
    console.log("⏳ JEV Decision API wordt aangeroepen...");

    const jevUrl = "https://openrouter.ai/api/alpha/decisions";
    const jevHeaders = {
      "Authorization": `Bearer ${CONFIG.JEV_API_KEY.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin || "http://localhost:3000",
      "X-Title": "StickerMakker"
    };

    const jevPayload = {
      "model": "typesafe/jev-1.13",
      "state": book_state,
      "questions": {
        "categorie": {
          "type": "choice",
          "instructions": "Bepaal in welke winkelcategorie dit boek het beste past.",
          "criteria": {
            "1": "Bedrijfskunde & economie",
            "4": "Educatief, opvoeding & onderwijs",
            "7": "Geschiedenis & koningshuis",
            "8": "Gezondheid & geneeskunde",
            "9": "Godsdienst & religie",
            "10": "Hobby",
            "17": "Mens & maatschappij",
            "18": "Natuur & milieu",
            "20": "Poëzie",
            "21": "Romans"
          }
        },
        "verkoopprijs": {
          "type": "score",
          "instructions": "Bepaal een geschikte tweedehands verkoopprijs in EUR voor dit boek. Kies uit het bereik van 0,50 tot 5,00 euro.",
          "criteria": ["0.50", "1.00", "1.50", "2.00", "2.50", "3.00", "3.50", "4.00", "4.50", "5.00"]
        }
      }
    };

    const startJev = performance.now();
    const jevRes = await fetch(jevUrl, {
      method: 'POST',
      headers: jevHeaders,
      body: JSON.stringify(jevPayload)
    });

    const endJev = performance.now();
    const jevDuration = Number(((endJev - startJev) / 1000).toFixed(2));
    console.log(`⏱️ JEV API call duurde: ${jevDuration} seconden`);

    const jevResultJson = await jevRes.json();

    if (!jevRes.ok) {
      throw new Error(`JEV API failed (${jevRes.status}): ${JSON.stringify(jevResultJson)}`);
    }

    // Resultaten verwerken
    let titel  = getValueFromBookState(book_state, 'Titel');
    let auteur = getValueFromBookState(book_state, 'Auteur');

    if (titel === null)  titel  = 'Titel niet gevonden.';
    if (auteur === null) auteur = 'Auteur niet gevonden.';

    console.log("Titel:", titel);
    console.log("Auteur:", auteur);

    localStorage.setItem("titel", titel);
    localStorage.setItem("auteur", auteur);

    const finalResult = {
      timings: {
        gemini_seconds: geminiDuration,
        jev_seconds: jevDuration
      },
      success: true,
      book_state: book_state,
      jev_result: jevResultJson
    };

    localStorage.setItem("assessmentResult", JSON.stringify(finalResult));

    // Toon het resultaat netjes in de UI
    showTemporaryResult(finalResult);

  } catch (error) {
    console.error("Upload error:", error);
    showTemporaryResult({ error: error.message });
  }
}

/* ---------- Overlay Helper ----------------------------------- */

function showTemporaryResult(data) {
  let existing = document.getElementById('api-result-overlay');
  if (existing) existing.remove();

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

  document.getElementById('close-api-result').onclick = () => overlay.remove();
}