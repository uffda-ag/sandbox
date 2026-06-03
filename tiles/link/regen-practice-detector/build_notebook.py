"""Builds regen_reversal_mvp.ipynb from plain cell definitions.

Uses only the stdlib (json) so it runs anywhere — no nbformat dependency.
Re-run to regenerate the notebook after editing cells here.
"""
import json
import os

CELLS = []
_CID = [0]


def _cid():
    _CID[0] += 1
    return f"cell{_CID[0]:02d}"


def md(text):
    CELLS.append({
        "cell_type": "markdown",
        "metadata": {},
        "id": _cid(),
        "source": _lines(text),
    })


def code(text):
    CELLS.append({
        "cell_type": "code",
        "metadata": {},
        "id": _cid(),
        "execution_count": None,
        "outputs": [],
        "source": _lines(text),
    })


def _lines(text):
    # Strip a single leading newline (lets us write triple-quoted blocks cleanly),
    # keep trailing newline handling nbformat-friendly (each line ends in \n except last).
    text = text.lstrip("\n").rstrip("\n")
    lines = text.split("\n")
    return [ln + "\n" for ln in lines[:-1]] + [lines[-1]]


# ---------------------------------------------------------------------------
md(r"""
# Regenerative-Ag **Reversal** Detector — parcel-level geoAI MVP

*Personal prototype. Free / open tools only. Built 2026-06-03.*

**Goal:** for a given field (parcel), detect when a regenerative practice
(**cover crop** or **no-till**) appears to have **reverted to conventional**
(bare winter fallow / full tillage). Event-based, per-parcel, knowledge-guided.

## The approach (why this shape)

Two signals, run in **parallel**, then fused into a per-parcel reversal score:

1. **Backbone embeddings — "something changed."**
   Google/DeepMind **AlphaEarth "Satellite Embedding"** annual dataset on Earth
   Engine (`GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL`): a 64-dim, **10 m per-pixel**,
   annual embedding, available since 2017, CC-BY-4.0. We take the mean embedding
   per parcel per year and measure **year-over-year drift from a baseline year**.
   This is a sensitive "the system changed" detector but it does **not** tell you
   *what* changed.

   *Why AlphaEarth over LGND / Clay here?* LGND's `lgnd-embeddings` and Clay are
   also free (CC-BY-4.0) and excellent, but the released embedding tiles are
   ~**2.56 km patch** resolution — too coarse to characterize a single field.
   AlphaEarth is per-pixel at 10 m, which is what parcel-level work needs. We
   still **peek at the LGND GeoParquet** in an optional cell below so you can feel
   the format (it's the better choice for *regional* / similarity-search work).

2. **Seasonal index time series — "what changed."**
   Annual embeddings **wash out the seasonal signal** that cover crops live in
   (the green-up happens *between* cash crops). So we run a parallel
   **Sentinel-2** seasonal series:
   - **NDVI / NDRE** — winter / shoulder-season green cover (the cover-crop tell).
   - **NDTI** — tillage / crop-residue index (residue cover after harvest).
   plus a **Sentinel-1 SAR** backscatter series (VV/VH) as a
   **tillage-event** detector that doesn't care about clouds.

**Detection logic:** pick a baseline year you believe was regenerative →
flag a later year as a candidate **reversal** when AlphaEarth drift is high
**and** the seasonal evidence is consistent with reversal (off-season green
cover collapses, and/or tillage signal rises). Rank candidates; a human
confirms. Start with **indices + a light classifier**; only fine-tune a
foundation model (Prithvi / Clay via TerraTorch) **later**, once you have
labeled reversals to train on.
""")

md(r"""
## ⚠️ Gotchas — read before you trust a flag

- **Residue / tillage indices are noisy.** NDTI-type residue estimates land
  around **R² ≈ 0.5–0.7** against ground truth and are **confoundable** by
  residue moisture, soil color/type, crop type, and sun angle. Treat tillage
  signal as *corroborating* evidence, never a sole trigger. SAR (Sentinel-1)
  helps because it responds to surface roughness changes directly.
- **Planet NICFI free tier ended in 2025** — don't design around it. Everything
  here is Sentinel-2/-1 + AlphaEarth, all free.
- **The embedding ecosystem is fragmented** (different patch sizes, band orders,
  normalizations, hosting). When you go past this MVP, lean on **TorchGeo /
  TerraTorch loaders** instead of hand-rolling readers — they paper over a lot of
  format drift.
- **Annual embeddings ≠ seasonal truth.** AlphaEarth compresses a whole year; it
  will under-react to a cover crop that's only green for 8 weeks. That's *why*
  the Sentinel-2/-1 seasonal series exists — don't drop it to "simplify."
- **Cover-crop absence ≠ reversal.** A wet fall, an early freeze, or a cash-crop
  rotation change can all suppress winter green-up without a practice change.
  Baseline-relative scoring + a human in the loop is the guardrail.
- **Don't fine-tune yet.** Fine-tuning Prithvi/Clay before you have labeled
  reversals just overfits noise. Earn the labels first (this notebook produces
  ranked candidates → confirm a handful → *then* train).
""")

