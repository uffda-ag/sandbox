# Plain-language guide to the satellite signals in this notebook

You don't need any of this to use the notebook — but here's what each line on
those charts actually *is*, in human terms.

## The big idea: satellites see colors our eyes can't

A camera in your phone records three colors: **red, green, blue**. Mix them and
you get the picture you see. Earth-observation satellites record those three
**plus several more "colors" beyond what human eyes can detect** — especially
**near-infrared** and **shortwave-infrared** light. Each of these is called a
**band**.

Why that matters: **different surfaces reflect these invisible bands very
differently.** A healthy green plant looks "kind of green" to us, but in
near-infrared it is *blindingly* bright — far brighter than dry soil or dead
stubble. So if you look at the invisible bands, plants, bare dirt, water, and
crop residue separate out cleanly, even when they look similar to the eye.

An **index** is just a simple recipe that mixes two bands to spotlight one thing
(greenness, residue, etc.). It's almost always "(band A − band B) ÷ (band A +
band B)", which conveniently lands every result between −1 and +1.

---

## The bands we use (Sentinel-2 satellite)

| Band | "Color" | What it's good for |
|------|---------|--------------------|
| B2 / B3 / B4 | Blue / Green / **Red** (visible) | The normal true-color picture — what the field *looks* like |
| B5 | **Red-edge** (just past red) | Super-sensitive to plant chlorophyll; catches sparse or just-emerging plants |
| B8 | **Near-infrared (NIR)** | Healthy vegetation glows here; the backbone of "how green/alive is it" |
| B11 / B12 | **Shortwave-infrared (SWIR)** | Tells dry plant *residue* (stubble) apart from bare soil and moisture |

---

## The indices (the colored lines on the chart)

**NDVI — "how green / how much living plant cover?"**
Recipe: near-infrared vs. red (B8 vs B4). Living plants soak up red light and
blast back near-infrared, so high NDVI = lush, green, growing; low NDVI = bare
or dormant. *In this notebook:* a cover crop shows up as NDVI staying up during
the off-season, when a conventional field would be bare (low NDVI). Losing that
off-season green is a reversal tell.

**NDRE — "how green, but more sensitive (especially early/sparse growth)."**
Recipe: near-infrared vs. red-edge (B8 vs B5). The red-edge band reacts to
chlorophyll sooner and doesn't "max out" as fast as NDVI, so NDRE catches a
*thin, young* cover crop that NDVI might miss. Think of it as NDVI's
finer-grained cousin.

**NDTI — "how much crop residue is left on the surface?"** (the tillage tell)
Recipe: the two shortwave-infrared bands (B11 vs B12). Dead, dry plant material
(the stubble a no-till field leaves on top) reflects these two bands differently
than bare tilled soil does. Higher NDTI ≈ more residue left standing ≈ less
tillage. A *drop* in NDTI is consistent with someone tilling the residue under.
**Caveat (in the notebook's gotchas too):** this one is noisy — wet soil, soil
color, and crop type can fool it. Treat it as supporting evidence, not proof.

---

## The radar signal (Sentinel-1 satellite) — "VV" and "VH"

Everything above is *reflected sunlight*, so clouds and darkness block it. **Radar
is different: the satellite sends down its own microwave pulse and listens for the
echo.** That means it works **through clouds, day or night** — a big deal in a
cloudy growing season.

Radar doesn't see color; it senses **texture and moisture**. A freshly tilled
field is rough and bare; an undisturbed residue-covered field is smoother. A
**tillage pass changes the echo**, so a sudden jump in the radar line is a
candidate "a machine worked this field" event.

- **VV** and **VH** are just two ways the radar wave is oriented going out and
  coming back ("polarizations"). **VV** leans toward bare-soil/surface roughness;
  **VH** leans toward vegetation structure. We track both because together they
  separate "rough bare dirt" from "standing crop" better than either alone.

---

## AlphaEarth "embedding" — the AI fingerprint (not a band or index)

The top chart isn't a light measurement at all. **AlphaEarth** is a Google/DeepMind
AI model that watches a whole year of satellite data over a spot and boils it down
to a **64-number fingerprint** of that pixel for that year. We don't interpret the
64 numbers individually — we just measure **how far this year's fingerprint moved
from a baseline year.** A big move = "something meaningfully changed here," without
us having to say what. That's why we pair it with the indices above, which tell us
*what* changed.

---

## Where to learn more (free, good sources)

- **ESA Sentinel-2 bands** (what each band is): https://sentinels.copernicus.eu/web/sentinel/user-guides/sentinel-2-msi/resolutions/spatial
- **NDVI / vegetation indices, plain intro** (USGS): https://www.usgs.gov/special-topics/remote-sensing-phenology/science/ndvi-foundation-remote-sensing-phenology
- **Index DataBase** — searchable catalog of every spectral index and its formula: https://www.indexdatabase.de/
- **Sentinel-1 radar, gentle intro** (NASA SAR handbook): https://nisar.jpl.nasa.gov/mission/get-to-know-sar/overview/
- **Crop residue / tillage indices (NDTI) background**: search "Normalized Difference Tillage Index van Deventer 1997" for the original, or the USDA OpTIS methodology docs.
- **Google Earth Engine dataset pages** (each has a plain description + the bands):
  - AlphaEarth: search "Satellite Embedding" in the Earth Engine Data Catalog
  - Sentinel-2 SR: "COPERNICUS/S2_SR_HARMONIZED"
  - Sentinel-1: "COPERNICUS/S1_GRD"
