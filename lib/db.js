const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "subscribers.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subscriber_id TEXT NOT NULL UNIQUE,
  ip TEXT,
  mobile TEXT,
  expiry_date TEXT NOT NULL,      -- ISO میلادی YYYY-MM-DD (برای مرتب‌سازی دقیق)
  provider TEXT,
  note TEXT,
  monitored INTEGER NOT NULL DEFAULT 0,
  notified_5 INTEGER NOT NULL DEFAULT 0,
  notified_3 INTEGER NOT NULL DEFAULT 0,
  notified_0 INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id_fk INTEGER NOT NULL,
  kind TEXT NOT NULL,             -- '5day' | '3day' | 'expired'
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (subscriber_id_fk) REFERENCES subscribers(id) ON DELETE CASCADE
);
`);

module.exports = db;
