"""
ablation_all.py
Walk-forward MAE for EVERY combination of the six feature groups (2^6 = 64 models),
for the website's ablation explorer. Same setup as train_validate.py: ridge (alpha from
results/chosen_model.json), folds 2019-2024, development seasons only. This script makes
no decisions; it only reports.

It also measures, with the same paired bootstrap as train_validate.py (5,000 resamples, seed 0),
where the gain over the baselines comes from. These comparisons were added AFTER the model was
chosen, to check the website's explanations; they were not used for any decision.

Outputs: results/ablation_all.csv, results/feature_gains.json
"""
import itertools, json, warnings
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge

warnings.filterwarnings("ignore")
DEV_END, FOLDS = 2024, list(range(2019, 2025))
ALPHA = json.load(open("results/chosen_model.json"))["alpha"]
f = pd.read_csv("data/features_over10.csv", dtype={"match_id": str})
f = f[(f.season <= DEV_END) & ~f.warmup].reset_index(drop=True)      # never load test seasons

GROUPS = {"wickets": ["wkts_10"], "last5": ["runs_last5", "wkts_last5"], "last2": ["runs_last2", "wkts_last2"],
          "venue": ["venue_avg"], "league": ["league_back10"], "era": ["impact_era"]}

def mae(features):
    err = []
    for s in FOLDS:
        tr, va = f[f.season < s], f[f.season == s]
        m = make_pipeline(StandardScaler(), Ridge(alpha=ALPHA)).fit(tr[features], tr.runs_to_come)
        e = va.runs_10 + m.predict(va[features]) - va.final_runs
        err.append(pd.DataFrame({"fold": s, "e": e}))
    e = pd.concat(err)
    new = e[e.fold >= 2023]
    return e.e.abs().mean(), new.e.abs().mean(), new.e.mean()

rows = []
for k in range(len(GROUPS) + 1):
    for combo in itertools.combinations(GROUPS, k):
        cols = ["runs_10"] + [c for g in combo for c in GROUPS[g]]
        m, m_new, s_new = mae(cols)
        rows.append({**{g: int(g in combo) for g in GROUPS}, "MAE": round(m, 3),
                     "MAE_2023_24": round(m_new, 3), "signed_2023_24": round(s_new, 3)})
out = pd.DataFrame(rows).sort_values("MAE")
out.to_csv("results/ablation_all.csv", index=False)
print(f"{len(out)} combinations. Best five:")
print(out.head(5).to_string(index=False))
sel = out[(out.wickets == 1) & (out.era == 1) & (out[["last5", "last2", "venue", "league"]].sum(axis=1) == 0)]
print("\nSelected model (runs, wickets, era):", sel.MAE.iloc[0])

# ---------------------------------------------------------------- where does the gain come from? (post-hoc evidence)
rng = np.random.default_rng(0)
def errors(features=None, kind=None):
    """Absolute error per validation innings, in a fixed order."""
    out = []
    for s in FOLDS:
        tr, va = f[f.season < s], f[f.season == s]
        if kind == "x2":
            pred = va.runs_10 * 2
        elif kind == "ratio":                                   # same definition as baselines.py
            pred = va.runs_10 * (tr.final_runs.sum() / tr.runs_10.sum())
        else:
            m = make_pipeline(StandardScaler(), Ridge(alpha=ALPHA)).fit(tr[features], tr.runs_to_come)
            pred = va.runs_10 + m.predict(va[features])
        out.append(pd.DataFrame({"fold": s, "ae": (pred - va.final_runs).abs().values}))
    return pd.concat(out, ignore_index=True)

def gain(a, b, mask=None):
    """MAE(b) - MAE(a): negative means b is better. 95% paired bootstrap CI."""
    d = (b.ae - a.ae).values if mask is None else (b.ae - a.ae).values[mask]
    means = d[rng.integers(0, len(d), (5000, len(d)))].mean(axis=1)
    return dict(diff=round(float(d.mean()), 2), ci_low=round(float(np.percentile(means, 2.5)), 2),
                ci_high=round(float(np.percentile(means, 97.5)), 2), n=int(len(d)))

X2, RATIO = errors(kind="x2"), errors(kind="ratio")
SCORE = errors(["runs_10"])
SW = errors(["runs_10", "wkts_10"])
SE = errors(["runs_10", "impact_era"])
SWE = errors(["runs_10", "wkts_10", "impact_era"])
new = (SW.fold >= 2023).values
gains = {
    "score_only_vs_commentator": gain(X2, SCORE),
    "score_only_vs_learned_ratio": gain(RATIO, SCORE),
    "add_wickets_to_score": gain(SCORE, SW),
    "add_era_to_score_and_wickets": gain(SW, SWE),
    "add_era_to_score_and_wickets_2023_24": gain(SW, SWE, new),
    "add_wickets_to_score_and_era": gain(SE, SWE),
}
json.dump(gains, open("results/feature_gains.json", "w"), indent=1)
print("\nWhere the gain comes from (MAE change in runs, 95% CI; negative = better):")
for k, v in gains.items():
    print(f"  {k:40s} {v['diff']:+.2f}  [{v['ci_low']:+.2f}, {v['ci_high']:+.2f}]  n={v['n']}")
