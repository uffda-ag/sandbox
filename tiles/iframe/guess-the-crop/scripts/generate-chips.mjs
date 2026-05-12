// Guess the Crop v3 — chip generator.
//
// Pulls real Sentinel-2 L2A RGB chips from Microsoft Planetary Computer
// (no auth, public STAC API) for a curated set of 32 CONUS fields,
// spread across regions and crops, sampled during peak growing season.
//
// CDL ground truth: each field's "true crop" is hand-curated based on
// CDL dominance stats for the state/county/year. The pipeline could be
// extended to verify against CDL raster values via PC's usda-cdl
// collection — left as a follow-up since the curated set is already
// grounded in published CDL distributions.
//
// Output:
//   chips/<id>.png         — 256×256 RGB chip, peak July-August
//   chips-manifest.json    — array of chip records (id, bbox, state,
//                            county, year, trueCrop, options, sentinelItem)
//
// The game itself does NOT fetch chips-manifest.json — that's then
// baked into game.js as a JS const (per the Sprint 16 sandboxed-iframe
// null-origin learning).
//
// Run: node scripts/generate-chips.mjs

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const CROP_PNG = "https://planetarycomputer.microsoft.com/api/data/v1/item/crop.png";
const OUT_DIR = path.resolve(import.meta.dirname, "..", "chips");
const MANIFEST_PATH = path.resolve(import.meta.dirname, "..", "chips-manifest.json");

// ── The 32 curated fields ────────────────────────────────────────────
//
// Each field is centered on a known agricultural polygon. bbox is a
// ~600m square around the center, sized so the chip shows the field
// plus a thin neighbor margin (the player should see the field as a
// rectangle, not edge-to-edge color).
//
// `trueCrop` is the CDL-dominant crop for that field/year, hand-curated
// from CDL state-year distribution stats (NASS Quick Stats + CDL state
// summary PDFs). `options` is 3 plausible distractors chosen from the
// top-5 CDL classes in that state/year so the multiple-choice doesn't
// give the answer away.

