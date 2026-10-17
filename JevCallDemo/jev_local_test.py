import os
import json
import requests
from dotenv import load_dotenv
from PIL import Image
from google import genai
from datetime import datetime


# 1. Laad API keys uit .env
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
JEV_API_KEY = os.getenv("JEV_API_KEY")

if not GEMINI_API_KEY or not JEV_API_KEY:
    raise ValueError("❌ Zorg dat zowel GEMINI_API_KEY als JEV_API_KEY in je .env bestand staan!")

IMAGE_PATH = "boek.jpg"  # Vervang door jouw afbeelding

if not os.path.exists(IMAGE_PATH):
    raise FileNotFoundError(f"❌ Kan het bestand {IMAGE_PATH} niet vinden in de huidige map.")

# ---------------------------------------------------------
# STAP 1: Gemini aanroepen voor visuele analyse van het boek
# ---------------------------------------------------------
print("📸 Foto wordt geanalyseerd door Gemini Flash...")

client = genai.Client(api_key=GEMINI_API_KEY)
img = Image.open(IMAGE_PATH)

prompt = """
Analyseer deze foto van het boek. Extraheer de volgende gegevens in een compacte Nederlandse tekst:
- Titel
- Auteur
- Staat/Conditie (bijv. vergeelde pagina's, leesvouwen, hoekschade, nieuwstaat, etc.)
- Details (formaat, binds规定/hardcover/paperback, eventuele opvallende kenmerken)

Geef alleen deze beschrijving terug zonder extra beleefdheidsflosfels.
"""

# Gebruik Gemini 3.5 Flash Lite: altijd beschikbaar en goedkoop
gemini_response = client.models.generate_content(
    model="gemini-3.5-flash-lite",
    contents=[img, prompt]
)

book_state = gemini_response.text

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
                "Literatuur": "Literatuur en romans",
                "Thriller": "Thrillers, detectives en spanning",
                "Non-Fictie": "Non-fictie, geschiedenis en filosofie",
                "Kinderboek": "Kinderboeken en jeugd",
                "Hobby": "Koken, hobby en vrije tijd"
            }
        },
        "verkoopsnelheid": {
            "type": "choice",
            "instructions": "Schat in hoe snel dit boek waarschijnlijk verkocht zal worden.",
            "criteria": {
                "Snel": "Verwachte verkoop binnen 14 dagen",
                "Normaal": "Verwachte verkoop tussen 14 en 60 dagen",
                "Traag": "Verwachte verkoop duurt langer dan 60 dagen"
            }
        },
        "verkoopprijs": {
            "type": "score",
            "instructions": "Bepaal een geschikte tweedehands verkoopprijs in EUR voor dit boek.",
            "criteria": ["2.00", "3.50", "5.00", "7.50", "10.00", "15.00"]
        }
    }
}

try:
    response = requests.post(URL, headers=headers, json=payload, timeout=15)
    if response.status_code == 200:
        result = response.json()

        # ---------------------------------------------------------
        # OPSLAAN VAN DE RAUWE RESPONS JSON
        # ---------------------------------------------------------

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"jev_response_{timestamp}.json"
        with open(output_filename, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"💾 Rauwe JEV respons opgeslagen in '{output_filename}'")

        # ---------------------------------------------------------
        # OVERZICHTSWEERGAVE IN DE TERMINAL
        # ---------------------------------------------------------
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
            label = key.capitalize()
            print(f"\n🔹 {label:<16}: {waarde}")
            print(f"   └─ Zekerheid   : {icon} {percentage:.1f}%")

        print("\n" + "-" * 55)
        
        if total_confidence >= 0.90:
            print("🚀 STATUS          : AUTOMATISCH GOEDGEKEURD")
            print("🖨️ ACTIE           : Sticker kan direct worden afgedrukt.")
        elif total_confidence >= 0.75:
            print("⚠️ STATUS          : TWIJFELGEVAL")
            print("🔍 ACTIE           : Controleer categorie of prijs handmatig.")
        else:
            print("❌ STATUS          : ONVOLDOENDE ZEKERHEID")
            print("✋ ACTIE           : Vraag handmatige invoer aan de medewerker.")
            
        print("=" * 55 + "\n")
        
    else:
        print(f"\n❌ JEV API Fout ({response.status_code}):")
        print(response.text)

except Exception as e:
    print(f"❌ Fout tijdens verwerking: {e}")