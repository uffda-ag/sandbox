/**
 * Field Boundary Improver — sandbox tile app v2.
 *
 * v2 changes:
 *  - HUMILITY REFRAME: "win/check" → "likely-split/low-confidence" tiers.
 *    rot_quality displayed as soft band (strong/moderate/weak), never bare %.
 *  - BOUNDARY DRAW UI: hand-rolled on MapLibre GeoJSON sources — no external draw
 *    library. Click to place vertices, double-click to finish line. Works natively
 *    with MapLibre GL 3.6.2. Replaces prior @mapbox/mapbox-gl-draw (incompatible
 *    with MapLibre 3.x).
 *  - INGEST: verdict + drawn correction + field id POSTed to contact-form edge fn.
 *    contact-form is the right fit: public/anon, accepts structured message body.
 *    Client-side JSON export kept as belt-and-suspenders.
 *
 * Map: MapLibre GL JS 3.6.2.
 * Data: data.js (ES module) — McLean County IL v6.
 *
 * Feedback: sessionStorage (key: boundary_improver_feedback_v2) + POST to contact-form.
 *
 * User-facing strings: see STRINGS block below — Voice Guardian gate pending.
 *
 * STRINGS BLOCK (extract for Voice Guardian):
 *  STRINGS.sectionLikelySplit    = "Likely needs split — inspect"
 *  STRINGS.sectionLowConf        = "Low-confidence suggestion — inspect"
 *  STRINGS.sectionKept           = "Kept as-is"
 *  STRINGS.badgeLikelySplit      = "X likely splits"
 *  STRINGS.badgeLowConf          = "X low-confidence"
 *  STRINGS.badgeKept             = "X kept"
 *  STRINGS.catLikelySplit        = "LIKELY SPLIT"
 *  STRINGS.catLowConf            = "LOW CONFIDENCE"
 *  STRINGS.catKept               = "KEPT"
 *  STRINGS.signalStrong          = "strong"
 *  STRINGS.signalModerate        = "moderate"
 *  STRINGS.signalWeak            = "weak"
 *  STRINGS.rotSignalLabel        = "Rotation signal"
 *  STRINGS.rotSignalNote         = "{n}/8 years diverged between pieces."
 *  STRINGS.keptSignalNote        = "Rotation is uniform across this field — kept as single unit."
 *  STRINGS.drawBtnStart          = "Draw correction"
 *  STRINGS.drawBtnStop           = "Done drawing"
 *  STRINGS.drawHint              = "Click map to place points. Double-click to finish."
 *  STRINGS.drawCaptured          = "Correction captured — will include with your verdict."
 *  STRINGS.drawCleared           = "Drawing cleared."
 *  STRINGS.submitBtnLabel        = "Submit verdict"
 *  STRINGS.submitBtnSending      = "Sending..."
 *  STRINGS.submitOk              = "Submitted — thank you!"
 *  STRINGS.submitFail            = "Submission failed — verdict saved locally, use Export."
 *  STRINGS.submitNoVerdict       = "Pick a verdict first."
 *  STRINGS.submitNoField         = "Select a field first."
 *  STRINGS.exportBtnLabel        = "Export all feedback (JSON)"
 *  STRINGS.exportDone            = "Exported {n} verdicts"
 *  STRINGS.savedAt               = "Saved {time}"
 *  STRINGS.betaDisclaimer        = "These are SUGGESTIONS for human review, not verified boundaries. About ~2/3 of high-signal split suggestions are correct — the rotation signal tells us the split is likely, not certain."
 *  STRINGS.aboutText             = "Fields of The World (FTW) global field boundaries sometimes lump two fields with different crop rotations into one polygon. This tool splits them using 8 years of USDA CDL history. Split lines snap to the PLSS cardinal grid. The signal is rotation divergence — years where the two zones grew different crops."
 *  STRINGS.aboutFooter           = "McLean County IL pilot. Engine v6 — no smoothing, raw FTW outer boundary preserved. FTW: CC-BY-4.0 (Regrow/WRI). CDL: USDA NASS public domain."
 *
 * Known limitations:
 *  - McLean County IL only; generalisation to other counties in progress.
 *  - 3-zone under-catch: splitter finds 2 pieces where 3 are warranted.
 *  - contact-form has verify_jwt:true; the tile uses the public anon key as a bearer
 *    token (same key as NEXT_PUBLIC_SUPABASE_ANON_KEY — no elevated privileges).
 *  - contact-form CORS ALLOWED_ORIGIN = "https://uffda.ag". Fetch from localhost will
 *    be blocked by browser CORS preflight — expected. Works correctly in production.
 *  - contact-form does not have a dedicated boundary-feedback table; ground-truth
 *    rows land in contact_messages (source: "boundary-improver"). A proper
 *    boundary_feedback table would parse structured verdicts server-side — parked.
 *  - Draw engine is line-only (no polygon mode). A polygon draw mode would need a
 *    closing-click heuristic; line captures the correction intent adequately for v2.
 */

import { CASES } from "./data.js";

// ── Config ────────────────────────────────────────────────────────────────────

