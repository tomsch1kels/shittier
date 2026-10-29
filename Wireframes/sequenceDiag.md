
```mermaid
sequenceDiagram
    autonumber
    actor MaaktFoto as Maakt foto
    participant App as App
    participant Flask as Python@Render
    participant Jev as Jev

    MaaktFoto->>App: Foto
    App->>Flask: Foto
    create participant Gemini
    Flask->>Gemini: Vraagt om tekstbeschrijving
    Gemini-->>Flask: Antwoord
    destroy Gemini
    Flask->>Jev: Vraagt om cat. en prijs
    Jev-->>Flask: Antwoord
    Flask-->>App: Antwoord
    App-->>MaaktFoto: (vraagt om verheldering)
    MaaktFoto-->>App: Antwoord
    App-->>App: Maakt sticker
```