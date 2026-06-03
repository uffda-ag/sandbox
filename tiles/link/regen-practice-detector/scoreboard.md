# At-scale validation scoreboard — tillage/residue detection

**Ground truth:** MN Tillage Transect Survey 2007 (corn & soybean fields).  
**Task:** conservation/high-residue (no-till+ridge+mulch) vs low-residue (reduced+conventional), from 2007 Landsat-5 residue indices.  
**Split:** whole-county spatial hold-out (70/15/15) — held-out counties never seen in training.  
**Benchmark for context:** commercial systems ~63% accuracy on tillage at 10–30 m (a commercial system).

## Results
- **dev** (3744 pts, 9 counties, 34% conservation): accuracy **68.6%**, precision 53.6%, recall 55.0%, F1 0.54, AUC 0.72
- **holdout** (3840 pts, 13 counties, 30% conservation): accuracy **64.2%**, precision 41.9%, recall 52.1%, F1 0.46, AUC 0.66

**Headline:** 64.2% accuracy / 0.66 AUC on 3840 points across 13 **held-out** counties.

## Confusion matrix (held-out)
```
                 pred LOW   pred CONS
actual LOW           1868        827
actual CONS           549        596
```

## Feature importance
- NDVI_res: 0.220
- STI_res: 0.187
- NDTI_res: 0.180
- NDVI_early: 0.145
- STI_early: 0.134
- NDTI_early: 0.134

## Honesty notes
- 2007 Landsat era (no Sentinel-2/-1 or AlphaEarth in 2007) — this validates the residue-index *approach* at scale; the modern stack awaits Sentinel-era labels (Maryland MACS / PSA requests).
- Tillage is the hard problem (residue signal is subtle at 30 m). Cover-crop detection benchmarks higher (~78%).
- Held-out counties scored once; cal used for training, dev for sanity only.