"""At-scale validation v2 — push the optical ceiling on tillage/residue.

Upgrades over v1:
  - Landsat 5 + 7 (more clear obs), 3 windows incl. a BARE early-spring window
    (residue most exposed before crop green-up).
  - Richer residue features: NDTI, STI, NDI7, NDVI, raw SWIR1/SWIR2 per window.
  - Crop conditioning: growing crop + residue (prior) crop as features
    (corn residue >> soybean residue — a major confounder).
  - Honest metrics: AUC + balanced accuracy + threshold tuned on dev; plus a
    "clear-case" cut (no-till+ridge+mulch vs conventional, dropping reduced).
Same whole-county spatial hold-out (70/15/15).
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
from sklearn.metrics import (accuracy_score, balanced_accuracy_score,
                             precision_recall_fscore_support, confusion_matrix,
                             roc_auc_score, roc_curve)

NB = pathlib.Path(__file__).resolve().parent
ee.Initialize(project="your-gcp-project-id")

# --- 1. Ground-truth points + crop context ----------------------------------
shp = next((NB / "data_mn2007").glob("*.shp"))
r = shapefile.Reader(str(shp))
ix = {n: i for i, (n, *_ ) in enumerate(r.fields[1:])}
CROPS = {"Corn", "Soybeans (Full Season)"}

def crop_kind(s):
    s = (s or "").lower()
    if "corn" in s: return "corn"
    if "soy" in s: return "soy"
    return "other"

pts_by_cty = {}
for rec in r.records():
    till = int(rec[ix["TILL_NUM"]])
    if str(rec[ix["GROW_8CR"]]) not in CROPS or till not in (1, 2, 3, 4, 5):
        continue
    cty = str(rec[ix["COUNTY"]])
    p = dict(lon=float(rec[ix["LONG_"]]), lat=float(rec[ix["LAT"]]), county=cty,
             till=till,
             grow=crop_kind(str(rec[ix["GROW22CR"]]) if "GROW22CR" in ix else rec[ix["GROW_8CR"]]),
             resid=crop_kind(str(rec[ix["RESIDUE_CR"]])))
    pts_by_cty.setdefault(cty, []).append(p)
print(f"corn/soy tillage points: {sum(len(v) for v in pts_by_cty.values())} / {len(pts_by_cty)} counties")

# --- 2. Landsat 5+7 (2007) features over 3 windows ---------------------------
MN = ee.Geometry.Rectangle([-97.6, 43.4, -89.4, 49.5])

def prep(img):
    qa = img.select("QA_PIXEL")
    clear = (qa.bitwiseAnd(1 << 1).eq(0).And(qa.bitwiseAnd(1 << 3).eq(0))
             .And(qa.bitwiseAnd(1 << 4).eq(0)).And(qa.bitwiseAnd(1 << 5).eq(0)))
    return img.select("SR_B.").multiply(0.0000275).add(-0.2).updateMask(clear)

COLL = (ee.ImageCollection("LANDSAT/LT05/C02/T1_L2").filterBounds(MN)
        .merge(ee.ImageCollection("LANDSAT/LE07/C02/T1_L2").filterBounds(MN)))

def window(d0, d1, tag):
    c = COLL.filterDate(d0, d1).map(prep).median()
    b = {k: c.select(f"SR_B{n}") for k, n in
         dict(red=3, nir=4, sw1=5, sw2=7).items()}
    ndti = b["sw1"].subtract(b["sw2"]).divide(b["sw1"].add(b["sw2"])).rename(f"NDTI_{tag}")
    sti = b["sw1"].divide(b["sw2"]).rename(f"STI_{tag}")
    ndvi = b["nir"].subtract(b["red"]).divide(b["nir"].add(b["red"])).rename(f"NDVI_{tag}")
    ndi7 = b["nir"].subtract(b["sw2"]).divide(b["nir"].add(b["sw2"])).rename(f"NDI7_{tag}")
    return ee.Image.cat([ndti, sti, ndvi, ndi7,
                         b["sw1"].rename(f"SW1_{tag}"), b["sw2"].rename(f"SW2_{tag}")])

feat_img = ee.Image.cat([
    window("2007-04-01", "2007-05-12", "bare"),    # post-snowmelt, pre-emergence
    window("2007-05-12", "2007-06-20", "res"),     # post-planting residue
    window("2007-06-20", "2007-08-05", "can"),     # canopy
])
SPECTRAL = [f"{i}_{w}" for w in ("bare", "res", "can")
            for i in ("NDTI", "STI", "NDVI", "NDI7", "SW1", "SW2")]

# --- 3. Sample per county ----------------------------------------------------
rows = []
ctys = sorted(pts_by_cty)
for n, cty in enumerate(ctys, 1):
    fc = ee.FeatureCollection([
        ee.Feature(ee.Geometry.Point([p["lon"], p["lat"]]),
                   {"county": cty, "till": p["till"], "grow": p["grow"], "resid": p["resid"]})
        for p in pts_by_cty[cty]])
    try:
        for f in feat_img.sampleRegions(collection=fc, scale=30, geometries=False).getInfo()["features"]:
            rows.append(f["properties"])
    except Exception as e:
        print(f"  {cty} failed: {str(e)[:70]}")
    if n % 15 == 0:
        print(f"  {n}/{len(ctys)} counties, {len(rows)} rows")

df = pd.DataFrame(rows).dropna(subset=SPECTRAL)
# crop one-hots
for c in ("corn", "soy"):
    df[f"grow_{c}"] = (df["grow"] == c).astype(int)
    df[f"resid_{c}"] = (df["resid"] == c).astype(int)
CROPF = ["grow_corn", "grow_soy", "resid_corn", "resid_soy"]
FEATS = SPECTRAL + CROPF
print(f"valid feature rows: {len(df)}")

def split(c):
    h = int(hashlib.md5(str(c).encode()).hexdigest(), 16) % 100
    return "cal" if h < 70 else ("dev" if h < 85 else "holdout")
df["split"] = df["county"].map(split)

# --- 4. Train + evaluate, with dev-tuned threshold ---------------------------
def run_task(name, pos, neg):
    d = df[df.till.isin(pos + neg)].copy()
    d["y"] = d.till.isin(pos).astype(int)
    tr, dv, ho = d[d.split == "cal"], d[d.split == "dev"], d[d.split == "holdout"]
    clf = RandomForestClassifier(n_estimators=500, min_samples_leaf=5,
                                 class_weight="balanced", random_state=0, n_jobs=-1)
    clf.fit(tr[FEATS], tr.y)
    # tune threshold on dev to maximize balanced accuracy
    dvp = clf.predict_proba(dv[FEATS])[:, 1]
    fpr, tpr, thr = roc_curve(dv.y, dvp)
    j = tpr - fpr
    t = thr[int(np.argmax(j))]
    def metrics(sub):
        p = clf.predict_proba(sub[FEATS])[:, 1]
        yhat = (p >= t).astype(int)
        pr, rc, f1, _ = precision_recall_fscore_support(sub.y, yhat, average="binary", zero_division=0)
        return dict(n=len(sub), counties=sub.county.nunique(), base=sub.y.mean(),
                    auc=roc_auc_score(sub.y, p), bacc=balanced_accuracy_score(sub.y, yhat),
                    acc=accuracy_score(sub.y, yhat), prec=pr, rec=rc, f1=f1,
                    cm=confusion_matrix(sub.y, yhat))
    return dict(name=name, thr=t, dev=metrics(dv), hold=metrics(ho), clf=clf,
                imp=sorted(zip(FEATS, clf.feature_importances_), key=lambda x: -x[1]))

taskA = run_task("All classes: conservation(1-3) vs low(4-5)", [1, 2, 3], [4, 5])
taskB = run_task("Clear case: no-till+ridge+mulch(1-3) vs conventional(5) only", [1, 2, 3], [5])

# --- 5. Scoreboard -----------------------------------------------------------
def line(tag, m):
    maj = max(m["base"], 1 - m["base"])
    return (f"  - {tag}: AUC **{m['auc']:.2f}**, balanced-acc **{m['bacc']:.1%}**, "
            f"acc {m['acc']:.1%} (majority baseline {maj:.0%}), "
            f"precision {m['prec']:.1%}, recall {m['rec']:.1%}  [{m['n']} pts/{m['counties']} cty]")

L = ["# At-scale validation v2 — pushing the optical ceiling", "",
     f"Features: 3 Landsat-5+7 windows (bare/residue/canopy) × 6 indices + crop context. "
     f"{len(df)} corn/soy points, whole-county 70/15/15 spatial hold-out.  ",
     "**v1 held-out baseline:** AUC 0.66, balanced-acc ~54%.", ""]
for t in (taskA, taskB):
    L += [f"## {t['name']}",
          f"  (dev-tuned threshold {t['thr']:.2f})",
          line("dev    ", t["dev"]), line("HOLDOUT", t["hold"]), ""]
hb = taskB["hold"]
L += ["## Held-out confusion — clear case", "```",
      "             pred CONV   pred CONS",
      f"actual CONV   {hb['cm'][0,0]:>8}   {hb['cm'][0,1]:>8}",
      f"actual CONS   {hb['cm'][1,0]:>8}   {hb['cm'][1,1]:>8}", "```", "",
      "## Top features (clear case)",
      *[f"- {f}: {v:.3f}" for f, v in taskB["imp"][:12]], "",
      "## Read",
      f"- All-classes held-out AUC {taskA['hold']['auc']:.2f} vs v1 0.66 "
      f"(Δ {taskA['hold']['auc']-0.66:+.2f}).",
      f"- Clear-case held-out AUC {taskB['hold']['auc']:.2f} — the ceiling when the "
      "fuzzy 'reduced-till' middle is removed.",
      "- Balanced accuracy is the honest headline (corrects for class imbalance); "
      "raw accuracy vs the majority baseline is shown alongside.",
      "- Crop-context feature weight indicates how much prior crop (corn vs soy "
      "residue) was confounding the raw indices."]
(NB / "scoreboard_v2.md").write_text("\n".join(L), encoding="utf-8")

# plots
fig, ax = plt.subplots(1, 2, figsize=(12, 4.6))
cm = hb["cm"]; ax[0].imshow(cm, cmap="Greens")
ax[0].set_xticks([0,1]); ax[0].set_xticklabels(["CONV","CONS"])
ax[0].set_yticks([0,1]); ax[0].set_yticklabels(["CONV","CONS"])
ax[0].set_xlabel("predicted"); ax[0].set_ylabel("actual")
ax[0].set_title(f"Clear-case held-out (AUC {hb['auc']:.2f}, bal-acc {hb['bacc']:.0%})")
for (i,j),v in np.ndenumerate(cm):
    ax[0].text(j,i,str(v),ha="center",va="center",color="white" if v>cm.max()/2 else "black")
fn, fv = zip(*taskB["imp"][:12])
ax[1].barh(range(len(fn)), fv, color="#1565c0"); ax[1].set_yticks(range(len(fn)))
ax[1].set_yticklabels(fn, fontsize=8); ax[1].invert_yaxis(); ax[1].set_title("Top features")
plt.tight_layout(); plt.savefig(NB / "scoreboard_v2_plots.png", dpi=110)
print("\n=== DONE ===")
print("\n".join(L[5:14]))
