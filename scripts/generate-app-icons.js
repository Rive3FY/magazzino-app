const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const src =
  "C:/Users/Gianluca/.cursor/projects/c-Users-Gianluca-Desktop-magazzino-app2/assets/app-icon-warehouse.png";
const res = path.join("android", "app", "src", "main", "res");

const sizes = {
  mdpi: { launcher: 48, foreground: 108 },
  hdpi: { launcher: 72, foreground: 162 },
  xhdpi: { launcher: 96, foreground: 216 },
  xxhdpi: { launcher: 144, foreground: 324 },
  xxxhdpi: { launcher: 192, foreground: 432 },
};

async function roundMask(size, inputPath) {
  const svg = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
  );
  return sharp(inputPath)
    .resize(size, size, { fit: "cover" })
    .composite([{ input: svg, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync("resources", { recursive: true });
  fs.mkdirSync("public", { recursive: true });

  await sharp(src).resize(1024, 1024).png().toFile(path.join("resources", "icon.png"));
  await sharp(src).resize(512, 512).png().toFile(path.join("public", "app-icon.png"));

  // Adaptive foreground: keep artwork in center safe zone
  const fgMaster = await sharp(src)
    .resize(720, 720, {
      fit: "contain",
      background: { r: 245, g: 247, b: 244, alpha: 1 },
    })
    .extend({
      top: 152,
      bottom: 152,
      left: 152,
      right: 152,
      background: { r: 245, g: 247, b: 244, alpha: 1 },
    })
    .resize(1024, 1024)
    .png()
    .toBuffer();

  for (const [density, s] of Object.entries(sizes)) {
    const dir = path.join(res, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });

    await sharp(src)
      .resize(s.launcher, s.launcher)
      .png()
      .toFile(path.join(dir, "ic_launcher.png"));

    const roundBuf = await roundMask(s.launcher, src);
    await sharp(roundBuf).toFile(path.join(dir, "ic_launcher_round.png"));

    await sharp(fgMaster)
      .resize(s.foreground, s.foreground)
      .png()
      .toFile(path.join(dir, "ic_launcher_foreground.png"));

    console.log("wrote", density);
  }

  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
