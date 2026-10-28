"""
verify_final_test.py
Read-only check of the published final test. It does NOT re-run or replace the one-time test
(src/final_test.py, which is kept unchanged and refuses a second run).

It rebuilds the 2025-2026 evaluation from the frozen model and the recorded procedure, and checks:
  1. predictions from the frozen coefficients match results/test_predictions.csv
  2. MAE, RMSE, signed error and within-15 (overall and per season) match results/final_test.json
  3. baseline predictions and the paired-bootstrap comparison intervals reproduce
     (same baselines, 5,000 resamples, seed 0, same comparison order as final_test.py)
  4. 90% range coverage (overall and per season) and the primary-claim verdict match
  5. no file under results/, docs/ or src/ is modified by this check
Tolerances allow for rounding in the committed files: predictions 2 decimals, metrics 3, CIs 2.

Run from the repository root, after scripts 1 and 4 have recreated data/features_over10.csv:
  python src/verify_final_test.py
Exit code 0 means everything matches; 1 lists what does not.
"""
import hashlib, json, os, sys
import numpy as np
import pandas as pd

def snapshot():
    """Hash of every file in the folders that hold committed results, website and code."""
    h = {}
    for folder in ["results", "docs", "src"]:
        for root, _, files in os.walk(folder):
            for name in files:
                p = os.path.join(root, name)
                h[p] = hashlib.sha256(open(p, "rb").read()).hexdigest()
    return h
before = snapshot()

TOL_PRED, TOL_METRIC, TOL_CI = 0.006, 0.0011, 0.006
problems = []
def check(label, ours, published, tol):
    if abs(float(ours) - float(published)) > tol:
        problems.append(f"{label}: recomputed {float(ours):.4f}, published {float(published):.4f}")

chosen = json.load(open("results/chosen_model.json"))
pub = json.load(open("results/final_test.json"))
saved = pd.read_csv("results/test_predictions.csv", dtype={"match_id": str})
W, FEATURES = chosen["weights"], chosen["features"]

f = pd.read_csv("data/features_over10.csv", dtype={"match_id": str})
dev = f[(f.season <= 2024) & ~f.warmup]
test = f[f.season >= 2025].copy()

# ---- same definitions and order as final_test.py
test["model"] = test.runs_10 + W["intercept"] + sum(W["coefficients"][c] * test[c] for c in FEATURES)
k = dev.final_runs.sum() / dev.runs_10.sum()
test["commentator"] = test.runs_10 * 2
test["learned_ratio"] = test.runs_10 * k
test["median_total"] = float(dev.final_runs.median())
test["lo"] = test.model + chosen["interval_q05"]
test["hi"] = test.model + chosen["interval_q95"]
METHODS = ["model", "commentator", "learned_ratio", "median_total"]

# ---- 1. predictions (and baseline predictions) match the committed file
check("number of test innings", len(test), pub["n"], 0)
if set(test.match_id) != set(saved.match_id) or len(test) != len(saved):
    problems.append("the set of test innings differs from results/test_predictions.csv")
else:
    m = test.merge(saved, on="match_id", suffixes=("", "_saved"))
    for col in ["final_runs", "runs_10", "wkts_10"] + METHODS + ["lo", "hi"]:
        gap = float((m[col] - m[f"{col}_saved"]).abs().max())
        if gap > TOL_PRED:
            problems.append(f"{col}: recomputed values differ from the committed CSV by up to {gap:.3f}")
check("learned ratio k", k, pub["learned_ratio_k"], 0.00006)
check("median total", float(dev.final_runs.median()), pub["median_total"], 0)

# ---- 2. metrics, overall and per season
def metrics(pred, actual):
    e = pred - actual
    return dict(MAE=e.abs().mean(), RMSE=np.sqrt((e ** 2).mean()), signed=e.mean(), within15=(e.abs() <= 15).mean())
for meth in METHODS:
    ours = metrics(test[meth], test.final_runs)
    for key in ["MAE", "RMSE", "signed", "within15"]:
        check(f"overall {meth} {key}", ours[key], pub["overall"][meth][key], TOL_METRIC)
for season, g in test.groupby("season"):
    p = pub["per_season"][str(season)]
    check(f"{season} innings", len(g), p["n"], 0)
    for meth in METHODS:
        ours = metrics(g[meth], g.final_runs)
        for key in ["MAE", "RMSE", "signed", "within15"]:
            check(f"{season} {meth} {key}", ours[key], p[meth][key], TOL_METRIC)

# ---- 3. comparison intervals: paired bootstrap, B = 5000, seed 0, same order as final_test.py
rng = np.random.default_rng(0)
def paired(a, b):
    d = ((test[a] - test.final_runs).abs() - (test[b] - test.final_runs).abs()).values
    means = d[rng.integers(0, len(d), (5000, len(d)))].mean(axis=1)
    return d.mean(), np.percentile(means, 2.5), np.percentile(means, 97.5)
recomputed = {}
for name, (a, b) in {"model_vs_commentator": ("model", "commentator"),
                     "model_vs_learned_ratio": ("model", "learned_ratio"),
                     "model_vs_median_total": ("model", "median_total")}.items():
    diff, lo, hi = paired(a, b)
    recomputed[name] = (diff, lo, hi)
    check(f"{name} difference", diff, pub["comparisons"][name]["diff"], TOL_CI)
    check(f"{name} CI low", lo, pub["comparisons"][name]["ci_low"], TOL_CI)
    check(f"{name} CI high", hi, pub["comparisons"][name]["ci_high"], TOL_CI)

# ---- 4. range coverage and the primary-claim verdict
inside = (test.final_runs >= test.lo) & (test.final_runs <= test.hi)
check("coverage overall", inside.mean(), pub["interval_coverage"]["overall"], TOL_METRIC)
for season, v in inside.groupby(test.season).mean().items():
    check(f"coverage {season}", v, pub["interval_coverage"]["per_season"][str(season)], TOL_METRIC)
verdict = bool(recomputed["model_vs_commentator"][2] < 0)       # pre-set rule: whole CI below 0
if verdict != pub["primary_claim_supported"]:
    problems.append(f"primary-claim verdict: recomputed {verdict}, published {pub['primary_claim_supported']}")

# ---- 5. nothing was modified
after = snapshot()
changed = sorted(p for p in set(before) | set(after) if before.get(p) != after.get(p))
if changed:
    problems.append("files changed during the check: " + ", ".join(changed))

# ---- report
o, c = pub["overall"], pub["comparisons"]["model_vs_commentator"]
print(f"Published final test (2025-2026, {pub['n']} innings, run once):")
print(f"  MAE: model {o['model']['MAE']:.2f}, commentator {o['commentator']['MAE']:.2f}, "
      f"learned ratio {o['learned_ratio']['MAE']:.2f}, median {o['median_total']['MAE']:.2f}")
print(f"  model minus commentator: {c['diff']:+.2f} runs, 95% CI [{c['ci_low']:+.2f}, {c['ci_high']:+.2f}]; "
      f"coverage {pub['interval_coverage']['overall']:.1%}")
if problems:
    print(f"\nNOT REPRODUCED ({len(problems)} problem(s)):")
    for p in problems:
        print("  - " + p)
    sys.exit(1)
print("\nReproduced: predictions, all metrics (overall and per season), bootstrap intervals, coverage and")
print("the verdict match the published files. No file was modified.")
