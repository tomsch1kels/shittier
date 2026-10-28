from flask import Flask, request, jsonify
from flask_cors import CORS  # Import toevoegen
from dotenv import load_dotenv
from PIL import Image
from google import genai
from google.genai import types  # Nodig voor HttpOptions (timeout)
from datetime import datetime
import requests
import os
import json
import time  # Nodig voor het meten van de duur

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

    # Client configureren met een timeout van 120 seconden (120.000 ms)
    client = genai.Client(
        api_key=GEMINI_API_KEY,
        http_options=types.HttpOptions(timeout=120000)
    )
    image = Image.open(file)

    prompt = """
    Analyseer deze foto van het boek. Extraheer de volgende gegevens in een compacte Nederlandse tekst:
- Titel
- Auteur
- Staat/Conditie (bijv. vergeelde pagina's, leesvouwen, hoekschade, nieuwstaat, etc.)
- Details (formaat, hardcover/paperback, eventuele opvallende kenmerken)

    Geef alleen deze beschrijving terug zonder extra beleefdheidsflosfels.
    """

    start_gemini = time.time()
    try:
        gemini_response = client.models.generate_content(
            model="gemini-3.5-flash-lite", 
            contents=[image, prompt]
        )
        book_state = gemini_response.text
    except Exception as e:
        return jsonify({"error": f"Gemini API error: {str(e)}"}), 500
    
    end_gemini = time.time()
    gemini_duration = round(end_gemini - start_gemini, 2)
    print(f"⏱️ Gemini call duurde: {gemini_duration} seconden")

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
            "verkoopprijs": {
                "type": "score",
                "instructions": "Bepaal een geschikte tweedehands verkoopprijs in EUR voor dit boek. Kies uit het bereik van 0,50 tot 5,00 euro.",
                "criteria": ["0.50", "1.00", "1.50", "2.00", "2.50", "3.00", "3.50", "4.00", "4.50", "5.00"]
            }
        }
    }

    start_jev = time.time()
    try:
        response = requests.post(URL, headers=headers, json=payload, timeout=30)
        end_jev = time.time()
        jev_duration = round(end_jev - start_jev, 2)
        print(f"⏱️ JEV API call duurde: {jev_duration} seconden")
        
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

            # Retourneer de respons inclusief de timmings
            return jsonify({
                "success": True,
                "book_state": book_state,
                "jev_result": result,
                "timings": {
                    "gemini_seconds": gemini_duration,
                    "jev_seconds": jev_duration
                }
            }), 200
            
        else:
            print(f"\n❌ JEV API Fout ({response.status_code}):")
            print(response.text)
            return jsonify({
                "error": "JEV API failed",
                "status_code": response.status_code,
                "details": response.text,
                "timings": {
                    "gemini_seconds": gemini_duration,
                    "jev_seconds": round(time.time() - start_jev, 2)
                }
            }), response.status_code

    except Exception as e:
        print(f"❌ Fout tijdens verwerking: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)