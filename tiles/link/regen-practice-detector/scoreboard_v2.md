# At-scale validation v2 — pushing the optical ceiling

Features: 3 Landsat-5+7 windows (bare/residue/canopy) × 6 indices + crop context. 26908 corn/soy points, whole-county 70/15/15 spatial hold-out.  
**v1 held-out baseline:** AUC 0.66, balanced-acc ~54%.

## All classes: conservation(1-3) vs low(4-5)
  (dev-tuned threshold 0.45)
  - dev    : AUC **0.76**, balanced-acc **71.2%**, acc 71.3% (majority baseline 64%), precision 57.9%, recall 70.9%  [3944 pts/9 cty]
  - HOLDOUT: AUC **0.81**, balanced-acc **74.4%**, acc 75.4% (majority baseline 69%), precision 58.8%, recall 71.6%  [4250 pts/13 cty]

## Clear case: no-till+ridge+mulch(1-3) vs conventional(5) only
  (dev-tuned threshold 0.52)
  - dev    : AUC **0.82**, balanced-acc **76.0%**, acc 75.5% (majority baseline 55%), precision 82.1%, recall 70.5%  [2570 pts/9 cty]
  - HOLDOUT: AUC **0.86**, balanced-acc **78.6%**, acc 79.2% (majority baseline 54%), precision 81.9%, recall 70.9%  [2859 pts/13 cty]

## Held-out confusion — clear case
```
             pred CONV   pred CONS
actual CONV       1322        208
actual CONS        387        942
```

## Top features (clear case)
- resid_corn: 0.135
- NDVI_bare: 0.080
- grow_soy: 0.058
- grow_corn: 0.058
- resid_soy: 0.050
- NDI7_bare: 0.046
- STI_res: 0.046
- NDTI_res: 0.046
- NDVI_res: 0.044
- SW1_can: 0.040
- STI_bare: 0.038
- NDTI_bare: 0.038

## Read
- All-classes held-out AUC 0.81 vs v1 0.66 (Δ +0.15).
- Clear-case held-out AUC 0.86 — the ceiling when the fuzzy 'reduced-till' middle is removed.
- Balanced accuracy is the honest headline (corrects for class imbalance); raw accuracy vs the majority baseline is shown alongside.
- Crop-context feature weight indicates how much prior crop (corn vs soy residue) was confounding the raw indices.