// contact-form edge function endpoint.
// verify_jwt: true — requires anon key bearer token (public key, already in client JS).
// Source tag identifies this as boundary-improver feedback in contact_messages.
const FEEDBACK_ENDPOINT = "https://ivjogpfjdtdppzncjumr.supabase.co/functions/v1/contact-form";
const FEEDBACK_SOURCE   = "boundary-improver";
// Supabase anon key — public by design (NEXT_PUBLIC_SUPABASE_ANON_KEY). Used only
// to satisfy verify_jwt:true on the contact-form function. No elevated privileges.
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2am9ncGZqZHRkcHB6bmNqdW1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTgzMzgsImV4cCI6MjA5MDU3NDMzOH0.33DJ2sS7ovtJOr_uzOJ74LsV_fFeLmub1zrIQJ--cZ4";

// ── Storage key ───────────────────────────────────────────────────────────────
const STORAGE_KEY = "boundary_improver_feedback_v2";

// ── Tier definitions (humility reframe) ──────────────────────────────────────
// OLD: "win" (green, % confidence) and "check" (yellow) → NEW: two humble tiers.
//
// "likely-split"  : was "win"   — high-rotation-signal split suggestion (green)
// "low-conf"      : was "check" — lower-signal split OR geometry-flagged (yellow/orange)
// "kept"          : unchanged   — uniform rotation, field kept as-is (neutral gray)
//
// NOTE: category in data.js is still "win"/"check"/"kept". Map here.
function uiTier(c) {
  if (c.category === "win")   return "likely-split";
  if (c.category === "check") return "low-conf";
  return "kept";
}

const TIER_META = {
  "likely-split": {
    color:       "#22c55e",
    badgeClass:  "badge-likely",
    sectionClass:"likely",
    label:       "LIKELY SPLIT",
    sectionLabel:"Likely needs split — inspect",
  },
  "low-conf": {
    color:       "#f59e0b",
    badgeClass:  "badge-lowconf",
    sectionClass:"lowconf",
    label:       "LOW CONFIDENCE",
    sectionLabel:"Low-confidence suggestion — inspect",
  },
  "kept": {
    color:       "#8b949e",
    badgeClass:  "badge-kept",
    sectionClass:"kept",
    label:       "KEPT",
    sectionLabel:"Kept as-is",
  },
};

// Rotation signal band (replaces bare %)
function rotBand(rq) {
  if (rq >= 0.75) return { label: "strong",   color: "#22c55e" };
  if (rq >= 0.45) return { label: "moderate", color: "#f59e0b" };
  return                  { label: "weak",     color: "#f85149" };
}

// ── State ─────────────────────────────────────────────────────────────────────
let activeIdx     = null;
let activeVerdict = null;
let mapView       = "refined";
let useSat        = false;
let map           = null;
let drawMode      = false;
let drawnGeometry = null;

// ── Hand-rolled draw engine state ─────────────────────────────────────────────
// Uses MapLibre GeoJSON sources directly — no external draw library.
// draw-preview source holds the in-progress line while drawing.
// draw-final source holds the committed correction line.
var _drawVertices  = [];   // [lng, lat] pairs for current in-progress line
var _drawListeners = {};   // named map event listeners (for clean removal)

// Feedback store — persisted to sessionStorage for export within the session.
let feedback = {};
try {
  feedback = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
} catch (_) {
  feedback = {};
}

// ── Badge counts ──────────────────────────────────────────────────────────────

function updateTopBadges() {
  const likely = CASES.filter(c => c.category === "win").length;
  const lowc   = CASES.filter(c => c.category === "check").length;
  const kept   = CASES.filter(c => c.category === "kept").length;
  document.getElementById("badge-likely").textContent  = likely + " likely splits";
  document.getElementById("badge-lowconf").textContent = lowc   + " low-confidence";
  document.getElementById("badge-kept").textContent    = kept   + " kept";
}

// ── Map styles ────────────────────────────────────────────────────────────────

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors"
    }
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
};

const SAT_STYLE = {
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution: "Tiles &copy; Esri"
    }
  },
  layers: [{ id: "sat", type: "raster", source: "sat" }]
};

// ── Map helpers ───────────────────────────────────────────────────────────────

function emptyFC() {
  return { type: "FeatureCollection", features: [] };
}

function feat(geom, props) {
  return { type: "Feature", geometry: geom, properties: props || {} };
}

function bboxOfGeom(g) {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  function walk(c) {
    if (typeof c[0] === "number") {
      if (c[0] < mnx) mnx = c[0];
      if (c[0] > mxx) mxx = c[0];
      if (c[1] < mny) mny = c[1];
      if (c[1] > mxy) mxy = c[1];
    } else {
      c.forEach(walk);
    }
  }
  walk(g.coordinates);
  return [mnx, mny, mxx, mxy];
}

function mergedBbox(geoms) {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  geoms.forEach(g => {
    if (!g || !g.coordinates) return;
    const [a, b, c, d] = bboxOfGeom(g);
    if (a < mnx) mnx = a;
    if (b < mny) mny = b;
    if (c > mxx) mxx = c;
    if (d > mxy) mxy = d;
  });
  return [mnx, mny, mxx, mxy];
}