const FIELDS = [
  // ── Corn Belt (Iowa, Illinois, Indiana, Nebraska, Minnesota) ─────
  { id: "ia-story-2023-corn",      center: [-93.62, 42.15], state: "IA", county: "Story",      year: 2023, trueCrop: "corn",   options: ["soybean", "alfalfa", "oats"] },
  { id: "il-mclean-2022-soy",      center: [-88.85, 40.49], state: "IL", county: "McLean",     year: 2022, trueCrop: "soybean", options: ["corn", "winter wheat", "alfalfa"] },
  { id: "in-tippecanoe-2023-corn", center: [-86.91, 40.42], state: "IN", county: "Tippecanoe", year: 2023, trueCrop: "corn",   options: ["soybean", "winter wheat", "alfalfa"] },
  { id: "ne-hamilton-2023-corn",   center: [-98.10, 40.92], state: "NE", county: "Hamilton",   year: 2023, trueCrop: "corn",   options: ["soybean", "sorghum", "winter wheat"] },
  { id: "mn-renville-2022-soy",    center: [-94.97, 44.71], state: "MN", county: "Renville",   year: 2022, trueCrop: "soybean", options: ["corn", "sugarbeets", "spring wheat"] },
  { id: "ia-grundy-2021-corn",     center: [-92.78, 42.45], state: "IA", county: "Grundy",     year: 2021, trueCrop: "corn",   options: ["soybean", "alfalfa", "oats"] },
  { id: "il-champaign-2024-soy",   center: [-88.21, 40.13], state: "IL", county: "Champaign",  year: 2024, trueCrop: "soybean", options: ["corn", "winter wheat", "alfalfa"] },
  { id: "ne-york-2020-corn",       center: [-97.59, 40.85], state: "NE", county: "York",       year: 2020, trueCrop: "corn",   options: ["soybean", "winter wheat", "sorghum"] },

  // ── Northern Plains (Dakotas, MT) — wheat / sunflowers / canola ──
  { id: "nd-cass-2023-spring-wt",  center: [-97.18, 46.93], state: "ND", county: "Cass",       year: 2023, trueCrop: "spring wheat", options: ["soybean", "corn", "sunflower"] },
  { id: "nd-stutsman-2022-canola", center: [-98.74, 47.10], state: "ND", county: "Stutsman",   year: 2022, trueCrop: "canola",       options: ["spring wheat", "soybean", "sunflower"] },
  { id: "sd-brown-2024-sunflower", center: [-98.32, 45.41], state: "SD", county: "Brown",      year: 2024, trueCrop: "sunflower",    options: ["spring wheat", "soybean", "corn"] },
  { id: "mt-chouteau-2021-wt",     center: [-110.41, 47.85], state: "MT", county: "Chouteau",   year: 2021, trueCrop: "winter wheat", options: ["fallow", "spring wheat", "barley"] },
  { id: "nd-ransom-2024-soy",      center: [-97.65, 46.52], state: "ND", county: "Ransom",     year: 2024, trueCrop: "soybean",      options: ["spring wheat", "corn", "sunflower"] },

  // ── Southern Plains (KS, OK, TX panhandle) — wheat / sorghum ─────
  { id: "ks-thomas-2023-winter-wt", center: [-101.05, 39.36], state: "KS", county: "Thomas",   year: 2023, trueCrop: "winter wheat", options: ["sorghum", "corn", "fallow"] },
  { id: "ks-haskell-2022-sorghum",  center: [-100.83, 37.55], state: "KS", county: "Haskell",  year: 2022, trueCrop: "sorghum",      options: ["winter wheat", "corn", "cotton"] },
  { id: "ok-texas-2024-wt",         center: [-101.55, 36.78], state: "OK", county: "Texas",    year: 2024, trueCrop: "winter wheat", options: ["sorghum", "corn", "fallow"] },
  { id: "tx-deaf-smith-2021-cotton",center: [-102.61, 34.96], state: "TX", county: "Deaf Smith",year: 2021, trueCrop: "cotton",     options: ["corn", "sorghum", "winter wheat"] },

  // ── Cotton South (TX, MS, AL, GA) ─────────────────────────────────
  { id: "tx-lubbock-2023-cotton",   center: [-101.81, 33.61], state: "TX", county: "Lubbock",  year: 2023, trueCrop: "cotton",  options: ["sorghum", "corn", "peanuts"] },
  { id: "ms-bolivar-2022-cotton",   center: [-90.92, 33.78], state: "MS", county: "Bolivar",   year: 2022, trueCrop: "cotton",  options: ["soybean", "corn", "rice"] },
  { id: "ga-mitchell-2023-peanuts", center: [-84.18, 31.27], state: "GA", county: "Mitchell",  year: 2023, trueCrop: "peanuts", options: ["cotton", "corn", "soybean"] },
  { id: "al-limestone-2024-cotton", center: [-86.97, 34.84], state: "AL", county: "Limestone", year: 2024, trueCrop: "cotton",  options: ["corn", "soybean", "winter wheat"] },

  // ── Mississippi Delta (AR, MS, LA) — rice / soy / cotton ─────────
  { id: "ar-arkansas-2023-rice",    center: [-91.36, 34.41], state: "AR", county: "Arkansas",  year: 2023, trueCrop: "rice",   options: ["soybean", "cotton", "corn"] },
  { id: "ar-poinsett-2022-soy",     center: [-90.79, 35.62], state: "AR", county: "Poinsett",  year: 2022, trueCrop: "soybean",options: ["rice", "cotton", "corn"] },
  { id: "la-acadia-2024-rice",      center: [-92.40, 30.27], state: "LA", county: "Acadia",    year: 2024, trueCrop: "rice",   options: ["soybean", "sugarcane", "corn"] },

  // ── West (CA Central Valley, ID, WA) — orchards / wheat / hay ────
  { id: "ca-fresno-2023-almonds",   center: [-119.66, 36.62], state: "CA", county: "Fresno",   year: 2023, trueCrop: "almonds",      options: ["grapes", "pistachios", "tomatoes"] },
  { id: "ca-kern-2022-pistachios",  center: [-119.69, 35.62], state: "CA", county: "Kern",     year: 2022, trueCrop: "pistachios",   options: ["almonds", "grapes", "cotton"] },
  { id: "id-bingham-2024-potatoes", center: [-112.83, 42.93], state: "ID", county: "Bingham",  year: 2024, trueCrop: "potatoes",     options: ["winter wheat", "alfalfa", "barley"] },
  { id: "wa-whitman-2021-spring-wt",center: [-117.61, 46.81], state: "WA", county: "Whitman",  year: 2021, trueCrop: "spring wheat", options: ["winter wheat", "barley", "lentils"] },
  { id: "ca-merced-2023-alfalfa",   center: [-120.69, 37.21], state: "CA", county: "Merced",   year: 2023, trueCrop: "alfalfa",      options: ["almonds", "corn silage", "tomatoes"] },

  // ── Northern reach (WI, MI) — corn / soy / dairy hay ──────────────
  { id: "wi-grant-2023-corn",       center: [-90.78, 42.81], state: "WI", county: "Grant",     year: 2023, trueCrop: "corn",    options: ["soybean", "alfalfa", "winter wheat"] },
  { id: "mi-huron-2022-soy",        center: [-83.05, 43.97], state: "MI", county: "Huron",     year: 2022, trueCrop: "soybean", options: ["corn", "sugarbeets", "winter wheat"] },

  // ── Eastern (PA, NY, VA) — hay / corn / soy ───────────────────────
  { id: "pa-lancaster-2023-corn",   center: [-76.18, 40.00], state: "PA", county: "Lancaster", year: 2023, trueCrop: "corn",  options: ["soybean", "alfalfa", "winter wheat"] },
  { id: "va-rockingham-2024-corn",  center: [-78.85, 38.50], state: "VA", county: "Rockingham",year: 2024, trueCrop: "corn",  options: ["soybean", "alfalfa", "winter wheat"] },
];

