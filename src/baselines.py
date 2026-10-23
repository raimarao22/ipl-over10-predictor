"""
baselines.py
Baselines on walk-forward folds within the DEVELOPMENT period (2008-2024).
For each fold season s in 2019..2024: fit on seasons < s, evaluate on season s.
Test seasons (2025-2026) are removed at load time and never used here.
"""
import os
import numpy as np
import pandas as pd

DEV_END, FOLDS = 2024, range(2019, 2025)
df = pd.read_csv("data/first_innings_over10.csv")
df = df[df.season <= DEV_END]        # never load test seasons

rows = []
for s in FOLDS:
    train, val = df[df.season < s], df[df.season == s]
    ratio = train.final_runs.sum() / train.runs_10.sum()      # learned multiplier
    preds = {
        "commentator (runs_10 x 2)": val.runs_10 * 2,
        "learned ratio (runs_10 x k)": val.runs_10 * ratio,
        "median of earlier totals": pd.Series(train.final_runs.median(), index=val.index),
    }
    for name, p in preds.items():
        err = p - val.final_runs                               # signed: prediction - actual
        rows.append(dict(fold=s, baseline=name, n=len(val), k=round(ratio, 3),
                         MAE=err.abs().mean(), RMSE=np.sqrt((err ** 2).mean()),
                         signed=err.mean(), within15=(err.abs() <= 15).mean()))

R = pd.DataFrame(rows)
pd.set_option("display.width", 140)
print("Per fold:\n", R.round(2).to_string(index=False))
print("\nPooled over folds 2019-2024 (weighted by innings):")
for name, g in R.groupby("baseline", sort=False):
    w = g.n / g.n.sum()
    print(f"  {name:28s} MAE {np.sum(w*g.MAE):5.1f} | RMSE {np.sum(w*g.RMSE):5.1f} | "
          f"signed {np.sum(w*g.signed):+5.1f} | within 15: {np.sum(w*g.within15):.0%}")
os.makedirs("results", exist_ok=True)
R.round(3).to_csv("results/baseline_results.csv", index=False)
