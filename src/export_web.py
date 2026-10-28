"""
export_web.py
Writes the small JSON files the website reads (docs/data/).
Uses ONLY the development period (2008-2024). No 2025-2026 innings are ever exported; once
final_test.py has been run, its aggregate results (results/final_test.json) are added to summary.json.

Outputs:
  docs/data/model.json     frozen ridge weights, interval, learned ratio (calculator)
  docs/data/summary.json   data funnel, season averages, wicket effect, validation results
  docs/data/balls.json     six validation innings ball by ball (for the 240-balls explainer)
  docs/data/explorer.json  every validation innings (folds 2019-2024) with its over-by-over
                           worm and each method's out-of-sample prediction
"""
import json, os, zipfile
import numpy as np
import pandas as pd

DEV_END, FOLDS = 2024, list(range(2019, 2025))
OUT = "docs/data"
os.makedirs(OUT, exist_ok=True)

snap = pd.read_csv("data/first_innings_over10.csv", dtype={"match_id": str})
feat = pd.read_csv("data/features_over10.csv", dtype={"match_id": str})
chosen = json.load(open("results/chosen_model.json"))
funnel = json.load(open("results/exclusions.json"))
val = pd.read_csv("results/validation_results.csv")
oos = pd.read_csv("results/oos_predictions.csv", dtype={"match_id": str})
abl = pd.read_csv("results/ablation_all.csv")
leak = json.load(open("results/leakage_demo.json"))
gains = json.load(open("results/feature_gains.json"))

snap, feat = snap[snap.season <= DEV_END], feat[feat.season <= DEV_END]   # never export test seasons
assert oos.fold.max() <= DEV_END

def r(x, d=1):
    return None if pd.isna(x) else round(float(x), d)

# ---------------------------------------------------------------- model.json (calculator)
fit = feat[~feat.warmup]                                 # same rows as baselines.py (no warm-up innings)
k = fit.final_runs.sum() / fit.runs_10.sum()             # learned ratio fitted on 2008-2024
model = dict(intercept=chosen["weights"]["intercept"], coefficients=chosen["weights"]["coefficients"],
             interval_q05=chosen["interval_q05"], interval_q95=chosen["interval_q95"],
             ratio_k=round(k, 4), fitted_on="2008-2024", alpha=chosen["alpha"])
json.dump(model, open(f"{OUT}/model.json", "w"), indent=1)

# ---------------------------------------------------------------- summary.json
dev = feat[~feat.warmup]
seasons = (snap.groupby("season")
           .agg(innings=("final_runs", "size"), avg_final=("final_runs", "mean"),
                avg_runs_10=("runs_10", "mean"), avg_to_come=("runs_to_come", "mean"))
           .reset_index())
dev = dev.assign(wk=dev.wkts_10.clip(upper=5))
wick = (dev.groupby("wk").agg(innings=("runs_to_come", "size"), avg_to_come=("runs_to_come", "mean"))
        .reset_index())
pick = lambda sec: [dict(config=row.config, MAE=r(row.MAE, 2), signed=r(row.signed, 2),
                         MAE_2023_24=r(row.MAE_2023_24, 2)) for row in val[val.section == sec].itertuples()]
# era comparison (development seasons only)
def era_block(g):
    g = g.assign(wk=g.wkts_10.clip(upper=5))
    w = g.groupby("wk").runs_to_come.mean()
    return dict(innings=int(len(g)), avg_final=r(g.final_runs.mean()), avg_runs_10=r(g.runs_10.mean()),
                avg_to_come=r(g.runs_to_come.mean()),
                wickets=[dict(wickets=("5+" if k == 5 else str(int(k))), avg_to_come=r(v)) for k, v in w.items()])
eras = {"2008-2022": era_block(dev[dev.season <= 2022]), "2023-2024": era_block(dev[dev.season >= 2023])}
ablation = [dict(groups=[g for g in ["wickets", "last5", "last2", "venue", "league", "era"] if row[g] == 1],
                 MAE=float(row.MAE), MAE_2023_24=float(row.MAE_2023_24)) for _, row in abl.iterrows()]
fold_mae = (oos.assign(ae=oos.err.abs()).groupby("fold").agg(n=("ae", "size"), MAE=("ae", "mean"),
            signed=("err", "mean")).reset_index())
# range honesty: central ranges built from earlier folds' residuals, checked on each later fold
res = oos.assign(res=oos.actual - oos.pred)
calibration = []
for L in [50, 60, 70, 80, 90, 95]:
    hits, per = [], {}
    for f in FOLDS[1:]:
        lo_q, hi_q = res[res.fold < f].res.quantile([(1 - L / 100) / 2, 1 - (1 - L / 100) / 2])
        x = res[res.fold == f].res
        h = (x >= lo_q) & (x <= hi_q)
        hits += h.tolist(); per[f] = r(h.mean(), 3)
    calibration.append(dict(level=L, coverage=r(np.mean(hits), 3), n=len(hits), seasons=per))

# fit-the-line: straight lines from over-10 score to final total, fitted once on 2008-2018,
# scored on the 2019-2024 innings
tr_l, va_l = fit[fit.season < FOLDS[0]], snap[snap.season >= FOLDS[0]]
k0 = tr_l.final_runs.sum() / tr_l.runs_10.sum()
b0, a0 = np.polyfit(tr_l.runs_10, tr_l.final_runs, 1)
line_mae = lambda sl, ic: r((va_l.final_runs - (ic + sl * va_l.runs_10)).abs().mean(), 2)
fitline = dict(points=[[int(a), int(b)] for a, b in zip(va_l.runs_10, va_l.final_runs)],
               lines=[dict(name="x2", slope=2, intercept=0, MAE=line_mae(2, 0)),
                      dict(name="ratio", slope=r(k0, 3), intercept=0, MAE=line_mae(k0, 0)),
                      dict(name="free", slope=r(b0, 3), intercept=r(a0, 1), MAE=line_mae(b0, a0))],
               fitted_on="2008-2018", scored_on="2019-2024")

