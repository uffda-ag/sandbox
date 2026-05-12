/*
 * Guess the Crop v2 - Rotation Guesser.
 *
 * Show a target field plus 6-8 neighbor fields, each painted with three
 * years of prior CDL rotation as horizontal ribbons inside the polygon.
 * Player predicts the target's current-year crop. The educational lift
 * is that satellite ag-data isn't just spotting corn from the air - it's
 * the temporal rotation pattern that matters, and neighbor context gives
 * you priors.
 *
 * Self-contained: SVG-only rendering (no embedded MapLibre, no chart
 * library). All cluster data inlined below so the iframe runtime doesn't
 * need fetch() permissions (fetch from a sandboxed null-origin iframe is
 * CORS-blocked anyway). chips.json stays on disk for human reference;
 * the runtime reads from CLUSTERS in this file. If you add a cluster,
 * update both.
 *
 * postMessage handshake: posts uffda:ready on init per the canonical
 * v1 protocol; logs inbound uffda:state for visibility; acks teardown.
 */

const TOTAL_ROUNDS = 8;
const SVG_W = 480;
const SVG_H = 360;

const CROP_COLORS = {
  corn:    "#dac51e",
  soy:     "#26a644",
  wheat:   "#c2a04a",
  canola:  "#e6c200",
  rice:    "#79bcd8",
  alfalfa: "#7aae60",
  fallow:  "#a08866",
  pasture: "#9eb088",
};

const CROP_LABELS = {
  corn:    "Corn",
  soy:     "Soy",
  wheat:   "Winter wheat",
  canola:  "Canola",
  rice:    "Rice",
  alfalfa: "Alfalfa",
  fallow:  "Fallow",
  pasture: "Pasture",
};