md(r"""
## ✅ "Run this week" checklist

1. **Get Earth Engine access** — sign up at https://earthengine.google.com,
   create / pick a Google Cloud project with the Earth Engine API enabled, then
   `earthengine authenticate` (or run the auth cell below once). Put your project
   id in `EE_PROJECT`.
2. **Drop in one real field.** Replace `parcels.geojson` with a boundary you
   actually know the history of (one you can ground-truth). Set its
   `baseline_year` to a year you believe was regenerative.
3. **Run top-to-bottom** on that one field. Eyeball the three-panel chart: does
   the AlphaEarth drift line spike in the year you suspect? Does off-season NDVI
   drop / NDTI rise in the same year?
4. **Tune the two thresholds** (`DRIFT_Z`, seasonal deltas) on that known field
   until the flag matches your knowledge. *Then* add 2–3 more fields.
5. **Log every flag + your verdict** (true/false reversal). That CSV is your
   first labeled training set — the on-ramp to a classifier, then fine-tuning.
6. *(Optional)* Run the **DuckDB / LGND** peek to feel the GeoParquet embedding
   format for later regional / similarity work.

> **Need boundaries?** Bring-your-own GeoJSON is the MVP path. When you only have
> imagery, **Fields of the World** (fieldsofthe.world) and **Delineate Anything**
> are the go-to open field-boundary sources/models.
""")

# ---------------------------------------------------------------------------
md(r"""
---
## 0 · Setup & authentication

If a package is missing, uncomment the install line. `earthengine-api` +
`geemap` are the only heavy deps; the rest are standard PyData.
""")

code(r"""
# One-time install (uncomment if needed):
# %pip install earthengine-api geemap pandas numpy matplotlib scikit-learn duckdb

import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

import ee
import geemap

# ---- EDIT ME -------------------------------------------------------------
# Your Google Cloud / Earth Engine project id (override with the EE_PROJECT env var).
EE_PROJECT = os.environ.get("EE_PROJECT", "your-gcp-project-id")
# --------------------------------------------------------------------------

try:
    ee.Initialize(project=EE_PROJECT)
except Exception:
    # First run on a new machine: opens a browser / prints a URL for a token.
    ee.Authenticate()
    ee.Initialize(project=EE_PROJECT)

print("Earth Engine initialized:", ee.String("ok").getInfo())
""")

# ---------------------------------------------------------------------------
md(r"""
---
## 1 · Parcels (bring-your-own boundaries)

The MVP reads a local **`parcels.geojson`** (shipped alongside this notebook with
3 placeholder US-Midwest fields). Each feature carries:

- `parcel_id` — stable id
- `name` — human label
- `baseline_year` — the year you believe the parcel was regenerative (the
  reference for drift + seasonal comparison)

Swap in your own fields and set each `baseline_year`. If the file is missing we
fall back to an inline copy so the notebook still runs.
""")

