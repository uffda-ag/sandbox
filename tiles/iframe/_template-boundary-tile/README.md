# Boundary-tile scaffold

Template for Sandbox iframe tiles that paint a single field-boundary PMTiles archive over a Carto Positron basemap. Sprint 19 ships ACPF (Corn Belt), CA-SCM (California), and CropSight-US (sparse CONUS) on top of this scaffold.

## Files

- **index.html** — chrome (title, tagline, caveat panel, attribution strip) + MapLibre canvas. Loads `maplibre-gl@4.7.1` and `pmtiles@4.4.1` from unpkg.
- **app.js** — MapLibre wiring. Reads `./tile.json` at runtime, fills the chrome, mounts the map against `./tiles/fields.pmtiles`.
- **style.css** — cream-white palette matching the FTW restyle (ink `#2e3a25` on cream `#f7f1e1`).
- **tile.json** — schema-conforming manifest with `{{TEMPLATE}}` placeholders. Per-source ingest scripts replace these via `scripts/sandbox_tiles/_lib/tile_json_template.mjs`.

## Paint modes

`<body data-paint-mode="...">` selects the paint rule in `app.js`:

- **`fill-outline`** (default) — translucent cream fill (`#f5e8d0` @ 0.35) plus crisp `#3d4a36` outline. Use for dense coverage (ACPF, CA-SCM).
- **`sparse-markers`** — outline-only at 1.5px, 0.55 opacity. Use for sparse reference layers (CropSight-US: 124k polygons across CONUS).

## PMTiles contract

`app.js` expects exactly one PMTiles archive at `./tiles/fields.pmtiles`, source-layer name `fields`. The per-source ingest script writes the archive into the tile folder before commit; the host's `sync-sandbox-tiles.mjs` mirrors the tree into `web/public/tiles/iframe/<slug>/` at build.

## 80MB budget

Each PMTiles archive must stay ≤ 80MB. The shared helper `web/scripts/sandbox_tiles/_lib/ingest_common.mjs` exposes `enforceTileBudget(pmtilesPath, maxMB)` — call it at the end of every ingest script. `encodePMTiles` will auto-retry once with `--simplification=10` if the first pass overruns.

## Ingestion contract

Per-source ingest scripts live at `web/scripts/sandbox_tiles/<slug>/ingest.mjs`. They:

1. `fetchToTemp(url)` the upstream source.
2. `reprojectToWgs84(in, out)` if needed.
3. `encodePMTiles(in, out, "fields", { maxBytes })` to build the archive.
4. `enforceTileBudget(out)` to hard-fail on overrun.
5. Write the final `fields.pmtiles` into this tile folder's `tiles/` subdir.
6. Emit the populated `tile.json` via `buildTileJson(...)`.

Requires `ogr2ogr` (GDAL) and `tippecanoe` on PATH.
