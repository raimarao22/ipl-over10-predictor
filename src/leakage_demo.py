"""
leakage_demo.py
A deliberate mistake, for teaching: what happens if the venue average is computed from ALL
development seasons (including the match being predicted and later matches) instead of only
earlier matches? Both versions use the same model and walk-forward folds 2019-2024.
The leaky version is never used for any decision; it only shows how leakage flatters results.

Output: results/leakage_demo.json
"""
import json, warnings
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge

warnings.filterwarnings("ignore")
DEV_END, FOLDS, SHRINK_M = 2024, list(range(2019, 2025)), 10
ALPHA = json.load(open("results/chosen_model.json"))["alpha"]
f = pd.read_csv("data/features_over10.csv", dtype={"match_id": str})
f = f[(f.season <= DEV_END) & ~f.warmup].reset_index(drop=True)      # never load test seasons

# WRONG: venue average over every development innings at that venue, including this match and the future
league = f.final_runs.mean()
g = f.groupby("venue").final_runs.agg(["sum", "count"])
f["venue_avg_leaky"] = f.venue.map((g["sum"] + SHRINK_M * league) / (g["count"] + SHRINK_M))

def run(venue_col):
    feats = ["runs_10", "wkts_10", "impact_era", venue_col]
    per_fold, errs = [], []
    for s in FOLDS:
        tr, va = f[f.season < s], f[f.season == s]
        m = make_pipeline(StandardScaler(), Ridge(alpha=ALPHA)).fit(tr[feats], tr.runs_to_come)
        e = (va.runs_10 + m.predict(va[feats]) - va.final_runs).abs()
        per_fold.append(dict(fold=s, MAE=round(e.mean(), 2))); errs.append(e)
    return round(pd.concat(errs).mean(), 3), per_fold

correct, correct_folds = run("venue_avg")
leaky, leaky_folds = run("venue_avg_leaky")
out = dict(features="runs_10, wkts_10, impact_era, venue average", correct_MAE=correct, leaky_MAE=leaky,
           correct_folds=correct_folds, leaky_folds=leaky_folds)
json.dump(out, open("results/leakage_demo.json", "w"), indent=1)
print(f"Correct (earlier matches only): {correct:.2f}  |  Leaky (all seasons): {leaky:.2f}  |  "
      f"leakage makes it look {correct - leaky:.2f} runs better")