code(r"""
HERE = Path.cwd()
GEOJSON_PATH = HERE / "parcels.geojson"

# Inline fallback (3 placeholder ~80-acre fields: Story Co. IA, Champaign &
# McLean Co. IL). REPLACE with your own — these are illustrative only.
FALLBACK_GEOJSON = {
    "type": "FeatureCollection",
    "features": [
        {"type": "Feature",
         "properties": {"parcel_id": "PLACEHOLDER-001", "name": "Placeholder field (REPLACE ME)",
                         "baseline_year": 2019},
         "geometry": {"type": "Polygon", "coordinates": [[
             [-89.650, 39.800], [-89.640, 39.800],
             [-89.640, 39.808], [-89.650, 39.808], [-89.650, 39.800]]]}},
        {"type": "Feature",
         "properties": {"parcel_id": "IL-CHAMPAIGN-001", "name": "Champaign Co. IL (demo)",
                         "baseline_year": 2019},
         "geometry": {"type": "Polygon", "coordinates": [[
             [-88.210, 40.100], [-88.200, 40.100],
             [-88.200, 40.108], [-88.210, 40.108], [-88.210, 40.100]]]}},
        {"type": "Feature",
         "properties": {"parcel_id": "IL-MCLEAN-001", "name": "McLean Co. IL (demo)",
                         "baseline_year": 2019},
         "geometry": {"type": "Polygon", "coordinates": [[
             [-88.900, 40.500], [-88.890, 40.500],
             [-88.890, 40.508], [-88.900, 40.508], [-88.900, 40.500]]]}},
    ],
}

if GEOJSON_PATH.exists():
    gj = json.loads(GEOJSON_PATH.read_text())
    print(f"Loaded {GEOJSON_PATH.name}")
else:
    gj = FALLBACK_GEOJSON
    print("parcels.geojson not found — using inline fallback fields.")

# Optional fast-demo subset (set DEMO_PARCELS env var to a comma list of
# parcel_ids; full set used by default).
_subset = os.environ.get("DEMO_PARCELS")
if _subset:
    keep = {s.strip() for s in _subset.split(",")}
    gj = {**gj, "features": [f for f in gj["features"]
                             if f["properties"]["parcel_id"] in keep]}
    print(f"DEMO_PARCELS active -> {sorted(keep)}")

parcels = ee.FeatureCollection(gj["features"])
PARCEL_META = {f["properties"]["parcel_id"]: f["properties"] for f in gj["features"]}
PARCEL_GEOM = {f["properties"]["parcel_id"]: ee.Geometry(f["geometry"])
               for f in gj["features"]}

print(f"{len(PARCEL_META)} parcels:")
for pid, m in PARCEL_META.items():
    print(f"  {pid:18s} baseline={m['baseline_year']}  ({m['name']})")

# Analysis window. AlphaEarth is annual since 2017.
# (Override with DEMO_YEARS env var, e.g. "2019,2021,2023", for a fast run.)
YEARS = list(range(2018, 2025))
_years = os.environ.get("DEMO_YEARS")
if _years:
    YEARS = [int(y) for y in _years.split(",")]
""")

# ---------------------------------------------------------------------------
md(r"""
---
## 2 · AlphaEarth annual embeddings → year-over-year drift ("*something* changed")

`GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL` is a 64-band image collection (bands
`A00`…`A63`), one annual layer at 10 m. We take the **mean embedding vector per
parcel per year** with a `reduceRegion`, pull the small result client-side, and
measure drift.

AlphaEarth embeddings are (approximately) **unit-length**, so we use
**cosine distance** `1 − cos(θ)` between the baseline-year vector and each later
year. A larger value = the field's annual "fingerprint" moved further from its
regenerative baseline. With only a handful of parcels, doing the vector math
client-side with NumPy is the clearest approach.
""")

code(r"""
AE = ee.ImageCollection("GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL")
BANDS = [f"A{ i:02d}" for i in range(64)]

def embedding_vector(geom, year):
    # Mean 64-d AlphaEarth embedding over `geom` for `year` (None if no data).
    img = (AE.filterBounds(geom)
             .filterDate(f"{year}-01-01", f"{year}-12-31")
             .mosaic())
    stats = img.reduceRegion(
        reducer=ee.Reducer.mean(), geometry=geom, scale=10, maxPixels=1e9)
    d = stats.getInfo()
    if not d or d.get("A00") is None:
        return None
    return np.array([d[b] for b in BANDS], dtype=float)

def cosine_distance(a, b):
    if a is None or b is None:
        return np.nan
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return np.nan if denom == 0 else 1.0 - float(np.dot(a, b) / denom)

# Pull per-parcel/per-year vectors (a few getInfo calls per parcel — fine at MVP scale).
emb = {}   # pid -> {year -> vector}
for pid, geom in PARCEL_GEOM.items():
    emb[pid] = {}
    for y in YEARS:
        emb[pid][y] = embedding_vector(geom, y)
    got = [y for y in YEARS if emb[pid][y] is not None]
    print(f"{pid}: embeddings for years {got}")

# Drift from each parcel's baseline year.
drift_rows = []
for pid, meta in PARCEL_META.items():
    base_y = int(meta["baseline_year"])
    base_v = emb[pid].get(base_y)
    for y in YEARS:
        drift_rows.append({
            "parcel_id": pid, "year": y,
            "embed_drift": cosine_distance(base_v, emb[pid].get(y)),
        })
drift_df = pd.DataFrame(drift_rows)
drift_df.pivot(index="year", columns="parcel_id", values="embed_drift")
""")