// Inlined cluster manifest. Polygons are arrays of [x,y] in normalized
// 0..1 viewport space; history is [Y-3, Y-2, Y-1]; truth is the target
// field's Y crop (the answer). chips.json on disk mirrors this for
// reference - update both if you add a cluster.
const CLUSTERS = [
  {
    id: "iowa-cs-1",
    region: "Iowa (Story County area)",
    year: 2024,
    target: { polygon: [[0.40,0.40],[0.60,0.40],[0.60,0.60],[0.40,0.60]], history: ["soy","corn","soy"], truth: "corn" },
    neighbors: [
      { polygon: [[0.18,0.18],[0.38,0.18],[0.38,0.38],[0.18,0.38]], history: ["corn","soy","corn"] },
      { polygon: [[0.40,0.18],[0.60,0.18],[0.60,0.38],[0.40,0.38]], history: ["soy","corn","soy"] },
      { polygon: [[0.62,0.18],[0.82,0.18],[0.82,0.38],[0.62,0.38]], history: ["corn","soy","corn"] },
      { polygon: [[0.18,0.40],[0.38,0.40],[0.38,0.60],[0.18,0.60]], history: ["corn","soy","corn"] },
      { polygon: [[0.62,0.40],[0.82,0.40],[0.82,0.60],[0.62,0.60]], history: ["corn","soy","corn"] },
      { polygon: [[0.18,0.62],[0.38,0.62],[0.38,0.82],[0.18,0.82]], history: ["soy","corn","soy"] },
      { polygon: [[0.40,0.62],[0.60,0.62],[0.60,0.82],[0.40,0.82]], history: ["corn","soy","corn"] },
      { polygon: [[0.62,0.62],[0.82,0.62],[0.82,0.82],[0.62,0.82]], history: ["soy","corn","soy"] },
    ],
  },
  {
    id: "iowa-cs-2",
    region: "Northwest Iowa (corn-on-corn pocket)",
    year: 2024,
    target: { polygon: [[0.38,0.42],[0.62,0.42],[0.62,0.62],[0.38,0.62]], history: ["corn","corn","corn"], truth: "corn" },
    neighbors: [
      { polygon: [[0.16,0.20],[0.36,0.20],[0.36,0.40],[0.16,0.40]], history: ["corn","corn","soy"] },
      { polygon: [[0.38,0.20],[0.62,0.20],[0.62,0.40],[0.38,0.40]], history: ["corn","corn","corn"] },
      { polygon: [[0.64,0.20],[0.84,0.20],[0.84,0.40],[0.64,0.40]], history: ["soy","corn","corn"] },
      { polygon: [[0.16,0.42],[0.36,0.42],[0.36,0.62],[0.16,0.62]], history: ["corn","corn","corn"] },
      { polygon: [[0.64,0.42],[0.84,0.42],[0.84,0.62],[0.64,0.62]], history: ["corn","corn","soy"] },
      { polygon: [[0.16,0.64],[0.36,0.64],[0.36,0.84],[0.16,0.84]], history: ["corn","corn","corn"] },
      { polygon: [[0.38,0.64],[0.62,0.64],[0.62,0.84],[0.38,0.84]], history: ["corn","soy","corn"] },
    ],
  },
  {
    id: "kansas-wheat-fallow",
    region: "Western Kansas (winter-wheat / fallow)",
    year: 2024,
    target: { polygon: [[0.38,0.40],[0.62,0.40],[0.62,0.60],[0.38,0.60]], history: ["wheat","fallow","wheat"], truth: "fallow" },
    neighbors: [
      { polygon: [[0.14,0.18],[0.36,0.18],[0.36,0.38],[0.14,0.38]], history: ["fallow","wheat","fallow"] },
      { polygon: [[0.38,0.18],[0.62,0.18],[0.62,0.38],[0.38,0.38]], history: ["wheat","fallow","wheat"] },
      { polygon: [[0.64,0.18],[0.86,0.18],[0.86,0.38],[0.64,0.38]], history: ["fallow","wheat","fallow"] },
      { polygon: [[0.14,0.40],[0.36,0.40],[0.36,0.60],[0.14,0.60]], history: ["fallow","wheat","fallow"] },
      { polygon: [[0.64,0.40],[0.86,0.40],[0.86,0.60],[0.64,0.60]], history: ["fallow","wheat","fallow"] },
      { polygon: [[0.14,0.62],[0.36,0.62],[0.36,0.82],[0.14,0.82]], history: ["wheat","fallow","wheat"] },
      { polygon: [[0.38,0.62],[0.62,0.62],[0.62,0.82],[0.38,0.82]], history: ["fallow","wheat","fallow"] },
    ],
  },
  {
    id: "delta-rice-soy",
    region: "Mississippi Delta (rice / soy)",
    year: 2024,
    target: { polygon: [[0.40,0.42],[0.62,0.42],[0.62,0.62],[0.40,0.62]], history: ["rice","soy","rice"], truth: "soy" },
    neighbors: [
      { polygon: [[0.18,0.20],[0.38,0.20],[0.38,0.40],[0.18,0.40]], history: ["soy","rice","soy"] },
      { polygon: [[0.40,0.20],[0.62,0.20],[0.62,0.40],[0.40,0.40]], history: ["rice","soy","rice"] },
      { polygon: [[0.64,0.20],[0.84,0.20],[0.84,0.40],[0.64,0.40]], history: ["soy","rice","soy"] },
      { polygon: [[0.18,0.42],[0.38,0.42],[0.38,0.62],[0.18,0.62]], history: ["rice","soy","rice"] },
      { polygon: [[0.64,0.42],[0.84,0.42],[0.84,0.62],[0.64,0.62]], history: ["soy","rice","soy"] },
      { polygon: [[0.18,0.64],[0.38,0.64],[0.38,0.84],[0.18,0.84]], history: ["rice","soy","rice"] },
      { polygon: [[0.40,0.64],[0.62,0.64],[0.62,0.84],[0.40,0.84]], history: ["soy","rice","soy"] },
      { polygon: [[0.64,0.64],[0.84,0.64],[0.84,0.84],[0.64,0.84]], history: ["rice","soy","rice"] },
    ],
  },
  {
    id: "north-dakota-rotation",
    region: "North Dakota (wheat / canola / soy)",
    year: 2024,
    target: { polygon: [[0.38,0.40],[0.62,0.40],[0.62,0.60],[0.38,0.60]], history: ["wheat","canola","soy"], truth: "wheat" },
    neighbors: [
      { polygon: [[0.16,0.18],[0.36,0.18],[0.36,0.38],[0.16,0.38]], history: ["soy","wheat","canola"] },
      { polygon: [[0.38,0.18],[0.62,0.18],[0.62,0.38],[0.38,0.38]], history: ["canola","soy","wheat"] },
      { polygon: [[0.64,0.18],[0.86,0.18],[0.86,0.38],[0.64,0.38]], history: ["wheat","canola","soy"] },
      { polygon: [[0.16,0.40],[0.36,0.40],[0.36,0.60],[0.16,0.60]], history: ["soy","wheat","canola"] },
      { polygon: [[0.64,0.40],[0.86,0.40],[0.86,0.60],[0.64,0.60]], history: ["canola","soy","wheat"] },
      { polygon: [[0.16,0.62],[0.36,0.62],[0.36,0.82],[0.16,0.82]], history: ["wheat","canola","soy"] },
      { polygon: [[0.38,0.62],[0.62,0.62],[0.62,0.82],[0.38,0.82]], history: ["soy","wheat","canola"] },
    ],
  },
  {
    id: "central-illinois-cs",
    region: "Central Illinois (corn-soy)",
    year: 2024,
    target: { polygon: [[0.40,0.40],[0.60,0.40],[0.60,0.60],[0.40,0.60]], history: ["corn","soy","corn"], truth: "soy" },
    neighbors: [
      { polygon: [[0.18,0.18],[0.38,0.18],[0.38,0.38],[0.18,0.38]], history: ["soy","corn","soy"] },
      { polygon: [[0.40,0.18],[0.60,0.18],[0.60,0.38],[0.40,0.38]], history: ["corn","soy","corn"] },
      { polygon: [[0.62,0.18],[0.82,0.18],[0.82,0.38],[0.62,0.38]], history: ["soy","corn","soy"] },
      { polygon: [[0.18,0.40],[0.38,0.40],[0.38,0.60],[0.18,0.60]], history: ["soy","corn","soy"] },
      { polygon: [[0.62,0.40],[0.82,0.40],[0.82,0.60],[0.62,0.60]], history: ["soy","corn","soy"] },
      { polygon: [[0.18,0.62],[0.38,0.62],[0.38,0.82],[0.18,0.82]], history: ["corn","soy","corn"] },
      { polygon: [[0.40,0.62],[0.60,0.62],[0.60,0.82],[0.40,0.82]], history: ["soy","corn","soy"] },
      { polygon: [[0.62,0.62],[0.82,0.62],[0.82,0.82],[0.62,0.82]], history: ["corn","soy","corn"] },
    ],
  },
  {
    id: "pasture-anchor",
    region: "Eastern Kansas (corn-soy bounded by pasture)",
    year: 2024,
    target: { polygon: [[0.40,0.42],[0.62,0.42],[0.62,0.62],[0.40,0.62]], history: ["soy","corn","soy"], truth: "corn" },
    neighbors: [
      { polygon: [[0.18,0.20],[0.38,0.20],[0.38,0.40],[0.18,0.40]], history: ["pasture","pasture","pasture"] },
      { polygon: [[0.40,0.20],[0.62,0.20],[0.62,0.40],[0.40,0.40]], history: ["corn","soy","corn"] },
      { polygon: [[0.64,0.20],[0.84,0.20],[0.84,0.40],[0.64,0.40]], history: ["soy","corn","soy"] },
      { polygon: [[0.18,0.42],[0.38,0.42],[0.38,0.62],[0.18,0.62]], history: ["pasture","pasture","pasture"] },
      { polygon: [[0.64,0.42],[0.84,0.42],[0.84,0.62],[0.64,0.62]], history: ["corn","soy","corn"] },
      { polygon: [[0.18,0.64],[0.38,0.64],[0.38,0.84],[0.18,0.84]], history: ["pasture","pasture","pasture"] },
      { polygon: [[0.40,0.64],[0.62,0.64],[0.62,0.84],[0.40,0.84]], history: ["corn","soy","corn"] },
    ],
  },
  {
    id: "alfalfa-anchor",
    region: "Central Wisconsin (corn-alfalfa)",
    year: 2024,
    target: { polygon: [[0.38,0.40],[0.62,0.40],[0.62,0.60],[0.38,0.60]], history: ["alfalfa","alfalfa","corn"], truth: "alfalfa" },
    neighbors: [
      { polygon: [[0.16,0.18],[0.36,0.18],[0.36,0.38],[0.16,0.38]], history: ["corn","alfalfa","alfalfa"] },
      { polygon: [[0.38,0.18],[0.62,0.18],[0.62,0.38],[0.38,0.38]], history: ["alfalfa","alfalfa","corn"] },
      { polygon: [[0.64,0.18],[0.86,0.18],[0.86,0.38],[0.64,0.38]], history: ["alfalfa","corn","alfalfa"] },
      { polygon: [[0.16,0.40],[0.36,0.40],[0.36,0.60],[0.16,0.60]], history: ["corn","alfalfa","alfalfa"] },
      { polygon: [[0.64,0.40],[0.86,0.40],[0.86,0.60],[0.64,0.60]], history: ["alfalfa","alfalfa","corn"] },
      { polygon: [[0.16,0.62],[0.36,0.62],[0.36,0.82],[0.16,0.82]], history: ["alfalfa","corn","alfalfa"] },
      { polygon: [[0.38,0.62],[0.62,0.62],[0.62,0.82],[0.38,0.82]], history: ["corn","alfalfa","alfalfa"] },
    ],
  },
];

