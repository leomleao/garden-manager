const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, 'data.txt'), 'utf8');

const colMatch = sql.match(/INSERT INTO seeds \(([^)]+)\)/);
if (!colMatch) {
  console.error('Could not find column definitions');
  process.exit(1);
}
const cols = colMatch[1].split(',').map(c => c.trim());

function parseValues(sql) {
  const rows = [];
  const valStart = sql.indexOf('VALUES') + 6;
  let i = valStart;

  while (i < sql.length) {
    // Find opening paren of row
    while (i < sql.length && sql[i] !== '(') i++;
    if (i >= sql.length) break;
    i++; // skip '('

    const values = [];

    while (i < sql.length) {
      // Skip whitespace
      while (i < sql.length && (sql[i] === ' ' || sql[i] === '\n' || sql[i] === '\r')) i++;

      if (sql[i] === ')') { i++; break; } // end of row

      if (sql[i] === "'") {
        // String value
        i++;
        let s = '';
        while (i < sql.length) {
          if (sql[i] === "'" && sql[i + 1] === "'") { s += "'"; i += 2; } // escaped quote
          else if (sql[i] === "'") { i++; break; }
          else { s += sql[i]; i++; }
        }
        values.push(s);
      } else {
        // NULL or numeric
        let token = '';
        while (i < sql.length && sql[i] !== ',' && sql[i] !== ')') {
          token += sql[i];
          i++;
        }
        const trimmed = token.trim();
        values.push(trimmed === 'NULL' ? null : trimmed);
      }

      // Skip whitespace and comma
      while (i < sql.length && sql[i] === ' ') i++;
      if (i < sql.length && sql[i] === ',') i++;
    }

    if (values.length > 0) rows.push(values);
  }

  return rows;
}

const rows = parseValues(sql);

const result = rows.map(vals => {
  const obj = {};
  cols.forEach((col, idx) => {
    obj[col] = vals[idx] !== undefined ? vals[idx] : null;
  });
  return obj;
});

const outputPath = path.join(__dirname, 'data.json');
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(`Converted ${result.length} records to ${outputPath}`);
