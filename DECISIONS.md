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
| | runs_last2 / wkts_last2 kept or dropped? | TBD |
| | Era handling: league_back10 / impact_era / both? | TBD |
| | Training window | TBD |
| | Final model: ridge or tree ensemble? | TBD |
