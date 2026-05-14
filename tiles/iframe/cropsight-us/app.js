// CropSight US sandbox-tile renderer.
//
// Sprint 19 fix-cycle: simplified to mount the map directly with hard-coded
// constants. Previously read `tile.json` at runtime to populate iframe
// chrome (title/tagline/attribution), but the iframe sandbox attribute
// drops same-origin, making the fetch fail with an opaque-origin CORS
// reject — which killed the whole main() promise and left the map blank.
// Chrome now lives only in the outer Next.js /sandbox/<slug>/ route,
// which reads from the tile registry server-side. The iframe is just a
// map canvas.
//
// Paint mode is taken from `document.body.dataset.paintMode`:
//   - fill-outline: translucent cream fill + crisp outline.
//   - sparse-markers: outline-only at 1.5px, low opacity.

const PMTILES_URL = "./tiles/fields.pmtiles";
const SOURCE_LAYER = "fields";

// CONUS-wide framing — CropSight covers the lower 48.
const CROPSIGHT_CENTER = [-96, 39];
const CROPSIGHT_ZOOM = 4;

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

function main() {
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
    center: CROPSIGHT_CENTER,
    zoom: CROPSIGHT_ZOOM,
  });
}

try {
  main();
} catch (err) {
  console.error("[cropsight-us] failed to mount:", err);
}
