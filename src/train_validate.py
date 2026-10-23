"""
train_validate.py
All modelling decisions, made with walk-forward validation on the DEVELOPMENT period only.

Folds: for each season s in 2019..2024, train on seasons < s, predict season s.
Test seasons (2025-2026) are removed at load time and never touched here.

Target: runs_to_come (final - runs_10); predictions are turned back into final totals,
and every error is reported on the final total, in runs (prediction - actual).

Decision rules (fixed before the final test):
  1. Ridge alpha: lowest pooled MAE on the full proposed feature set.
  2. Features: backward elimination over feature GROUPS. A group is dropped if removing it
     makes pooled MAE worse by less than TOL runs (simpler model preferred within TOL).
  3. Training window / recency weighting: kept at "all seasons, equal weight" unless an
     alternative lowers pooled MAE by at least TOL runs.
  4. Tree ensemble: replaces ridge only if the paired-bootstrap 95% CI of
     (ensemble MAE - ridge MAE) lies entirely below 0.

Outputs (results/, committed to the repo):
  validation_results.csv   every configuration tried, with its metrics
  oos_predictions.csv      out-of-sample predictions of the chosen model, folds 2019-2024
  chosen_model.json        the frozen configuration and exact ridge weights
                           (refit on all of 2008-2024), used by final_test.py and the website
"""
import json, os, warnings
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor

warnings.filterwarnings("ignore")
DEV_END, FOLDS, TOL, SEED = 2024, list(range(2019, 2025)), 0.10, 0
rng = np.random.default_rng(SEED)

f = pd.read_csv("data/features_over10.csv", dtype={"match_id": str})
f = f[(f.season <= DEV_END) & ~f.warmup].reset_index(drop=True)      # never load test seasons

GROUPS = {                                  # feature groups, in the proposal's ladder order
    "wickets": ["wkts_10"],
    "last5":   ["runs_last5", "wkts_last5"],
    "last2":   ["runs_last2", "wkts_last2"],
    "venue":   ["venue_avg"],
    "league":  ["league_back10"],
    "era":     ["impact_era"],
}
def cols(groups):
    return ["runs_10"] + [c for g in groups for c in GROUPS[g]]

def ridge(alpha):
    return lambda: make_pipeline(StandardScaler(), Ridge(alpha=alpha))

# ---------------------------------------------------------------- helpers
def walk_forward(features, make_model, start=2008, half_life=None):
    """Out-of-sample predictions for every fold. Returns one row per validation innings."""
    out = []
    for s in FOLDS:
        tr = f[(f.season < s) & (f.season >= start)]
        va = f[f.season == s]
        m = make_model()
        if half_life is None:
            m.fit(tr[features], tr.runs_to_come)
        else:                                   # recent seasons count more
            w = (0.5 ** ((s - 1 - tr.season) / half_life)).values
            last = m.steps[-1][0] if hasattr(m, "steps") else None
            m.fit(tr[features], tr.runs_to_come, **({f"{last}__sample_weight": w} if last else {"sample_weight": w}))
        pred = va.runs_10 + m.predict(va[features])
        out.append(pd.DataFrame({"fold": s, "match_id": va.match_id, "pred": pred,
                                 "actual": va.final_runs, "err": pred - va.final_runs}))
    return pd.concat(out, ignore_index=True)

def baseline(kind):
    out = []
    for s in FOLDS:
        tr, va = f[f.season < s], f[f.season == s]
        if kind == "x2":      pred = va.runs_10 * 2
        elif kind == "ratio": pred = va.runs_10 * (tr.final_runs.sum() / tr.runs_10.sum())
        else:                 pred = pd.Series(tr.final_runs.median(), index=va.index)
        out.append(pd.DataFrame({"fold": s, "match_id": va.match_id, "pred": pred,
                                 "actual": va.final_runs, "err": pred - va.final_runs}))
    return pd.concat(out, ignore_index=True)

def metrics(o):
    old, new = o[o.fold <= 2022], o[o.fold >= 2023]
    return dict(MAE=o.err.abs().mean(), RMSE=np.sqrt((o.err ** 2).mean()), signed=o.err.mean(),
                within15=(o.err.abs() <= 15).mean(),
                MAE_2019_22=old.err.abs().mean(), signed_2019_22=old.err.mean(),
                MAE_2023_24=new.err.abs().mean(), signed_2023_24=new.err.mean())

def paired_boot(o1, o2, B=5000):
    """MAE(o1) - MAE(o2) on the same innings, with a 95% bootstrap CI."""
    d = (o1.err.abs().values - o2.err.abs().values)
    means = d[rng.integers(0, len(d), (B, len(d)))].mean(axis=1)
    return d.mean(), np.percentile(means, 2.5), np.percentile(means, 97.5)