# ---------------------------------------------------------------------------
md(r"""
---
## 3 · Sentinel-2 seasonal indices ("*what* changed")

Monthly composites of three indices, per parcel:

- **NDVI** `(B8−B4)/(B8+B4)` — overall greenness.
- **NDRE** `(B8−B5)/(B8+B5)` — red-edge greenness, more sensitive to sparse /
  early cover-crop canopy.
- **NDTI** `(B11−B12)/(B11+B12)` — tillage / residue index (higher ≈ more crop
  residue / less tillage).

We mask clouds with **Cloud Score+** (`GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED`),
the current free best-practice S2 mask, then median-composite each month.
""")

code(r"""
S2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
CSPLUS = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
CS_BAND = "cs"            # 0 (cloud) .. 1 (clear)
CS_THRESH = 0.6

def add_indices(img):
    ndvi = img.normalizedDifference(["B8", "B4"]).rename("NDVI")
    ndre = img.normalizedDifference(["B8", "B5"]).rename("NDRE")
    ndti = img.normalizedDifference(["B11", "B12"]).rename("NDTI")
    return img.addBands([ndvi, ndre, ndti])

def s2_monthly(geom, year, month):
    start = ee.Date.fromYMD(year, month, 1)
    end = start.advance(1, "month")
    coll = (S2.filterBounds(geom).filterDate(start, end)
              .linkCollection(CSPLUS, [CS_BAND])
              .map(lambda im: im.updateMask(im.select(CS_BAND).gte(CS_THRESH)))
              .map(add_indices))
    composite = coll.select(["NDVI", "NDRE", "NDTI"]).median()
    stats = composite.reduceRegion(
        reducer=ee.Reducer.mean(), geometry=geom, scale=10, maxPixels=1e9)
    return stats.getInfo()

# Build the monthly S2 series. (Parcels x years x 12 getInfo calls — fine for an
# MVP of a few fields; for many parcels, switch to a server-side reduceRegions map.)
s2_rows = []
for pid, geom in PARCEL_GEOM.items():
    for y in YEARS:
        for m in range(1, 13):
            d = s2_monthly(geom, y, m) or {}
            s2_rows.append({
                "parcel_id": pid, "year": y, "month": m,
                "date": pd.Timestamp(year=y, month=m, day=15),
                "NDVI": d.get("NDVI"), "NDRE": d.get("NDRE"), "NDTI": d.get("NDTI"),
            })
s2_df = pd.DataFrame(s2_rows)
print(f"S2 series: {len(s2_df)} parcel-months")
s2_df.head()
""")

# ---------------------------------------------------------------------------
md(r"""
---
## 4 · Sentinel-1 SAR backscatter ("tillage events, cloud-free")

Sentinel-1 C-band backscatter (VV / VH, dB) responds to **surface roughness and
soil moisture** — a tillage pass is a step change in roughness, visible even
under cloud. We take monthly mean VV/VH per parcel from `COPERNICUS/S1_GRD`
(IW, ground-range-detected). A sharp VV rise after harvest is consistent with a
tillage event (residue buried, surface roughened); persistent residue cover under
no-till tends to be steadier.
""")

code(r"""
S1 = (ee.ImageCollection("COPERNICUS/S1_GRD")
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
        .select(["VV", "VH"]))

def s1_monthly(geom, year, month):
    start = ee.Date.fromYMD(year, month, 1)
    end = start.advance(1, "month")
    composite = S1.filterBounds(geom).filterDate(start, end).mean()
    stats = composite.reduceRegion(
        reducer=ee.Reducer.mean(), geometry=geom, scale=10, maxPixels=1e9)
    return stats.getInfo()

s1_rows = []
for pid, geom in PARCEL_GEOM.items():
    for y in YEARS:
        for m in range(1, 13):
            d = s1_monthly(geom, y, m) or {}
            s1_rows.append({
                "parcel_id": pid, "year": y, "month": m,
                "date": pd.Timestamp(year=y, month=m, day=15),
                "VV": d.get("VV"), "VH": d.get("VH"),
            })
s1_df = pd.DataFrame(s1_rows)
print(f"S1 series: {len(s1_df)} parcel-months")
s1_df.head()
""")

