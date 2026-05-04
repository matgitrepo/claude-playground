CREATE TABLE IF NOT EXISTS snapshots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_date  TEXT NOT NULL,
  skill          TEXT NOT NULL,
  count          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_date ON snapshots(captured_date);
CREATE INDEX IF NOT EXISTS idx_skill ON snapshots(skill);
