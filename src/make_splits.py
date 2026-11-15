"""
make_splits.py
Writes results/splits.csv: the exact role of every innings in our evaluation, so the splits can be
checked without re-running the models. Reads data/features_over10.csv (scripts 1 and 4); changes nothing else.

Walk-forward validation is not a single fixed train/validation split. To predict season S, the model is
trained on every development innings from seasons before S (warm-up rows excluded). So an innings in a
validation season is predicted once, in its own fold, and is then training data for every later fold.

Columns
  split_role         warmup | train_only | validation | test
  validation_fold    the season whose fold predicts this innings (blank unless split_role is validation)
  train_in_folds     the validation folds whose training set includes this innings, e.g. "2019-2024"
  in_final_model     1 if the frozen model (trained on 2008-2024) was fitted on this innings
"""
import pandas as pd

FOLDS = list(range(2019, 2025))
f = pd.read_csv("data/features_over10.csv", dtype={"match_id": str})


def role(r):
    if r.season >= 2025:
        return "test"
    if r.warmup:
        return "warmup"
    return "validation" if r.season in FOLDS else "train_only"


def train_folds(r):
    if r.warmup or r.season >= 2025:
        return ""
    later = [s for s in FOLDS if s > r.season]
    return f"{later[0]}-{later[-1]}" if later else ""


out = pd.DataFrame({
    "match_id": f.match_id, "date": f.date, "season": f.season,
    "batting_team": f.batting_team, "bowling_team": f.bowling_team,
    "split_role": f.apply(role, axis=1),
    "validation_fold": f.season.where(f.season.isin(FOLDS) & ~f.warmup).astype("Int64"),
    "train_in_folds": f.apply(train_folds, axis=1),
    "in_final_model": ((f.season <= 2024) & ~f.warmup).astype(int),
})
out.to_csv("results/splits.csv", index=False)

counts = out.split_role.value_counts()
print("Wrote results/splits.csv")
print(counts.to_string())
print("validation innings per fold:", out.validation_fold.value_counts().sort_index().to_dict())
