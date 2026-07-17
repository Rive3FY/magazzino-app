import type { CapacitorConfig } from "@capacitor/cli";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * URL HTTPS dell'app Next.js in produzione.
 * Imposta CAPACITOR_SERVER_URL oppure crea `.env.capacitor` (vedi `.env.capacitor.example`).
 */
function loadCapacitorServerUrl(): string {
  if (process.env.CAPACITOR_SERVER_URL?.trim()) {
    return process.env.CAPACITOR_SERVER_URL.trim();
  }

  const envPath = join(__dirname, ".env.capacitor");
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, "utf8").match(
      /^CAPACITOR_SERVER_URL=(.+)$/m
    );
    if (match?.[1]?.trim()) {
      return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  return "https://YOUR-PRODUCTION-URL.example.com";
}

const serverUrl = loadCapacitorServerUrl();

const config: CapacitorConfig = {
  appId: "com.magazzino.app2",
  appName: "Magazzino App2",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
