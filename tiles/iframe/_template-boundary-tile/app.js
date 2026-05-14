// Sandbox boundary-tile renderer.
//
// Reads `tile.json` (fetched at runtime) to populate the chrome, then
// mounts a MapLibre map against `./tiles/fields.pmtiles`. Same-origin
// fetch — the host (web/scripts/sync-sandbox-tiles.mjs) mirrors this
// folder into web/public/tiles/iframe/<slug>/ at build time, so the
// PMTiles archive is served alongside index.html.
//
// Paint mode is taken from `document.body.dataset.paintMode`:
//   - fill-outline (default): translucent fill + crisp outline.
//   - sparse-markers: outline-only at 1.5px, low opacity. Use for
//                     reference layers with sparse polygon coverage so
//                     the basemap reads underneath.

const PMTILES_URL = "./tiles/fields.pmtiles";
const SOURCE_LAYER = "fields";
const TILE_JSON_URL = "./tile.json";

const STYLE_BASE = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    "carto-positron": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors · © CARTO",
    },
  },
  layers: [
    {
      id: "basemap",
      type: "raster",
      source: "carto-positron",
    },
  ],
};

function paintLayersForMode(mode) {
  if (mode === "sparse-markers") {
    return [
      {
        id: "fields-line",
        type: "line",
        source: "fields",
        "source-layer": SOURCE_LAYER,
        paint: {
          "line-color": "#3d4a36",
          "line-width": 1.5,
          "line-opacity": 0.55,
        },
      },
    ];
  }
  return [
    {
      id: "fields-fill",
      type: "fill",
      source: "fields",
      "source-layer": SOURCE_LAYER,
      paint: {
        "fill-color": "#f5e8d0",
        "fill-opacity": 0.35,
      },
    },
    {
      id: "fields-line",
      type: "line",
      source: "fields",
      "source-layer": SOURCE_LAYER,
      paint: {
        "line-color": "#3d4a36",
        "line-width": 1.0,
        "line-opacity": 0.8,
      },
    },
  ];
}

async function loadTileMeta() {
  const res = await fetch(TILE_JSON_URL);
  if (!res.ok) throw new Error(`tile.json fetch ${res.status}`);
  return res.json();
}

function fillChrome(meta) {
  document.title = `${meta.name} — UFFDA Sandbox`;
  document.getElementById("tile-title").textContent = meta.name;
  document.getElementById("tile-tagline").textContent = meta.tagline ?? "";
  document.getElementById("caveat").textContent = meta.description ?? "";
  if (meta.licenseNote) {
    document.getElementById("attribution-strip").textContent =
      `${meta.author?.name ?? ""} · ${meta.license} · ${meta.licenseNote}`.trim();
  } else {
    document.getElementById("attribution-strip").textContent =
      `${meta.author?.name ?? ""} · ${meta.license}`.trim();
  }
}

async function main() {
  const meta = await loadTileMeta();
  fillChrome(meta);

  const paintMode = document.body.dataset.paintMode ?? "fill-outline";

  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  const style = {
    ...STYLE_BASE,
    sources: {
      ...STYLE_BASE.sources,
      fields: {
        type: "vector",
        url: `pmtiles://${PMTILES_URL}`,
      },
    },
    layers: [...STYLE_BASE.layers, ...paintLayersForMode(paintMode)],
  };

  new maplibregl.Map({
    container: "map",
    style,
    center: [-93.5, 42.0],
    zoom: 6,
  });
}

main().catch((err) => {
  console.error("[boundary-tile] failed to mount:", err);
  const caveat = document.getElementById("caveat");
  if (caveat) {
    caveat.textContent = `Tile failed to mount: ${err.message}`;
  }
});
