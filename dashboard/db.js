const { Database } = require('node-sqlite3-wasm');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join('/data', 'garden.db');
const db = new Database(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const tasksTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get();
if (tasksTable) {
  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all().map(col => col.name);
  if (!taskColumns.includes('callback_type')) {
    db.exec('ALTER TABLE tasks ADD COLUMN callback_type TEXT');
  }
  if (!taskColumns.includes('callback_payload')) {
    db.exec('ALTER TABLE tasks ADD COLUMN callback_payload TEXT');
  }
}

module.exports = db;