// ── Map init ──────────────────────────────────────────────────────────────────

function addMapLayers() {
  // FTW original
  map.addSource("ftw", { type: "geojson", data: emptyFC() });
  map.addLayer({ id: "ftw-fill", type: "fill",   source: "ftw", paint: { "fill-color": "#f97316", "fill-opacity": 0.14 } });
  map.addLayer({ id: "ftw-line", type: "line",   source: "ftw", paint: { "line-color": "#f97316", "line-width": 3, "line-dasharray": [6, 3] } });

  // Split pieces p0 / p1 / p2
  [["p0", "#22c55e"], ["p1", "#60a5fa"], ["p2", "#a78bfa"]].forEach(function(pair) {
    var src = pair[0]; var col = pair[1];
    map.addSource(src, { type: "geojson", data: emptyFC() });
    map.addLayer({ id: src + "-fill", type: "fill", source: src, paint: { "fill-color": col, "fill-opacity": 0.18 } });
    map.addLayer({ id: src + "-line", type: "line", source: src, paint: { "line-color": col, "line-width": 2.5 } });
  });

  // Kept field — gray, never blue (blue is reserved for split piece 2)
  map.addSource("kept-src", { type: "geojson", data: emptyFC() });
  map.addLayer({ id: "kept-fill", type: "fill", source: "kept-src", paint: { "fill-color": "#8b949e", "fill-opacity": 0.12 } });
  map.addLayer({ id: "kept-line", type: "line", source: "kept-src", paint: { "line-color": "#8b949e", "line-width": 2 } });

  // Draw engine sources: preview (in-progress) + final (committed correction).
  // Both are yellow (#facc15) to match the legend entry.
  map.addSource("draw-preview", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "draw-preview-line",
    type: "line",
    source: "draw-preview",
    paint: {
      "line-color": "#facc15",
      "line-width": 2.5,
      "line-dasharray": [4, 2],
      "line-opacity": 0.85
    }
  });
  map.addLayer({
    id: "draw-preview-points",
    type: "circle",
    source: "draw-preview",
    filter: ["==", "$type", "Point"],
    paint: {
      "circle-radius": 4,
      "circle-color": "#facc15",
      "circle-stroke-width": 1,
      "circle-stroke-color": "#0d1117"
    }
  });

  map.addSource("draw-final", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "draw-final-line",
    type: "line",
    source: "draw-final",
    paint: {
      "line-color": "#facc15",
      "line-width": 2.5,
      "line-opacity": 0.9
    }
  });
  map.addLayer({
    id: "draw-final-points",
    type: "circle",
    source: "draw-final",
    filter: ["==", "$type", "Point"],
    paint: {
      "circle-radius": 4,
      "circle-color": "#facc15",
      "circle-stroke-width": 1,
      "circle-stroke-color": "#0d1117"
    }
  });

  // Re-apply active data if a field is already selected (after style swap)
  if (activeIdx !== null) applyMapData(CASES[activeIdx], mapView);

  // Restore committed correction after style swap
  if (drawnGeometry) {
    _renderFinal(drawnGeometry);
  }
}

function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: OSM_STYLE,
    center: [-88.86, 40.52],
    zoom: 10,
    attributionControl: { compact: true }
  });
  map.on("load", function() {
    addMapLayers();
  });
}

window.toggleSat = function toggleSat() {
  useSat = !useSat;
  document.getElementById("sat-toggle").textContent = useSat ? "Street map" : "Satellite";
  var ctr = map.getCenter();
  var z   = map.getZoom();

  // If in draw mode, cancel it cleanly before style swap
  if (drawMode) {
    _drawCancel();
  }

  map.setStyle(useSat ? SAT_STYLE : OSM_STYLE);
  map.once("styledata", function() {
    // addMapLayers re-adds draw sources and restores drawnGeometry
    addMapLayers();
    map.setCenter(ctr);
    map.setZoom(z);
  });
};

// ── Hand-rolled draw engine ───────────────────────────────────────────────────
//
// No external library. Uses MapLibre GeoJSON sources added in addMapLayers().
// Workflow:
//   1. toggleDraw()  → enter draw mode: cursor becomes crosshair, click adds vertices.
//   2. Each click appends a vertex; preview source updates with current line + points.
//   3. Double-click  → finish: commits the line to drawnGeometry + draw-final source,
//                       clears preview, exits draw mode.
//   4. toggleDraw() while active (Done button) → same finish behavior.
//   5. clearDraw()   → wipes everything.
//   Escape key also cancels mid-draw without committing.

function _drawPreviewFC() {
  // Build a FeatureCollection with the current in-progress line + vertex points
  // so the user sees both the line and each placed vertex.
  var features = [];
  if (_drawVertices.length >= 2) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: _drawVertices.slice() },
      properties: {}
    });
  }
  _drawVertices.forEach(function(pt) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: pt },
      properties: {}
    });
  });
  return { type: "FeatureCollection", features: features };
}