const els = {
  round:         document.getElementById("round"),
  total:         document.getElementById("total"),
  score:         document.getElementById("score"),
  region:        document.getElementById("region"),
  stage:         document.getElementById("stage"),
  board:         document.getElementById("board"),
  legend:        document.getElementById("legend"),
  choices:       document.getElementById("choices"),
  verdict:       document.getElementById("verdict"),
  endscreen:     document.getElementById("endscreen"),
  endscreenNote: document.getElementById("endscreen-note"),
  finalScore:    document.getElementById("final-score"),
  finalTotal:    document.getElementById("final-total"),
  playAgain:     document.getElementById("play-again"),
};

const state = {
  deck: [],
  index: 0,
  score: 0,
  locked: false,
};

// postMessage handshake (v1 canonical contract)
function postReady() {
  window.parent.postMessage({ type: "uffda:ready", version: 1 }, "*");
}
function onHostMessage(event) {
  const data = event && event.data;
  if (!data || typeof data !== "object" || data.version !== 1) return;
  if (data.type === "uffda:state") {
    // eslint-disable-next-line no-console
    console.debug("[guess-the-crop] received uffda:state", data.payload);
  } else if (data.type === "uffda:teardown") {
    // eslint-disable-next-line no-console
    console.debug("[guess-the-crop] host teardown received");
  }
}

