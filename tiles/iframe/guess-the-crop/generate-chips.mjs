#!/usr/bin/env node
// Generate synthetic 64x64 PNG chips for Guess the Crop.
//
// Sprint 16 ships placeholders — coarse colored-noise tinted by per-crop
// reference RGBs (loosely matched to mid-summer Sentinel-2 RGB for corn,
// soy, wheat, sorghum). Real Sentinel-2 chips replace these in Sprint 17.
// The chip CAPTION (rendered in index.html, not baked into the PNG)
// always reads "Placeholder chip — real Sentinel-2 in Sprint 17" per
// Gate A acceptance.
//
// Output: chip-001-corn.png through chip-008-sorghum.png + chips.json.
// Run from this folder: `node generate-chips.mjs`.

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, "chips");

// Per-crop reference RGBs — coarse summer-Sentinel-2 RGB starting points.
// Real chips will vary; these are intentionally distinct so each one
// reads as a different crop at a glance.
const CROPS = {
  corn: { rgb: [110, 138, 70], jitter: 30 }, // mid-summer canopy green w/ yellow tilt
  soy: { rgb: [88, 120, 64], jitter: 28 }, // slightly bluer / cooler green
  wheat: { rgb: [184, 154, 111], jitter: 35 }, // post-harvest tan / straw
  sorghum: { rgb: [160, 130, 80], jitter: 32 }, // dryland tan-green blend
};

// 8 chips: 2 of each. Order randomized at runtime by game.js — file
// numbering is stable so chips.json maps file → truth deterministically.
const PLAN = [
  { id: 1, truth: "corn" },
  { id: 2, truth: "soy" },
  { id: 3, truth: "wheat" },
  { id: 4, truth: "sorghum" },
  { id: 5, truth: "corn" },
  { id: 6, truth: "soy" },
  { id: 7, truth: "wheat" },
  { id: 8, truth: "sorghum" },
];

const SIZE = 64;

/** Deterministic PRNG so chips don't drift between rebuilds. Seeded per
 *  chip id so each chip is reproducibly noisy. */
function mulberry32(seed) {
  let t = seed | 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build an RGBA buffer with per-pixel jitter around the crop's base RGB. */
function buildPixels(cropKey, seed) {
  const { rgb, jitter } = CROPS[cropKey];
  const rnd = mulberry32(seed);
  const px = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    // Slight low-frequency tilt: vary across rows so chips look like
    // actual fields rather than uniform noise.
    const row = Math.floor(i / SIZE) / SIZE;
    const tilt = (row - 0.5) * 10;
    const dr = (rnd() - 0.5) * jitter + tilt;
    const dg = (rnd() - 0.5) * jitter + tilt * 0.6;
    const db = (rnd() - 0.5) * jitter;
    px[i * 4] = clamp255(rgb[0] + dr);
    px[i * 4 + 1] = clamp255(rgb[1] + dg);
    px[i * 4 + 2] = clamp255(rgb[2] + db);
    px[i * 4 + 3] = 255;
  }
  return px;
}

function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

// ─── Minimal PNG encoder. Just IHDR + IDAT + IEND. Color type 6 = RGBA. ─────
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  // Filter byte 0 per scanline, then rgba data.
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    scanlines[y * (1 + width * 4)] = 0;
    rgba.copy(
      scanlines,
      y * (1 + width * 4) + 1,
      y * width * 4,
      (y + 1) * width * 4,
    );
  }
  const idat = zlib.deflateSync(scanlines);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  if (!existsSync(OUT_DIR)) {
    await mkdir(OUT_DIR, { recursive: true });
  }
  const index = [];
  for (const c of PLAN) {
    const file = `chip-${String(c.id).padStart(3, "0")}-${c.truth}.png`;
    const pixels = buildPixels(c.truth, c.id * 31 + 7);
    const png = encodePNG(SIZE, SIZE, pixels);
    await writeFile(path.join(OUT_DIR, file), png);
    index.push({ id: c.id, file, truth: c.truth });
    console.log(`wrote ${file} (${png.length} bytes)`);
  }
  await writeFile(
    path.join(__dirname, "chips.json"),
    JSON.stringify(index, null, 2) + "\n",
  );
  console.log(`wrote chips.json (${index.length} entries)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
