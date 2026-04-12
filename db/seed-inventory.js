const { Database } = require('../dashboard/node_modules/node-sqlite3-wasm');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'garden.db');
const sqlPath = path.join(__dirname, 'seed-inventory.sql');

// Ensure database exists before executing SQL
let resolvedDbPath = dbPath;
if (!fs.existsSync(resolvedDbPath)) {
  const fallbackPath = '/home/leo/garden-manager/data/garden.db';
  console.warn('Database not found at', resolvedDbPath, '— trying fallback:', fallbackPath);
  if (!fs.existsSync(fallbackPath)) {
    console.error('Error: Database not found at fallback path', fallbackPath);
    process.exit(1);
  }
  resolvedDbPath = fallbackPath;
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const db = new Database(resolvedDbPath);

db.exec(sql);
db.close();

console.log('Seed inventory initialized at', resolvedDbPath);
