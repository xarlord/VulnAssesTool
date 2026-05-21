-- FPF Audit Events Schema
-- ISO 21434 compliant audit trail for False Positive Filter decisions
-- Uses hash chain for tamper detection

CREATE TABLE IF NOT EXISTS fpf_audit_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,
  project_id TEXT NOT NULL,
  vulnerability_id TEXT NOT NULL,
  vulnerability_json TEXT NOT NULL,
  decision_json TEXT NOT NULL,
  context_json TEXT NOT NULL,
  user_json TEXT NOT NULL,
  hash TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  llm_data_json TEXT,
  undone INTEGER DEFAULT 0,
  undone_by_json TEXT,
  undone_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient project-based queries
CREATE INDEX IF NOT EXISTS idx_fpf_audit_project ON fpf_audit_events(project_id);

-- Index for efficient CVE-based queries
CREATE INDEX IF NOT EXISTS idx_fpf_audit_vuln ON fpf_audit_events(vulnerability_id);

-- Index for timestamp-based queries (chronological ordering)
CREATE INDEX IF NOT EXISTS idx_fpf_audit_timestamp ON fpf_audit_events(timestamp);

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_fpf_audit_event_type ON fpf_audit_events(event_type);

-- Index for finding the last event (for hash chain)
CREATE INDEX IF NOT EXISTS idx_fpf_audit_created ON fpf_audit_events(created_at DESC);
