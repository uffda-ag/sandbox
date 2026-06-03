# Test protocol — how we validate the reversal detector on real fields

The point of this doc: when boundaries arrive (your friend's fields, a research
station, anything), we already know *exactly* how we ingest and test them — no
scrambling. Works whether or not the fields come with a known history.

---

## 1. What we ask for with a field (intake)

**Required:**
- A **boundary** — GeoJSON preferred; Shapefile / KML / KMZ / a drawn polygon all
  fine (I convert). One polygon per field.

**Gold (ask, but don't block on it):**
- **Known practice history** — for each field, which years were regenerative
  (cover crop and/or no-till) and which year (if any) it reverted. Even rough is
  gold: "no-till + rye cover 2017–2020, went conventional/tilled ~2021."
- **Crop** if known (we can also derive it from CDL).
- A **contact** who can confirm a verdict later.

**Friend-ask, copy-paste:** *"Can you send the field boundaries (any GIS format),
and for each one, anything you know about its cover-crop / tillage history —
especially if/when it switched back to conventional, even approximate years?"*

---

## 2. Two test modes (the field's history decides which)

**Mode A — Labeled field (we know the reversal year).** The real validation.
We ask: does the detector **rank the true reversal year at/near the top**, and do
known-**stable** fields stay **unflagged**?
- Metrics: hit@1 / hit@2 on the true reversal year; false-positive rate on
  known-stable fields; lead/lag error (did we flag the right year, or ±1?).

**Mode B — Unlabeled field (boundary only).** Calibration + label-building.
Run detector → drill-down dense filmstrip on each flag → **human verdict**
(real / not real / unsure) → save to `labels.csv`. Every verdict grows the
ground-truth set, which is the actual asset.

---

## 3. Pipeline per field (the standard run)

1. **Ingest + validate** geometry — single polygon, sane area, reproject to
   EPSG:4326.
2. **Crop history** — pull CDL per year; label each year's crop. *(This also
   feeds the crop-conditioning in step 4.)*
3. **Baseline** — a known-regenerative year if provided; else earliest clean year.
4. **Conditioned detection** —
   - *Embedding anomaly (crop + weather conditioned):* compare the field to the
     **regional same-crop fingerprint for that year**, not to its own past. The
     reversal signal is a **change over time** in how far the field sits from its
     crop's regional norm (see `## Method notes` below).
   - *Seasonal evidence (direction):* off-season NDRE (cover-crop tell), NDTI
     (residue/tillage), Sentinel-1 SAR (tillage disturbance).
5. **Output** —
   - ranked candidate reversal years (score + the evidence behind each),
   - the multi-year overview filmstrip,
   - a **dense before/after zoom** filmstrip for each flagged year (every
     cloud-free pass across the transition window — the close-proximity visual
     check).
6. **Verdict capture** — append to `labels.csv`:
   `parcel_id, year, score, drivers, verdict, confidence, notes, reviewer, date`.

---

## 4. Success criteria (once we have ground truth)

- **Detection:** true reversal year in **top-1** (stretch) or **top-2**
  (acceptable) by score.
- **Specificity:** known-stable fields produce **no** flag above threshold.
- **Timing:** flagged year within **±1** of the actual transition.
- **Calibrate, then hold out:** tune thresholds on a training split once we have
  **~10–15 labeled fields**; report metrics on a held-out split so we're not
  grading our own homework.

---

## 5. Honesty rules (so we never overclaim)

- **Boundary-only fields = calibration, not validation.** We can prove the
  pipeline and eyeball plausibility, but we cannot claim accuracy without labels.
- **One field is an anecdote.** Real accuracy numbers need a labeled set across
  multiple fields, crops, and regions.
- **Log every dropped/uncertain case.** A flag we couldn't visually confirm is
  "unsure," not a silent success.

---

## 6. Artifacts

- `parcels.geojson` — the fields under test (boundaries + any known history).
- `labels.csv` — the growing ground-truth / verdict log. **The durable asset.**
- `regen_reversal_mvp_run.html` — per-batch results (charts + filmstrips).

---

## 7. Calibration vs. validation — leak-free design (the anti-overfit rule)