results = []
def record(section, name, o, **extra):
    results.append(dict(section=section, config=name, **metrics(o), **extra))
    m = metrics(o)
    print(f"  {name:38s} MAE {m['MAE']:5.2f} | RMSE {m['RMSE']:5.2f} | signed {m['signed']:+5.2f} | "
          f"2023-24 MAE {m['MAE_2023_24']:5.2f}, signed {m['signed_2023_24']:+5.1f}")
    return m["MAE"]

# ---------------------------------------------------------------- 1. baselines
print("1. Baselines")
B = {k: baseline(k) for k in ["x2", "ratio", "median"]}
record("baseline", "commentator: runs_10 x 2", B["x2"])
record("baseline", "learned ratio: runs_10 x k", B["ratio"])
record("baseline", "median of earlier totals", B["median"])

# ---------------------------------------------------------------- 2. ridge alpha
print("\n2. Ridge alpha (full proposed feature set)")
full = cols(GROUPS)
alpha_mae = {a: record("alpha", f"ridge alpha={a}", walk_forward(full, ridge(a)), alpha=a)
             for a in [0.1, 1, 10, 100]}
ALPHA = min(alpha_mae, key=alpha_mae.get)
print(f"  -> alpha = {ALPHA}")

# ---------------------------------------------------------------- 3. ablation ladder (reporting)
print("\n3. Ablation ladder (ridge)")
ladder = [("runs only", []), ("+ wickets", ["wickets"]), ("+ last 5 overs", ["wickets", "last5"]),
          ("+ last 2 overs", ["wickets", "last5", "last2"]),
          ("+ venue", ["wickets", "last5", "last2", "venue"]),
          ("+ league scoring level", ["wickets", "last5", "last2", "venue", "league"]),
          ("+ impact era (instead of league)", ["wickets", "last5", "last2", "venue", "era"]),
          ("+ both era features", ["wickets", "last5", "last2", "venue", "league", "era"])]
for name, gs in ladder:
    record("ladder", name, walk_forward(cols(gs), ridge(ALPHA)), features=" ".join(cols(gs)))

# ---------------------------------------------------------------- 4. feature selection
print(f"\n4. Backward elimination (drop a group if MAE worsens by < {TOL} runs)")
current = list(GROUPS)
cur_mae = metrics(walk_forward(cols(current), ridge(ALPHA)))["MAE"]
while current:
    trial = {g: metrics(walk_forward(cols([x for x in current if x != g]), ridge(ALPHA)))["MAE"]
             for g in current}
    g, m = min(trial.items(), key=lambda kv: kv[1])
    print(f"  current {current}: MAE {cur_mae:.3f}; best drop '{g}' -> {m:.3f}")
    if m < cur_mae + TOL:
        current.remove(g); cur_mae = m
    else:
        break
FEATURES = cols(current)
print(f"  -> selected features: {FEATURES}")
O_sel = walk_forward(FEATURES, ridge(ALPHA))
record("selected", "ridge, selected features", O_sel, features=" ".join(FEATURES))

# ---------------------------------------------------------------- 5. training window
print(f"\n5. Training window / recency weighting (adopt only if MAE improves by >= {TOL})")
window = dict(start=2008, half_life=None)
best_mae = metrics(O_sel)["MAE"]
for name, kw in [("start 2012", dict(start=2012)), ("start 2015", dict(start=2015)),
                 ("half-life 3 seasons", dict(half_life=3)), ("half-life 5 seasons", dict(half_life=5))]:
    m = record("window", name, walk_forward(FEATURES, ridge(ALPHA), **kw))
    if m <= best_mae - TOL:
        best_mae, window = m, dict(start=kw.get("start", 2008), half_life=kw.get("half_life"))
print(f"  -> training window: {window}")
O_ridge = walk_forward(FEATURES, ridge(ALPHA), **window)

# ---------------------------------------------------------------- 6. tree ensembles
print("\n6. Tree ensembles on the selected features")
trees = {
    "gbr depth2 n200": lambda: GradientBoostingRegressor(n_estimators=200, max_depth=2, learning_rate=0.03, subsample=0.8, random_state=SEED),
    "gbr depth3 n150": lambda: GradientBoostingRegressor(n_estimators=150, max_depth=3, learning_rate=0.03, subsample=0.8, random_state=SEED),
    "rf leaf20":       lambda: RandomForestRegressor(n_estimators=300, min_samples_leaf=20, random_state=SEED, n_jobs=-1),
    "rf leaf40":       lambda: RandomForestRegressor(n_estimators=300, min_samples_leaf=40, random_state=SEED, n_jobs=-1),
}
tree_out = {k: walk_forward(FEATURES, mk, **window) for k, mk in trees.items()}
for k, o in tree_out.items():
    record("tree", k, o)
best_tree = min(tree_out, key=lambda k: metrics(tree_out[k])["MAE"])
d, lo, hi = paired_boot(tree_out[best_tree], O_ridge)
use_tree = hi < 0
print(f"  best ensemble '{best_tree}' minus ridge: {d:+.2f} runs, 95% CI [{lo:+.2f}, {hi:+.2f}]"
      f" -> {'use ensemble' if use_tree else 'keep ridge'}")
