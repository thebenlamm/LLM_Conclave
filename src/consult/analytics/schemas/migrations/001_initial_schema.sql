-- Initial schema for consultation analytics
CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  mode TEXT NOT NULL,
  final_recommendation TEXT,
  confidence REAL,
  total_cost REAL,
  total_tokens INTEGER,
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  schema_version TEXT,
  state TEXT NOT NULL,
  has_dissent INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS consultation_agents (
  consultation_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id)
);

CREATE TABLE IF NOT EXISTS consultation_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultation_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  round_type TEXT NOT NULL,
  duration_ms INTEGER,
  tokens_used INTEGER,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id)
);

CREATE INDEX IF NOT EXISTS idx_consultations_created_at ON consultations(created_at);
CREATE INDEX IF NOT EXISTS idx_consultations_cost ON consultations(total_cost);
CREATE INDEX IF NOT EXISTS idx_consultations_mode ON consultations(mode);
CREATE INDEX IF NOT EXISTS idx_consultations_state ON consultations(state);
