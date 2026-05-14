// ACPF Corn Belt sandbox-tile renderer.
//
// Custom variant of the boundary-tile scaffold that adds a state-filter
// pill row above the map. The combined fields.pmtiles archive carries
// one feature per field across IA/MN/WI/IL stamped with `state` =
// `'IA'`/`'MN'`/`'WI'`/`'IL'` (see scripts/sandbox_tiles/acpf-cornbelt/
// ingest.mjs). Clicking a pill pushes a `setFilter` against the layer
// so the user sees only that state's fields. "All" clears the filter.
//
// Reads `tile.json` at runtime to fill the chrome (title, tagline,
// caveat panel, attribution strip). Paint mode is `fill-outline` per
// the scaffold default — translucent cream fill, crisp ink outline.

const PMTILES_URL = "./tiles/fields.pmtiles";
const SOURCE_LAYER = "fields";
const TILE_JSON_URL = "./tile.json";

// Corn Belt bounding box — covers IA + MN + WI + IL with a small pad.
// Camera centers here on load; user can pan freely.
const CORN_BELT_CENTER = [-91.5, 43.0];
const CORN_BELT_ZOOM = 5.2;

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
  const authorName = meta.author?.name ?? "";
  const licenseBits = [authorName, meta.license, meta.licenseNote].filter(Boolean);
  document.getElementById("attribution-strip").textContent = licenseBits.join(" · ");
}

/** Wire the state-filter pill row. Clicking a pill toggles which state
 *  is shown — empty `data-state` means "all states", clears the filter. */
function wireStateFilter(map) {
  const pills = document.querySelectorAll(".state-pill");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      const state = pill.dataset.state || "";
      const filter = state ? ["==", ["get", "state"], state] : null;
      // setFilter only takes effect once the layer exists. The map
      // calls this after style.load, so the layers are guaranteed
      // present here.
      for (const id of ["fields-fill", "fields-line"]) {
        map.setFilter(id, filter);
      }
    });
  });
}

async function main() {
  const meta = await loadTileMeta();
  fillChrome(meta);

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
    center: CORN_BELT_CENTER,
    zoom: CORN_BELT_ZOOM,
  });
  map.addControl(new maplibregl.NavigationControl(), "top-right");

  map.on("load", () => wireStateFilter(map));
}

main().catch((err) => {
  console.error("[acpf-cornbelt] failed to mount:", err);
  const caveat = document.getElementById("caveat");
  if (caveat) caveat.textContent = `Tile failed to mount: ${err.message}`;
});
