const fs = require('fs');
const path = require('path');
// Laad de variabelen uit het .env bestand
require('dotenv').config();

// Maak een JavaScript-bestand aan met de keys
const envConfig = `// Automatisch gegenereerd - Niet committen naar GitHub!
const CONFIG = {
  GEMINI_API_KEY: "${process.env.GEMINI_API_KEY || ''}",
  JEV_API_KEY: "${process.env.JEV_API_KEY || ''}"
};
`;

// Pad naar je www/js map in je Cordova app (pas aan indien nodig)
// const targetPath = path.join(__dirname, 'stickermakker-cordoba-app', 'www', 'js', 'env-config.js');
const targetPath = path.join(__dirname, 'www', 'js', 'env-config.js');

fs.writeFileSync(targetPath, envConfig);
console.log('✅ API keys succesvol geïnjecteerd vanuit .env naar env-config.js!');