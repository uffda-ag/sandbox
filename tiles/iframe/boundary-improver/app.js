/**
 * Field Boundary Improver — sandbox tile app.
 *
 * Loads McLean IL v6 evidence data (71 FTW fields, CDL 2016-2023).
 * Shows FTW original vs CDL-rotation-split refined boundaries on satellite.
 *
 * Map: MapLibre GL JS 3.6.2 (matches evidence panel).
 * Data: data.js (ES module) — auto-generated from viewer_data_mclean_v6.json.
 *
 * Feedback is stored in sessionStorage (key: boundary_improver_feedback).
 * Export button downloads the collected verdicts as JSON.
 *
 * User-facing strings: listed in the handoff brief; Voice Guardian gate pending.
 *
 * Known limitations (see implementation note):
 *  - McLean County IL only; generalisation to other counties in progress.
 *  - 3-zone under-catch: splitter finds 2 pieces where 3 are warranted (tuning backlog).
 *  - Feedback is session-only (no backend yet); Export for persistence.
 */

import { CASES } from "./data.js";

// ── Storage key ──────────────────────────────────────────────────────────────
const STORAGE_KEY = "boundary_improver_feedback";

// ── State ────────────────────────────────────────────────────────────────────
let activeIdx    = null;
let activeVerdict = null;
let mapView      = "refined";
let useSat       = false;
let map          = null;

// Feedback store — persisted to sessionStorage for export within the session.
let feedback = {};
try {
  feedback = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
} catch (_) {
  feedback = {};
}

// ── Badge counts ─────────────────────────────────────────────────────────────

function updateTopBadges() {
  const wins   = CASES.filter(c => c.category === "win").length;
  const checks = CASES.filter(c => c.category === "check").length;
  const kept   = CASES.filter(c => c.category === "kept").length;
  document.getElementById("badge-wins").textContent   = wins   + " wins";
  document.getElementById("badge-checks").textContent = checks + " checks";
  document.getElementById("badge-kept").textContent   = kept   + " kept";
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
  [["p0", "#22c55e"], ["p1", "#60a5fa"], ["p2", "#a78bfa"]].forEach(([src, col]) => {
    map.addSource(src, { type: "geojson", data: emptyFC() });
    map.addLayer({ id: src + "-fill", type: "fill", source: src, paint: { "fill-color": col, "fill-opacity": 0.18 } });
    map.addLayer({ id: src + "-line", type: "line", source: src, paint: { "line-color": col, "line-width": 2.5 } });
  });

  // Kept field (single, grey)
  map.addSource("kept", { type: "geojson", data: emptyFC() });
  map.addLayer({ id: "kept-fill", type: "fill", source: "kept", paint: { "fill-color": "#8b949e", "fill-opacity": 0.12 } });
  map.addLayer({ id: "kept-line", type: "line", source: "kept", paint: { "line-color": "#8b949e", "line-width": 2 } });
}

function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: OSM_STYLE,
    center: [-88.86, 40.52],
    zoom: 10,
    attributionControl: { compact: true }
  });
  map.on("load", addMapLayers);
}

window.toggleSat = function toggleSat() {
  useSat = !useSat;
  document.getElementById("sat-toggle").textContent = useSat ? "Street map" : "Satellite";
  const ctr = map.getCenter();
  const z   = map.getZoom();
  map.setStyle(useSat ? SAT_STYLE : OSM_STYLE);
  map.once("styledata", () => {
    addMapLayers();
    if (activeIdx !== null) applyMapData(CASES[activeIdx], mapView);
    map.setCenter(ctr);
    map.setZoom(z);
  });
};

