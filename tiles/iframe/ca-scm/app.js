// California Statewide Crop Mapping (CA-SCM) sandbox-tile renderer.
//
// Single-state tile, no filter UI. Renders the fiboa-via-source.coop
// PMTiles archive at `./tiles/fields.pmtiles`. The upstream PMTiles was
// produced by the fiboa publisher with source-layer `us_ca_scm` (NOT
// the scaffold's default `fields`).
//
// Sprint 19 fix-cycle: stopped fetching tile.json at runtime — the
// iframe sandbox attribute drops same-origin, so the fetch failed with
// an opaque-origin CORS reject and blanked the map. Chrome now lives in
// the outer Next.js /sandbox/<slug>/ route. The iframe is just a canvas.

const PMTILES_URL = "./tiles/fields.pmtiles";
// Source-layer name from the upstream fiboa PMTiles (verified via the
// gzipped metadata blob in the .pmtiles header). Different from the
// scaffold default — fiboa publishers don't rename source-layers, and
// re-encoding just to rename would defeat the point of reusing the
// upstream PMTiles.
const SOURCE_LAYER = "us_ca_scm";

// California-centric camera. Sets us up looking at the Central Valley
// where the densest crop polygons live.
const CA_CENTER = [-119.5, 36.8];
const CA_ZOOM = 5.6;

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
  layers: [{ id: "basemap", type: "raster", source: "carto-positron" }],
};

function paintLayers() {
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
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  const style = {
    ...STYLE_BASE,
    sources: {
      ...STYLE_BASE.sources,
      fields: { type: "vector", url: `pmtiles://${PMTILES_URL}` },
    },
    layers: [...STYLE_BASE.layers, ...paintLayers()],
  };

  const map = new maplibregl.Map({
    container: "map",
    style,
    center: CA_CENTER,
    zoom: CA_ZOOM,
  });
  map.addControl(new maplibregl.NavigationControl(), "top-right");
}

try {
  main();
} catch (err) {
  console.error("[ca-scm] failed to mount:", err);
}