function _renderPreview() {
  if (!map.getSource("draw-preview")) return;
  map.getSource("draw-preview").setData(_drawPreviewFC());
}

function _renderFinal(fc) {
  if (!map.getSource("draw-final")) return;
  map.getSource("draw-final").setData(fc || emptyFC());
}

function _drawFinish() {
  // Commit whatever vertices we have (need at least 2 for a line)
  _drawListenersOff();
  map.getCanvas().style.cursor = "";
  map.doubleClickZoom.enable();
  drawMode = false;

  var btn  = document.getElementById("draw-btn");
  var hint = document.getElementById("draw-hint");
  if (btn)  { btn.textContent = "Draw correction"; btn.classList.remove("draw-active"); }
  if (hint) hint.style.display = "none";

  if (_drawVertices.length >= 2) {
    var coords = _drawVertices.slice();
    var fc = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {}
      }]
    };
    drawnGeometry = fc;
    // Clear preview, show final
    if (map.getSource("draw-preview")) map.getSource("draw-preview").setData(emptyFC());
    _renderFinal(fc);
    var status = document.getElementById("draw-status");
    if (status) {
      status.textContent = "Correction captured — will include with your verdict.";
      status.style.color = "#22c55e";
    }
  } else {
    // Not enough points — cancel silently
    if (map.getSource("draw-preview")) map.getSource("draw-preview").setData(emptyFC());
    var status2 = document.getElementById("draw-status");
    if (status2) {
      status2.textContent = "";
      status2.style.color = "#8b949e";
    }
  }
  _drawVertices = [];
}

function _drawCancel() {
  // Cancel without committing (Escape key or style swap)
  _drawListenersOff();
  map.getCanvas().style.cursor = "";
  map.doubleClickZoom.enable();
  drawMode = false;
  _drawVertices = [];
  if (map.getSource("draw-preview")) map.getSource("draw-preview").setData(emptyFC());
  var btn  = document.getElementById("draw-btn");
  var hint = document.getElementById("draw-hint");
  if (btn)  { btn.textContent = "Draw correction"; btn.classList.remove("draw-active"); }
  if (hint) hint.style.display = "none";
}

function _drawListenersOn() {
  var lastClickTime = 0;

  _drawListeners.click = function(e) {
    var now = Date.now();
    // Double-click guard: two clicks within 400ms = finish, not vertex
    if (now - lastClickTime < 400) {
      lastClickTime = 0;
      _drawFinish();
      return;
    }
    lastClickTime = now;
    _drawVertices.push([e.lngLat.lng, e.lngLat.lat]);
    _renderPreview();
  };

  _drawListeners.dblclick = function() {
    // MapLibre fires dblclick after the two individual click events.
    // The second click is already caught by the 400ms guard above,
    // so by the time this fires drawMode may already be false.
    // Fire _drawFinish as a safety net only if still active.
    if (drawMode) {
      _drawFinish();
    }
  };

  _drawListeners.keydown = function(e) {
    if (e.key === "Escape") _drawCancel();
  };

  map.on("click",    _drawListeners.click);
  map.on("dblclick", _drawListeners.dblclick);
  document.addEventListener("keydown", _drawListeners.keydown);
}

function _drawListenersOff() {
  if (_drawListeners.click)   map.off("click",    _drawListeners.click);
  if (_drawListeners.dblclick) map.off("dblclick", _drawListeners.dblclick);
  if (_drawListeners.keydown) document.removeEventListener("keydown", _drawListeners.keydown);
  _drawListeners = {};
}

window.toggleDraw = function toggleDraw() {
  if (drawMode) {
    // "Done drawing" — finish and commit whatever is in progress
    map.doubleClickZoom.enable();
    _drawFinish();
  } else {
    // Enter draw mode
    drawMode = true;
    _drawVertices = [];
    map.getCanvas().style.cursor = "crosshair";
    // Disable map's own dblclick-zoom so double-clicking to finish
    // doesn't also zoom the map
    map.doubleClickZoom.disable();
    _drawListenersOn();
    var btn = document.getElementById("draw-btn");
    if (btn) { btn.textContent = "Done drawing"; btn.classList.add("draw-active"); }
    var hint = document.getElementById("draw-hint");
    if (hint) hint.style.display = "block";
    var status = document.getElementById("draw-status");
    if (status) { status.textContent = ""; status.style.color = "#8b949e"; }
  }
};

window.clearDraw = function clearDraw() {
  if (drawMode) _drawCancel();
  drawnGeometry = null;
  _drawVertices = [];
  if (map.getSource("draw-preview")) map.getSource("draw-preview").setData(emptyFC());
  if (map.getSource("draw-final"))   map.getSource("draw-final").setData(emptyFC());
  drawMode = false;
  var btn = document.getElementById("draw-btn");
  if (btn) { btn.textContent = "Draw correction"; btn.classList.remove("draw-active"); }
  var hint = document.getElementById("draw-hint");
  if (hint) hint.style.display = "none";
  var status = document.getElementById("draw-status");
  if (status) { status.textContent = "Drawing cleared."; status.style.color = "#8b949e"; }
};

