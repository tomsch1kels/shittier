%%{init: {
  "sequence": {
    "actorMargin": 10,
    "messageMargin": 10,
    "messageFontSize": 11,
    "actorFontSize": 11,
    "noteFontSize": 11,
    "wrap": true
  }
}}%%
sequenceDiagram
    autonumber
    actor M as Foto
    participant A as App
    participant R as Render
    participant G as Gemini
    participant J as Jev

    M->>A: Foto
    A->>R: Foto
    R->>G: Vraag beschrijving
    G-->>R: Antwoord
    R->>J: Vraag cat/prijs
    J-->>R: Antwoord
    R-->>A: Antwoord
    A-->>M: Verheldering?
    M-->>A: Antwoord
    Note over A: Maakt sticker