// Deck management
function buildDeck() {
  const deck = CLUSTERS.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// SVG helpers — string builders. Renders cluster polygons + per-field
// ribbon stripes (Y-3 top, Y-1 bottom). Target gets the rust outline +
// no ribbons inside (player guesses Y).
function renderCluster(cluster) {
  const svgNS = "http://www.w3.org/2000/svg";
  const root = els.board;
  while (root.firstChild) root.removeChild(root.firstChild);

  // Group background grid hint (a faint dotted boundary so isolated fields
  // don't read as floating).
  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", String(SVG_W));
  bg.setAttribute("height", String(SVG_H));
  bg.setAttribute("fill", "#0e1709");
  root.appendChild(bg);

  // Neighbor fields - render with ribbon stripes
  for (const f of cluster.neighbors) {
    renderField(root, svgNS, f.polygon, f.history, /*target=*/ false);
  }

  // Target field - rust outline, no ribbons, "?" overlay
  renderField(root, svgNS, cluster.target.polygon, /*history=*/ null, /*target=*/ true);
}

function renderField(root, svgNS, normPoly, history, isTarget) {
  // Convert normalized [0..1, 0..1] coords to SVG viewport coords.
  const pts = normPoly.map(([x, y]) => [x * SVG_W, y * SVG_H]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;

  // Polygon outline (used as clip for ribbons + as the visible stroke)
  const polyId = `poly-${Math.random().toString(36).slice(2, 8)}`;
  const defs = document.createElementNS(svgNS, "defs");
  const clip = document.createElementNS(svgNS, "clipPath");
  clip.setAttribute("id", polyId);
  const clipPoly = document.createElementNS(svgNS, "polygon");
  clipPoly.setAttribute("points", pts.map((p) => `${p[0]},${p[1]}`).join(" "));
  clip.appendChild(clipPoly);
  defs.appendChild(clip);
  root.appendChild(defs);

  if (isTarget) {
    // Target = dark fill inside (we want the player to NOT see crop info),
    // rust outline, "?" + "TARGET / 2024" label.
    const targetFill = document.createElementNS(svgNS, "polygon");
    targetFill.setAttribute("points", pts.map((p) => `${p[0]},${p[1]}`).join(" "));
    targetFill.setAttribute("fill", "#1b2a18");
    targetFill.setAttribute("class", "field-poly target");
    root.appendChild(targetFill);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const q = document.createElementNS(svgNS, "text");
    q.setAttribute("x", String(cx));
    q.setAttribute("y", String(cy + 6));
    q.setAttribute("text-anchor", "middle");
    q.setAttribute("font-family", '"Playfair Display", Fraunces, Georgia, serif');
    q.setAttribute("font-size", "34");
    q.setAttribute("font-style", "italic");
    q.setAttribute("fill", "#c4922b");
    q.textContent = "?";
    root.appendChild(q);

    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", String(cx));
    t.setAttribute("y", String(minY + 14));
    t.setAttribute("class", "target-label");
    t.textContent = "Target · 2024";
    root.appendChild(t);
    return;
  }

  // Neighbor: paint three horizontal ribbons inside the polygon, clipped.
  // Ribbon 1 = Y-3 (top), Ribbon 3 = Y-1 (bottom).
  const ribbonH = h / 3;
  for (let i = 0; i < 3; i++) {
    const crop = history[i];
    const color = CROP_COLORS[crop] || "#444";
    const r = document.createElementNS(svgNS, "rect");
    r.setAttribute("x", String(minX));
    r.setAttribute("y", String(minY + i * ribbonH));
    r.setAttribute("width", String(w));
    r.setAttribute("height", String(ribbonH));
    r.setAttribute("fill", color);
    r.setAttribute("clip-path", `url(#${polyId})`);
    root.appendChild(r);
    // Thin divider between ribbons so adjacent same-color years still
    // read as separate.
    if (i > 0) {
      const div = document.createElementNS(svgNS, "line");
      div.setAttribute("x1", String(minX));
      div.setAttribute("y1", String(minY + i * ribbonH));
      div.setAttribute("x2", String(maxX));
      div.setAttribute("y2", String(minY + i * ribbonH));
      div.setAttribute("class", "ribbon-divider");
      div.setAttribute("clip-path", `url(#${polyId})`);
      root.appendChild(div);
    }
  }

  // Polygon outline on top, so neighbor edges are crisp.
  const stroke = document.createElementNS(svgNS, "polygon");
  stroke.setAttribute("points", pts.map((p) => `${p[0]},${p[1]}`).join(" "));
  stroke.setAttribute("fill", "none");
  stroke.setAttribute("class", "field-poly");
  root.appendChild(stroke);

  // Tiny year labels (Y-3 / Y-2 / Y-1) on the right edge of the polygon,
  // only if there's room (skip on small polys).
  if (h > 50 && w > 60) {
    for (let i = 0; i < 3; i++) {
      const lab = document.createElementNS(svgNS, "text");
      lab.setAttribute("x", String(maxX - 2));
      lab.setAttribute("y", String(minY + (i + 0.5) * ribbonH + 3));
      lab.setAttribute("class", "year-label");
      lab.textContent = `Y-${3 - i}`;
      root.appendChild(lab);
    }
  }
}

function renderLegend(cluster) {
  // Collect the unique crops used in this cluster's history + answer set.
  const used = new Set();
  for (const f of cluster.neighbors) for (const c of f.history) used.add(c);
  // We always show the cluster's truth in the legend too — it might be a
  // crop the neighbors don't use (e.g. corn target with pasture neighbors).
  used.add(cluster.target.truth);
  for (const c of cluster.target.history) used.add(c);
  const sorted = Array.from(used).sort();
  els.legend.innerHTML = sorted.map((c) => {
    const color = CROP_COLORS[c] || "#444";
    const label = CROP_LABELS[c] || c;
    return `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${escapeHtml(label)}</span>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Round flow
function renderRound() {
  const cluster = state.deck[state.index];
  els.round.textContent = String(state.index + 1);
  els.total.textContent = String(state.deck.length);
  els.score.textContent = String(state.score);
  els.region.textContent = cluster.region;
  renderCluster(cluster);
  renderLegend(cluster);
  els.verdict.textContent = "";
  els.verdict.classList.remove("right", "wrong");
  for (const btn of els.choices.querySelectorAll("button")) {
    btn.disabled = false;
    btn.classList.remove("right", "wrong");
  }
  state.locked = false;
}

function onChoice(crop) {
  if (state.locked) return;
  state.locked = true;
  const cluster = state.deck[state.index];
  const correct = cluster.target.truth === crop;
  if (correct) state.score += 1;
  for (const btn of els.choices.querySelectorAll("button")) {
    btn.disabled = true;
    if (btn.dataset.crop === cluster.target.truth) btn.classList.add("right");
    else if (btn.dataset.crop === crop && !correct) btn.classList.add("wrong");
  }
  els.verdict.classList.add(correct ? "right" : "wrong");
  els.verdict.textContent = correct
    ? `Right. ${CROP_LABELS[cluster.target.truth]}.`
    : `Wrong. The target planted ${CROP_LABELS[cluster.target.truth].toLowerCase()}.`;
  els.score.textContent = String(state.score);

  window.setTimeout(() => {
    state.index += 1;
    if (state.index >= state.deck.length) showEnd();
    else renderRound();
  }, 1200);
}

function showEnd() {
  els.stage.hidden = true;
  els.endscreen.hidden = false;
  els.finalScore.textContent = String(state.score);
  els.finalTotal.textContent = String(state.deck.length);
  els.endscreenNote.textContent = endNote(state.score, state.deck.length);
}

function endNote(score, total) {
  const ratio = score / total;
  if (ratio === 1) return "Clean read. You're seeing the rotation, not the color.";
  if (ratio >= 0.75) return "Strong read. The neighbors are doing real work for you.";
  if (ratio >= 0.5) return "Half-and-half. Look at the dominant Y-1 ribbon next time.";
  if (ratio > 0) return "Rough round. Most rotations have a 2-year flip - check Y-2 vs Y-1.";
  return "Tough deck. The rotation pattern is the whole game.";
}

// Wire-up
els.choices.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const btn = target.closest("button.choice");
  if (!btn) return;
  const crop = btn.dataset.crop;
  if (crop) onChoice(crop);
});

els.playAgain.addEventListener("click", () => {
  state.deck = buildDeck();
  state.index = 0;
  state.score = 0;
  els.stage.hidden = false;
  els.endscreen.hidden = true;
  renderRound();
});

window.addEventListener("message", onHostMessage);

(function init() {
  state.deck = buildDeck();
  renderRound();
  postReady();
})();
