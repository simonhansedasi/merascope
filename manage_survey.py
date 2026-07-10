#!/usr/bin/env python3
"""Survey management CLI — community indicator-weight survey (see METHODS.md's
"Community Survey" section for the full method writeup).

Public respondents rank all 12 SURVEY_INDICATORS 1 (most important) to 12; this
CLI operates on the sqlite survey.db that collects those rankings (separate
from the main PostgreSQL app DB in schema.sql). `snapshot` is the mechanism
referenced by METHODS.md's "Snapshot mechanism" note: at a formal comment
deadline, current weights get frozen with a timestamp label so reports can
show both "as of [date]" and "current" community weights side by side.

Usage:
  python manage_survey.py snapshot <state> <region> "<label>"
  python manage_survey.py count    <state> <region>
  python manage_survey.py export   <state> <region>
"""
import sys
import json
import sqlite3
import statistics
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
SURVEY_DB    = PROJECT_ROOT / 'data' / 'survey.db'

SURVEY_INDICATORS = [
    'tx','water','ej','seismic','flood','contam',
    'waterway','geo','flat','pop','aquifer','soil'
]
N = len(SURVEY_INDICATORS)


def compute_weights(rows):
    # Borda count (de Borda, 1781): rank r -> (N+1-r) points, so rank 1 (most
    # important) scores N points and rank N scores 1. No response -> 0 points,
    # not excluded, so partial/skipped rankings don't get discarded.
    if not rows:
        eq = 1.0 / N
        return {k: eq for k in SURVEY_INDICATORS}
    point_lists = {k: [] for k in SURVEY_INDICATORS}
    for (rj,) in rows:
        r = json.loads(rj)
        for k in SURVEY_INDICATORS:
            rank = r.get(k)
            pts  = (N + 1 - int(rank)) if rank is not None else 0
            point_lists[k].append(pts)
    means  = {k: statistics.mean(v) for k, v in point_lists.items()}
    stdevs = {k: statistics.stdev(v) if len(v) > 1 else 0.0 for k, v in point_lists.items()}
    # Dividing by (1 + stdev) before normalizing is a deliberate in-house
    # addition, not part of classic Borda counting: it discounts indicators
    # respondents disagree about, on the premise that unanimous priorities
    # should carry more weight than contested ones with the same mean score.
    raw    = {k: means[k] / (1.0 + stdevs[k]) for k in SURVEY_INDICATORS}
    total  = sum(raw.values()) or 1.0
    return {k: raw[k] / total for k in SURVEY_INDICATORS}


def cmd_snapshot(state, region, label):
    db = sqlite3.connect(str(SURVEY_DB))
    rows = db.execute(
        "SELECT rankings FROM survey_responses WHERE state=? AND region=?",
        (state.upper(), region.lower())
    ).fetchall()
    count   = len(rows)
    weights = compute_weights(rows)
    db.execute(
        "INSERT INTO survey_snapshots (region, state, label, weights, response_count) VALUES (?,?,?,?,?)",
        (region.lower(), state.upper(), label, json.dumps(weights), count)
    )
    db.commit()
    db.close()
    print(f"Snapshot saved — {count} responses, label: {label}")
    for k, v in sorted(weights.items(), key=lambda x: -x[1]):
        print(f"  {k:12s}  {v:.4f}  ({v*100:.1f}%)")


def cmd_count(state, region):
    db = sqlite3.connect(str(SURVEY_DB))
    count = db.execute(
        "SELECT COUNT(*) FROM survey_responses WHERE state=? AND region=?",
        (state.upper(), region.lower())
    ).fetchone()[0]
    db.close()
    print(f"{count} responses for {state.upper()}/{region.lower()}")


def cmd_export(state, region):
    db = sqlite3.connect(str(SURVEY_DB))
    rows = db.execute(
        "SELECT zip_code, rankings, submitted_at FROM survey_responses WHERE state=? AND region=?",
        (state.upper(), region.lower())
    ).fetchall()
    db.close()
    print("zip_code,rankings,submitted_at")
    for zip_code, rankings, submitted_at in rows:
        print(f"{zip_code},{rankings},{submitted_at}")


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    state, region = sys.argv[2], sys.argv[3]
    if cmd == 'snapshot':
        label = sys.argv[4] if len(sys.argv) > 4 else 'Snapshot'
        cmd_snapshot(state, region, label)
    elif cmd == 'count':
        cmd_count(state, region)
    elif cmd == 'export':
        cmd_export(state, region)
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
