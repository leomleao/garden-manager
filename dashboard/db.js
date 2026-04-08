const { Database } = require('node-sqlite3-wasm');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join('/data', 'garden.db');
const db = new Database(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

module.exports = db;
