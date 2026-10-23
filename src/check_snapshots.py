"""
check_snapshots.py
Independent over-by-over recount for random innings, to catch over-numbering bugs.
Run after build_snapshots.py. Every line should print OK.
"""
import json, zipfile
import pandas as pd

z = zipfile.ZipFile("data/ipl_male_json.zip")
df = pd.read_csv("data/first_innings_over10.csv", dtype={"match_id": str})
dev = df[df.season <= 2024]          # sample only development seasons


def per_over(match_id):
    d = json.loads(z.read(f"{match_id}.json"))
    inn = [i for i in d["innings"] if not i.get("super_over")][0]
    rows = [(over["over"] + 1,       # convert to cricket numbering (1-20)
             sum(b["runs"]["total"] for b in over["deliveries"]),
             sum(1 for b in over["deliveries"] for w in b.get("wickets", [])
                 if w["kind"] not in {"retired hurt", "retired not out"}))
            for over in inn["overs"]]
    return pd.DataFrame(rows, columns=["over", "runs", "wkts"])


for _, row in dev.sample(10, random_state=1).iterrows():
    o = per_over(row.match_id)
    checks = {
        "overs 1-10": (o[o.over <= 10], row.runs_10, row.wkts_10),
        "overs 6-10": (o[o.over.between(6, 10)], row.runs_last5, row.wkts_last5),
        "overs 9-10": (o[o.over.between(9, 10)], row.runs_last2, row.wkts_last2),
    }
    for label, (part, runs, wkts) in checks.items():
        assert (part.runs.sum(), part.wkts.sum()) == (runs, wkts), f"{row.match_id} {label}"
    assert o.runs.sum() == row.final_runs, f"{row.match_id} final total"
    print(f"OK {row.match_id} ({row.season}): {row.runs_10}/{row.wkts_10} at 10, "
          f"overs 6-10 {row.runs_last5}/{row.wkts_last5}, overs 9-10 {row.runs_last2}/{row.wkts_last2}, "
          f"final {row.final_runs}")
print("All checks passed.")