# ---------------------------------------------------------------------------
md(r"""
---
## 5 · Seasonal features per parcel-year

Collapse the monthly series into a few interpretable **per parcel-year**
features that bear on reversal:

- `offseason_green` — mean NDRE over the **off-season window** (Nov–Apr, when a
  cover crop would be the only thing green). A drop vs. baseline = lost cover.
- `min_ndvi` — annual minimum NDVI (how bare the field gets at its barest).
- `peak_ndti` — max monthly NDTI (residue peak; a drop = more tillage).
- `vv_range` — within-year VV swing (a proxy for disturbance/tillage events).

Then express each as a **delta vs. the parcel's baseline year**, so scoring is
relative to that field's own regenerative reference rather than absolute values.
""")

code(r"""
OFFSEASON_MONTHS = [11, 12, 1, 2, 3, 4]

def season_features(df_s2, df_s1, pid, year):
    s2y = df_s2[(df_s2.parcel_id == pid) & (df_s2.year == year)]
    s1y = df_s1[(df_s1.parcel_id == pid) & (df_s1.year == year)]
    off = s2y[s2y.month.isin(OFFSEASON_MONTHS)]
    return {
        "offseason_green": off["NDRE"].mean(),
        "min_ndvi": s2y["NDVI"].min(),
        "peak_ndti": s2y["NDTI"].max(),
        "vv_range": (s1y["VV"].max() - s1y["VV"].min()),
    }

feat_rows = []
for pid, meta in PARCEL_META.items():
    base_y = int(meta["baseline_year"])
    base = season_features(s2_df, s1_df, pid, base_y)
    for y in YEARS:
        cur = season_features(s2_df, s1_df, pid, y)
        feat_rows.append({
            "parcel_id": pid, "year": y,
            **cur,
            # deltas vs baseline (sign chosen so "more reversal-like" is positive)
            "d_offseason_green": (base["offseason_green"] - cur["offseason_green"]),
            "d_min_ndvi":        (base["min_ndvi"] - cur["min_ndvi"]),
            "d_peak_ndti":       (base["peak_ndti"] - cur["peak_ndti"]),
            "d_vv_range":        (cur["vv_range"] - base["vv_range"]),
        })
feat_df = pd.DataFrame(feat_rows)
feat_df.head()
""")

# ---------------------------------------------------------------------------
md(r"""
---
## 6 · Reversal-flagging heuristic (knowledge-guided)

A deliberately **simple, transparent** rule for the MVP — no training required:

1. **Gate on change:** AlphaEarth drift must exceed the parcel's own noise floor.
   We z-score each parcel's drift series and require `drift_z ≥ DRIFT_Z`
   ("*something* changed, beyond this field's normal year-to-year wobble").
2. **Corroborate with seasonal evidence** ("*what* changed"): build a small score
   from the baseline-relative deltas — lost off-season green cover, a barer
   minimum, less residue, more SAR disturbance.
3. **Flag** a parcel-year when the change gate is open **and** the seasonal score
   is positive; **rank** by the combined score.

Tune `DRIFT_Z` and the weights on one field you know, then generalize. The
`reversal_score` is a *triage ranking*, not a probability — a human confirms.
""")

code(r"""
DRIFT_Z = 1.0   # how many SDs above a parcel's own mean drift counts as "changed"

df = (feat_df
      .merge(drift_df, on=["parcel_id", "year"], how="left"))

# Per-parcel z-score of embedding drift (its own noise floor).
df["drift_z"] = df.groupby("parcel_id")["embed_drift"].transform(
    lambda s: (s - s.mean()) / (s.std(ddof=0) if s.std(ddof=0) else 1.0))

# Seasonal evidence score: weighted, normalized-ish deltas. Off-season green loss
# (cover-crop tell) and residue loss (tillage tell) carry the most weight.
def z(s):
    sd = s.std(ddof=0)
    return (s - s.mean()) / (sd if sd else 1.0)

df["seasonal_score"] = (
    1.5 * z(df["d_offseason_green"]).fillna(0) +
    1.0 * z(df["d_peak_ndti"]).fillna(0) +
    0.7 * z(df["d_min_ndvi"]).fillna(0) +
    0.5 * z(df["d_vv_range"]).fillna(0)
)

change_gate = df["drift_z"] >= DRIFT_Z
df["reversal_flag"] = change_gate & (df["seasonal_score"] > 0)
df["reversal_score"] = np.where(
    change_gate, df["drift_z"] * df["seasonal_score"].clip(lower=0), 0.0)

ranked = (df[df["reversal_flag"]]
          .sort_values("reversal_score", ascending=False)
          [["parcel_id", "year", "reversal_score", "drift_z",
            "seasonal_score", "d_offseason_green", "d_peak_ndti"]])
print("Candidate reversals (ranked):")
ranked if len(ranked) else "No parcel-year cleared both gates at current thresholds."
""")

