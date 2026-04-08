const { Database } = require('../dashboard/node_modules/node-sqlite3-wasm/node-sqlite3-wasm');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'garden.db');
const sqlPath = path.join(__dirname, 'db', 'init-db.sql');

const sql = fs.readFileSync(sqlPath, 'utf8');
const db = new Database(dbPath);

db.exec(sql);
db.close();

console.log('Database initialized at', dbPath);
