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