summary = dict(
    funnel=funnel, calibration=calibration, fitline=fitline,
    seasons=[{c: (int(v) if c in ("season", "innings") else r(v)) for c, v in row.items()}
             for row in seasons.to_dict("records")],
    wickets=[dict(wickets=("5+" if row.wk == 5 else str(int(row.wk))), innings=int(row.innings),
                  avg_to_come=r(row.avg_to_come)) for row in wick.itertuples()],
    baselines=pick("baseline"), ladder=pick("ladder"), trees=pick("tree"), windows=pick("window"),
    selected=pick("selected"),
    folds=[dict(fold=int(row.fold), n=int(row.n), MAE=r(row.MAE, 2), signed=r(row.signed, 2))
           for row in fold_mae.itertuples()],
    validation=chosen["validation"], comparisons=chosen["comparisons"], gains=gains, to_come_sd_2019_24=r(fit[fit.season >= FOLDS[0]].runs_to_come.std()), eras=eras, ablation=ablation, leakage=leak,
    features=chosen["features"])
if os.path.exists("results/final_test.json"):                # aggregate test results only, after the one run
    ft = json.load(open("results/final_test.json"))
    summary["final_test"] = {k: ft[k] for k in ["n", "test_seasons", "overall", "comparisons", "interval_coverage",
                                                "per_season", "primary_claim_supported"]}
json.dump(summary, open(f"{OUT}/summary.json", "w"), indent=1)

# ---------------------------------------------------------------- explorer.json
z = zipfile.ZipFile("data/ipl_male_json.zip")
oos = oos.merge(snap[["match_id", "date", "season", "venue", "batting_team", "bowling_team",
                      "runs_10", "wkts_10"]], on="match_id")
oos = oos.assign(resid=oos.actual - oos.pred)
rows = []
for s in FOLDS:
    train = fit[fit.season < s]
    k_s = train.final_runs.sum() / train.runs_10.sum()          # learned ratio as of that fold (as in baselines.py)
    earlier = oos[oos.fold < s].resid                           # interval from earlier folds only
    q05, q95 = (earlier.quantile(0.05), earlier.quantile(0.95)) if len(earlier) else (None, None)
    for row in oos[oos.fold == s].itertuples():
        d = json.loads(z.read(f"{row.match_id}.json"))
        inn = [i for i in d["innings"] if not i.get("super_over")][0]
        runs, wk, cr, cw = [], [], 0, 0
        for over in inn["overs"]:
            for b in over["deliveries"]:
                cr += b["runs"]["total"]
                cw += sum(1 for w in b.get("wickets", []) if w["kind"] not in {"retired hurt", "retired not out"})
            runs.append(cr); wk.append(cw)
        rows.append(dict(id=row.match_id, date=row.date, season=int(row.season), venue=row.venue,
                         bat=row.batting_team, bowl=row.bowling_team,
                         r10=int(row.runs_10), w10=int(row.wkts_10), actual=int(row.actual),
                         model=r(row.pred), x2=int(row.runs_10 * 2), ratio=r(row.runs_10 * k_s),
                         lo=r(row.pred + q05) if q05 is not None else None,
                         hi=r(row.pred + q95) if q95 is not None else None,
                         worm=runs, wkts=wk))
json.dump(rows, open(f"{OUT}/explorer.json", "w"), separators=(",", ":"))

# ---------------------------------------------------------------- balls.json (ball-by-ball innings to one row)
# six validation innings, ball by ball: [runs, wicket 0/1, extra 0/1] per delivery
sample_ids = pd.Series([r["id"] for r in rows]).sample(6, random_state=4).tolist()
by_id = {r["id"]: r for r in rows}
balls = []
for mid in sample_ids:
    d = json.loads(z.read(f"{mid}.json"))
    inn = [i for i in d["innings"] if not i.get("super_over")][0]
    overs = [[[b["runs"]["total"],
               int(any(w["kind"] not in {"retired hurt", "retired not out"} for w in b.get("wickets", []))),
               int("wides" in b.get("extras", {}) or "noballs" in b.get("extras", {}))]
              for b in o["deliveries"]] for o in inn["overs"]]
    r = by_id[mid]
    balls.append(dict(id=mid, date=r["date"], bat=r["bat"], bowl=r["bowl"], venue=r["venue"], season=r["season"], overs=overs))
json.dump(balls, open(f"{OUT}/balls.json", "w"), separators=(",", ":"))
# ---------------------------------------------------------------- history.json (similar innings)
# every kept development innings: [season, runs at 10, wickets at 10, final total, batting, bowling]
history = [[int(x.season), int(x.runs_10), int(x.wkts_10), int(x.final_runs), x.batting_team, x.bowling_team]
           for x in snap.itertuples()]
json.dump(history, open(f"{OUT}/history.json", "w"), separators=(",", ":"))
print(f"model.json: ratio k = {k:.3f}; summary.json: {len(seasons)} seasons; "
      f"explorer.json: {len(rows)} validation innings ({oos.season.min()}-{oos.season.max()})")
