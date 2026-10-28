"""
explore_after_test.py
Exploratory checks run AFTER the final test, to explain the model on the website.
Development seasons only (2008-2024), walk-forward folds 2019-2024, same ridge as train_validate.py.
Nothing here changes the model: the final test has been used, so no new model can be tested fairly.

Output: results/exploratory_after_test.json
"""
import json, warnings
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.ensemble import GradientBoostingRegressor

warnings.filterwarnings("ignore")
FOLDS = range(2019, 2025)
ALPHA = json.load(open("results/chosen_model.json"))["alpha"]
f = pd.read_csv("data/features_over10.csv", dtype={"match_id": str})
f = f[(f.season <= 2024) & ~f.warmup].reset_index(drop=True)          # never load test seasons
F = ["runs_10", "wkts_10", "impact_era"]
ALL = ["runs_10", "wkts_10", "runs_last5", "wkts_last5", "runs_last2", "wkts_last2", "venue_avg", "league_back10", "impact_era"]
for k in range(1, 6):
    f[f"wk{k}"] = (f.wkts_10.clip(upper=5) == k).astype(int)            # wickets as categories (0 is the base)
f["wkts_sq"] = f.wkts_10 ** 2
f["runs_x_wkts"] = f.runs_10 * f.wkts_10
ridge = lambda: make_pipeline(StandardScaler(), Ridge(alpha=ALPHA))
gbr = lambda: GradientBoostingRegressor(n_estimators=200, max_depth=2, learning_rate=0.03, subsample=0.8, random_state=0)

def errors(cols, make):
    out = []
    for s in FOLDS:
        tr, va = f[f.season < s], f[f.season == s]
        m = make().fit(tr[cols], tr.runs_to_come)
        out.append((va.runs_to_come - m.predict(va[cols])).abs())
    return pd.concat(out).values

rng = np.random.default_rng(0)
def gain(a, b):
    """MAE(b) - MAE(a), negative = b better, with a 95% paired bootstrap CI (5,000 resamples)."""
    d = b - a
    means = d[rng.integers(0, len(d), (5000, len(d)))].mean(axis=1)
    return dict(diff=round(float(d.mean()), 2), ci_low=round(float(np.percentile(means, 2.5)), 2),
                ci_high=round(float(np.percentile(means, 97.5)), 2))

# 1. Impact Player flag: what the model could learn in each fold
era = []
for s in FOLDS:
    tr, va = f[f.season < s], f[f.season == s]
    m = ridge().fit(tr[F], tr.runs_to_come)
    w = m.named_steps["ridge"].coef_ / m.named_steps["standardscaler"].scale_
    no_era = ridge().fit(tr[F[:2]], tr.runs_to_come)
    era.append(dict(fold=s, train_rows_with_flag=int(tr.impact_era.sum()), era_weight=round(float(w[2]), 2),
                    mae_with_era=round(float((va.runs_to_come - m.predict(va[F])).abs().mean()), 2),
                    mae_without_era=round(float((va.runs_to_come - no_era.predict(va[F[:2]])).abs().mean()), 2)))

# 2. Learned ratio per fold: sum of final totals / sum of over-10 scores of earlier seasons
ratio = {str(s): round(float(f[f.season < s].final_runs.sum() / f[f.season < s].runs_10.sum()), 3) for s in FOLDS}
ratio["final_2008_2024"] = round(float(f.final_runs.sum() / f.runs_10.sum()), 3)

# 3. Runs still to come by wickets at over 10 (raw averages)
by_wkts = {str(int(k)): dict(innings=int(len(g)), avg_to_come=round(float(g.runs_to_come.mean()), 1))
           for k, g in f.groupby(f.wkts_10.clip(upper=6))}

# 4. Exploratory variants (walk-forward MAE); none is used for anything
base = errors(F, ridge)
cats = errors(["runs_10", "impact_era", "wk1", "wk2", "wk3", "wk4", "wk5"], ridge)
variants = {
    "ridge_our_model": round(float(base.mean()), 3),
    "ridge_wickets_squared": round(float(errors(F + ["wkts_sq"], ridge).mean()), 3),
    "ridge_wickets_as_categories": round(float(cats.mean()), 3),
    "ridge_runs_x_wickets": round(float(errors(F + ["runs_x_wkts"], ridge).mean()), 3),
    "gbr_our_3_features": round(float(errors(F, gbr).mean()), 3),
    "gbr_all_9_features": round(float(errors(ALL, gbr).mean()), 3),
}
result = dict(note="Exploratory, run after the final test; not used for any decision.",
              impact_flag_by_fold=era, learned_ratio_by_fold=ratio, runs_to_come_by_wickets=by_wkts,
              variants_walk_forward_mae=variants, wicket_categories_vs_linear=gain(base, cats))
json.dump(result, open("results/exploratory_after_test.json", "w"), indent=1)
print(json.dumps(result, indent=1))
