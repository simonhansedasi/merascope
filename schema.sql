-- Merascope PostgreSQL schema
-- Run once on a fresh database: psql $DATABASE_URL -f schema.sql

CREATE TABLE IF NOT EXISTS event_log (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT,
    fid         INTEGER,
    event_type  TEXT,
    payload     TEXT,
    ts          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session ON event_log(session_id);
CREATE INDEX IF NOT EXISTS idx_fid     ON event_log(fid);
CREATE INDEX IF NOT EXISTS idx_type    ON event_log(event_type);

CREATE TABLE IF NOT EXISTS case_invites (
    id          SERIAL PRIMARY KEY,
    case_id     TEXT NOT NULL,
    agency_key  TEXT NOT NULL,
    ts          TIMESTAMP DEFAULT NOW(),
    UNIQUE(case_id, agency_key)
);

CREATE TABLE IF NOT EXISTS case_conditions (
    id                SERIAL PRIMARY KEY,
    case_id           TEXT NOT NULL,
    text              TEXT NOT NULL,
    by                TEXT,
    type              TEXT DEFAULT 'Water',
    status            TEXT DEFAULT 'Proposed',
    pending_approval  INTEGER DEFAULT 0,
    submitted_by_role TEXT DEFAULT 'lead',
    ts                TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_docs (
    id            SERIAL PRIMARY KEY,
    case_id       TEXT NOT NULL,
    filename      TEXT NOT NULL,
    original_name TEXT,
    label         TEXT,
    doc_status    TEXT,
    ts            TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_meta (
    case_id           TEXT PRIMARY KEY,
    rebuttal_due_date TEXT,
    rebuttal_cycle    INTEGER DEFAULT 1,
    rebuttal_max      INTEGER DEFAULT 3
);

CREATE TABLE IF NOT EXISTS cases (
    id                 SERIAL PRIMARY KEY,
    case_id            TEXT NOT NULL UNIQUE,
    site               TEXT,
    applicant          TEXT,
    score              REAL DEFAULT 0.5,
    stage              TEXT DEFAULT 'Site Inquiry',
    days               INTEGER DEFAULT 0,
    ts                 TIMESTAMP DEFAULT NOW(),
    cell_fid           TEXT,
    state_code         TEXT,
    lat                REAL,
    lon                REAL,
    contact_name       TEXT,
    contact_email      TEXT,
    lead_agency        TEXT,
    notes              TEXT,
    external_permit_id TEXT,
    imported           INTEGER DEFAULT 0,
    agency_tracking_id TEXT,
    confirmed_at       TEXT,
    owner_email        TEXT
);

CREATE TABLE IF NOT EXISTS case_stage_overrides (
    case_id TEXT PRIMARY KEY,
    stage   TEXT NOT NULL,
    ts      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_impasse_routes (
    id       SERIAL PRIMARY KEY,
    item_key TEXT NOT NULL UNIQUE,
    ts       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_checks (
    id          SERIAL PRIMARY KEY,
    study_name  TEXT NOT NULL,
    section_idx INTEGER NOT NULL,
    ts          TIMESTAMP DEFAULT NOW(),
    UNIQUE(study_name, section_idx)
);

CREATE TABLE IF NOT EXISTS case_rebuttals (
    id      SERIAL PRIMARY KEY,
    case_id TEXT NOT NULL,
    text    TEXT NOT NULL,
    ts      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_state (
    fid   TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    ts    TIMESTAMP DEFAULT NOW()
);

-- ── auth ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    email      TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    email      TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Pre-seed steward emails here before pilot:
--   INSERT INTO user_roles (email, role, agency_key) VALUES ('name@seattle.gov', 'steward', 'OPCD');
CREATE TABLE IF NOT EXISTS user_roles (
    email      TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    role       TEXT NOT NULL,
    agency_key TEXT,
    PRIMARY KEY (email, role)
);
