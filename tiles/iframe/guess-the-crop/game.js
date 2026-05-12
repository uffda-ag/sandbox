/*
 * Guess the Crop v3 — Real Sentinel-2 Imagery, CDL Ground Truth.
 *
 * Show a real Sentinel-2 RGB chip (256×256, ~600m square, peak growing
 * season) of a CONUS field, plus a metadata strip (state/county/year),
 * and ask the player to pick the dominant crop from a 4-option button
 * group. Eight rounds per game, score tally, replay button.
 *
 * Year filter (All / 2020 / 2021 / 2022 / 2023 / 2024) restricts the
 * pool the game shuffles from.
 *
 * No fetch() — the manifest below is inlined as a JS const. This is
 * intentional: the iframe runs from sandbox.uffda.ag in a sandboxed
 * (null-origin) iframe, where fetch('chips.json') fails due to the
 * null origin. Sprint 16 retro caught this; v3 stays inlined.
 *
 * Chip metadata: id, state, county, year, trueCrop (from CDL dominance
 * stats), options (3 plausible distractors), sentinelDate, cloudCover.
 * Chip image is loaded as chips/<id>.png (a sibling path, which IS
 * permitted from the iframe — only fetch() of JSON is null-origin
 * blocked; <img> src loads aren't).
 */