// ── Map data ──────────────────────────────────────────────────────────────────

function applyMapData(c, mode) {
  if (!map.getSource("ftw")) return;

  if (c.category === "kept") {
    map.getSource("ftw").setData(emptyFC());
    ["p0", "p1", "p2"].forEach(function(s) { map.getSource(s).setData(emptyFC()); });
    map.getSource("kept-src").setData({ type: "FeatureCollection", features: [feat(c.ftw_polygon, { id: c.id })] });
    return;
  }

  if (mode === "ftw") {
    ["p0", "p1", "p2", "kept-src"].forEach(function(s) { map.getSource(s).setData(emptyFC()); });
    map.getSource("ftw").setData({ type: "FeatureCollection", features: [feat(c.ftw_polygon, { id: c.id })] });
    if (map.getLayer("ftw-line")) {
      map.setPaintProperty("ftw-line", "line-width", 4);
      map.setPaintProperty("ftw-fill", "fill-opacity", 0.2);
    }
  } else {
    var polys = c.refined_polygons || [];
    ["p0", "p1", "p2"].forEach(function(s, si) {
      map.getSource(s).setData({
        type: "FeatureCollection",
        features: polys[si] ? [feat(polys[si], { id: c.id + "_p" + si })] : []
      });
    });
    map.getSource("kept-src").setData(emptyFC());
    map.getSource("ftw").setData({ type: "FeatureCollection", features: [feat(c.ftw_polygon, { id: c.id + "_ftw" })] });
    if (map.getLayer("ftw-line")) {
      map.setPaintProperty("ftw-line", "line-width", 2.5);
      map.setPaintProperty("ftw-fill", "fill-opacity", 0.06);
    }
  }
}

window.setView = function setView(mode) {
  mapView = mode;
  document.getElementById("btn-refined").className = "vt-btn" + (mode === "refined" ? " active-refined" : "");
  document.getElementById("btn-ftw").className     = "vt-btn" + (mode === "ftw"     ? " active-ftw"     : "");
  if (activeIdx !== null) applyMapData(CASES[activeIdx], mode);
};

// ── Sidebar list ──────────────────────────────────────────────────────────────

function buildList(containerId, indices) {
  var el = document.getElementById(containerId);
  indices.forEach(function(idx) {
    var c    = CASES[idx];
    var tier = uiTier(c);
    var meta = TIER_META[tier];
    var d    = document.createElement("div");
    d.className = "field-item";
    d.id = "fi-" + idx;

    var metaStr = "";
    if (c.n_parts > 1) {
      metaStr = c.part_acs.map(function(a) { return a.toFixed(0) + "ac"; }).join(" + ");
      var rq   = c.rot_quality !== undefined ? c.rot_quality : c.confidence;
      var band = rotBand(rq);
      if (c.n_diverging_years) metaStr += " &bull; " + c.n_diverging_years + "/8 div";
      metaStr += " &bull; <span style='color:" + band.color + "'>signal: " + band.label + "</span>";
      if (c.plss_aligned) metaStr += " &bull; <span style='color:#34d399'>PLSS</span>";
    } else {
      metaStr = c.source_ac.toFixed(0) + "ac (kept)";
    }

    d.innerHTML =
      "<div class='fi-id'>" + c.id + " <span id='vb-" + idx + "' style='font-size:9px;'></span></div>" +
      "<div class='fi-sum'><span style='color:" + meta.color + ";font-weight:600;'>" + meta.label + "</span> " + c.source_ac.toFixed(0) + "ac</div>" +
      "<div class='fi-meta'>" + metaStr + "</div>";

    d.addEventListener("click", function() {
      document.querySelectorAll(".field-item").forEach(function(x) { x.classList.remove("active"); });
      d.classList.add("active");
      showCase(idx);
    });

    el.appendChild(d);
    updateVerdictBadge(idx);
  });
}

function updateVerdictBadge(idx) {
  var el = document.getElementById("vb-" + idx);
  if (!el) return;
  var v = feedback[CASES[idx].id];
  if (!v || !v.verdict) { el.textContent = ""; return; }
  var labels = { right: "v", wrong: "x", unsure: "?" };
  el.textContent = labels[v.verdict] || v.verdict;
  el.style.color = v.verdict === "right" ? "#3fb950" : v.verdict === "wrong" ? "#f85149" : "#e3b341";
}

// ── Show a case ───────────────────────────────────────────────────────────────