function applyMapData(c, mode) {
  if (!map.getSource("ftw")) return;

  if (c.category === "kept") {
    map.getSource("ftw").setData(emptyFC());
    ["p0", "p1", "p2"].forEach(s => map.getSource(s).setData(emptyFC()));
    map.getSource("kept").setData({ type: "FeatureCollection", features: [feat(c.ftw_polygon, { id: c.id })] });
    return;
  }

  if (mode === "ftw") {
    ["p0", "p1", "p2", "kept"].forEach(s => map.getSource(s).setData(emptyFC()));
    map.getSource("ftw").setData({ type: "FeatureCollection", features: [feat(c.ftw_polygon, { id: c.id })] });
    if (map.getLayer("ftw-line")) {
      map.setPaintProperty("ftw-line", "line-width", 4);
      map.setPaintProperty("ftw-fill", "fill-opacity", 0.2);
    }
  } else {
    const polys = c.refined_polygons || [];
    ["p0", "p1", "p2"].forEach((s, si) => {
      map.getSource(s).setData({
        type: "FeatureCollection",
        features: polys[si] ? [feat(polys[si], { id: c.id + "_p" + si })] : []
      });
    });
    map.getSource("kept").setData(emptyFC());
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
  const el = document.getElementById(containerId);
  indices.forEach(idx => {
    const c = CASES[idx];
    const d = document.createElement("div");
    d.className = "field-item";
    d.id = "fi-" + idx;

    const catColor = c.category === "win" ? "#3fb950" : c.category === "check" ? "#e3b341" : "#8b949e";
    const catLabel = c.category === "win" ? "WIN" : c.category === "check" ? "CHECK" : "KEPT";

    let metaStr = "";
    if (c.n_parts > 1) {
      metaStr = c.part_acs.map(a => a.toFixed(0) + "ac").join(" + ");
      const rq = c.rot_quality !== undefined ? c.rot_quality : c.confidence;
      const rqColor = rq >= 0.7 ? "#3fb950" : rq >= 0.4 ? "#e3b341" : "#f85149";
      if (c.n_diverging_years) metaStr += " &bull; " + c.n_diverging_years + "/8 div";
      metaStr += " &bull; <span style='color:" + rqColor + "'>" + Math.round(rq * 100) + "%</span>";
      if (c.plss_aligned) metaStr += " &bull; <span style='color:#34d399'>PLSS</span>";
    } else {
      metaStr = c.source_ac.toFixed(0) + "ac (kept)";
    }

    d.innerHTML =
      "<div class='fi-id'>" + c.id + " <span id='vb-" + idx + "' style='font-size:9px;'></span></div>" +
      "<div class='fi-sum'><span style='color:" + catColor + ";font-weight:600;'>" + catLabel + "</span> " + c.source_ac.toFixed(0) + "ac</div>" +
      "<div class='fi-meta'>" + metaStr + "</div>";

    d.addEventListener("click", () => {
      document.querySelectorAll(".field-item").forEach(x => x.classList.remove("active"));
      d.classList.add("active");
      showCase(idx);
    });

    el.appendChild(d);
    updateVerdictBadge(idx);
  });
}

function updateVerdictBadge(idx) {
  const el = document.getElementById("vb-" + idx);
  if (!el) return;
  const v = feedback[CASES[idx].id];
  if (!v || !v.verdict) { el.textContent = ""; return; }
  const labels = { right: "✓", wrong: "✗", unsure: "?" };
  el.textContent = labels[v.verdict] || v.verdict;
  el.style.color = v.verdict === "right" ? "#3fb950" : v.verdict === "wrong" ? "#f85149" : "#e3b341";
}

// ── Show a case ───────────────────────────────────────────────────────────────

function showCase(idx) {
  activeIdx = idx;
  const c   = CASES[idx];

  // Toggle view switch visibility
  document.getElementById("view-toggle").style.display = c.category !== "kept" ? "flex" : "none";

  applyMapData(c, mapView);

  const allGeoms = [c.ftw_polygon, ...(c.refined_polygons || [])].filter(Boolean);
  const [mnx, mny, mxx, mxy] = mergedBbox(allGeoms);
  const pad = Math.max(mxx - mnx, mxy - mny) * 0.4;
  map.fitBounds([[mnx - pad, mny - pad], [mxx + pad, mxy + pad]], { padding: 40, duration: 500 });

  // Restore feedback state
  const prev = feedback[c.id];
  activeVerdict = prev ? prev.verdict : null;
  document.getElementById("note-fld").value = prev ? (prev.note || "") : "";
  ["right", "wrong", "unsure"].forEach(x => {
    document.getElementById("v-" + x).className = "vbtn" + (activeVerdict === x ? " v" + x[0] : "");
  });
  document.getElementById("save-status").textContent = "";

  renderSignal(c);
  renderQuality(c);
  renderCDL(c);
  renderGeom(c);
}

// ── Detail panel renderers ────────────────────────────────────────────────────

function renderSignal(c) {
  const el = document.getElementById("signal-content");
  if (c.category === "kept") {
    el.innerHTML = "<div style='font-size:11px;color:#8b949e;'>No split — CDL rotation is uniform across this field. FTW kept as-is.</div>";
    return;
  }
  const divs = c.diverging_years || [];
  if (!divs.length) {
    el.innerHTML = "<span style='font-size:11px;color:#6e7681;'>No divergence data available.</span>";
    return;
  }

  let h = "<div class='signal-box'><strong style='color:#22c55e;'>Split signal:</strong> ";
  const seqs = c.piece_seqs || [];
  if (seqs.length >= 2) {
    h += "The <span style='color:#22c55e;'>green piece</span> grew <strong>" + seqs[0] + "</strong> ";
    h += "while the <span style='color:#60a5fa;'>blue piece</span> grew <strong>" + seqs[1] + "</strong>. ";
    h += divs.length + " of 8 years diverged — that rotation difference placed the boundary.";
  } else {
    h += divs.length + " of 8 years showed different crops across the two zones.";
  }
  h += "</div>";

  h += "<div style='font-size:10px;color:#8b949e;margin-bottom:4px;'>Year-by-year divergence:</div>";
  divs.forEach(d => {
    const colon = d.indexOf(":");
    const yr   = colon >= 0 ? d.slice(0, colon).trim() : "?";
    const rest = colon >= 0 ? d.slice(colon + 1).trim() : d;
    const parts   = rest.split(" vs ");
    const isRecent = ["2021", "2022", "2023"].includes(String(yr));
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
  const el  = document.getElementById("quality-content");
  const rq  = c.rot_quality !== undefined ? c.rot_quality : c.confidence;
  const ndiv = c.n_diverging_years || 0;
  const pct  = Math.round(rq * 100);
  const qcol = rq >= 0.7 ? "#3fb950" : rq >= 0.4 ? "#e3b341" : "#f85149";

  if (c.category === "kept") {
    el.innerHTML = "<div class='qbar-row'><span class='qbar-lbl'>Rotation signal</span><div class='qbar-bg'><div class='qbar-fill' style='width:100%;background:#8b949e;'></div></div><span class='qbar-val' style='color:#8b949e;'>uniform</span></div><div style='font-size:10px;color:#6e7681;'>No divergence — kept as single unit.</div>";
    return;
  }

  let h = "<div class='qbar-row'><span class='qbar-lbl'>Rotation quality</span><div class='qbar-bg'><div class='qbar-fill' style='width:" + pct + "%;background:" + qcol + ";'></div></div><span class='qbar-val' style='color:" + qcol + ";'>" + pct + "%</span></div>";
  h += "<div style='font-size:10px;color:#8b949e;margin-bottom:4px;'>" + ndiv + "/8 years diverged between pieces.</div>";

  const snap = c.snap_angle;
  if (snap !== null && snap !== undefined) {
    const snapDir   = snap === 0 ? "N-S cut" : snap === 90 ? "E-W cut" : "non-cardinal cut";
    const snapColor = snap === 0 ? "#58a6ff" : snap === 90 ? "#34d399" : "#a78bfa";
    h += "<div style='font-size:10px;margin-bottom:3px;'><span style='color:#8b949e;'>Cardinal snap: </span><span style='color:" + snapColor + ";font-weight:600;'>" + snapDir + "</span></div>";
  }
  if (c.plss_aligned) {
    h += "<div style='font-size:10px;'><span class='plss-tag'>PLSS half-section aligned</span></div>";
  }
  if (c.check_reason && c.check_reason.length) {
    h += "<div style='font-size:10px;margin-top:5px;color:#8b949e;'>Geometry check: ";
    h += c.check_reason.map(r => "<span class='check-tag'>" + r + "</span>").join(" ");
    h += "</div>";
  }

  el.innerHTML = h;
}

const PIECE_LABELS = ["Piece 1 (green)", "Piece 2 (blue)", "Piece 3 (purple)"];
const PIECE_CLASSES = ["pl-0", "pl-1", "pl-2"];

function renderCDL(c) {
  const el = document.getElementById("cdl-content");
  if (!c.piece_cdl || !c.piece_cdl.length) {
    el.innerHTML = "<span style='font-size:11px;color:#6e7681;'>" + (c.category === "kept" ? "No split — single rotation history." : "No CDL data.") + "</span>";
    return;
  }

  const divYrSet = new Set();
  (c.diverging_years || []).forEach(d => {
    const colon = d.indexOf(":");
    if (colon >= 0) divYrSet.add(parseInt(d.slice(0, colon).trim()));
  });

  let h = "";
  if (divYrSet.size > 0) {
    h += "<div style='font-size:9px;color:#f59e0b;margin-bottom:5px;padding:3px 5px;background:rgba(245,158,11,0.08);border-radius:4px;border:1px solid rgba(245,158,11,0.25);'>Yellow ring = year the two pieces grew different crops</div>";
  }

  c.piece_cdl.forEach((yrData, pi) => {
    const pClass = PIECE_CLASSES[pi] || "pl-0";
    const seqStr = (c.piece_seqs && c.piece_seqs[pi]) ? c.piece_seqs[pi] : "";
    h += "<span class='piece-lbl " + pClass + "'>" + (PIECE_LABELS[pi] || "Piece " + (pi + 1)) + "</span>";
    if (seqStr) h += "<div style='font-size:9px;color:#8b949e;margin-bottom:2px;'>" + seqStr + "</div>";
    h += "<div class='cdl-strip'>";
    yrData.forEach(yd => {
      const isDiv = divYrSet.has(yd.year);
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
  const el = document.getElementById("geom-content");
  let h = "";

  if (c.ftw_verts) {
    h += "<div style='font-size:10px;margin-bottom:3px;'><span style='color:#f97316;'>FTW source:</span> " + c.ftw_verts + " vertices</div>";
  }

  const verts  = c.verts || [];
  const pCols  = ["#22c55e", "#60a5fa", "#a78bfa"];
  verts.forEach((v, i) => {
    h += "<div style='font-size:10px;margin-bottom:2px;'><span style='color:" + pCols[i] + ";'>" + (c.n_parts > 1 ? "Piece " + (i + 1) : "Refined") + ":</span> " + v + " vertices</div>";
  });

  if (c.part_acs && c.part_acs.length > 1) {
    h += "<div style='font-size:10px;margin-top:4px;color:#8b949e;'>Sizes: " + c.part_acs.map(a => a.toFixed(0) + "ac").join(" / ") + " (ratio: " + c.ratio + "x)</div>";
  }

  if (c.plss_aligned) {
    h += "<div style='font-size:10px;margin-top:4px;'><span class='plss-tag'>PLSS half-section aligned</span> — split near a surveyed section boundary</div>";
  }

  el.innerHTML = h || "<span style='font-size:11px;color:#6e7681;'>No geometry data.</span>";
}

// ── Feedback ──────────────────────────────────────────────────────────────────

window.setVerdict = function setVerdict(v) {
  activeVerdict = v;
  ["right", "wrong", "unsure"].forEach(x => {
    document.getElementById("v-" + x).className = "vbtn" + (x === v ? " v" + x[0] : "");
  });
};

window.saveFeedback = function saveFeedback() {
  if (activeIdx === null) return;
  const c = CASES[activeIdx];
  feedback[c.id] = {
    id: c.id,
    category: c.category,
    verdict: activeVerdict,
    note: document.getElementById("note-fld").value.trim(),
    rot_quality: c.rot_quality || c.confidence,
    n_diverging: c.n_diverging_years,
    check_reason: c.check_reason || [],
    ts: new Date().toISOString()
  };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(feedback)); } catch (_) {}
  updateVerdictBadge(activeIdx);
  document.getElementById("save-status").textContent = "Saved " + new Date().toLocaleTimeString();
};

window.exportFeedback = function exportFeedback() {
  const payload = Object.values(feedback);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "boundary_improver_feedback.json";
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById("save-status").textContent = "Exported " + payload.length + " verdicts";
};

// ── Boot ──────────────────────────────────────────────────────────────────────

function boot() {
  updateTopBadges();

  const wI = [], cI = [], kI = [];
  CASES.forEach((c, i) => {
    if (c.category === "win") wI.push(i);
    else if (c.category === "check") cI.push(i);
    else kI.push(i);
  });
  buildList("list-wins",   wI);
  buildList("list-checks", cI);
  buildList("list-kept",   kI);

  initMap();

  // Auto-select first win after map loads
  setTimeout(() => {
    const first = document.querySelector(".field-item");
    if (first) first.click();
  }, 1200);
}

boot();