// ── Inlined chip manifest (33 chips, CONUS-wide, 2020-2024) ─────────
const CHIPS = [
  { id: "ia-story-2023-corn",       state: "IA", county: "Story",       year: 2023, trueCrop: "corn",         options: ["soybean", "alfalfa", "oats"],         sentinelDate: "2023-08-22", cloudCover: 0.1 },
  { id: "il-mclean-2022-soy",       state: "IL", county: "McLean",      year: 2022, trueCrop: "soybean",      options: ["corn", "winter wheat", "alfalfa"],    sentinelDate: "2022-07-19", cloudCover: 3.6 },
  { id: "in-tippecanoe-2023-corn",  state: "IN", county: "Tippecanoe",  year: 2023, trueCrop: "corn",         options: ["soybean", "winter wheat", "alfalfa"], sentinelDate: "2023-07-11", cloudCover: 0.0 },
  { id: "ne-hamilton-2023-corn",    state: "NE", county: "Hamilton",    year: 2023, trueCrop: "corn",         options: ["soybean", "sorghum", "winter wheat"], sentinelDate: "2023-08-15", cloudCover: 0.5 },
  { id: "mn-renville-2022-soy",     state: "MN", county: "Renville",    year: 2022, trueCrop: "soybean",      options: ["corn", "sugarbeets", "spring wheat"], sentinelDate: "2022-08-30", cloudCover: 0.0 },
  { id: "ia-grundy-2021-corn",      state: "IA", county: "Grundy",      year: 2021, trueCrop: "corn",         options: ["soybean", "alfalfa", "oats"],         sentinelDate: "2021-08-14", cloudCover: 0.3 },
  { id: "il-champaign-2024-soy",    state: "IL", county: "Champaign",   year: 2024, trueCrop: "soybean",      options: ["corn", "winter wheat", "alfalfa"],    sentinelDate: "2024-08-27", cloudCover: 0.0 },
  { id: "ne-york-2020-corn",        state: "NE", county: "York",        year: 2020, trueCrop: "corn",         options: ["soybean", "winter wheat", "sorghum"], sentinelDate: "2020-08-10", cloudCover: 0.1 },
  { id: "nd-cass-2023-spring-wt",   state: "ND", county: "Cass",        year: 2023, trueCrop: "spring wheat", options: ["soybean", "corn", "sunflower"],       sentinelDate: "2023-08-28", cloudCover: 0.0 },
  { id: "nd-stutsman-2022-canola",  state: "ND", county: "Stutsman",    year: 2022, trueCrop: "canola",       options: ["spring wheat", "soybean", "sunflower"], sentinelDate: "2022-08-23", cloudCover: 0.0 },
  { id: "sd-brown-2024-sunflower",  state: "SD", county: "Brown",       year: 2024, trueCrop: "sunflower",    options: ["spring wheat", "soybean", "corn"],    sentinelDate: "2024-08-02", cloudCover: 0.0 },
  { id: "mt-chouteau-2021-wt",      state: "MT", county: "Chouteau",    year: 2021, trueCrop: "winter wheat", options: ["fallow", "spring wheat", "barley"],   sentinelDate: "2021-08-13", cloudCover: 0.0 },
  { id: "nd-ransom-2024-soy",       state: "ND", county: "Ransom",      year: 2024, trueCrop: "soybean",      options: ["spring wheat", "corn", "sunflower"],  sentinelDate: "2024-08-02", cloudCover: 0.0 },
  { id: "ks-thomas-2023-winter-wt", state: "KS", county: "Thomas",      year: 2023, trueCrop: "winter wheat", options: ["sorghum", "corn", "fallow"],          sentinelDate: "2023-07-24", cloudCover: 0.0 },
  { id: "ks-haskell-2022-sorghum",  state: "KS", county: "Haskell",     year: 2022, trueCrop: "sorghum",      options: ["winter wheat", "corn", "cotton"],     sentinelDate: "2022-08-23", cloudCover: 1.0 },
  { id: "ok-texas-2024-wt",         state: "OK", county: "Texas",       year: 2024, trueCrop: "winter wheat", options: ["sorghum", "corn", "fallow"],          sentinelDate: "2024-08-22", cloudCover: 0.3 },
  { id: "tx-deaf-smith-2021-cotton",state: "TX", county: "Deaf Smith",  year: 2021, trueCrop: "cotton",       options: ["corn", "sorghum", "winter wheat"],    sentinelDate: "2021-09-07", cloudCover: 0.0 },
  { id: "tx-lubbock-2023-cotton",   state: "TX", county: "Lubbock",     year: 2023, trueCrop: "cotton",       options: ["sorghum", "corn", "peanuts"],         sentinelDate: "2023-08-25", cloudCover: 0.0 },
  { id: "ms-bolivar-2022-cotton",   state: "MS", county: "Bolivar",     year: 2022, trueCrop: "cotton",       options: ["soybean", "corn", "rice"],            sentinelDate: "2022-09-12", cloudCover: 0.0 },
  { id: "ga-mitchell-2023-peanuts", state: "GA", county: "Mitchell",    year: 2023, trueCrop: "peanuts",      options: ["cotton", "corn", "soybean"],          sentinelDate: "2023-09-08", cloudCover: 2.3 },
  { id: "al-limestone-2024-cotton", state: "AL", county: "Limestone",   year: 2024, trueCrop: "cotton",       options: ["corn", "soybean", "winter wheat"],    sentinelDate: "2024-08-24", cloudCover: 0.1 },
  { id: "ar-arkansas-2023-rice",    state: "AR", county: "Arkansas",    year: 2023, trueCrop: "rice",         options: ["soybean", "cotton", "corn"],          sentinelDate: "2023-07-27", cloudCover: 0.4 },
  { id: "ar-poinsett-2022-soy",     state: "AR", county: "Poinsett",    year: 2022, trueCrop: "soybean",      options: ["rice", "cotton", "corn"],             sentinelDate: "2022-08-31", cloudCover: 0.0 },
  { id: "la-acadia-2024-rice",      state: "LA", county: "Acadia",      year: 2024, trueCrop: "rice",         options: ["soybean", "sugarcane", "corn"],       sentinelDate: "2024-07-31", cloudCover: 3.5 },
  { id: "ca-fresno-2023-almonds",   state: "CA", county: "Fresno",      year: 2023, trueCrop: "almonds",      options: ["grapes", "pistachios", "tomatoes"],   sentinelDate: "2023-05-31", cloudCover: 0.2 },
  { id: "ca-kern-2022-pistachios",  state: "CA", county: "Kern",        year: 2022, trueCrop: "pistachios",   options: ["almonds", "grapes", "cotton"],        sentinelDate: "2022-05-26", cloudCover: 0.0 },
  { id: "id-bingham-2024-potatoes", state: "ID", county: "Bingham",     year: 2024, trueCrop: "potatoes",     options: ["winter wheat", "alfalfa", "barley"],  sentinelDate: "2024-08-27", cloudCover: 0.0 },
  { id: "wa-whitman-2021-spring-wt",state: "WA", county: "Whitman",     year: 2021, trueCrop: "spring wheat", options: ["winter wheat", "barley", "lentils"],  sentinelDate: "2021-08-29", cloudCover: 0.0 },
  { id: "ca-merced-2023-alfalfa",   state: "CA", county: "Merced",      year: 2023, trueCrop: "alfalfa",      options: ["almonds", "corn silage", "tomatoes"], sentinelDate: "2023-06-03", cloudCover: 0.1 },
  { id: "wi-grant-2023-corn",       state: "WI", county: "Grant",       year: 2023, trueCrop: "corn",         options: ["soybean", "alfalfa", "winter wheat"], sentinelDate: "2023-07-25", cloudCover: 0.7 },
  { id: "mi-huron-2022-soy",        state: "MI", county: "Huron",       year: 2022, trueCrop: "soybean",      options: ["corn", "sugarbeets", "winter wheat"], sentinelDate: "2022-08-27", cloudCover: 0.0 },
  { id: "pa-lancaster-2023-corn",   state: "PA", county: "Lancaster",   year: 2023, trueCrop: "corn",         options: ["soybean", "alfalfa", "winter wheat"], sentinelDate: "2023-08-13", cloudCover: 30.4 },
  { id: "va-rockingham-2024-corn",  state: "VA", county: "Rockingham",  year: 2024, trueCrop: "corn",         options: ["soybean", "alfalfa", "winter wheat"], sentinelDate: "2024-08-25", cloudCover: 0.8 },
];