function showCase(idx) {
  activeIdx = idx;
  var c   = CASES[idx];

  // Clear drawn geometry when switching fields (draw is field-specific)
  clearDraw();

  // Toggle view switch visibility
  document.getElementById("view-toggle").style.display = c.category !== "kept" ? "flex" : "none";

  applyMapData(c, mapView);

  var allGeoms = [c.ftw_polygon].concat(c.refined_polygons || []).filter(Boolean);
  var bbox = mergedBbox(allGeoms);
  var mnx = bbox[0]; var mny = bbox[1]; var mxx = bbox[2]; var mxy = bbox[3];
  var pad = Math.max(mxx - mnx, mxy - mny) * 0.4;
  map.fitBounds([[mnx - pad, mny - pad], [mxx + pad, mxy + pad]], { padding: 40, duration: 500 });

  // Restore feedback state
  var prev = feedback[c.id];
  activeVerdict = prev ? prev.verdict : null;
  document.getElementById("note-fld").value = prev ? (prev.note || "") : "";
  ["right", "wrong", "unsure"].forEach(function(x) {
    document.getElementById("v-" + x).className = "vbtn" + (activeVerdict === x ? " v" + x[0] : "");
  });
  setStatus("", "#8b949e");

  // Show/hide draw section for split cases only
  var drawSec = document.getElementById("draw-sec");
  if (drawSec) drawSec.style.display = c.category !== "kept" ? "block" : "none";

  renderSignal(c);
  renderQuality(c);
  renderCDL(c);
  renderGeom(c);
}

// ── Detail panel renderers ────────────────────────────────────────────────────

function renderSignal(c) {
  var el = document.getElementById("signal-content");
  if (c.category === "kept") {
    el.innerHTML = "<div style='font-size:11px;color:#8b949e;'>No split — CDL rotation is uniform across this field. FTW kept as-is.</div>";
    return;
  }
  var divs = c.diverging_years || [];
  if (!divs.length) {
    el.innerHTML = "<span style='font-size:11px;color:#6e7681;'>No divergence data available.</span>";
    return;
  }

  var tier = uiTier(c);
  var disclaimer = tier === "likely-split"
    ? "<div class='signal-disclaimer likely-disc'>Rotation signal is strong — this is a <strong>suggested split for your review</strong>, not a verified boundary.</div>"
    : "<div class='signal-disclaimer lowconf-disc'>Rotation signal is weaker or geometry is flagged — treat this as a <strong>low-confidence suggestion</strong>.</div>";

  var h = disclaimer + "<div class='signal-box'><strong style='color:#22c55e;'>Split signal:</strong> ";
  var seqs = c.piece_seqs || [];
  if (seqs.length >= 2) {
    h += "The <span style='color:#22c55e;'>green piece</span> grew <strong>" + seqs[0] + "</strong> ";
    h += "while the <span style='color:#60a5fa;'>blue piece</span> grew <strong>" + seqs[1] + "</strong>. ";
    h += divs.length + " of 8 years diverged — that rotation difference placed the boundary.";
  } else {
    h += divs.length + " of 8 years showed different crops across the two zones.";
  }
  h += "</div>";

  h += "<div style='font-size:10px;color:#8b949e;margin-bottom:4px;'>Year-by-year divergence:</div>";
  divs.forEach(function(d) {
    var colon = d.indexOf(":");
    var yr   = colon >= 0 ? d.slice(0, colon).trim() : "?";
    var rest = colon >= 0 ? d.slice(colon + 1).trim() : d;
    var parts   = rest.split(" vs ");
    var isRecent = ["2021", "2022", "2023"].indexOf(String(yr)) >= 0;
    h += "<div class='div-row'><span class='div-yr' style='" + (isRecent ? "color:#f59e0b;font-weight:700;" : "") + "'>" + yr + (isRecent ? "*" : "") + "</span>";
    if (parts.length === 2) {
      h += "<span><span style='color:#22c55e;'>" + parts[0].trim() + "</span> <span style='color:#6e7681;'>vs</span> <span style='color:#60a5fa;'>" + parts[1].trim() + "</span></span>";
    } else {
      h += "<span>" + rest + "</span>";
    }
    h += "</div>";
  });
  h += "<div style='font-size:9px;color:#6e7681;margin-top:3px;'>* = double-weight recent year (2021-2023)</div>";
  el.innerHTML = h;
}

