# County cross-validation (5-fold, grouped by county)

Confidence band on the held-out result — each fold holds out ~13 whole counties.

## All classes (conservation vs low-residue)
- **AUC 0.78 ± 0.03**  (folds: 0.81, 0.74, 0.75, 0.80, 0.83)
- **Balanced accuracy 72.0% ± 3.3%**  (folds: 75%, 68%, 68%, 73%, 76%)

## Clear case (no-till+mulch vs conventional)
- **AUC 0.83 ± 0.03**  (folds: 0.80, 0.81, 0.87, 0.84, 0.86)
- **Balanced accuracy 76.0% ± 2.3%**  (folds: 73%, 74%, 80%, 76%, 77%)

## Read
- The single-split v2 numbers (0.81 / 0.86 AUC) sit within the CV bands -> the result is stable, not a lucky split.
- All-classes AUC 0.78 ± 0.03; clear-case AUC 0.83 ± 0.03 across 5 county folds.