const ROUNDS_PER_GAME = 8;

// ── DOM refs ─────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const roundEl = $("round");
const totalEl = $("total");
const scoreEl = $("score");
const regionEl = $("region");
const chipImg = $("chip");
const chipMetaEl = $("chip-meta");
const choicesEl = $("choices");
const verdictEl = $("verdict");
const stageEl = $("stage");
const endscreenEl = $("endscreen");
const finalScoreEl = $("final-score");
const finalTotalEl = $("final-total");
const playAgainBtn = $("play-again");
const yearSelect = $("year-filter");

// ── Crop label formatter ─────────────────────────────────────────────
function fmtCrop(c) {
  // Title-case the label. "winter wheat" → "Winter wheat".
  return c.charAt(0).toUpperCase() + c.slice(1);
}

// ── Shuffle (in-place Fisher-Yates) ──────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── State ────────────────────────────────────────────────────────────
let deck = [];
let roundIdx = 0;
let score = 0;
let awaitingNext = false;
let advanceTimer = null;

// ── Year filter ──────────────────────────────────────────────────────
function chipsForYearFilter() {
  const y = yearSelect.value;
  if (y === "all") return CHIPS.slice();
  const n = Number(y);
  return CHIPS.filter((c) => c.year === n);
}

// ── New game ────────────────────────────────────────────────────────
function newGame() {
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
  const pool = chipsForYearFilter();
  // Build deck of ROUNDS_PER_GAME chips, randomized. If filtered pool
  // < ROUNDS_PER_GAME, ride the full pool (shorter game gracefully).
  const want = Math.min(ROUNDS_PER_GAME, pool.length);
  deck = shuffle(pool.slice()).slice(0, want);
  roundIdx = 0;
  score = 0;
  awaitingNext = false;
  totalEl.textContent = String(deck.length);
  scoreEl.textContent = "0";
  endscreenEl.hidden = true;
  stageEl.hidden = false;
  renderRound();
}

// ── Render a round ───────────────────────────────────────────────────
function renderRound() {
  const chip = deck[roundIdx];
  roundEl.textContent = String(roundIdx + 1);
  regionEl.textContent = `${chip.state} · ${chip.county} County · ${chip.year}`;
  chipImg.src = `chips/${chip.id}.png`;
  chipImg.alt = `Sentinel-2 RGB chip of a field in ${chip.county} County, ${chip.state}, captured ${chip.sentinelDate}.`;
  chipMetaEl.textContent = `Sentinel-2 · ${chip.sentinelDate} · ${chip.cloudCover.toFixed(1)}% cloud · ~600m`;
  // Choices — true crop + 3 distractors, shuffled
  const opts = shuffle([chip.trueCrop, ...chip.options]);
  choicesEl.innerHTML = "";
  for (const opt of opts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.dataset.crop = opt;
    btn.textContent = fmtCrop(opt);
    btn.addEventListener("click", () => onPick(btn, opt, chip));
    choicesEl.appendChild(btn);
  }
  verdictEl.textContent = "";
  verdictEl.className = "verdict";
  awaitingNext = false;
}

// ── Round resolution ────────────────────────────────────────────────
function onPick(btn, crop, chip) {
  if (awaitingNext) return;
  awaitingNext = true;
  const right = crop === chip.trueCrop;
  for (const b of choicesEl.querySelectorAll(".choice")) {
    b.disabled = true;
    if (b.dataset.crop === chip.trueCrop) b.classList.add("right");
    else if (b === btn && !right) b.classList.add("wrong");
  }
  if (right) {
    score++;
    scoreEl.textContent = String(score);
    verdictEl.textContent = `Yep — ${fmtCrop(chip.trueCrop)}.`;
    verdictEl.className = "verdict right";
  } else {
    verdictEl.textContent = `Nope — that's ${fmtCrop(chip.trueCrop)}.`;
    verdictEl.className = "verdict wrong";
  }
  advanceTimer = setTimeout(advance, 1500);
}

function advance() {
  advanceTimer = null;
  roundIdx++;
  if (roundIdx >= deck.length) {
    endGame();
    return;
  }
  renderRound();
}

function endGame() {
  stageEl.hidden = true;
  endscreenEl.hidden = false;
  finalScoreEl.textContent = String(score);
  finalTotalEl.textContent = String(deck.length);
}

// ── Wire up ─────────────────────────────────────────────────────────
playAgainBtn.addEventListener("click", newGame);
yearSelect.addEventListener("change", newGame);

// ── postMessage to host: tile is ready ──────────────────────────────
// Matches the uffda sandbox-postmessage protocol (Sprint 16).
try {
  window.parent?.postMessage({ type: "uffda:ready", tile: "guess-the-crop" }, "*");
} catch (_) { /* sandboxed; silent */ }

// Kick off.
newGame();
