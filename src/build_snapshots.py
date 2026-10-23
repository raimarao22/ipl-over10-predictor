"""
build_snapshots.py
Reads the Cricsheet IPL JSON zip and builds one row per FIRST innings at the end of over 10.

Outputs (in data/):
    first_innings_over10.csv -> modelling table
    results/exclusions.json  -> counts for the data funnel on the website

Cricsheet numbers overs from 0, so "end of over 10" = over indices 0..9 complete.
"""
import json, zipfile, collections, os
import pandas as pd

ZIP_PATH = "data/ipl_male_json.zip"
CHECKPOINT = 10                                        # predict at end of over 10
NOT_DISMISSALS = {"retired hurt", "retired not out"}   # not counted as wickets lost

# Same ground under different names (renames, spellings). Verify these yourselves.
VENUE_ALIASES = {
    "Feroz Shah Kotla": "Arun Jaitley Stadium",
    "M.Chinnaswamy Stadium": "M Chinnaswamy Stadium",
    "Sardar Patel Stadium": "Narendra Modi Stadium",
    "Punjab Cricket Association Stadium": "Punjab Cricket Association IS Bindra Stadium",
    "Sheikh Zayed Stadium": "Zayed Cricket Stadium",
    "Subrata Roy Sahara Stadium": "Maharashtra Cricket Association Stadium",
}


def clean_venue(raw):
    name = raw.split(",")[0].strip()      # drop ", Mumbai" etc.
    return VENUE_ALIASES.get(name, name)


def is_legal(ball):
    extras = ball.get("extras", {})
    return "wides" not in extras and "noballs" not in extras


def count_wickets(ball):
    return sum(1 for w in ball.get("wickets", []) if w["kind"] not in NOT_DISMISSALS)


def innings_state(innings):
    """State at the end of over 10 plus the final total."""
    s = dict(runs_10=0, wkts_10=0, runs_last5=0, wkts_last5=0, runs_last2=0, wkts_last2=0,
             legal_balls_10=0, total_runs=0, total_legal=0)
    for over in innings["overs"]:
        o = over["over"]                  # 0-based index
        for ball in over["deliveries"]:
            r, w, legal = ball["runs"]["total"], count_wickets(ball), is_legal(ball)
            s["total_runs"] += r
            s["total_legal"] += legal
            if o < CHECKPOINT:            # overs 1-10
                s["runs_10"] += r
                s["wkts_10"] += w
                s["legal_balls_10"] += legal
                if o >= CHECKPOINT - 5:   # indices 5-9 = overs 6-10
                    s["runs_last5"] += r
                    s["wkts_last5"] += w
                if o >= CHECKPOINT - 2:   # indices 8-9 = overs 9-10
                    s["runs_last2"] += r
                    s["wkts_last2"] += w
    s["completed_over10"] = s["legal_balls_10"] == CHECKPOINT * 6
    return s


def build():
    z = zipfile.ZipFile(ZIP_PATH)
    rows, excluded = [], collections.Counter()
    n_matches = 0
    for name in sorted(z.namelist()):
        if not name.endswith(".json"):
            continue
        n_matches += 1
        d = json.loads(z.read(name))
        info, outcome = d["info"], d["info"].get("outcome", {})
        regular = [inn for inn in d["innings"] if not inn.get("super_over")]

        if outcome.get("result") == "no result" or not regular:
            excluded["no_result"] += 1
            continue

        target_overs = regular[1].get("target", {}).get("overs", 20) if len(regular) > 1 else 20
        reduced = "method" in outcome or target_overs != 20     # DLS or shortened match
        inn1 = regular[0]
        s = innings_state(inn1)
        if reduced and s["total_legal"] < 120:                  # first innings itself was cut short
            excluded["rain_reduced_first_innings"] += 1
            continue
        if not s["completed_over10"]:
            excluded["ended_before_over10"] += 1
            continue

        rows.append(dict(
            match_id=name.replace(".json", ""),
            date=info["dates"][0],
            season=int(info["dates"][0][:4]),                   # fixes "2007/08"-style labels
            venue=clean_venue(info["venue"]),
            batting_team=inn1["team"],
            bowling_team=[t for t in info["teams"] if t != inn1["team"]][0],
            runs_10=s["runs_10"], wkts_10=s["wkts_10"],
            runs_last5=s["runs_last5"], wkts_last5=s["wkts_last5"],
            runs_last2=s["runs_last2"], wkts_last2=s["wkts_last2"],
            final_runs=s["total_runs"],
            runs_to_come=s["total_runs"] - s["runs_10"]))

    df = pd.DataFrame(rows).sort_values(["date", "match_id"]).reset_index(drop=True)
    df.to_csv("data/first_innings_over10.csv", index=False)
    funnel = {"matches": n_matches, "kept": len(df), "excluded": dict(excluded),
              "kept_2008_2024": int((df.season <= 2024).sum()),
              "kept_2025_2026": int((df.season >= 2025).sum())}
    os.makedirs("results", exist_ok=True)
    with open("results/exclusions.json", "w") as f:
        json.dump(funnel, f, indent=2)
    return df, funnel


if __name__ == "__main__":
    df, funnel = build()
    print(json.dumps(funnel, indent=2))
