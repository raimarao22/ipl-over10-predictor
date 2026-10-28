# Decision log

Every modelling choice, the date, and the evidence behind it.
All evidence comes from walk-forward validation (folds 2019-2024) unless stated.
2025-2026 is the final test and is not used for any decision.

| Date | Decision | Evidence |
|---|---|---|
| 2026-10-13 | Predict at end of over 10, first innings only | Design: chase totals are capped by the target |
| 2026-10-13 | Exclude no-results, rain-reduced first innings, innings ending before over 10 | 9 + 21 + 2 excluded; 1,211 kept |
| 2026-10-13 | Season from match date | Cricsheet labels like "2007/08" are inconsistent |
| 2026-10-13 | Learned-ratio baseline added | x2 rule signed error -15.0 on folds; learned ratio +3.1 |
| 2026-10-24 | Historical features use matches on strictly earlier dates only | check_features.py passes |
| 2026-10-24 | First 11 innings of 2008 used as history only (warm-up) | Fewer than 10 earlier innings |
| 2026-10-24 | venue_avg shrinkage strength m = 10 | Design choice; venues with few matches pulled toward league level |
| 2026-10-24 | Decision rules: drop a feature group if MAE worsens by < 0.1 runs; ensemble only if bootstrap CI < 0 | Fixed before the final test |
| 2026-10-24 | Ridge alpha = 100 | Lowest walk-forward MAE on the full feature set (differences < 0.1 runs) |
| 2026-10-24 | Features: runs_10, wkts_10, impact_era. Dropped last-5, last-2, venue, league_back10 | Backward elimination; see validation_results.csv |
| 2026-10-24 | Era handling: impact_era indicator | Ladder: 16.80 vs 17.07 (league_back10) vs 16.82 (both) |
| 2026-10-24 | Training window: 2008 onward, equal weight | Alternatives improved MAE by < 0.1 runs |
| 2026-10-24 | Model: ridge, not gradient boosting | GBR minus ridge -0.26 runs, 95% CI [-0.71, +0.18] includes 0 |
| 2026-10-24 | Validation result: MAE 16.8 vs 22.0 (x2) and 20.3 (ratio) | Paired bootstrap CIs exclude 0 |
| 2026-10-24 | Website reporting scripts added: `ablation_all.py` (all 64 feature combinations), `leakage_demo.py`, `export_web.py` | Report only; no modelling decision uses them. All read 2008-2024 only |
| 2026-10-25 | Keep the selected model, ranked 7th of 64 combinations | The six ahead are 0.001-0.055 runs better (16.727-16.781 vs 16.782), below the pre-set 0.1-run rule; picking the top of 64 would partly fit validation noise |
| 2026-10-25 | Leakage demo: venue average from all seasons, deliberately wrong, for teaching | Leaky 16.59 vs correct 16.73: leakage would have made venue look worth adding. Never used for any decision |
| 2026-10-25 | 90% range kept as built | Pooled coverage on 2020-2024 was 87% (2021 lowest, 80%). Widening it after seeing this check would tune the range on the result we report |
| 2026-10-25 | Website predictor allows 0-7 wickets at over 10 | No development innings was more than 7 down (6 down: 11 innings; 7 down: 2). A linear model beyond that would extrapolate |
| 2026-10-28 | Learned ratio on the website and in the final test uses `train_validate.py`'s definition (excludes the 11 warm-up innings) | `baselines.py` includes them: 20.30 vs 20.27 MAE on folds. Website now matches the reported comparisons exactly |
| 2026-10-28 | Post-hoc check of where the gain comes from (`results/feature_gains.json`) | Score-only ridge vs x2: -4.77 [-6.08, -3.35]; vs ratio: -3.07 [-4.37, -1.71]. Adding era to score+wickets: -0.35 [-0.56, -0.15], 2023-24 only -0.97 [-1.56, -0.42]. Adding wickets to score: -0.07 [-0.78, +0.60]. Run after the model was chosen; the model was NOT changed (the pre-set rule kept wickets) |
| 2026-10-29 | Final test fixed in advance in `src/final_test.py`, committed before its first run | Frozen model and range, no refitting; baselines fitted on 2008-2024. Primary claim (model beats x2 on unseen seasons) only if the 95% CI of the MAE difference is entirely below 0. Run once; the script refuses a second run. Model not changed afterwards, whatever the result |
| 2026-10-29 | Final test run once with `src/final_test.py`, after both partners agreed | Frozen model MAE 16.71 vs 22.25 (x2), 24.09 (ratio), 37.74 (median) on 141 innings. Model minus x2: -5.54 [-7.96, -3.14], so the pre-specified primary claim is supported. Coverage 86.5% (122 of 141). Model not changed afterwards |
| 2026-10-29 | Website and README updated with the final test results only | `export_web.py` adds the aggregate `final_test.json` to the site; no 2025-2026 innings are exported |
| 2026-10-29 | Post-test exploratory checks (`src/explore_after_test.py`, `results/exploratory_after_test.json`), for the website's explanations only | Impact Player flag had zero weight when predicting 2023 (no Impact Player seasons in training yet) and +6.1 runs when predicting 2024 (MAE 17.52 vs 19.51 without it). Wickets as categories: 16.68 vs 16.78, difference -0.11 [-0.48, +0.26], not established. Gradient boosting with all 9 features: 16.96. Run after the final test; the model was NOT changed |
| 2026-10-29 | Read-only verification of the final test added (`src/verify_final_test.py`); `final_test.py` kept unchanged | Recomputes predictions, all metrics (overall and per season), the bootstrap intervals (seed 0) and coverage from the frozen model, compares them with the committed files within rounding tolerances, and writes nothing |
