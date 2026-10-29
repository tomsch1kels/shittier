
```mermaid
sequenceDiagram
    autonumber
    actor MaaktFoto as Maakt foto
    participant App as App
    participant Flask as Python@Render
    participant Gemini as Gemini

    MaaktFoto->>App: Foto
    App->>Flask: Foto
    Flask->>Gemini: Vraagt om tekstbeschrijving
    Gemini-->>Flask: Antwoord
    Flask-->>App: Antwoord
    App->>App: Test call
    Note over MaaktFoto: Kies cat / kies prijs
```