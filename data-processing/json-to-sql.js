'use strict';
// Usage: node json-to-sql.js
// Reads data.json and writes data.sql in the same INSERT INTO format as data.txt

const fs   = require('fs');
const path = require('path');

const DATA_JSON = path.join(__dirname, 'data.json');
const DATA_SQL  = path.join(__dirname, 'data.sql');

// Column order matches data.txt; 'image' from JSON maps to 'picture' in SQL
const COLUMNS = [
  'name', 'variety', 'emoji', 'type', 'quantity', 'box_id',
  'supplier', 'purchase_year', 'sow_by_year', 'notes', 'purchase_link',
  'days_to_germinate', 'optimum_soil_temp', 'optimum_soil_type',
  'plant_height', 'light_requirements', 'growing_instructions',
  'sow_indoors_start', 'sow_indoors_end',
  'sow_outdoors_start', 'sow_outdoors_end',
  'plant_out_start', 'plant_out_end',
  'harvest_start', 'harvest_end',
  'picture',  // stored as 'image' in the JSON
];

// These columns are written as unquoted numbers
const NUMERIC_COLS = new Set(['quantity', 'box_id', 'purchase_year', 'sow_by_year']);

function sqlEscape(col, value) {
  if (value === null || value === undefined) return 'NULL';
  if (NUMERIC_COLS.has(col)) return String(value);
  // Normalise whitespace so each row stays on a single line, then escape single quotes
  const escaped = String(value)
    .replace(/\r\n|\r|\n|\t/g, ' ')  // collapse newlines/tabs to space
    .replace(/ {2,}/g, ' ')          // collapse multiple spaces
    .trim()
    .replace(/'/g, "''");            // escape single quotes
  return `'${escaped}'`;
}

function rowToSql(item) {
  const vals = COLUMNS.map(col => {
    // 'picture' in SQL comes from 'image' in JSON
    const jsonKey = col === 'picture' ? 'image' : col;
    let value = item[jsonKey] !== undefined ? item[jsonKey] : null;
    // The app reads raw base64 from the DB and prepends 'data:image/jpeg;base64,' itself,
    // so strip that prefix here if it was stored as a full data URL by the scraper.
    if (col === 'picture' && typeof value === 'string' && value.startsWith('data:')) {
      value = value.split(',')[1] ?? null;
    }
    return sqlEscape(col, value);
  });
  return `(${vals.join(', ')})`;
}

const data = JSON.parse(fs.readFileSync(DATA_JSON, 'utf8'));

const header = `INSERT INTO seeds (${COLUMNS.join(', ')}) VALUES`;
const rows   = data.map((item, i) => {
  const suffix = i < data.length - 1 ? ',' : ';';
  return rowToSql(item) + suffix;
});

const sql = [header, ...rows].join('\n');

fs.writeFileSync(DATA_SQL, sql);
console.log(`Converted ${data.length} records to ${DATA_SQL}`);