md(r"""
> **When you have labels, graduate from the heuristic to a light classifier.**
> Keep the same features; let the model learn the weights. Stub:

```python
# from sklearn.ensemble import RandomForestClassifier
# FEATS = ["embed_drift", "drift_z", "d_offseason_green", "d_min_ndvi",
#          "d_peak_ndti", "d_vv_range"]
# labeled = df.dropna(subset=FEATS).merge(your_labels, on=["parcel_id", "year"])
# clf = RandomForestClassifier(n_estimators=300, class_weight="balanced")
# clf.fit(labeled[FEATS], labeled["is_reversal"])
# df["reversal_prob"] = clf.predict_proba(df[FEATS])[:, 1]
```
> Only **after** a classifier plateaus is it worth fine-tuning a foundation model
> (Prithvi / Clay via **TerraTorch**) on imagery chips for the confirmed events.
""")

# ---------------------------------------------------------------------------
md(r"""
---
## 7 · Visualize

Per-parcel three-panel view: AlphaEarth **drift** (annual), the **seasonal
indices** (monthly NDVI/NDRE/NDTI), and **SAR VV** — with flagged years shaded.
Read it as: a drift spike that lines up with off-season green collapse / residue
drop is a believable reversal; a drift spike with no seasonal story is suspect.
""")

code(r"""
def plot_parcel(pid):
    meta = PARCEL_META[pid]
    fig, ax = plt.subplots(3, 1, figsize=(11, 9), sharex=False)
    fig.suptitle(f"{pid} — {meta['name']}  (baseline {meta['baseline_year']})",
                 fontweight="bold")

    # Panel 1: AlphaEarth drift (annual)
    dd = drift_df[drift_df.parcel_id == pid].sort_values("year")
    ax[0].plot(dd["year"], dd["embed_drift"], "o-", color="#b5651d")
    ax[0].set_ylabel("AlphaEarth\ndrift (cos dist)")
    ax[0].set_title("'Something changed' — embedding drift from baseline")

    # Panel 2: seasonal indices (monthly)
    ss = s2_df[s2_df.parcel_id == pid].sort_values("date")
    ax[1].plot(ss["date"], ss["NDVI"], label="NDVI", color="#2e7d32")
    ax[1].plot(ss["date"], ss["NDRE"], label="NDRE", color="#66bb6a")
    ax[1].plot(ss["date"], ss["NDTI"], label="NDTI (residue)", color="#8d6e63")
    ax[1].axhline(0, color="grey", lw=0.5)
    ax[1].set_ylabel("S2 index"); ax[1].legend(loc="upper right", fontsize=8)
    ax[1].set_title("'What changed' — seasonal indices")

    # Panel 3: SAR VV (monthly)
    s1 = s1_df[s1_df.parcel_id == pid].sort_values("date")
    ax[2].plot(s1["date"], s1["VV"], color="#1565c0")
    ax[2].set_ylabel("S1 VV (dB)"); ax[2].set_title("Tillage proxy — SAR backscatter")

    # Shade flagged years across all panels
    flagged = df[(df.parcel_id == pid) & (df.reversal_flag)]["year"].tolist()
    for y in flagged:
        ax[0].axvspan(y - 0.4, y + 0.4, color="red", alpha=0.12)
        for a in ax[1:]:
            a.axvspan(pd.Timestamp(y, 1, 1), pd.Timestamp(y, 12, 31),
                      color="red", alpha=0.10)
    if flagged:
        ax[0].text(0.01, 0.95, f"flagged: {flagged}", transform=ax[0].transAxes,
                   va="top", fontsize=8, color="red")
    plt.tight_layout()
    plt.show()

for pid in PARCEL_META:
    plot_parcel(pid)
""")

