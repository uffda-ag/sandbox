"""At-scale validation: tillage/residue classification vs. real ground truth.

Ground truth: Minnesota Tillage Transect Survey 2007 (42k GPS points, 67 counties),
filtered to corn/soybean fields with a known tillage class.

Task: predict HIGH-residue / conservation tillage (no-till + ridge + mulch) vs.
LOW-residue (reduced + conventional) from 2007 Landsat-5 residue indices.

Honesty / anti-overfit:
- Spatial split by WHOLE COUNTY (hash of county FIPS) -> 70% cal / 15% dev / 15%
  held-out. Holding out whole counties (not random points) blocks spatial-
  autocorrelation leakage.
- The model is trained on cal only, tuned/checked on dev, and the held-out
  counties are scored ONCE at the end as the headline number.

Outputs: scoreboard.md + scoreboard_plots.png (confusion matrix + feature importance).
"""
import hashlib
import pathlib

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import shapefile
import ee
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (accuracy_score, precision_recall_fscore_support,
                             confusion_matrix, roc_auc_score)

NB = pathlib.Path(__file__).resolve().parent
ee.Initialize(project="your-gcp-project-id")

# --- 1. Ground-truth points -------------------------------------------------
shp = next((NB / "data_mn2007").glob("*.shp"))
r = shapefile.Reader(str(shp))
flds = [f[0] for f in r.fields[1:]]
ix = {n: i for i, n in enumerate(flds)}
CROPS = {"Corn", "Soybeans (Full Season)"}
HIGH = {1, 2, 3}   # no-till, ridge, mulch  (conservation, >=~30% residue)
LOW = {4, 5}       # reduced, conventional   (<~30% residue)

pts_by_cty = {}
for rec in r.records():
    till = int(rec[ix["TILL_NUM"]])
    crop = str(rec[ix["GROW_8CR"]])
    if crop not in CROPS or till not in (HIGH | LOW):
        continue
    cty = str(rec[ix["COUNTY"]])
    lon, lat = float(rec[ix["LONG_"]]), float(rec[ix["LAT"]])
    label = 1 if till in HIGH else 0   # 1 = conservation/high-residue
    pts_by_cty.setdefault(cty, []).append(
        dict(pid=f"{cty}_{len(pts_by_cty.get(cty, []))}", lon=lon, lat=lat,
             county=cty, till=till, label=label))
n_pts = sum(len(v) for v in pts_by_cty.values())
print(f"corn/soy points with tillage class: {n_pts} across {len(pts_by_cty)} counties")

# --- 2. 2007 Landsat-5 residue/vegetation features --------------------------
MN = ee.Geometry.Rectangle([-97.6, 43.4, -89.4, 49.5])
L5 = ee.ImageCollection("LANDSAT/LT05/C02/T1_L2")

def prep(img):
    qa = img.select("QA_PIXEL")
    clear = (qa.bitwiseAnd(1 << 1).eq(0)
             .And(qa.bitwiseAnd(1 << 3).eq(0))
             .And(qa.bitwiseAnd(1 << 4).eq(0))
             .And(qa.bitwiseAnd(1 << 5).eq(0)))
    opt = img.select("SR_B.").multiply(0.0000275).add(-0.2)
    return opt.updateMask(clear)

def window(d0, d1, suffix):
    c = L5.filterBounds(MN).filterDate(d0, d1).map(prep).median()
    ndti = c.normalizedDifference(["SR_B5", "SR_B7"]).rename("NDTI" + suffix)
    ndvi = c.normalizedDifference(["SR_B4", "SR_B3"]).rename("NDVI" + suffix)
    sti = c.select("SR_B5").divide(c.select("SR_B7")).rename("STI" + suffix)
    return ndti.addBands([ndvi, sti])

# residue window (post-planting, residue still exposed) + early-canopy window
feat_img = window("2007-04-20", "2007-06-10", "_res").addBands(
    window("2007-06-10", "2007-07-25", "_early"))
FEATS = ["NDTI_res", "NDVI_res", "STI_res", "NDTI_early", "NDVI_early", "STI_early"]

# --- 3. Sample features per county (server-side, chunked by county) ---------
rows = []
for n, (cty, pts) in enumerate(sorted(pts_by_cty.items()), 1):
    fc = ee.FeatureCollection([
        ee.Feature(ee.Geometry.Point([p["lon"], p["lat"]]),
                   {"pid": p["pid"], "label": p["label"], "county": cty, "till": p["till"]})
        for p in pts])
    sampled = feat_img.sampleRegions(collection=fc, scale=30, geometries=False)
    try:
        for f in sampled.getInfo()["features"]:
            rows.append(f["properties"])
    except Exception as e:
        print(f"  county {cty} sample failed: {str(e)[:80]}")
    if n % 10 == 0:
        print(f"  sampled {n}/{len(pts_by_cty)} counties, {len(rows)} rows so far")

df = pd.DataFrame(rows).dropna(subset=FEATS)
print(f"feature rows with valid imagery: {len(df)}")

