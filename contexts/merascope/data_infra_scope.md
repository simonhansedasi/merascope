# Data Infrastructure Scope — Pre-Pilot

**Context:** Even a single-steward pilot (Seattle OPCD) brings hundreds of builders immediately. The current SQLite + local disk + no-auth backend cannot survive first contact with a real agency. The frontend and API surface are production-ready. The persistence layer is not. This document scopes what needs to change before any real permitting data enters the system.

---

## What breaks first

**SQLite under concurrent writes.** One steward reviewing cases while several builders upload documents simultaneously = write locks and failed requests. This happens at ~5 concurrent users, not hundreds.

**No row-level access control.** `/api/cases` returns every case to any caller. Builder A can read Builder B's documents, contact info, and permit files. At demo scale this is invisible. At pilot scale it is a liability and a reason for agencies not to adopt.

**Local disk is not a legal record.** Documents stored in `data/docs/` on the VPS have no redundancy, no backup, and no audit trail. Files cited in permitting decisions need to live somewhere durable.

---

## Component 1 — PostgreSQL

**Replaces:** SQLite (`merascope_log.db`)

**Why now:** Foundation for everything else. Row-level security, concurrent writes, proper foreign keys, and production reliability all depend on a real database.

**What changes:**
- `server.py`: swap `sqlite3` for `psycopg2`. Replace `?` placeholders with `%s`. Replace `INSERT OR REPLACE` with `INSERT ... ON CONFLICT DO UPDATE`. Replace `datetime('now')` with `NOW()`. Replace `INTEGER PRIMARY KEY AUTOINCREMENT` with `SERIAL PRIMARY KEY`.
- Write a `schema.sql` migration script (one-time run on the VPS).
- Connection pooling via `psycopg2.pool.ThreadedConnectionPool` (Flask is multi-threaded under gunicorn).

**Frontend impact:** None.

**Effort:** 1 day.

---

## Component 2 — Auth (email magic link)

**Replaces:** `mera_role` in localStorage

**Why now:** Without identity, row-level access control is impossible. Every other security property depends on knowing who is making a request.

**What changes:**
- New tables: `users (email PK, created_at)`, `sessions (token PK, email FK, expires_at)`.
- New routes: `POST /api/auth/request` (takes email, sends magic link), `GET /api/auth/verify?token=...` (validates token, sets HTTP-only session cookie), `POST /api/auth/logout`.
- Session middleware: decorator that reads session cookie, validates against `sessions` table, attaches `g.user_email` and `g.user_role` to the request context.
- Role table: `user_roles (email, role, agency_key)` — pre-seed steward emails for OPCD; builders self-register via their case submission email.
- Email delivery: SMTP via existing gmail account, or Resend free tier (100 emails/day).

**Role mapping:**
- Builder: any email that has submitted or registered a case. Scoped to their own cases.
- Steward: pre-registered email in `user_roles` with `role='steward'`. Sees all cases.
- Co-party: invited by steward via `case_invites`. Scoped to invited cases only.

**Frontend impact:** Login page already exists (`#/login`). Needs to wire up to the magic link flow instead of demo SSO. The `mera_role` localStorage value stays for the demo tour — auth gates apply only to authenticated routes.

**Effort:** 2–3 days.

---

## Component 3 — Row-level access control

**Depends on:** Component 2 (auth)

**Why now:** One builder must not be able to read another builder's case, documents, or contact information.

**What changes:**
- Add `owner_email TEXT` to `cases` table — set at submission time from `g.user_email`.
- Builder routes (`/api/cases`, `/api/builder/case/:id`, `/api/case/:id/docs`) add `WHERE owner_email = g.user_email` filter for builder role.
- Steward routes: no filter (see all cases), or filtered by `lead_agency` if multi-agency support is needed later.
- Co-party routes: filter by `case_invites` membership.
- Document serve route (`/api/case/:id/docs/:filename`): verify requester has case access before serving the file.

**Frontend impact:** None to the UI. The API just returns the right subset.

**Effort:** 1 day (once auth is in place).

---

## Component 4 — Hetzner Object Storage for documents

**Replaces:** `data/docs/` on VPS local disk

**Why now:** Documents are legal records. They need durability, redundancy, and to not live on the same disk as the application.

**What changes:**
- Provision Hetzner Object Storage bucket (S3-compatible, ~€5/month for 1TB).
- `upload_doc` route: swap `f.save(local_path)` for `boto3` `put_object` to the bucket. `filename` column in `case_docs` becomes the object key.
- `serve_doc` route: generate a pre-signed URL (time-limited, 15 min) and redirect. No file proxying through Flask.
- `DOCS_DIR` and `os.makedirs` calls are removed.

**Frontend impact:** Download links change from `/api/case/:id/docs/:filename` to pre-signed URLs, but this is transparent — the redirect is handled server-side.

**Effort:** 1 day.

---

## Component 5 — Docket pagination

**Why now:** `SELECT * FROM cases` with hundreds of cases is slow and sends unnecessary data to the client.

**What changes:**
- `/api/cases` accepts `limit` (default 50) and `offset` query params.
- Steward docket frontend: "Load more" button or infinite scroll.

**Effort:** 2–3 hours.

---

## Order of operations

```
Week 1, Days 1–2:   Component 1 — PostgreSQL migration
Week 1, Days 3–5:   Component 2 — Auth (magic link)
Week 2, Day 1:      Component 3 — Row-level access control
Week 2, Day 2:      Component 4 — Object Storage
Week 2, Day 3:      Component 5 — Pagination + smoke test full flow
```

Components 4 and 5 can run in parallel with 2 and 3 if there are two people.

---

## What this does NOT solve (next scope)

- **Multi-agency steward scoping** — a King County steward should only see King County cases by default. Needs `agency_key` on cases + steward role scoping.
- **Document versioning** — right now you can upload a v2 of a document but v1 stays. No version chain.
- **Audit log tied to identity** — `event_log` records actions but not WHO. Once auth exists, log `user_email` on every event.
- **Data deletion / GDPR** — builders may request their data be removed. No mechanism exists.
- **Case transfer** — what happens if a builder company changes or a steward agency transfers a case.

These are real but none of them block a pilot with Seattle. The five components above are the hard pre-conditions.

---

## Pre-pilot checklist

- [ ] PostgreSQL provisioned and schema migrated on Hetzner VPS
- [ ] Magic link auth working end-to-end (request → email → cookie → session)
- [ ] Builder can only see their own cases
- [ ] Steward (pre-seeded OPCD emails) can see all cases
- [ ] Documents stored in Object Storage, not local disk
- [ ] Docket paginated
- [ ] `deploy_hetzner.sh` updated to handle new env vars (DB connection string, Object Storage keys, SMTP credentials)
- [ ] Smoke test: builder registers permit → uploads doc → steward confirms → both see same record → builder downloads doc