# ---------------------------------------------------------------------------
md(r"""
---
## 7b · Eye test — true-color "filmstrip" vs. the index series

The trust-your-eyes check. For each field: a strip of **actual true-color
satellite snapshots**, one per year — top row = growing season (Jun–Aug),
middle row = early-spring off-season (Mar–Apr, when a cover crop would be the
only green thing) — with the **index time series** beneath, sharing the
timeline. Ask yourself: does a flagged (red) year actually *look* different in
the raw imagery — greener off-season cover lost, more bare/tilled soil? If the
charts and your eyes agree, the flag is believable.
""")

code(r"""
import urllib.request
from io import BytesIO

def truecolor_thumb(geom, year, m0, m1, dims=220):
    # Median cloud-masked true-color (RGB) chip for a month window, as an array.
    start = ee.Date.fromYMD(year, m0, 1)
    end = ee.Date.fromYMD(year, m1, 1).advance(1, "month")
    coll = (S2.filterBounds(geom).filterDate(start, end)
              .linkCollection(CSPLUS, [CS_BAND])
              .map(lambda im: im.updateMask(im.select(CS_BAND).gte(CS_THRESH))))
    img = coll.median().visualize(bands=["B4", "B3", "B2"], min=0, max=3000)
    url = img.getThumbURL({"region": geom, "dimensions": dims, "format": "png"})
    with urllib.request.urlopen(url) as resp:
        return plt.imread(BytesIO(resp.read()), format="png")

def eye_test(pid):
    geom = PARCEL_GEOM[pid]
    meta = PARCEL_META[pid]
    rows = [("growing\nJun–Aug", 6, 8), ("off-season\nMar–Apr", 3, 4)]
    n = len(YEARS)
    fig = plt.figure(figsize=(max(8, 1.7 * n), 8))
    gs = fig.add_gridspec(3, n, height_ratios=[1, 1, 1.5], hspace=0.15, wspace=0.06)
    for r, (label, m0, m1) in enumerate(rows):
        for j, y in enumerate(YEARS):
            ax = fig.add_subplot(gs[r, j])
            try:
                ax.imshow(truecolor_thumb(geom, y, m0, m1))
            except Exception:
                ax.text(0.5, 0.5, "no clear\nimage", ha="center", va="center",
                        fontsize=7, color="grey")
            ax.set_xticks([]); ax.set_yticks([])
            if r == 0:
                ax.set_title(str(y), fontsize=9)
            if j == 0:
                ax.set_ylabel(label, fontsize=8, rotation=0, ha="right", va="center")
    # Bottom: the index series, aligned to the same year columns.
    axb = fig.add_subplot(gs[2, :])
    ss = s2_df[s2_df.parcel_id == pid].sort_values("date")
    axb.plot(ss["date"], ss["NDVI"], label="NDVI", color="#2e7d32")
    axb.plot(ss["date"], ss["NDRE"], label="NDRE", color="#66bb6a")
    axb.plot(ss["date"], ss["NDTI"], label="NDTI (residue)", color="#8d6e63")
    for y in df[(df.parcel_id == pid) & (df.reversal_flag)]["year"].tolist():
        axb.axvspan(pd.Timestamp(y, 1, 1), pd.Timestamp(y, 12, 31),
                    color="red", alpha=0.10)
    axb.legend(loc="upper right", fontsize=8); axb.set_ylabel("S2 index")
    fig.suptitle(f"Eye test — {pid}: {meta['name']}", fontweight="bold")
    plt.show()

for pid in PARCEL_META:
    eye_test(pid)
""")

# ---------------------------------------------------------------------------
md(r"""
---
## 7c · Cover-crop window — dense monthly look (Oct → May)

The single most useful view for the eye test: a **monthly** true-color strip
through one off-season, Oct → May. A winter **cover crop** greens up in this
window while a **conventional** field sits bare/brown (or under snow). With known
labels on these fields, this is the direct visual check — does the cover-crop
field actually look greener here than the conventional one?
""")

code(r"""
def cover_crop_window(pid, start_year=2021):
    geom = PARCEL_GEOM[pid]; meta = PARCEL_META[pid]
    months = [(start_year, 10), (start_year, 11), (start_year, 12),
              (start_year + 1, 1), (start_year + 1, 2), (start_year + 1, 3),
              (start_year + 1, 4), (start_year + 1, 5)]
    fig, axes = plt.subplots(1, len(months), figsize=(2.0 * len(months), 2.8))
    for ax, (yy, mm) in zip(axes, months):
        try:
            ax.imshow(truecolor_thumb(geom, yy, mm, mm))   # single-month composite
        except Exception:
            ax.text(0.5, 0.5, "no clear\nimage", ha="center", va="center",
                    fontsize=7, color="grey")
        ax.set_xticks([]); ax.set_yticks([]); ax.set_title(f"{yy}-{mm:02d}", fontsize=8)
    known = meta.get("known_practice", "")
    title = f"Cover-crop window {start_year}-10 → {start_year + 1}-05 — {pid}"
    if known:
        title += f"   [KNOWN: {known}]"
    fig.suptitle(title, fontweight="bold")
    plt.tight_layout(); plt.show()

for pid in PARCEL_META:
    cover_crop_window(pid, 2021)
""")