# --- 4. Spatial split by county --------------------------------------------
def split(cty):
    h = int(hashlib.md5(str(cty).encode()).hexdigest(), 16) % 100
    return "cal" if h < 70 else ("dev" if h < 85 else "holdout")

df["split"] = df["county"].map(split)
for s in ("cal", "dev", "holdout"):
    sub = df[df.split == s]
    print(f"  {s}: {len(sub)} pts, {sub.county.nunique()} counties, "
          f"conservation rate {sub.label.mean():.2f}")

# --- 5. Train on cal, check on dev, score held-out ONCE ---------------------
clf = RandomForestClassifier(n_estimators=400, min_samples_leaf=5,
                             class_weight="balanced", random_state=0, n_jobs=-1)
clf.fit(df[df.split == "cal"][FEATS], df[df.split == "cal"].label)

def evaluate(split_name):
    sub = df[df.split == split_name]
    proba = clf.predict_proba(sub[FEATS])[:, 1]
    pred = (proba >= 0.5).astype(int)
    pr, rc, f1, _ = precision_recall_fscore_support(sub.label, pred, average="binary",
                                                    zero_division=0)
    return dict(split=split_name, n=len(sub), counties=sub.county.nunique(),
                accuracy=accuracy_score(sub.label, pred),
                precision=pr, recall=rc, f1=f1,
                auc=roc_auc_score(sub.label, proba) if sub.label.nunique() > 1 else float("nan"),
                cm=confusion_matrix(sub.label, pred), base_rate=sub.label.mean())

dev = evaluate("dev")
hold = evaluate("holdout")

# --- 6. Scoreboard + plots --------------------------------------------------
def fmt(m):
    return (f"- **{m['split']}** ({m['n']} pts, {m['counties']} counties, "
            f"{m['base_rate']:.0%} conservation): "
            f"accuracy **{m['accuracy']:.1%}**, precision {m['precision']:.1%}, "
            f"recall {m['recall']:.1%}, F1 {m['f1']:.2f}, AUC {m['auc']:.2f}")

imp = sorted(zip(FEATS, clf.feature_importances_), key=lambda x: -x[1])
lines = [
    "# At-scale validation scoreboard — tillage/residue detection",
    "",
    "**Ground truth:** MN Tillage Transect Survey 2007 (corn & soybean fields).  ",
    "**Task:** conservation/high-residue (no-till+ridge+mulch) vs low-residue "
    "(reduced+conventional), from 2007 Landsat-5 residue indices.  ",
    "**Split:** whole-county spatial hold-out (70/15/15) — held-out counties never seen in training.  ",
    "**Benchmark for context:** commercial systems ~63% accuracy on tillage at 10–30 m (a commercial system).",
    "",
    "## Results",
    fmt(dev),
    fmt(hold),
    "",
    f"**Headline:** {hold['accuracy']:.1%} accuracy / {hold['auc']:.2f} AUC on "
    f"{hold['n']} points across {hold['counties']} **held-out** counties.",
    "",
    "## Confusion matrix (held-out)",
    "```",
    "                 pred LOW   pred CONS",
    f"actual LOW       {hold['cm'][0,0]:>8}   {hold['cm'][0,1]:>8}",
    f"actual CONS      {hold['cm'][1,0]:>8}   {hold['cm'][1,1]:>8}",
    "```",
    "",
    "## Feature importance",
    *[f"- {f}: {v:.3f}" for f, v in imp],
    "",
    "## Honesty notes",
    "- 2007 Landsat era (no Sentinel-2/-1 or AlphaEarth in 2007) — this validates the "
    "residue-index *approach* at scale; the modern stack awaits Sentinel-era labels "
    "(Maryland MACS / PSA requests).",
    "- Tillage is the hard problem (residue signal is subtle at 30 m). Cover-crop "
    "detection benchmarks higher (~78%).",
    "- Held-out counties scored once; cal used for training, dev for sanity only.",
]
(NB / "scoreboard.md").write_text("\n".join(lines), encoding="utf-8")

fig, ax = plt.subplots(1, 2, figsize=(12, 4.5))
cm = hold["cm"]
ax[0].imshow(cm, cmap="Blues")
ax[0].set_xticks([0, 1]); ax[0].set_xticklabels(["LOW", "CONS"])
ax[0].set_yticks([0, 1]); ax[0].set_yticklabels(["LOW", "CONS"])
ax[0].set_xlabel("predicted"); ax[0].set_ylabel("actual")
ax[0].set_title(f"Held-out confusion ({hold['n']} pts, acc {hold['accuracy']:.1%})")
for (i, j), v in np.ndenumerate(cm):
    ax[0].text(j, i, str(v), ha="center", va="center",
               color="white" if v > cm.max() / 2 else "black", fontsize=12)
fnames, fvals = zip(*imp)
ax[1].barh(range(len(fnames)), fvals, color="#2e7d32")
ax[1].set_yticks(range(len(fnames))); ax[1].set_yticklabels(fnames)
ax[1].invert_yaxis(); ax[1].set_title("Feature importance")
plt.tight_layout()
plt.savefig(NB / "scoreboard_plots.png", dpi=110)
print("\n=== DONE ===")
print("\n".join(lines[7:14]))
