// generate_qr.js
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const locations = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../frontend/qr_locations.json"), "utf8")
);

// Save all QR codes into frontend/qrcodes
const outputDir = path.join(__dirname, "../frontend/qrcodes");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

locations.forEach(async (loc) => {
  const data = encodeURIComponent(JSON.stringify({
  id: loc.id,
  lat: loc.latitude,
  lon: loc.longitude
}));
const url = `http://10.235.164.7:3000/?data=${data}`;
  const filePath = path.join(outputDir, `${loc.id}.png`);

  await QRCode.toFile(filePath, url, { width: 300 });
  console.log(`✅ Generated QR for ${loc.label}: ${filePath}`);
});