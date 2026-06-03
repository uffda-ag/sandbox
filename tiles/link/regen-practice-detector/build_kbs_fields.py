"""Build the KBS LTER calibration/dev labeled field set.

Source: KBS LTER Main Cropping System Experiment, plot-center table 644
(https://lter.kbs.msu.edu/datatables/644.csv) + verified treatment definitions.

KBS labels are PUBLIC -> this is our calibration + dev set only. The held-out
validation set is reserved for genuinely-private fields (Nick-held labels), so
nothing here can leak into the held-out wall.

Output: kbs_fields.geojson (geometries + labels + cal/dev split) and
kbs_labels.csv (the label table). Re-run to regenerate.
"""
import csv
import hashlib
import io
import json
import math
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
URL = "https://lter.kbs.msu.edu/datatables/644.csv"

# Verified treatment -> practice labels (annual row-crop treatments only).
# T5/T6/T7 (poplar / perennial grass / successional) are a different land use
# and are excluded from the regen-vs-conventional-annual question.
TREATMENTS = {
    "T1": dict(system="Conventional",   tillage="tilled",  cover_crop=False, organic=False, regen_class="conventional"),
    "T2": dict(system="No-till",        tillage="no-till", cover_crop=False, organic=False, regen_class="no-till"),
    "T3": dict(system="Reduced Input",  tillage="tilled",  cover_crop=True,  organic=False, regen_class="cover_crop"),
    "T4": dict(system="Organic",        tillage="tilled",  cover_crop=True,  organic=True,  regen_class="cover_crop_organic"),
}

# Interior sampling box side (m). Plots are ~90 m across and ADJACENT to
# different-treatment plots, so we sample an interior square to limit spectral
# bleed from neighbors at 10 m pixel size.
BOX_SIDE_M = 70.0


def square_polygon(lon, lat, side_m):
    dlat = (side_m / 2.0) / 111320.0
    dlon = (side_m / 2.0) / (111320.0 * math.cos(math.radians(lat)))
    return [[
        [lon - dlon, lat - dlat], [lon + dlon, lat - dlat],
        [lon + dlon, lat + dlat], [lon - dlon, lat + dlat],
        [lon - dlon, lat - dlat],
    ]]


def split_for(plot_id):
    # Deterministic 75/25 cal/dev split by plot id (md5 so it's stable across runs).
    h = int(hashlib.md5(plot_id.encode()).hexdigest(), 16)
    return "dev" if h % 4 == 0 else "cal"


def main():
    raw = urllib.request.urlopen(
        urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"}),
        timeout=60).read().decode("utf-8", "replace")
    rows = list(csv.DictReader(io.StringIO(
        "\n".join(l for l in raw.splitlines() if not l.startswith("#")))))

    feats, label_rows = [], []
    seen = {}
    for r in rows:
        trt = (r.get("treatment") or "").strip()
        if trt not in TREATMENTS:
            continue
        rep = (r.get("repliate") or r.get("replicate") or "").strip()  # note: source typo "repliate"
        base_id = f"KBS-{trt}-{rep}"
        seen[base_id] = seen.get(base_id, 0) + 1
        plot_id = base_id if seen[base_id] == 1 else f"{base_id}-{seen[base_id]}"
        lon, lat = float(r["longitude"]), float(r["latitude"])
        lab = TREATMENTS[trt]
        split = split_for(plot_id)
        props = dict(plot_id=plot_id, treatment=trt, replicate=rep,
                     area_m2_orig=int(float(r.get("area_m2") or 0)),
                     split=split, baseline_year=2019, **lab)
        feats.append({"type": "Feature", "properties": props,
                      "geometry": {"type": "Polygon",
                                   "coordinates": square_polygon(lon, lat, BOX_SIDE_M)}})
        label_rows.append(props)

    gj = {"type": "FeatureCollection",
          "_comment": "KBS LTER Main Cropping System Experiment (T1-T4, annual row crops). "
                      "Calibration+dev set (public labels). Interior 70m sampling boxes. "
                      "Held-out validation is reserved for private fields.",
          "features": feats}
    (HERE / "kbs_fields.geojson").write_text(json.dumps(gj, indent=2), encoding="utf-8")

    cols = ["plot_id", "treatment", "replicate", "system", "tillage", "cover_crop",
            "organic", "regen_class", "split", "area_m2_orig", "baseline_year"]
    with open(HERE / "kbs_labels.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for row in label_rows:
            w.writerow({k: row[k] for k in cols})

    # Summary
    from collections import Counter
    by_trt = Counter(p["treatment"] for p in label_rows)
    by_split = Counter(p["split"] for p in label_rows)
    print(f"wrote kbs_fields.geojson + kbs_labels.csv  ({len(feats)} plots)")
    print("by treatment:", dict(sorted(by_trt.items())))
    print("by split:", dict(by_split))
    print("cover-crop plots:", sum(p["cover_crop"] for p in label_rows),
          "| no-till plots:", sum(p["tillage"] == "no-till" for p in label_rows))


if __name__ == "__main__":
    main()