MODEL = best_tree if use_tree else "ridge"
O_final = tree_out[best_tree] if use_tree else O_ridge

# ---------------------------------------------------------------- 7. chosen model vs baselines
print("\n7. Chosen model vs baselines (paired bootstrap, MAE difference in runs)")
runs_only = walk_forward(["runs_10"], ridge(ALPHA))
comparisons = {}
for name, other in [("commentator x2", B["x2"]), ("learned ratio", B["ratio"]),
                    ("ridge on runs_10 only", runs_only)]:
    d, lo, hi = paired_boot(O_final, other)
    comparisons[name] = dict(diff=round(d, 2), ci_low=round(lo, 2), ci_high=round(hi, 2))
    print(f"  chosen minus {name:22s}: {d:+.2f}  [{lo:+.2f}, {hi:+.2f}]")

# ---------------------------------------------------------------- 8. prediction intervals
print("\n8. 90% prediction intervals from earlier folds' out-of-sample residuals")
O_final = O_final.copy()
O_final["resid"] = O_final.actual - O_final.pred           # actual - prediction
cover = []
for s in FOLDS[1:]:                                         # 2020-2024: only earlier folds' residuals
    r = O_final[O_final.fold < s].resid
    q05, q95 = r.quantile(0.05), r.quantile(0.95)
    va = O_final[O_final.fold == s]
    inside = ((va.actual >= va.pred + q05) & (va.actual <= va.pred + q95)).mean()
    cover.append(dict(fold=s, q05=q05, q95=q95, coverage=inside, n=len(va)))
    print(f"  fold {s}: interval pred{q05:+.1f} to pred{q95:+.1f}, coverage {inside:.0%} (n={len(va)})")
C = pd.DataFrame(cover)
pooled_cov = np.average(C.coverage, weights=C.n)
Q05, Q95 = O_final.resid.quantile(0.05), O_final.resid.quantile(0.95)
print(f"  pooled coverage 2020-2024: {pooled_cov:.0%} (target 90%)")
print(f"  interval for the final test (all folds' residuals): pred{Q05:+.1f} to pred{Q95:+.1f}")

# ---------------------------------------------------------------- 9. frozen weights
# Refit the chosen configuration on ALL development seasons (2008-2024).
# This is the model final_test.py will evaluate, and the website will run in the browser.
print("\n9. Frozen model: refit on all development seasons 2008-2024")
weights = None
if MODEL == "ridge":
    tr = f[f.season >= window["start"]]
    m = ridge(ALPHA)()
    if window["half_life"] is None:
        m.fit(tr[FEATURES], tr.runs_to_come)
    else:
        w = (0.5 ** ((DEV_END - tr.season) / window["half_life"])).values
        m.fit(tr[FEATURES], tr.runs_to_come, ridge__sample_weight=w)
    sc, rg = m.named_steps["standardscaler"], m.named_steps["ridge"]
    coef = rg.coef_ / sc.scale_                              # back to original units
    intercept = rg.intercept_ - float((coef * sc.mean_).sum())
    weights = dict(target="runs_to_come", fitted_on="2008-2024",
                   intercept=round(intercept, 6),
                   coefficients={c: round(float(b), 6) for c, b in zip(FEATURES, coef)})
    # sanity check: the plain formula reproduces the pipeline exactly
    manual = intercept + tr[FEATURES].values @ coef
    assert np.allclose(manual, m.predict(tr[FEATURES])), "weight export mismatch"
    terms = " ".join(f"{b:+.3f}*{c}" for c, b in zip(FEATURES, coef))
    print(f"  runs_to_come = {intercept:.2f} {terms}")
    print("  predicted final total = runs_10 + runs_to_come")

# ---------------------------------------------------------------- save
os.makedirs("results", exist_ok=True)
pd.DataFrame(results).round(3).to_csv("results/validation_results.csv", index=False)
O_final.round(3).to_csv("results/oos_predictions.csv", index=False)
chosen = dict(model=MODEL, alpha=ALPHA, features=FEATURES, train_start=window["start"],
              half_life=window["half_life"], tolerance_runs=TOL,
              weights=weights,
              interval_q05=round(Q05, 2), interval_q95=round(Q95, 2),
              validation=dict({k: round(v, 3) for k, v in metrics(O_final).items()},
                              interval_coverage_2020_24=round(pooled_cov, 3)),
              comparisons=comparisons)
with open("results/chosen_model.json", "w") as fh:
    json.dump(chosen, fh, indent=2)
print("\nSaved results/validation_results.csv, results/oos_predictions.csv, results/chosen_model.json")
print(json.dumps({k: chosen[k] for k in ["model", "alpha", "features", "train_start", "half_life"]}))
