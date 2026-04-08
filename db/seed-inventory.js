const { Database } = require('../dashboard/node_modules/node-sqlite3-wasm');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'garden.db');
const sqlPath = path.join(__dirname, 'seed-inventory.sql');

// Ensure database exists before executing SQL
if (!fs.existsSync(dbPath)) {
  console.error('Error: Database not found at', dbPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const db = new Database(dbPath);

db.exec(sql);
db.close();

console.log('Seed inventory initialized at', dbPath);
