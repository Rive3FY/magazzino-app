import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necessario per il packaging Electron (non altera next start / next dev)
  output: "standalone",
  serverExternalPackages: ["firebase-admin"],
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  async headers() {
    return [
      {
        source: "/downloads/:path*.apk",
        headers: [
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          { key: "Content-Disposition", value: 'attachment; filename="MagazzinoApp2.apk"' },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
