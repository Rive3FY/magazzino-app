#!/usr/bin/env node
/**
 * Genera le icone PWA (192x192 e 512x512) da un'immagine sorgente.
 * Uso: node scripts/generate-pwa-icons.js [percorso-immagine]
 * Esempio: node scripts/generate-pwa-icons.js public/terna-login-bg.png
 *
 * Richiede: npm install sharp (opzionale)
 * Se sharp non è installato, crea icone placeholder minimali.
 */

const fs = require("fs");
const path = require("path");

const ICONS_DIR = path.join(__dirname, "..", "public", "icons");
const SIZES = [192, 512];

// PNG minimo valido 1x1 (trasparente) - usato come fallback
const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  const sourceImage = process.argv[2];
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  try {
    const sharp = require("sharp");
    if (!sourceImage || !fs.existsSync(sourceImage)) {
      console.log("Uso: node scripts/generate-pwa-icons.js <percorso-immagine>");
      console.log("Esempio: node scripts/generate-pwa-icons.js public/terna-login-bg.png");
      console.log("\nCreando icone placeholder...");
      createPlaceholders();
      return;
    }

    for (const size of SIZES) {
      const outputPath = path.join(ICONS_DIR, `icon-${size}.png`);
      await sharp(sourceImage)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`Creato: ${outputPath}`);
    }
    console.log("Icone generate con successo.");
  } catch (e) {
    if (e.code === "MODULE_NOT_FOUND") {
      console.log("sharp non installato. Installa con: npm install sharp");
      console.log("Creando icone placeholder...");
      createPlaceholders();
    } else {
      throw e;
    }
  }
}

function createPlaceholders() {
  const source = path.join(__dirname, "..", "public", "terna-login-bg.png");
  if (fs.existsSync(source)) {
    for (const size of SIZES) {
      const outputPath = path.join(ICONS_DIR, `icon-${size}.png`);
      fs.copyFileSync(source, outputPath);
      console.log(`Copiato: ${outputPath}`);
    }
  } else {
    for (const size of SIZES) {
      const outputPath = path.join(ICONS_DIR, `icon-${size}.png`);
      fs.writeFileSync(outputPath, MINIMAL_PNG);
      console.log(`Placeholder minimo: ${outputPath}`);
    }
  }
  console.log("Per icone migliori: npm install sharp && node scripts/generate-pwa-icons.js public/terna-login-bg.png");
}

main().catch(console.error);