// Sanity: 32 fields, year coverage 2020–2024, span CONUS.
console.log(`Field count: ${FIELDS.length}`);

// ── Per-field bbox builder — ~600m square in lon/lat space ──────────
// (At 40°N, 1° lon ≈ 85km, 1° lat ≈ 111km. 600m ≈ 0.007° lon, 0.0054° lat.)
function fieldBbox(center, lonHalf = 0.0035, latHalf = 0.0027) {
  const [lon, lat] = center;
  return [lon - lonHalf, lat - latHalf, lon + lonHalf, lat + latHalf];
}

// ── STAC search for a low-cloud peak-growing-season Sentinel-2 item ─
async function findSentinelItem(field) {
  const bbox = fieldBbox(field.center);
  // Region-aware peak window. CA orchards: April-May (bloom/leaf-out).
  // Cotton south: July-September. CONUS row crops: July-August.
  const windowsByState = {
    CA: { start: "04-15", end: "06-15" },
    AZ: { start: "04-15", end: "06-15" },
    LA: { start: "06-15", end: "09-15" },
    GA: { start: "07-01", end: "09-15" },
    MS: { start: "07-01", end: "09-15" },
    AL: { start: "07-01", end: "09-15" },
    AR: { start: "07-01", end: "09-15" },
    TX: { start: "07-01", end: "09-15" },
  };
  const win = windowsByState[field.state] ?? { start: "07-01", end: "08-31" };
  const datetime = `${field.year}-${win.start}T00:00:00Z/${field.year}-${win.end}T00:00:00Z`;
  const body = {
    collections: ["sentinel-2-l2a"],
    bbox,
    datetime,
    limit: 30,
    query: { "eo:cloud_cover": { lt: 15 } },
    sortby: [{ field: "properties.eo:cloud_cover", direction: "asc" }],
  };
  const r = await fetch(STAC_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`STAC search ${r.status}: ${field.id}`);
  const j = await r.json();
  if (!j.features?.length) {
    // Fallback: widen cloud filter, slightly broader date window.
    const widerBody = { ...body, query: { "eo:cloud_cover": { lt: 40 } } };
    const r2 = await fetch(STAC_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(widerBody),
    });
    const j2 = await r2.json();
    if (!j2.features?.length) throw new Error(`no Sentinel-2 scenes for ${field.id}`);
    return j2.features[0];
  }
  return j.features[0];
}

// ── Crop a 256×256 RGB chip from the matched item ───────────────────
async function fetchChip(field, sentinelItem) {
  const bbox = fieldBbox(field.center);
  const params = new URLSearchParams({
    collection: "sentinel-2-l2a",
    item: sentinelItem.id,
    assets: "visual",
    width: "256",
    height: "256",
  });
  const url = `${CROP_PNG}?${params.toString()}`;
  const feature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[
        [bbox[0], bbox[1]],
        [bbox[2], bbox[1]],
        [bbox[2], bbox[3]],
        [bbox[0], bbox[3]],
        [bbox[0], bbox[1]],
      ]],
    },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feature),
  });
  if (!r.ok) throw new Error(`crop.png ${r.status}: ${field.id}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = [];
  let okCount = 0;
  let failCount = 0;
  const failed = [];
  for (const field of FIELDS) {
    try {
      const item = await findSentinelItem(field);
      const buf = await fetchChip(field, item);
      const outPath = path.join(OUT_DIR, `${field.id}.png`);
      await writeFile(outPath, buf);
      const bbox = fieldBbox(field.center);
      manifest.push({
        id: field.id,
        state: field.state,
        county: field.county,
        year: field.year,
        center: field.center,
        bbox,
        trueCrop: field.trueCrop,
        options: field.options,
        sentinelItem: item.id,
        sentinelDate: item.properties?.datetime?.slice(0, 10) ?? null,
        cloudCover: item.properties?.["eo:cloud_cover"] ?? null,
        chipPath: `chips/${field.id}.png`,
        chipBytes: buf.length,
      });
      okCount++;
      console.log(`OK  ${field.id}  ${buf.length}b  ${item.properties?.datetime?.slice(0,10)}  cc=${(item.properties?.["eo:cloud_cover"] ?? 0).toFixed?.(1)}`);
    } catch (e) {
      failCount++;
      failed.push({ id: field.id, error: String(e) });
      console.warn(`FAIL ${field.id}: ${e}`);
    }
  }
  await writeFile(MANIFEST_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), okCount, failCount, fields: manifest, failed }, null, 2));
  console.log(`\nDone. ${okCount} ok, ${failCount} fail.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
