"""
final_test.py
The ONE-TIME final test on the held-out seasons 2025-2026 (141 innings).

Everything here was fixed before the script was first run, and is committed to the repository
before any test result exists:

  Model       The frozen ridge model in results/chosen_model.json (runs_10, wkts_10, impact_era;
              weights fitted on 2008-2024). Nothing is refitted, tuned or re-selected here.
  Baselines   Commentator rule (runs_10 x 2); learned ratio and median total, both fitted on all
              2008-2024 development innings (excluding the 11 warm-up innings, exactly as in
              train_validate.py, which produced the validation comparisons on the website).
  Interval    The frozen 90% range: prediction + interval_q05 to prediction + interval_q95.
  Bootstrap   Paired bootstrap of the MAE difference, 5,000 resamples, seed 0 (as in validation).

Pre-specified reading of the result:
  Primary     Model MAE minus commentator MAE. We claim the model beats the commentator on
              unseen seasons only if the 95% CI lies entirely below zero.
  Secondary   The same comparison against the learned ratio and the median total; the 90% range
              coverage (reported as is, not widened); MAE and signed error per season.
  Whatever the numbers, the model is NOT changed afterwards. A worse result than on validation
  is reported as it is.

Run once, from the repository root:  python src/final_test.py
It refuses to run a second time if results/final_test.json already exists.

Outputs: results/final_test.json, results/test_predictions.csv
"""
import json, os, sys
import numpy as np
import pandas as pd

OUT_JSON, OUT_CSV = "results/final_test.json", "results/test_predictions.csv"
if os.path.exists(OUT_JSON):
    sys.exit(f"{OUT_JSON} already exists: the final test has been run. It is run only once.")

SEED, B = 0, 5000
chosen = json.load(open("results/chosen_model.json"))
W = chosen["weights"]
FEATURES = chosen["features"]
assert FEATURES == list(W["coefficients"]), "chosen_model.json is inconsistent"

f = pd.read_csv("data/features_over10.csv", dtype={"match_id": str})
dev = f[(f.season <= 2024) & ~f.warmup]
test = f[f.season >= 2025].copy()
assert len(test) == 141 and set(test.season) == {2025, 2026}, "unexpected test set"
assert test[FEATURES].notna().all().all(), "missing inputs in the test set"

# ---------------------------------------------------------------- predictions (frozen, no refitting)
test["model"] = test.runs_10 + W["intercept"] + sum(W["coefficients"][c] * test[c] for c in FEATURES)
k = dev.final_runs.sum() / dev.runs_10.sum()
test["commentator"] = test.runs_10 * 2
test["learned_ratio"] = test.runs_10 * k
test["median_total"] = float(dev.final_runs.median())
test["lo"] = test.model + chosen["interval_q05"]
test["hi"] = test.model + chosen["interval_q95"]
METHODS = ["model", "commentator", "learned_ratio", "median_total"]

def metrics(pred, actual):
    e = pred - actual                                   # signed: prediction - actual
    return dict(MAE=round(float(e.abs().mean()), 3), RMSE=round(float(np.sqrt((e ** 2).mean())), 3),
                signed=round(float(e.mean()), 3), within15=round(float((e.abs() <= 15).mean()), 3))

rng = np.random.default_rng(SEED)
def paired(a, b):
    """MAE(a) - MAE(b) on the same innings, with a 95% paired bootstrap CI."""
    d = ((test[a] - test.final_runs).abs() - (test[b] - test.final_runs).abs()).values
    means = d[rng.integers(0, len(d), (B, len(d)))].mean(axis=1)
    return dict(diff=round(float(d.mean()), 2), ci_low=round(float(np.percentile(means, 2.5)), 2),
                ci_high=round(float(np.percentile(means, 97.5)), 2))

overall = {m: metrics(test[m], test.final_runs) for m in METHODS}
per_season = {int(s): dict(n=int(len(g)), **{m: metrics(g[m], g.final_runs) for m in METHODS})
              for s, g in test.groupby("season")}
comparisons = {"model_vs_commentator": paired("model", "commentator"),
               "model_vs_learned_ratio": paired("model", "learned_ratio"),
               "model_vs_median_total": paired("model", "median_total")}
inside = (test.final_runs >= test.lo) & (test.final_runs <= test.hi)
coverage = dict(overall=round(float(inside.mean()), 3),
                per_season={int(s): round(float(v), 3) for s, v in inside.groupby(test.season).mean().items()})
primary = comparisons["model_vs_commentator"]

result = dict(
    test_seasons=[2025, 2026], n=int(len(test)),
    frozen_model=dict(features=FEATURES, alpha=chosen["alpha"], weights=W,
                      interval=[chosen["interval_q05"], chosen["interval_q95"]]),
    learned_ratio_k=round(float(k), 4), median_total=float(dev.final_runs.median()),
    overall=overall, per_season=per_season, comparisons=comparisons, interval_coverage=coverage,
    validation_for_reference=chosen["validation"],
    primary_claim_supported=bool(primary["ci_high"] < 0),
)
os.makedirs("results", exist_ok=True)
json.dump(result, open(OUT_JSON, "w"), indent=1)
cols = ["match_id", "date", "season", "venue", "batting_team", "bowling_team", "runs_10", "wkts_10",
        "final_runs", "model", "lo", "hi", "commentator", "learned_ratio", "median_total"]
test[cols].round(2).to_csv(OUT_CSV, index=False)

# ---------------------------------------------------------------- report
print(f"FINAL TEST: {len(test)} innings, seasons 2025-2026 (frozen model, run once)\n")
print(f"{'method':16s} {'MAE':>6s} {'RMSE':>6s} {'signed':>7s} {'within 15':>9s}")
for m in METHODS:
    o = overall[m]
    print(f"{m:16s} {o['MAE']:6.2f} {o['RMSE']:6.2f} {o['signed']:+7.2f} {o['within15']:9.0%}")
print("\nModel MAE minus baseline MAE (negative = model better), 95% paired bootstrap CI:")
for name, c in comparisons.items():
    print(f"  {name:24s} {c['diff']:+6.2f}  [{c['ci_low']:+.2f}, {c['ci_high']:+.2f}]")
print(f"\n90% range coverage: {coverage['overall']:.0%} overall; per season {coverage['per_season']}")
print("Per season (model MAE / signed):", {s: (v['model']['MAE'], v['model']['signed']) for s, v in per_season.items()})
print(f"\nValidation MAE for reference: {chosen['validation']['MAE']:.2f}")
print("Primary claim (model beats commentator on unseen seasons):",
      "SUPPORTED" if result["primary_claim_supported"] else "NOT SUPPORTED", "by the pre-specified CI rule.")
print(f"\nWrote {OUT_JSON} and {OUT_CSV}")
