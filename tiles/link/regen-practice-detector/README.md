# Regenerative Practice Detector (in-dev)

Open development record for an exploratory effort to detect field-scale
**regenerative practices** - cover cropping and tillage/residue - from **free and
open satellite data** (Google Earth Engine; Sentinel-2/-1, Landsat, AlphaEarth).
Early-stage R&D, kept in the open. Rendered as an in-dev tile behind the Pioneer
login on uffda.ag/sandbox.

## What's here
- `regen_reversal_mvp.ipynb` - runnable end-to-end notebook (set your own
  `EE_PROJECT` and authenticate Earth Engine).
- `validate_at_scale*.py`, `validate_cv.py` - at-scale validation + county
  cross-validation against the Minnesota Tillage Transect Survey.
- `build_kbs_fields.py` - KBS LTER labeled calibration/dev set builder.
- `PROOF_POINT.md` - honest write-up of the result.
- `TEST_PROTOCOL.md` - the leak-free cal/dev/held-out validation discipline.
- `INDICES_EXPLAINER.md` - plain-language guide to the satellite indices.
- `visual_summary.html`, `scoreboard_v2.md`, `cv_results.md` - results.

## Headline result (honest)
Cross-validated on **held-out counties** (whole-county spatial split), the
tillage/residue classifier reached **AUC 0.78 +/- 0.03** (all classes) and
**0.83 +/- 0.03** (clear cases), balanced accuracy ~72-76% - at or above the
~63% commercial benchmark. The decisive lever was conditioning on the prior
crop (corn leaves heavy residue, soybeans almost none). This round used 2007
Landsat (the only era with matched point-level ground truth + imagery); the
modern Sentinel stack and cover-crop detection are next.

## Status
`in-dev`. Numbers are a proof-of-concept on one year / one state, not a product.

License: Apache-2.0 (code) / CC-BY-4.0 (docs). Ground-truth data: USDA / KBS LTER
(see their terms). Built with free public satellite data (Copernicus, USGS, Google).
