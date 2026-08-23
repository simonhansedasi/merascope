#!/usr/bin/env python3
"""dc_tracker.py — national data-center site tracker with source verification.

Grew out of trying to verify the McNary/Umatilla and Hermiston Amazon sites
for a Lisa Stiffler tip and hitting a wall: AWS never discloses exact
addresses/status, and every available citation was either a third-party
tracker's inference or a stale (2017/2018) article. This gives every claim
about a site (existence, status, address, operator) a logged source, and
only calls a claim "confirmed" once 2+ INDEPENDENT sources (distinct
publisher domains) agree on it -- not a manual checklist, an actual query.

Retrieval is SQLite FTS5 keyword search, not embeddings -- the corpus here
is realistically hundreds of rows, not millions, so a vector DB would be
solving a problem this dataset doesn't have.

Usage:
  python3 scripts/dc_tracker.py init
  python3 scripts/dc_tracker.py seed
  python3 scripts/dc_tracker.py search "<text>"
  python3 scripts/dc_tracker.py log --site-id N --url U --publisher P --field F --value V [--excerpt E] [--added-by X]
  python3 scripts/dc_tracker.py log --new --name N --state ST [--operator O] [--city C] [--lat X] [--lon Y] --url U --publisher P --field F --value V [--excerpt E]
  python3 scripts/dc_tracker.py status [--state ST] [--unconfirmed-only]
"""
import argparse
import glob
import json
import os
import sqlite3
from datetime import datetime, timezone
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__)) + "/.."
DB_PATH = os.path.join(ROOT, "datacenters.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    operator TEXT,
    state TEXT NOT NULL,
    city TEXT,
    address TEXT,
    lat REAL, lon REAL,
    precision TEXT,
    status TEXT DEFAULT 'unknown',
    status_confirmed INTEGER DEFAULT 0,
    created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id),
    url TEXT, publisher TEXT,
    published_date TEXT, fetched_at TEXT,
    claim_field TEXT, claim_value TEXT,
    excerpt TEXT, added_by TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(
    excerpt, claim_value, content='sources', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS sources_ai AFTER INSERT ON sources BEGIN
    INSERT INTO sources_fts(rowid, excerpt, claim_value) VALUES (new.id, new.excerpt, new.claim_value);
END;
"""


def _db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _publisher(url):
    """Domain from a URL, for independence counting -- two articles on the
    same domain are not two independent sources."""
    if not url:
        return None
    return urlparse(url).netloc.replace("www.", "")


def cmd_init(_args):
    con = _db()
    con.executescript(SCHEMA)
    con.commit()
    con.close()
    print(f"Schema ready at {DB_PATH}")


def _recompute_confirmed(con, site_id):
    """A site's status is confirmed once >=2 distinct-publisher sources agree
    on the same (claim_field='status', claim_value)."""
    rows = con.execute(
        "SELECT claim_value, COUNT(DISTINCT publisher) AS n FROM sources "
        "WHERE site_id=? AND claim_field='status' AND publisher IS NOT NULL "
        "GROUP BY claim_value ORDER BY n DESC LIMIT 1",
        (site_id,),
    ).fetchone()
    if rows and rows["n"] >= 2:
        con.execute(
            "UPDATE sites SET status=?, status_confirmed=1, updated_at=? WHERE id=?",
            (rows["claim_value"], _now(), site_id),
        )
    con.commit()


def cmd_seed(_args):
    con = _db()
    con.executescript(SCHEMA)

    # All 48 states' OSM pulls -- real but sparse (most states, incl. OR,
    # have zero man_made=data_centre nodes). Single source (OSM itself), so
    # every seeded site starts unconfirmed by construction.
    n_sites, n_sources = 0, 0
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "*", "raw", "datacenters.geojson"))):
        state = path.split(os.sep)[-3]
        if not (len(state) == 2 and state.isalpha()):
            continue
        feats = json.load(open(path)).get("features", [])
        for f in feats:
            p = f["properties"]
            lon, lat = f["geometry"]["coordinates"]
            existing = con.execute(
                "SELECT id FROM sites WHERE name=? AND state=?", (p.get("name"), state)
            ).fetchone()
            if existing:
                continue
            cur = con.execute(
                "INSERT INTO sites (name, operator, state, city, lat, lon, precision, status, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (p.get("name"), p.get("operator"), state, p.get("city"), lat, lon,
                 "city", "proposed" if p.get("source") == "proposed" else "unknown", _now(), _now()),
            )
            site_id = cur.lastrowid
            n_sites += 1
            citation = p.get("citation")
            con.execute(
                "INSERT INTO sources (site_id, url, publisher, fetched_at, claim_field, claim_value, excerpt, added_by) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (site_id, citation, _publisher(citation) or "openstreetmap.org", _now(),
                 "existence", "true", f"OSM/pipeline pull: {p.get('name')}, {p.get('city')}, {state}", "seed"),
            )
            n_sources += 1

    # Hand-curated OR sites from the water-stress work -- these already carry
    # real citation URLs, so they seed as real sources, not just OSM existence.
    or_verified = os.path.join(ROOT, "data", "shared", "or_datacenters_verified.geojson")
    if os.path.exists(or_verified):
        for f in json.load(open(or_verified)).get("features", []):
            p = f["properties"]
            lon, lat = f["geometry"]["coordinates"]
            existing = con.execute(
                "SELECT id FROM sites WHERE name=? AND state='OR'", (p.get("name"),)
            ).fetchone()
            if existing:
                site_id = existing["id"]
            else:
                cur = con.execute(
                    "INSERT INTO sites (name, operator, state, city, lat, lon, precision, status, created_at, updated_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (p.get("name"), p.get("operator"), "OR", p.get("city"), lat, lon,
                     "city", "proposed" if p.get("source") == "proposed" else "unknown", _now(), _now()),
                )
                site_id = cur.lastrowid
                n_sites += 1
            citation = p.get("citation")
            con.execute(
                "INSERT INTO sources (site_id, url, publisher, fetched_at, claim_field, claim_value, excerpt, added_by) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (site_id, citation, _publisher(citation), _now(), "existence", "true",
                 p.get("note") or f"{p.get('name')}, {p.get('city')}, OR", "seed"),
            )
            n_sources += 1

    con.commit()
    con.close()
    print(f"Seeded {n_sites} new sites, {n_sources} sources.")


def cmd_search(args):
    con = _db()
    rows = con.execute(
        "SELECT s.id, si.name, si.state, si.status, si.status_confirmed, s.publisher, s.claim_field, s.claim_value, s.excerpt "
        "FROM sources_fts f JOIN sources s ON s.id = f.rowid JOIN sites si ON si.id = s.site_id "
        "WHERE sources_fts MATCH ? ORDER BY si.name",
        (args.query,),
    ).fetchall()
    con.close()
    if not rows:
        print("No matches.")
        return
    for r in rows:
        conf = "confirmed" if r["status_confirmed"] else "unconfirmed"
        print(f"[site {r['id']}] {r['name']} ({r['state']}) -- status={r['status']} [{conf}]")
        print(f"    {r['claim_field']}={r['claim_value']!r} via {r['publisher']}: {r['excerpt']}")


def cmd_log(args):
    con = _db()
    if args.new:
        cur = con.execute(
            "INSERT INTO sites (name, operator, state, city, lat, lon, precision, status, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (args.name, args.operator, args.state.upper(), args.city, args.lat, args.lon,
             args.precision or "city", "unknown", _now(), _now()),
        )
        site_id = cur.lastrowid
        print(f"Created site {site_id}: {args.name} ({args.state.upper()})")
    else:
        site_id = args.site_id
        row = con.execute("SELECT id FROM sites WHERE id=?", (site_id,)).fetchone()
        if not row:
            print(f"No site with id {site_id} -- use --new to create one.")
            con.close()
            return

    con.execute(
        "INSERT INTO sources (site_id, url, publisher, fetched_at, claim_field, claim_value, excerpt, added_by) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (site_id, args.url, args.publisher or _publisher(args.url), _now(),
         args.field, args.value, args.excerpt, args.added_by or "manual"),
    )
    con.commit()

    if args.field == "address" and args.value:
        con.execute("UPDATE sites SET address=?, updated_at=? WHERE id=?", (args.value, _now(), site_id))
        con.commit()
    if args.field == "status":
        _recompute_confirmed(con, site_id)

    site = con.execute("SELECT name, status, status_confirmed FROM sites WHERE id=?", (site_id,)).fetchone()
    con.close()
    conf = "CONFIRMED" if site["status_confirmed"] else "still unconfirmed"
    print(f"Logged. Site {site_id} ({site['name']}): status={site['status']} [{conf}]")


def cmd_export_geojson(args):
    """GeoJSON FeatureCollection of tracked sites, for map overlays -- e.g.
    the pnw-water-stress report. Includes confirmation state as a property
    so the map can style confirmed vs. unconfirmed sites differently rather
    than presenting every claim with equal confidence."""
    con = _db()
    q = "SELECT name, operator, state, city, address, lat, lon, status, status_confirmed FROM sites WHERE lat IS NOT NULL AND lon IS NOT NULL"
    params = []
    if args.states:
        wanted = [s.strip().upper() for s in args.states.split(",")]
        q += f" AND state IN ({','.join('?' * len(wanted))})"
        params.extend(wanted)
    if args.confirmed_only:
        q += " AND status_confirmed=1"
    rows = con.execute(q, params).fetchall()
    con.close()

    features = []
    for r in rows:
        features.append({
            "type": "Feature",
            "properties": {
                "name": r["name"], "operator": r["operator"], "state": r["state"],
                "city": r["city"], "address": r["address"],
                "status": r["status"], "confirmed": bool(r["status_confirmed"]),
            },
            "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
        })
    out = {"type": "FeatureCollection", "features": features}
    if args.out:
        with open(args.out, "w") as f:
            json.dump(out, f)
        print(f"{len(features)} sites -> {args.out}")
    else:
        print(json.dumps(out))


def cmd_status(args):
    con = _db()
    q = "SELECT id, name, operator, state, city, status, status_confirmed FROM sites WHERE 1=1"
    params = []
    if args.state:
        q += " AND state=?"
        params.append(args.state.upper())
    if args.unconfirmed_only:
        q += " AND status_confirmed=0"
    q += " ORDER BY state, name"
    rows = con.execute(q, params).fetchall()
    con.close()
    print(f"{len(rows)} sites")
    for r in rows:
        conf = "confirmed" if r["status_confirmed"] else "unconfirmed"
        print(f"  [{r['id']:4d}] {r['state']}  {r['name']:42s} {r['operator'] or '':20s} status={r['status']:18s} [{conf}]")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init")
    sub.add_parser("seed")

    p_search = sub.add_parser("search")
    p_search.add_argument("query")

    p_log = sub.add_parser("log")
    p_log.add_argument("--new", action="store_true")
    p_log.add_argument("--site-id", type=int)
    p_log.add_argument("--name")
    p_log.add_argument("--operator")
    p_log.add_argument("--state")
    p_log.add_argument("--city")
    p_log.add_argument("--lat", type=float)
    p_log.add_argument("--lon", type=float)
    p_log.add_argument("--precision")
    p_log.add_argument("--url", required=True)
    p_log.add_argument("--publisher")
    p_log.add_argument("--field", required=True, choices=["existence", "status", "address", "operator"])
    p_log.add_argument("--value", required=True)
    p_log.add_argument("--excerpt")
    p_log.add_argument("--added-by")

    p_status = sub.add_parser("status")
    p_status.add_argument("--state")
    p_status.add_argument("--unconfirmed-only", action="store_true")

    p_export = sub.add_parser("export-geojson")
    p_export.add_argument("--states", help="comma-separated state list, e.g. WA,OR")
    p_export.add_argument("--confirmed-only", action="store_true")
    p_export.add_argument("--out", help="write to this path instead of stdout")

    args = parser.parse_args()
    {
        "init": cmd_init,
        "seed": cmd_seed,
        "search": cmd_search,
        "log": cmd_log,
        "status": cmd_status,
        "export-geojson": cmd_export_geojson,
    }[args.cmd](args)


if __name__ == "__main__":
    main()
