# Beat the Commentator: IPL Score Prediction at Over 10

ES 335 project. Predicts an IPL first-innings final total at the end of over 10
and compares it with the commentator's rule (score x 2).

Website: https://raimarao22.github.io/ipl-over10-predictor/

## Reproduce
1. `pip install -r requirements.txt`
2. Put the Cricsheet zip in `data/` (see `data/README.md`)
3. Run from the repo root, in order:
   - `python src/build_snapshots.py` -> 1,211 innings
   - `python src/check_snapshots.py` -> all checks pass
   - `python src/baselines.py` -> baseline results

## Split
Development 2008-2024 (walk-forward folds 2019-2024). Final test 2025-2026, run once.

## Data credit and AI use
Data from Cricsheet (CC-BY-4.0). We used Claude for planning and code drafting;
all results were checked by us.
