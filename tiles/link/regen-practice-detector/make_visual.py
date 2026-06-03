"""Build the one-page visual summary: a concept diagram + an assembled HTML
that pulls together the cross-validation and results plots."""
import pathlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

NB = pathlib.Path(__file__).resolve().parent

# --- Concept diagram --------------------------------------------------------
stages = [
    ("Ground truth", "42,000 field records\nMN Tillage Transect\n(all 67 counties)", "#6d4c41"),
    ("Free satellite stack", "Google Earth Engine\nLandsat · Sentinel-2/-1\n· AlphaEarth", "#1565c0"),
    ("Crop-conditioned\nfeatures", "Residue indices\n(NDTI · STI · NDI7)\n+ prior crop", "#2e7d32"),
    ("Classifier", "Random Forest\ntrained on\ncalibration counties", "#5e35b1"),
    ("Held-out counties", "scored on counties\nnever seen\nin training", "#00838f"),
    ("Result", "AUC 0.78–0.83\nbeats ~63%\ncommercial benchmark", "#c62828"),
]
fig, ax = plt.subplots(figsize=(15, 3.6))
ax.set_xlim(0, len(stages) * 2.5); ax.set_ylim(0, 3); ax.axis("off")
ax.text(len(stages) * 1.25, 2.78, "Detecting regenerative practice from open data — validated against real ground truth",
        ha="center", fontsize=15, fontweight="bold")
w, h, y = 2.0, 1.5, 0.7
for i, (title, body, col) in enumerate(stages):
    x = i * 2.5 + 0.15
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.05,rounding_size=0.12",
                                fc=col, ec="none", alpha=0.92))
    ax.text(x + w / 2, y + h - 0.32, title, ha="center", va="center", color="white",
            fontsize=10.5, fontweight="bold")
    ax.text(x + w / 2, y + 0.5, body, ha="center", va="center", color="white", fontsize=8.3)
    if i < len(stages) - 1:
        ax.add_patch(FancyArrowPatch((x + w, y + h / 2), (x + 2.5 + 0.13, y + h / 2),
                                     arrowstyle="-|>", mutation_scale=18, color="#444", lw=1.6))
ax.text(len(stages) * 1.25, 0.25,
        "Two complementary signals underneath: AlphaEarth annual embeddings flag that *something changed*; "
        "Sentinel/Landsat seasonal indices say *what changed*.",
        ha="center", fontsize=8.5, style="italic", color="#555")
plt.tight_layout()
plt.savefig(NB / "concept_diagram.png", dpi=120, bbox_inches="tight")
print("wrote concept_diagram.png")

# --- Assembled visual summary HTML -----------------------------------------
html = """<meta charset=utf-8>
<style>
 body{font-family:Segoe UI,-apple-system,Roboto,sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;color:#1a1a1a;line-height:1.5}
 h1{font-size:24px;margin-bottom:4px} .sub{color:#666;margin-top:0}
 .kpis{display:flex;gap:14px;margin:20px 0;flex-wrap:wrap}
 .kpi{flex:1;min-width:170px;background:#f5f7fa;border:1px solid #e0e4ea;border-radius:10px;padding:14px 16px}
 .kpi .n{font-size:26px;font-weight:700;color:#0d47a1} .kpi .l{font-size:12.5px;color:#555;margin-top:2px}
 img{max-width:100%;border:1px solid #e0e4ea;border-radius:8px;margin:8px 0}
 .cap{font-size:13px;color:#555;margin:2px 0 22px}
 .row{display:flex;gap:16px;flex-wrap:wrap} .row>div{flex:1;min-width:340px}
</style>
<h1>Regenerative-practice detection — visual summary</h1>
<p class="sub">At-scale validation against real ground truth · 2026-06-03</p>

<div class="kpis">
  <div class="kpi"><div class="n">42,000</div><div class="l">real field observations (MN Tillage Transect, 67 counties)</div></div>
  <div class="kpi"><div class="n">0.78&ndash;0.83</div><div class="l">held-out AUC (cross-validated, &plusmn;0.03)</div></div>
  <div class="kpi"><div class="n">72&ndash;76%</div><div class="l">balanced accuracy on unseen counties</div></div>
  <div class="kpi"><div class="n">&gt; ~63%</div><div class="l">meets/beats commercial tillage benchmark</div></div>
</div>

<img src="concept_diagram.png">
<p class="cap"><b>The approach.</b> Free, open data end-to-end; the model is trained on some counties and graded on entirely separate ones, so the score reflects real generalization.</p>

<div class="row">
 <div>
  <img src="cv_plot.png">
  <p class="cap"><b>Cross-validated accuracy.</b> Each dot is one county-fold; bars are mean &plusmn; spread. Well above random (0.50) and the earlier 0.66 baseline, with a tight band.</p>
 </div>
 <div>
  <img src="scoreboard_v2_plots.png">
  <p class="cap"><b>Where it's right, and what drives it.</b> Confusion matrix on held-out counties (clear case) and the top features &mdash; note prior-crop conditioning (<code>resid_corn</code>) leads.</p>
 </div>
</div>
"""
(NB / "visual_summary.html").write_text(html, encoding="utf-8")
print("wrote visual_summary.html")
