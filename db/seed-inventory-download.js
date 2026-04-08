const { Database } = require('../dashboard/node_modules/node-sqlite3-wasm');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'garden.db');
const outputPath = path.join(__dirname, 'seed-inventory-download.sql');

// Ensure database exists before reading
if (!fs.existsSync(dbPath)) {
  console.error('Error: Database not found at', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

try {
  // Query all seeds from the database
  const rows = db.prepare('SELECT * FROM seeds ORDER BY id').all();

  if (!rows || rows.length === 0) {
    console.log('No seeds found in database');
    db.close();
    process.exit(0);
  }

  // Get column names from the first row (excluding id for natural ordering)
  const allColumns = Object.keys(rows[0]);
  const columns = allColumns.filter(col => col !== 'id');

  // Generate SQL INSERT statements
  let sqlContent = '-- Seed Inventory Export\n';
  sqlContent += `-- Exported on ${new Date().toISOString()}\n`;
  sqlContent += `-- Total seeds: ${rows.length}\n\n`;
  sqlContent += `DELETE FROM seeds;\n\n`;

  sqlContent += `INSERT INTO seeds (${columns.join(', ')}) VALUES\n`;

  const valueLines = rows.map((row, idx) => {
    const values = columns.map(col => {
      const value = row[col];
      if (value === null || value === undefined) {
        return 'NULL';
      }
      if (typeof value === 'string') {
        return `'${value.replace(/'/g, "''")}'`;
      }
      return value;
    });

    const line = `(${values.join(', ')})`;
    return idx < rows.length - 1 ? line + ',' : line + ';';
  });

  sqlContent += valueLines.join('\n');

  // Write to file
  fs.writeFileSync(outputPath, sqlContent, 'utf8');
  
  console.log(`✓ Seed inventory exported to ${outputPath}`);
  console.log(`  - Total seeds: ${rows.length}`);
  console.log(`  - File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);

} catch (error) {
  console.error('Error exporting seed inventory:', error);
  process.exit(1);
} finally {
  db.close();
}
