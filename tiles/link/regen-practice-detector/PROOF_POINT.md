# Regenerative-practice detection — proof-point write-up

*2026-06-03. Early-stage open R&D. An honest record of what was built and what it does (and doesn't) show.*

## TL;DR
Built a field-scale detector for regenerative practices (tillage/residue, cover crop) on **free/open data only**, and ran a real **at-scale validation** against 42,000 ground-truth field observations. Cross-validated on **held-out counties**, it reaches **AUC 0.78 ± 0.03** (all tillage classes) and **0.83 ± 0.03** (clear no-till/mulch vs conventional), balanced accuracy **72–76%** — at or above the ~63% commercial tillage benchmark. The method is proven at scale; the modern Sentinel stack and cover-crop task are the next steps.

## What we built
- A clean, runnable pipeline on **Google Earth Engine** using only free data: **Sentinel-2** (optical), **Sentinel-1** (radar), **AlphaEarth** annual embeddings (modern stack), and **Landsat** for the historical validation.
- Two complementary signals: AlphaEarth embedding drift = *"something changed"*; seasonal indices (NDVI/NDRE cover-crop greenness, NDTI/STI residue, SAR roughness) = *"what changed."*
- A per-field classifier + an honest validation harness with a **whole-county spatial hold-out** and **5-fold cross-validation**.

## The validation (honest numbers)
- **Ground truth:** Minnesota Tillage Transect Survey 2007 — ~42,000 GPS field observations across all 67 counties, surveyor-recorded tillage class, on corn & soybean fields.
- **Task:** conservation/high-residue (no-till + mulch) vs conventional/low-residue.
- **Scored on counties the model never saw.** Cross-validated:
  - All classes: **AUC 0.78 ± 0.03**, balanced accuracy **72% ± 3%**.
  - Clear case (drop the fuzzy "reduced-till" middle): **AUC 0.83 ± 0.03**, balanced accuracy **76% ± 2%**.
- Tight ±0.03 spread → **stable across geography**, not a lucky split. The first naïve cut scored AUC 0.66 and *below* a dumb baseline; the upgrades roughly doubled the usable signal.

## What drove the result
- **Crop-conditioning was the decisive lever** — prior crop (corn leaves heavy residue, soybeans almost none) was the dominant confounder. Adding it (top feature: *was last year's crop corn?*) is what moved AUC 0.66 → ~0.80.
- A **bare-soil pre-emergence window** (residue most visible before the crop greens up) and **Landsat-5+7** for cleaner composites also helped.
- The SWIR residue indices (NDTI, STI, NDI7) carry real, consistent weight — the physics holds.

## How we can use this
- **Independent, auditable practice detection** on open data — a transparent alternative to proprietary black boxes for verified-practice claims and MRV.
- **Screening at scale** — rank/flag fields by likely practice without paid imagery, then focus human/field verification where it matters.
- **A labeling flywheel** — every confirmed field grows the ground-truth set, improving the model without leaking validation data (the held-out discipline in `TEST_PROTOCOL.md`).

## Honest limits
- **One year, one state, Landsat era.** Proves the *method* at scale; transfer to other years/regions and the modern sensors is unproven.
- **Tillage is the hard problem** (~63% benchmark); cover crop benchmarks higher (~78%) and is the next target.
- The **clear-case 0.83** deliberately excludes the ambiguous reduced-till middle; the all-classes 0.78 includes it.

## Next steps
1. **Modern stack:** Sentinel-2 + Sentinel-1 (SAR senses tillage roughness directly) — the most likely path past the optical-Landsat ceiling.
2. **Cover-crop task** on Sentinel-era labels (benchmarks higher than tillage).
3. **Recent labeled data** via request — Maryland MACS (cover-crop cost-share, ~25k digitized fields/yr) and the PSA on-farm network.

## Artifacts (this folder)
- `regen_reversal_mvp.ipynb` — the runnable end-to-end notebook.
- `validate_at_scale*.py`, `validate_cv.py` — the at-scale validation + cross-validation harness.
- `scoreboard.md`, `scoreboard_v2.md`, `cv_results.md`, `visual_summary.html` — results.
- `TEST_PROTOCOL.md` — the leak-free cal/dev/held-out validation discipline.