function renderQuality(c) {
  var el   = document.getElementById("quality-content");
  var rq   = c.rot_quality !== undefined ? c.rot_quality : c.confidence;
  var ndiv = c.n_diverging_years || 0;

  if (c.category === "kept") {
    el.innerHTML = "<div class='qbar-row'><span class='qbar-lbl'>Rotation signal</span><div class='qbar-bg'><div class='qbar-fill' style='width:100%;background:#8b949e;'></div></div><span class='qbar-val' style='color:#8b949e;'>uniform</span></div><div style='font-size:10px;color:#6e7681;'>No divergence — kept as single unit.</div>";
    return;
  }

  var band   = rotBand(rq);
  var barPct = Math.round(rq * 100);

  // Bar uses band color; value label is the soft word (strong/moderate/weak), not bare %
  var h = "<div class='qbar-row'><span class='qbar-lbl'>Rotation signal</span><div class='qbar-bg'><div class='qbar-fill' style='width:" + barPct + "%;background:" + band.color + ";'></div></div><span class='qbar-val' style='color:" + band.color + ";'>" + band.label + "</span></div>";
  h += "<div style='font-size:10px;color:#8b949e;margin-bottom:4px;'>" + ndiv + "/8 years diverged between pieces.</div>";
  h += "<div style='font-size:9px;color:#6e7681;margin-bottom:4px;font-style:italic;'>Signal measures rotation divergence strength, not split correctness. ~2/3 of strong-signal suggestions are correct.</div>";

  var snap = c.snap_angle;
  if (snap !== null && snap !== undefined) {
    var snapDir   = snap === 0 ? "N-S cut" : snap === 90 ? "E-W cut" : "non-cardinal cut";
    var snapColor = snap === 0 ? "#58a6ff" : snap === 90 ? "#34d399" : "#a78bfa";
    h += "<div style='font-size:10px;margin-bottom:3px;'><span style='color:#8b949e;'>Cardinal snap: </span><span style='color:" + snapColor + ";font-weight:600;'>" + snapDir + "</span></div>";
  }
  if (c.plss_aligned) {
    h += "<div style='font-size:10px;'><span class='plss-tag'>PLSS half-section aligned</span></div>";
  }
  if (c.check_reason && c.check_reason.length) {
    h += "<div style='font-size:10px;margin-top:5px;color:#8b949e;'>Geometry flag: ";
    h += c.check_reason.map(function(r) { return "<span class='check-tag'>" + r + "</span>"; }).join(" ");
    h += "</div>";
  }

  el.innerHTML = h;
}

var PIECE_LABELS  = ["Piece 1 (green)", "Piece 2 (blue)", "Piece 3 (purple)"];
var PIECE_CLASSES = ["pl-0", "pl-1", "pl-2"];

function renderCDL(c) {
  var el = document.getElementById("cdl-content");
  if (!c.piece_cdl || !c.piece_cdl.length) {
    el.innerHTML = "<span style='font-size:11px;color:#6e7681;'>" + (c.category === "kept" ? "No split — single rotation history." : "No CDL data.") + "</span>";
    return;
  }

  var divYrSet = {};
  (c.diverging_years || []).forEach(function(d) {
    var colon = d.indexOf(":");
    if (colon >= 0) divYrSet[parseInt(d.slice(0, colon).trim())] = true;
  });

  var h = "";
  if (Object.keys(divYrSet).length > 0) {
    h += "<div style='font-size:9px;color:#f59e0b;margin-bottom:5px;padding:3px 5px;background:rgba(245,158,11,0.08);border-radius:4px;border:1px solid rgba(245,158,11,0.25);'>Yellow ring = year the two pieces grew different crops</div>";
  }

  c.piece_cdl.forEach(function(yrData, pi) {
    var pClass = PIECE_CLASSES[pi] || "pl-0";
    var seqStr = (c.piece_seqs && c.piece_seqs[pi]) ? c.piece_seqs[pi] : "";
    h += "<span class='piece-lbl " + pClass + "'>" + (PIECE_LABELS[pi] || "Piece " + (pi + 1)) + "</span>";
    if (seqStr) h += "<div style='font-size:9px;color:#8b949e;margin-bottom:2px;'>" + seqStr + "</div>";
    h += "<div class='cdl-strip'>";
    yrData.forEach(function(yd) {
      var isDiv = !!divYrSet[yd.year];
      h += "<div class='cdl-cell" + (isDiv ? " div" : "") + "'>";
      h += "<div class='cdl-sw' style='background:" + (yd.color || "#ccc") + ";'></div>";
      h += "<div class='cdl-yr'>" + String(yd.year).slice(2) + "</div>";
      h += "<div class='cdl-crop'>" + (yd.label || "—").replace("/", "/​") + "</div>";
      h += "</div>";
    });
    h += "</div>";
    if (pi < c.piece_cdl.length - 1) {
      h += "<div style='height:7px;border-bottom:1px dashed #21262d;margin:4px 0;'></div>";
    }
  });
  el.innerHTML = h;
}

function renderGeom(c) {
  var el = document.getElementById("geom-content");
  var h  = "";

  if (c.ftw_verts) {
    h += "<div style='font-size:10px;margin-bottom:3px;'><span style='color:#f97316;'>FTW source:</span> " + c.ftw_verts + " vertices</div>";
  }

  var verts  = c.verts || [];
  var pCols  = ["#22c55e", "#60a5fa", "#a78bfa"];
  verts.forEach(function(v, i) {
    h += "<div style='font-size:10px;margin-bottom:2px;'><span style='color:" + pCols[i] + ";'>" + (c.n_parts > 1 ? "Piece " + (i + 1) : "Refined") + ":</span> " + v + " vertices</div>";
  });

  if (c.part_acs && c.part_acs.length > 1) {
    h += "<div style='font-size:10px;margin-top:4px;color:#8b949e;'>Sizes: " + c.part_acs.map(function(a) { return a.toFixed(0) + "ac"; }).join(" / ") + " (ratio: " + c.ratio + "x)</div>";
  }

  if (c.plss_aligned) {
    h += "<div style='font-size:10px;margin-top:4px;'><span class='plss-tag'>PLSS half-section aligned</span> — split near a surveyed section boundary</div>";
  }

  el.innerHTML = h || "<span style='font-size:11px;color:#6e7681;'>No geometry data.</span>";
}