**The risk:** if the same labeled fields build, tune, *and* judge the system — or
if the agent doing the tuning (Claude) can see the validation labels — the score
is fiction. We'd be grading our own homework, and any "accuracy" would just be
memorization. To validate *legitimately* and still improve over time, we use a
three-way split and **sequester the last set from the development loop.**

**Three sets:**
- **Calibration / train (visible):** fields + labels Claude sees and tunes on
  freely.
- **Dev / tuning (visible):** fields + labels Claude uses to choose thresholds and
  model variants — the day-to-day "is this version better?" set.
- **Held-out validation (HIDDEN from Claude):** **Nick holds these labels.**
  Claude gets the field *geometries* (needed to run the model) but **never** the
  labels. Scored only at milestones.

**Split rule:** deterministic + documented (e.g., hash of plot ID → 60% cal /
20% dev / 20% held-out) or Nick hand-picks the held-out set. Rule-based assignment
means Claude can't cherry-pick favorable held-out fields.

**Leak-free scoring harness (`score_holdout.py`):**
- *Input:* Claude's `predictions.csv` (per field-year score/class) + Nick's
  private `holdout_labels.csv`.
- *Output:* **aggregate metrics ONLY** (precision, recall, F1, hit@k, confusion
  counts) → `scoreboard.md`. No per-field truth is ever returned.
- Run **sparingly** — a "test budget," each peek logged — so repeated aggregate
  feedback can't slowly leak the answers either.

**Who holds what:**
- *Claude:* cal + dev fields & labels; all held-out field *geometries*; the model
  code; `predictions.csv`.
- *Nick (keeper):* `holdout_labels.csv`, kept outside Claude's working path; owns/
  runs the scorer; reports back the scoreboard.

**Improvement loop (leak-free):** tune on cal → select on dev → at a milestone,
predict on held-out → Nick scores → we read the aggregate numbers (not labels) →
iterate. The held-out set stays a genuine unseen test.

---

## 8. Where the real labels come from (verified sources)

- **Primary, downloadable now — KBS LTER Main Cropping System Experiment**
  (Kellogg Biological Station, MI). Plot center coordinates + documented
  treatment logs (1988–2020): tillage class (conventional / no-till) and
  cover-crop presence per treatment per year. *This is our gold-standard labeled
  source.* Shape note: treatments are **stable** per plot, so it's ideal for the
  **per-year practice classifier** (can the signal tell regen from conventional
  at all?); a *reversal* then = the year a field's predicted class flips. For true
  in-the-wild reversal *events* we still want changed commercial fields (your
  friend's, or treatment-change plots) later.
- **Maryland winter cover-crop (USGS data release)** — real enrolled-field
  cover-crop labels; boundaries are privacy-protected → request under a data-use
  agreement. Good breadth add.
- **Emerging field-level practice maps** (MDPI *Land* 2024 CONUS regen-ag maps;
  South Dakota cover-crop/tillage 2024) — availability unconfirmed; worth an
  author request for a CONUS-wide labeled layer.
- **Not usable for field-level truth:** OpTIS, CEAP, CSP (all aggregated for
  producer privacy); FTW/CSB (boundaries/crop only, no practice labels).

---

## Method notes (the two open method points)

**Crop + weather conditioning (why raw embedding drift is misleading).**
The AlphaEarth annual embedding is dominated by *what grew there* — so on a
corn/soy field, year-to-year drift mostly tracks the **rotation flip**, not a
practice change. Fix: condition on crop and weather by comparing the field to the
**average embedding of all same-crop fields in the surrounding region that same
year**. Same crop controls the rotation; same year+region controls the weather
(every peer experienced it). A distinctively regenerative field sits *far* from
that mostly-conventional regional norm; if it reverts, it moves *toward* the norm
— so the detector watches for a **shift over time** in that distance, with the
seasonal lines giving the direction (regen→conv vs conv→regen).

**Dense before/after imagery for flagged years.** The annual filmstrip is for the
multi-year overview only. To *examine* a flagged transition you need tight
before/afters — every cloud-free pass (~biweekly) from the season before to the
season after, weighted toward the **Oct–May off-season** where cover-crop and
tillage changes are visible.
