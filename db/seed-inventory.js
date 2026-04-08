/**
 * Seed Inventory Database Helper
 * Executes seed-inventory.sql to populate the seed_inventory table
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../data/garden.db');
const sqlPath = path.join(__dirname, 'seed-inventory.sql');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
});

const sql = fs.readFileSync(sqlPath, 'utf8');

db.exec(sql, (err) => {
  if (err) {
    console.error('Error executing SQL:', err);
    process.exit(1);
  }
  console.log('Seed inventory database initialized successfully at', dbPath);
  db.close();
});