md(r"""
### Interactive map — parcels colored by reversal score

`geemap` Leaflet map: the AlphaEarth embedding (first 3 bands as RGB) as a
backdrop, parcels overlaid. Hover/click to inspect. (Coloring by score is left
as a quick exercise — `reversal_score` is in `df`.)
""")

code(r"""
Map = geemap.Map(height="500px")
center = parcels.geometry().centroid(maxError=1)
Map.centerObject(parcels, zoom=11)

# AlphaEarth RGB-ish backdrop for the most recent analysis year.
ae_recent = (AE.filterBounds(parcels.geometry())
               .filterDate(f"{YEARS[-1]}-01-01", f"{YEARS[-1]}-12-31").mosaic())
Map.addLayer(ae_recent, {"bands": ["A00", "A01", "A02"], "min": -0.3, "max": 0.3},
             f"AlphaEarth {YEARS[-1]} (A00-A02)")
Map.addLayer(parcels.style(color="yellow", fillColor="00000000", width=2),
             {}, "Parcels")
Map
""")

# ---------------------------------------------------------------------------
md(r"""
---
## 8 · *(Optional)* Peek the LGND embeddings GeoParquet via DuckDB

Not used in the detector (too coarse per-pixel), but worth feeling the format —
GeoParquet embedding tables are the standard for **regional similarity search**
("find me fields whose embedding looks like this known reversal"), which is a
natural *next* layer on top of this MVP.

The `lgnd-embeddings` release lives on **source.coop** (`clay/lgnd-embeddings`),
served over S3-compatible storage. DuckDB reads remote Parquet directly. **Paths
on source.coop change** — if the read 404s, browse
https://source.coop/clay/lgnd-embeddings for the current object key and paste it
into `LGND_PARQUET`. Wrapped in try/except so a bad path won't break the notebook.
""")

code(r"""
import duckdb

# Update to a real object path from https://source.coop/clay/lgnd-embeddings
LGND_PARQUET = "s3://us-west-2.opendata.source.coop/clay/lgnd-embeddings/*.parquet"

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
con.execute("INSTALL spatial; LOAD spatial;")
con.execute("SET s3_region='us-west-2';")
# source.coop public buckets are anonymous-readable:
con.execute("SET s3_access_key_id=''; SET s3_secret_access_key='';")

try:
    schema = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{LGND_PARQUET}')").df()
    print("LGND GeoParquet columns:")
    print(schema[["column_name", "column_type"]].to_string(index=False))
    sample = con.execute(
        f"SELECT * FROM read_parquet('{LGND_PARQUET}') LIMIT 3").df()
    display(sample)
except Exception as e:
    print("LGND peek skipped (update LGND_PARQUET to a current source.coop path).")
    print("  ->", str(e).splitlines()[0])
""")

md(r"""
---
### Where this goes next

- **Confirm a handful of flags** → that's your first labeled set → swap the
  heuristic for the classifier stub in §6.
- **Scale parcels:** move the per-month `getInfo` loops to a single server-side
  `reduceRegions` over an `ee.FeatureCollection` to cut round-trips.
- **Regional hunt:** use LGND/Clay GeoParquet (§8) for embedding similarity
  search to *find* candidate reversers across a county, then run this per-parcel
  detector on the hits.
- **Foundation-model fine-tune (last):** Prithvi / Clay via **TerraTorch**, on
  imagery chips for confirmed events — only once labels justify it.
""")

# ---------------------------------------------------------------------------
NB = {
    "cells": CELLS,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python",
                        "name": "python3"},
        "language_info": {"name": "python", "version": "3.x"},
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}

out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "regen_reversal_mvp.ipynb")
with open(out, "w", encoding="utf-8") as fh:
    json.dump(NB, fh, indent=1, ensure_ascii=False)
print(f"Wrote {out}  ({len(CELLS)} cells)")
