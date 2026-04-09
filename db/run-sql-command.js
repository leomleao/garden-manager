const { Database } = require('../dashboard/node_modules/node-sqlite3-wasm');
const fs = require('fs');
const path = require('path');

const sqlArg = process.argv[2];

if (!sqlArg) {
  console.error('Usage: node run-sql-command.js <path-to-sql-file>');
  process.exit(1);
}

const dbPath = path.join(__dirname, '..', 'data', 'garden.db');
const sqlPath = path.resolve(sqlArg);

if (!fs.existsSync(dbPath)) {
  console.error('Error: Database not found at', dbPath);
  process.exit(1);
}

if (!fs.existsSync(sqlPath)) {
  console.error('Error: SQL file not found at', sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const db = new Database(dbPath);

db.exec(sql);
db.close();

console.log('Executed', sqlPath, 'against', dbPath);
