/*
 * Guess the Crop — game logic.
 *
 * Self-contained: loads chips.json, shuffles the deck, walks the user
 * through one chip at a time, tallies a score, offers "play again." No
 * external dependencies, no network calls outside the same-folder JSON +
 * PNG fetches the iframe runtime already permits.
 *
 * postMessage handshake:
 *   - On DOMContentLoaded, posts uffda:ready to window.parent so the
 *     wrapper's host bridge can deliver initial state. We don't *consume*
 *     state for gameplay (chips are pre-staged with CDL-truth labels),
 *     but exercising the handshake end-to-end is the lane test.
 *   - Listens for uffda:state / uffda:teardown messages and acks the
 *     teardown by cleaning up. State payload is logged-on-receipt for
 *     debugging but otherwise ignored — the game is intentionally
 *     read-nothing.
 *
 * Voice / UX:
 *   - Plain English. No "Wow!" no emoji. Verdict text is one word + the
 *     truth: "Right. Corn." or "Wrong. That was soy."
 *   - Placeholder caption renders on every chip per the Gate A acceptance.
 */

const TOTAL_ROUNDS = 8; // Matches the deck size shipped in chips.json.

const els = {
  round: document.getElementById("round"),
  total: document.getElementById("total"),
  score: document.getElementById("score"),
  stage: document.getElementById("stage"),
  chip: document.getElementById("chip"),
  chipCaption: document.getElementById("chip-caption"),
  choices: document.getElementById("choices"),
  verdict: document.getElementById("verdict"),
  endscreen: document.getElementById("endscreen"),
  endscreenNote: document.getElementById("endscreen-note"),
  finalScore: document.getElementById("final-score"),
  finalTotal: document.getElementById("final-total"),
  playAgain: document.getElementById("play-again"),
};

const state = {
  deck: [], // shuffled copy of chips.json entries
  index: 0, // current round (0-based)
  score: 0,
  locked: false, // prevents double-click after answering
};

// ─── postMessage handshake (v1 per uffda-ag/uffda canonical contract). ──────
function postReady() {
  // Tile-side outbound: targetOrigin '*' is acceptable because the wrapper
  // verifies inbound origin (same-origin lock). We're the trusted party
  // in the inbound direction; outbound is host-checked.
  window.parent.postMessage({ type: "uffda:ready", version: 1 }, "*");
}

function onHostMessage(event) {
  const data = event && event.data;
  if (!data || typeof data !== "object" || data.version !== 1) return;
  switch (data.type) {
    case "uffda:state":
      // Game doesn't use state for gameplay — log for visibility.
      // eslint-disable-next-line no-console
      console.debug("[guess-the-crop] received uffda:state", data.payload);
      break;
    case "uffda:teardown":
      // Wrapper is unmounting. We don't have persistent listeners to
      // clean up beyond this one — leave it; the iframe is going away.
      // eslint-disable-next-line no-console
      console.debug("[guess-the-crop] host teardown received");
      break;
    default:
      // Unknown / unrecognized — silently drop per protocol.
      break;
  }
}

// ─── Deck management. ──────────────────────────────────────────────────────
async function loadDeck() {
  const res = await fetch("chips.json", { credentials: "omit" });
  if (!res.ok) throw new Error("Failed to load chips.json");
  const deck = await res.json();
  // Fisher-Yates shuffle for variety across replays.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ─── Round flow. ───────────────────────────────────────────────────────────
function renderRound() {
  const chip = state.deck[state.index];
  els.round.textContent = String(state.index + 1);
  els.total.textContent = String(state.deck.length);
  els.score.textContent = String(state.score);
  els.chip.src = `chips/${chip.file}`;
  els.chip.alt = "Satellite-derived chip of an unknown field";
  // Caption is fixed but we restate it on every round to be explicit
  // about the lock (Gate A: caption MUST read on EVERY chip rendering).
  els.chipCaption.textContent =
    "Placeholder chip — real Sentinel-2 in Sprint 17";
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
  const chip = state.deck[state.index];
  const correct = chip.truth === crop;
  if (correct) state.score += 1;
  // Visual feedback on the choice buttons.
  for (const btn of els.choices.querySelectorAll("button")) {
    btn.disabled = true;
    if (btn.dataset.crop === chip.truth) btn.classList.add("right");
    else if (btn.dataset.crop === crop && !correct) btn.classList.add("wrong");
  }
  els.verdict.classList.add(correct ? "right" : "wrong");
  els.verdict.textContent = correct
    ? `Right. ${capitalize(chip.truth)}.`
    : `Wrong. That was ${chip.truth}.`;
  els.score.textContent = String(state.score);

  // Advance after a short pause so the user sees the verdict.
  window.setTimeout(() => {
    state.index += 1;
    if (state.index >= state.deck.length) {
      showEnd();
    } else {
      renderRound();
    }
  }, 950);
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
  if (ratio === 1) return "Clean sweep. Calibrated eye.";
  if (ratio >= 0.75) return "Strong read. Most agronomists land here.";
  if (ratio >= 0.5) return "Decent. Corn and soy fool everyone at first.";
  if (ratio > 0) return "Tough deck. Real chips will be sharper.";
  return "Tough deck. Try the deck again.";
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Wire-up. ──────────────────────────────────────────────────────────────
els.choices.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const btn = target.closest("button.choice");
  if (!btn) return;
  const crop = btn.dataset.crop;
  if (crop) onChoice(crop);
});

els.playAgain.addEventListener("click", async () => {
  state.deck = await loadDeck();
  state.index = 0;
  state.score = 0;
  els.stage.hidden = false;
  els.endscreen.hidden = true;
  renderRound();
});

window.addEventListener("message", onHostMessage);

(async function init() {
  state.deck = await loadDeck();
  renderRound();
  // Tell the host we're ready. Host responds with uffda:state.
  postReady();
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[guess-the-crop] init failed", err);
  els.verdict.textContent = "Couldn't load the chip deck.";
});
