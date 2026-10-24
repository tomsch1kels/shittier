from flask import Flask, request, jsonify
from flask_cors import CORS  # Import toevoegen
from dotenv import load_dotenv
from PIL import Image
from google import genai
from datetime import datetime
import requests
import os
import json

app = Flask(__name__)
CORS(app)

@app.route('/find', methods=['POST'])
def find_file_size():
    print("=== DEBUG ===")
    print("Form keys:", list(request.form.keys()))
    print("Files keys:", list(request.files.keys()))
    print("Content-Type:", request.content_type)
    print("Data len:", len(request.data))
    print("============")
    
    if 'image' not in request.files:
        return jsonify({"error": "No file provided...", "files_keys": list(request.files.keys())}), 400
    
    file = request.files['image']
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    # 1. Laad API keys uit .env
    load_dotenv()
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    JEV_API_KEY = os.getenv("JEV_API_KEY")

    if not GEMINI_API_KEY or not JEV_API_KEY:
        return jsonify({"error": "Zorg dat zowel GEMINI_API_KEY als JEV_API_KEY in je .env bestand staan!"}), 500

    # ---------------------------------------------------------
    # STAP 1: Gemini aanroepen voor visuele analyse van het boek
    # ---------------------------------------------------------
    print("📸 Foto wordt geanalyseerd door Gemini Flash...")

    client = genai.Client(api_key=GEMINI_API_KEY)
    image = Image.open(file)

    prompt = """
    Analyseer deze foto van het boek. Extraheer de volgende gegevens in een compacte Nederlandse tekst:
- Titel
- Auteur
- Staat/Conditie (bijv. vergeelde pagina's, leesvouwen, hoekschade, nieuwstaat, etc.)
- Details (formaat, hardcover/paperback, eventuele opvallende kenmerken)

    Geef alleen deze beschrijving terug zonder extra beleefdheidsflosfels.
    """

    try:
        gemini_response = client.models.generate_content(
            model="gemini-3.5-flash-lite", # Updated to standard active model name
            contents=[image, prompt]
        )
        book_state = gemini_response.text
    except Exception as e:
        return jsonify({"error": f"Gemini API error: {str(e)}"}), 500

    print("\n--- GEMINI EXTRACTION (BOOK STATE) ---")
    print(book_state)
    print("--------------------------------------\n")


    # ---------------------------------------------------------
    # STAP 2: JEV Decision API aanroepen met de gegenereerde state
    # ---------------------------------------------------------
    print("⏳ JEV Decision API wordt aangeroepen...")

    URL = "https://openrouter.ai/api/alpha/decisions"

    headers = {
        "Authorization": f"Bearer {JEV_API_KEY.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "StickerMakker"
    }

    payload = {
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
            "verkoopsnelheid": {
                "type": "choice",
                "instructions": "Schat in binnen hoeveel dagen dit boek waarschijnlijk verkocht zal worden.",
                "criteria": {
                    "0-14 dagen": "Verwachte verkoop binnen 14 dagen",
                    "14-30 dagen": "Verwachte verkoop tussen 14 en 30 dagen",
                    "30-60 dagen": "Verwachte verkoop tussen 30 en 60 dagen",
                    "60-90 dagen": "Verwachte verkoop tussen 60 en 90 dagen",
                    "90+ dagen": "Verwachte verkoop duurt langer dan 90 dagen"
                }
            },
            "verkoopprijs": {
                "type": "score",
                "instructions": "Bepaal een geschikte tweedehands verkoopprijs in EUR voor dit boek. Kies uit het bereik van 0,50 tot 5,00 euro.",
                "criteria": ["0.50", "1.00", "1.50", "2.00", "2.50", "3.00", "3.50", "4.00", "4.50", "5.00"]
            }
        }
    }

    try:
        response = requests.post(URL, headers=headers, json=payload, timeout=15)
        
        if response.status_code == 200:
            result = response.json()

            # OPSLAAN VAN DE RAUWE RESPONS JSON
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_filename = f"jev_response_{timestamp}.json"
            with open(output_filename, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            print(f"💾 Rauwe JEV respons opgeslagen in '{output_filename}'")

            # OVERZICHTSWEERGAVE IN DE TERMINAL
            decisions = result.get("decisions", {})
            print("\n" + "=" * 55)
            print("         🎯 JEV BESLUITVORMING OVERZICHT")
            print("=" * 55)
            
            total_confidence = 1.0
            for key, details in decisions.items():
                waarde = details.get("value", "N/A")
                confidence = details.get("confidence", 0.0)
                percentage = confidence * 100
                if confidence < total_confidence:
                    total_confidence = confidence
                
                icon = "🟢" if percentage >= 90 else ("🟡" if percentage >= 75 else "🔴")
                print(f"\n🔹 {key.capitalize():<16}: {waarde}")
                print(f"   └─ Zekerheid   : {icon} {percentage:.1f}%")

            print("\n" + "-" * 55)
            if total_confidence >= 0.90:
                print("🚀 STATUS          : AUTOMATISCH GOEDGEKEURD")
            elif total_confidence >= 0.75:
                print("⚠️ STATUS          : TWIJFELGEVAL")
            else:
                print("❌ STATUS          : ONVOLDOENDE ZEKERHEID")
            print("=" * 55 + "\n")

            # **CRITICAL FIX: Return a valid JSON response back to the client**
            return jsonify({
                "success": True,
                "book_state": book_state,
                "jev_result": result
            }), 200
            
        else:
            print(f"\n❌ JEV API Fout ({response.status_code}):")
            print(response.text)
            return jsonify({
                "error": "JEV API failed",
                "status_code": response.status_code,
                "details": response.text
            }), response.status_code

    except Exception as e:
        print(f"❌ Fout tijdens verwerking: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)