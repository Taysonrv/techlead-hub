import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const repositoryDir = path.resolve(desktopDir, "..");
const assetsDir = path.join(desktopDir, "assets");
const frontendIconDir = path.join(repositoryDir, "frontend", "public", "icons");
const supersampling = 3;

function parseColor(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function mixColor(start, end, amount) {
  return start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount));
}

function roundedRectDistance(x, y, left, top, right, bottom, radius) {
  const qx = Math.abs(x - (left + right) / 2) - ((right - left) / 2 - radius);
  const qy = Math.abs(y - (top + bottom) / 2) - ((bottom - top) / 2 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function segmentDistance(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function renderIcon(size) {
  const coordinateScale = (size / 128) * supersampling;
  const highSize = size * supersampling;
  const pixels = Buffer.alloc(highSize * highSize * 4);
  const setPixel = (x, y, color, alpha = 1) => {
    if (x < 0 || y < 0 || x >= highSize || y >= highSize || alpha <= 0) return;
    const index = (y * highSize + x) * 4;
    const previousAlpha = pixels[index + 3] / 255;
    const combinedAlpha = alpha + previousAlpha * (1 - alpha);
    for (let channel = 0; channel < 3; channel += 1) {
      pixels[index + channel] = Math.round((color[channel] * alpha + pixels[index + channel] * previousAlpha * (1 - alpha)) / combinedAlpha);
    }
    pixels[index + 3] = Math.round(combinedAlpha * 255);
  };

  const drawShape = (bounds, distanceAt, colorAt, stroke = null) => {
    const left = Math.max(0, Math.floor(bounds.left * coordinateScale));
    const top = Math.max(0, Math.floor(bounds.top * coordinateScale));
    const right = Math.min(highSize, Math.ceil(bounds.right * coordinateScale));
    const bottom = Math.min(highSize, Math.ceil(bounds.bottom * coordinateScale));
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        const x = (px + 0.5) / coordinateScale;
        const y = (py + 0.5) / coordinateScale;
        const distance = distanceAt(x, y);
        const coverage = stroke
          ? Math.max(0, Math.min(1, (stroke.width / 2 + 0.5 / coordinateScale - Math.abs(distance)) * coordinateScale))
          : Math.max(0, Math.min(1, (0.5 / coordinateScale - distance) * coordinateScale));
        if (coverage > 0) setPixel(px, py, colorAt(x, y), coverage);
      }
    }
  };

  drawShape(
    { left: 4, top: 4, right: 124, bottom: 124 },
    (x, y) => roundedRectDistance(x, y, 4, 4, 124, 124, 32),
    (x, y) => mixColor(parseColor("#102a35"), parseColor("#091923"), Math.max(0, Math.min(1, ((x + y) / 2 - 8) / 112))),
  );
  drawShape(
    { left: 4, top: 4, right: 124, bottom: 124 },
    (x, y) => roundedRectDistance(x, y, 4.75, 4.75, 123.25, 123.25, 31.25),
    () => parseColor("#55d9b2"),
    { width: 1.5 },
  );

  const markStart = parseColor("#d8f7ed");
  const markEnd = parseColor("#23c794");
  const markColor = (x, y) => mixColor(markStart, markEnd, Math.max(0, Math.min(1, ((x + y) / 2 - 30) / 70)));
  const drawMarkStroke = (x1, y1, x2, y2) => drawShape(
    { left: Math.min(x1, x2) - 8, top: Math.min(y1, y2) - 8, right: Math.max(x1, x2) + 8, bottom: Math.max(y1, y2) + 8 },
    (x, y) => segmentDistance(x, y, x1, y1, x2, y2) - 6.5,
    markColor,
  );
  drawMarkStroke(38, 38, 38, 90);
  drawMarkStroke(90, 38, 90, 90);
  drawMarkStroke(38, 64, 90, 64);

  const output = Buffer.alloc(size * size * 4);
  const samples = supersampling * supersampling;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const outputIndex = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        let total = 0;
        for (let sy = 0; sy < supersampling; sy += 1) {
          for (let sx = 0; sx < supersampling; sx += 1) {
            total += pixels[(((y * supersampling + sy) * highSize) + x * supersampling + sx) * 4 + channel];
          }
        }
        output[outputIndex + channel] = Math.round(total / samples);
      }
    }
  }
  return output;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const content = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([header, content, checksum]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(frontendIconDir, { recursive: true });
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((size) => ({ size, data: encodePng(size, renderIcon(size)) }));
fs.writeFileSync(path.join(assetsDir, "hub-icon.png"), pngs.at(-1).data);
fs.writeFileSync(path.join(frontendIconDir, "hub-icon.png"), pngs.at(-1).data);

const directorySize = 6 + pngs.length * 16;
let offset = directorySize;
const entries = pngs.map(({ size, data }) => {
  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size;
  entry[1] = size === 256 ? 0 : size;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(data.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += data.length;
  return entry;
});
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
fs.writeFileSync(path.join(assetsDir, "hub-icon.ico"), Buffer.concat([header, ...entries, ...pngs.map(({ data }) => data)]));
console.log("Ícones TechLead Hub gerados: PNG para Electron/PWA e ICO (" + sizes.join(", ") + "px).");
