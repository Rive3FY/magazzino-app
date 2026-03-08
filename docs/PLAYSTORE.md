# Pubblicare l'app su Google Play Store

Questa guida spiega come creare l'app Android per il Gestionale Magazzino e pubblicarla su Play Store usando **Trusted Web Activity (TWA)**.

## Prerequisiti

1. **App deployata** – L'app deve essere online su HTTPS (es. Vercel, dominio proprio)
2. **Account Google Play Developer** – Costo una tantum ~25€
3. **Node.js** – Per usare Bubblewrap

## Passo 1: Deploy dell'app

Assicurati che l'app sia accessibile via HTTPS. Esempio: `https://magazzino.tuaazienda.it`

## Passo 2: Aggiorna assetlinks.json

Dopo aver generato il progetto Android (Passo 3), dovrai aggiornare `public/.well-known/assetlinks.json` con:

- **package_name**: il package dell'app Android (es. `com.tuaazienda.magazzino`)
- **sha256_cert_fingerprints**: l'impronta SHA256 della chiave di firma

Per ottenere l'SHA256 dopo `bubblewrap init`:

```bash
keytool -list -v -keystore ./android-app.keystore -alias android
```

Copia la riga "SHA256:" e formattala con i due punti (es. `AA:BB:CC:...`).

## Passo 3: Genera il progetto Android con Bubblewrap

```bash
# Installa Bubblewrap
npm install -g @bubblewrap/cli

# Inizializza (sostituisci con l'URL della tua app deployata)
bubblewrap init --manifest=https://TUO-DOMINIO.it/manifest.json
```

Durante l'inizializzazione:
- Conferma nome app, URL, ecc.
- Scegli un **package name** (es. `com.tuaazienda.magazzino`)
- Bubblewrap creerà una chiave di firma o ne userà una esistente

## Passo 4: Aggiorna assetlinks sul server

Copia il contenuto di `public/.well-known/assetlinks.json` aggiornato e assicurati che sia servito all'URL:

```
https://TUO-DOMINIO.it/.well-known/assetlinks.json
```

Verifica con: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://TUO-DOMINIO.it

## Passo 5: Build dell'APK

```bash
cd <cartella-generata-da-bubblewrap>
bubblewrap build
```

Output: `app-release-signed.aab` (o `.apk`) pronto per Play Store.

## Passo 6: Pubblica su Play Store

1. Vai su [Google Play Console](https://play.google.com/console)
2. Crea una nuova app
3. Compila le informazioni richieste (descrizione, screenshot, ecc.)
4. Carica il file `.aab` nella sezione "Release" > "Produzione"
5. Invia per la revisione

## File importanti nel progetto

| File | Descrizione |
|------|-------------|
| `public/manifest.json` | Manifest PWA (nome, icone, theme) |
| `public/icons/icon-192.png` | Icona 192×192 |
| `public/icons/icon-512.png` | Icona 512×512 |
| `public/.well-known/assetlinks.json` | Verifica dominio per TWA |

## Rigenerare le icone

```bash
# Con sharp installato (ridimensiona da un'immagine)
npm install sharp
node scripts/generate-pwa-icons.js public/terna-login-bg.png

# Senza parametri: usa placeholder
node scripts/generate-pwa-icons.js
```

## Risorse

- [Bubblewrap - GitHub](https://github.com/GoogleChromeLabs/bubblewrap)
- [PWA in Play Store - Google](https://developers.google.com/codelabs/pwa-in-play)
- [Digital Asset Links](https://developers.google.com/digital-asset-links/v1/getting-started)