// ── Feedback ──────────────────────────────────────────────────────────────────

window.setVerdict = function setVerdict(v) {
  activeVerdict = v;
  ["right", "wrong", "unsure"].forEach(function(x) {
    document.getElementById("v-" + x).className = "vbtn" + (x === v ? " v" + x[0] : "");
  });
};

window.saveFeedback = function saveFeedback() {
  if (activeIdx === null) {
    setStatus("Select a field first.", "#f85149");
    return;
  }
  var c = CASES[activeIdx];
  feedback[c.id] = buildRecord(c);
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(feedback)); } catch (_) {}
  updateVerdictBadge(activeIdx);
  setStatus("Saved " + new Date().toLocaleTimeString(), "#8b949e");
};

window.submitFeedback = async function submitFeedback() {
  if (activeIdx === null) {
    setStatus("Select a field first.", "#f85149");
    return;
  }
  if (!activeVerdict) {
    setStatus("Pick a verdict first.", "#f85149");
    return;
  }

  var c = CASES[activeIdx];
  var record = buildRecord(c);

  // Also persist locally (belt-and-suspenders)
  feedback[c.id] = record;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(feedback)); } catch (_) {}
  updateVerdictBadge(activeIdx);

  var btn = document.getElementById("submit-btn");
  btn.disabled = true;
  btn.textContent = "Sending...";
  setStatus("", "#8b949e");

  // Build structured message body for contact-form.
  // contact_messages.message (text, max 5000) receives the full record.
  // contact_messages.source = "boundary-improver" for filtering in Supabase.
  var msgLines = [
    "=== Boundary Improver Feedback ===",
    "field_id: " + record.id,
    "category: " + record.category,
    "ui_tier: " + record.ui_tier,
    "verdict: " + record.verdict,
    "rot_quality_band: " + record.rot_quality_band,
    "n_diverging: " + record.n_diverging,
    "note: " + (record.note || "(none)"),
    "drawn_correction: " + (record.drawn_correction ? "yes" : "none"),
    "ts: " + record.ts,
  ];
  if (record.drawn_correction) {
    msgLines.push("");
    msgLines.push("=== Drawn correction GeoJSON ===");
    msgLines.push(JSON.stringify(record.drawn_correction, null, 2));
  }
  var msgBody = msgLines.join("\n");

  try {
    var res = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        from_email: "sandbox@uffda.ag",
        from_name:  "Boundary Improver Tile",
        message:    msgBody,
        source:     FEEDBACK_SOURCE,
      }),
    });

    if (res.ok) {
      setStatus("Submitted — thank you!", "#22c55e");
      btn.textContent = "Submit verdict";
    } else {
      var errJson = {};
      try { errJson = await res.json(); } catch (_) {}
      console.warn("[boundary-improver] submit error:", res.status, errJson);
      setStatus("Submission failed — verdict saved locally, use Export.", "#f85149");
      btn.textContent = "Submit verdict";
    }
  } catch (err) {
    console.warn("[boundary-improver] submit network error:", err);
    setStatus("Submission failed — verdict saved locally, use Export.", "#f85149");
    btn.textContent = "Submit verdict";
  } finally {
    btn.disabled = false;
  }
};

function buildRecord(c) {
  var rq   = c.rot_quality !== undefined ? c.rot_quality : c.confidence;
  var band = (rq !== undefined && rq !== null) ? rotBand(rq).label : null;
  return {
    id:               c.id,
    category:         c.category,
    ui_tier:          uiTier(c),
    verdict:          activeVerdict,
    note:             document.getElementById("note-fld").value.trim(),
    rot_quality_band: band,
    n_diverging:      c.n_diverging_years || null,
    check_reason:     c.check_reason || [],
    drawn_correction: drawnGeometry ? JSON.parse(JSON.stringify(drawnGeometry)) : null,
    ts:               new Date().toISOString(),
  };
}

function setStatus(msg, color) {
  var el = document.getElementById("save-status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || "#8b949e";
}

window.exportFeedback = function exportFeedback() {
  var payload = Object.values(feedback);
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement("a");
  a.href     = url;
  a.download = "boundary_improver_feedback.json";
  a.click();
  URL.revokeObjectURL(url);
  setStatus("Exported " + payload.length + " verdicts", "#8b949e");
};

// ── Boot ──────────────────────────────────────────────────────────────────────

function boot() {
  updateTopBadges();

  var likelyI = [], lowcI = [], kI = [];
  CASES.forEach(function(c, i) {
    var t = uiTier(c);
    if (t === "likely-split") likelyI.push(i);
    else if (t === "low-conf") lowcI.push(i);
    else kI.push(i);
  });
  buildList("list-likely",  likelyI);
  buildList("list-lowconf", lowcI);
  buildList("list-kept",    kI);

  initMap();

  // Auto-select first field after map loads
  setTimeout(function() {
    var first = document.querySelector(".field-item");
    if (first) first.click();
  }, 1200);
}

boot();
