
```mermaid
sequenceDiagram
    autonumber
    actor MaaktFoto as Maakt foto
    participant Flask as Render Flask app
    participant Gemini as Gemini

    MaaktFoto->>Flask: Maakt foto / stuur data
    Flask->>Gemini: Gemini call (categorie / opties)
    Gemini-->>Flask: Antwoord
    Note over MaaktFoto: Kies cat / kies prijs
```