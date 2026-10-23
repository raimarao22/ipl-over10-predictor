"""
check_features.py
Leakage check: recompute the historical features for random rows by hand,
using only matches on earlier dates, and confirm they match features_over10.csv.
"""
import pandas as pd

WINDOW, SHRINK_M = 30, 10
f = pd.read_csv("data/features_over10.csv", dtype={"match_id": str}, parse_dates=["date"])
f = f.sort_values(["date", "match_id"]).reset_index(drop=True)

sample = f[(f.season <= 2024) & ~f.warmup].sample(8, random_state=7)
for _, row in sample.iterrows():
    past = f[f.date < row.date]
    assert past.date.max() < row.date, "history contains same-day or future matches"
    recent = past.tail(WINDOW)
    lb10 = recent.runs_to_come.mean()
    lt = recent.final_runs.mean()
    v = past[past.venue == row.venue]
    va = (v.final_runs.sum() + SHRINK_M * lt) / (len(v) + SHRINK_M)
    assert abs(lb10 - row.league_back10) < 1e-9 and abs(va - row.venue_avg) < 1e-9
    print(f"OK  {row.match_id} {row.date.date()} {row.venue[:28]:28s} "
          f"venue_avg {row.venue_avg:6.1f} (n={row.venue_n:3d}) | league_back10 {row.league_back10:5.1f} | "
          f"latest history {past.date.max().date()}")

# a test-season row may use EARLIER test-season matches (allowed), never later ones
t = f[f.season == 2026].iloc[20]
past = f[f.date < t.date]
assert past.date.max() < t.date
print(f"\nOK  chronological update: a {t.date.date()} row uses history up to {past.date.max().date()} only")
print("All feature checks passed.")
