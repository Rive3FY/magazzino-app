# Genera il keystore di upload per Google Play (una sola volta).
# Uso (da PowerShell, nella root del progetto):
#   .\scripts\create-android-keystore.ps1
#
# Output:
#   android/upload-keystore.jks
#   android/keystore.properties  (se non esiste già)

param(
  [string]$StorePassword = "",
  [string]$KeyPassword = "",
  [string]$Alias = "magazzino"
)

$ErrorActionPreference = "Stop"
$androidDir = Join-Path $PSScriptRoot "..\android" | Resolve-Path
$keystorePath = Join-Path $androidDir "upload-keystore.jks"
$propsPath = Join-Path $androidDir "keystore.properties"

if (Test-Path $keystorePath) {
  Write-Host "Keystore già presente: $keystorePath"
  Write-Host "Non viene sovrascritto. Eliminalo manualmente se vuoi ricrearlo."
  exit 0
}

$keytool = Get-Command keytool -ErrorAction SilentlyContinue
if (-not $keytool) {
  $javaHome = $env:JAVA_HOME
  if ($javaHome) {
    $candidate = Join-Path $javaHome "bin\keytool.exe"
    if (Test-Path $candidate) { $keytool = $candidate }
  }
}

if (-not $keytool) {
  Write-Error "keytool non trovato. Installa un JDK e assicurati che keytool sia nel PATH (o imposta JAVA_HOME)."
}

if (-not $StorePassword) {
  $secure = Read-Host "Password keystore (storePassword)" -AsSecureString
  $StorePassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  )
}
if (-not $KeyPassword) {
  $KeyPassword = $StorePassword
}

Write-Host "Creazione keystore in $keystorePath ..."
& $keytool -genkeypair `
  -v `
  -keystore $keystorePath `
  -alias $Alias `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -storepass $StorePassword `
  -keypass $KeyPassword `
  -dname "CN=Magazzino App2, OU=Mobile, O=Magazzino, L=Italia, ST=IT, C=IT"

if (-not (Test-Path $propsPath)) {
  @"
storeFile=upload-keystore.jks
storePassword=$StorePassword
keyAlias=$Alias
keyPassword=$KeyPassword
"@ | Set-Content -Path $propsPath -Encoding UTF8
  Write-Host "Creato $propsPath"
} else {
  Write-Host "keystore.properties esiste già — non modificato."
}

Write-Host ""
Write-Host "Fatto. Conserva password e .jks in un posto sicuro."
Write-Host "Build AAB: npm run android:bundle"
Write-Host "Output tipico: android/app/build/outputs/bundle/release/app-release.aab"
