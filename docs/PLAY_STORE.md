# Magazzino App2 — Google Play Store (Android)

L’app Android è uno shell **Capacitor** che apre l’URL HTTPS di produzione di Next.js. Electron (Windows) resta indipendente.

## Prerequisiti

1. App Next.js online su **HTTPS** (es. Vercel).
2. [Android Studio](https://developer.android.com/studio) (SDK + JDK).
3. Account [Google Play Console](https://play.google.com/console) (quota una tantum).

## 1. Imposta l’URL di produzione

Copia e modifica:

```bash
copy .env.capacitor.example .env.capacitor
```

In `.env.capacitor`:

```
CAPACITOR_SERVER_URL=https://TUO-DOMINIO-REALE.vercel.app
```

Poi sincronizza:

```bash
npm run cap:sync
```

## 2. Apri il progetto Android

```bash
npm run cap:open:android
```

Oppure apri la cartella `android/` in Android Studio.

## 3. Keystore di firma (una sola volta)

Da PowerShell, nella root del repo:

```powershell
.\scripts\create-android-keystore.ps1
```

Crea:

- `android/upload-keystore.jks`
- `android/keystore.properties`

**Non committare** questi file. Conserva password e `.jks` in un backup sicuro: senza di essi non potrai aggiornare l’app sullo store.

Template di riferimento: `android/keystore.properties.example`.

## 4. Build AAB (Android App Bundle)

Con JDK e Android SDK configurati:

```bash
npm run android:bundle
```

Oppure in Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**.

Output tipico:

`android/app/build/outputs/bundle/release/app-release.aab`

## 5. Checklist Google Play Console

### Account e app

- [ ] Account sviluppatore Play Console attivo
- [ ] Crea app → nome **Magazzino App2** → tipo App → gratis/a pagamento
- [ ] Package name / applicationId: `com.magazzino.app2` (già impostato)

### Scheda store (obbligatoria)

- [ ] Titolo breve e descrizione completa
- [ ] Icona 512×512
- [ ] Feature graphic 1024×500
- [ ] Screenshot telefono (almeno 2)
- [ ] Categoria (es. Business / Produttività)
- [ ] Contatto email di supporto
- [ ] **URL privacy policy** (obbligatoria se login / dati utente — il caso di Magazzino)

### Contenuti e conformità

- [ ] Questionario classificazione contenuti
- [ ] Target audience / age rating
- [ ] Dichiarazione Data safety (Supabase, account, eventuali email)
- [ ] Se usi fotocamera: dichiaralo in Data safety / permessi

### Release

- [ ] Crea release in **test interno** (consigliato prima della produzione)
- [ ] Carica `app-release.aab`
- [ ] Aggiungi tester interni, verifica login / scan / magazzino
- [ ] Promuovi a produzione quando i test sono ok

### Versioni successive

In `android/app/build.gradle` incrementa:

- `versionCode` (intero, sempre +1)
- `versionName` (es. `"1.1"`)

Poi `npm run cap:sync` (se cambi URL/config) e `npm run android:bundle`.

## Limiti noti

- Serve rete: il WebView carica il server Next remoto.
- Web NFC in WebView Android è limitato; per NFC sul device valuta in seguito plugin nativi o i flussi “scan remoto” già presenti.
- Dopo aver cambiato `CAPACITOR_SERVER_URL`, riesegui sempre `npm run cap:sync`.

## Script utili

| Comando | Descrizione |
|---------|-------------|
| `npm run cap:sync` | Copia config/assets nel progetto Android |
| `npm run cap:open:android` | Apre Android Studio |
| `npm run android:bundle` | Build release AAB |
| `.\scripts\create-android-keystore.ps1` | Genera keystore + properties |
