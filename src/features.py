"""
features.py
Adds historical context features to the over-10 table.

Rule: every historical feature for a match uses ONLY innings from matches played on an
EARLIER DATE (strictly before). This holds in every season, including the test seasons,
so features keep updating chronologically without leaking the future.

Adds:
  venue_avg      average first-innings total at this venue in earlier matches,
                 shrunk toward the league average when the venue has few matches
  venue_n        number of earlier innings at this venue (for checks / website)
  league_back10  average runs scored in overs 11-20 over the previous 30 first innings
  league_total   average final total over the previous 30 first innings (used by venue_avg shrinkage)
  impact_era     1 for seasons from 2023 (Impact Player era), 0 before
  warmup         True for the first innings of 2008 with too little history; used only as history

Output: data/features_over10.csv
"""
import pandas as pd

WINDOW = 30          # previous first innings used for league-level features
MIN_HISTORY = 10     # innings needed before a row is used for modelling
SHRINK_M = 10        # venue shrinkage strength: acts like 10 "league-average" innings

df = pd.read_csv("data/first_innings_over10.csv", dtype={"match_id": str})
df["date"] = pd.to_datetime(df["date"])
df = df.sort_values(["date", "match_id"]).reset_index(drop=True)

league_back10, league_total, venue_avg, venue_n, n_hist = [], [], [], [], []
for i, row in df.iterrows():
    past = df[df["date"] < row["date"]]                 # strictly earlier dates only
    recent = past.tail(WINDOW)
    n_hist.append(len(past))
    lb10 = recent["runs_to_come"].mean() if len(recent) else float("nan")
    lt = recent["final_runs"].mean() if len(recent) else float("nan")
    league_back10.append(lb10)
    league_total.append(lt)

    v = past[past["venue"] == row["venue"]]
    n = len(v)
    venue_n.append(n)
    # shrinkage: weighted mix of venue mean and current league level
    venue_avg.append((v["final_runs"].sum() + SHRINK_M * lt) / (n + SHRINK_M)
                     if len(recent) else float("nan"))

df["league_back10"] = league_back10
df["league_total"] = league_total
df["venue_avg"] = venue_avg
df["venue_n"] = venue_n
df["impact_era"] = (df["season"] >= 2023).astype(int)
df["warmup"] = pd.Series(n_hist) < MIN_HISTORY

df["date"] = df["date"].dt.strftime("%Y-%m-%d")
df.to_csv("data/features_over10.csv", index=False)

dev = df[(df.season <= 2024) & ~df.warmup]              # report development rows only
print(f"Rows: {len(df)} total | warm-up rows (history only): {int(df.warmup.sum())} | "
      f"development rows for modelling: {len(dev)}")
print("\nDevelopment-period summary (2008-2024, warm-up excluded):")
print(dev[["runs_10", "wkts_10", "runs_last5", "wkts_last5", "runs_last2", "wkts_last2",
           "venue_avg", "league_back10", "impact_era", "runs_to_come"]].describe().round(1).T
      [["mean", "std", "min", "max"]].to_string())
print("\nCorrelation with runs_to_come (development only):")
print(dev[["runs_10", "wkts_10", "runs_last5", "wkts_last5", "runs_last2", "wkts_last2",
           "venue_avg", "league_back10", "impact_era"]].corrwith(dev["runs_to_come"]).round(2).to_string())
