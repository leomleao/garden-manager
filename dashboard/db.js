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

// Migrate plant_lifecycle.zone_id to be nullable (required for clearing a plant from a zone without deleting it)
const plcTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plant_lifecycle'").get();
if (plcTable) {
  const zoneIdCol = db.prepare("PRAGMA table_info(plant_lifecycle)").all().find(col => col.name === 'zone_id');
  if (zoneIdCol && zoneIdCol.notnull) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      BEGIN;
      CREATE TABLE plant_lifecycle_v2 (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        seed_id          INTEGER REFERENCES seeds(id),
        zone_id          INTEGER REFERENCES zones(id),
        cell_id          INTEGER REFERENCES zone_cells(id),
        sown_date        TEXT,
        germinated_date  TEXT,
        moved_date       TEXT,
        harvested_date   TEXT,
        failed_date      TEXT,
        status           TEXT NOT NULL DEFAULT 'sown',
        quantity         INTEGER DEFAULT 1,
        notes            TEXT
      );
      INSERT INTO plant_lifecycle_v2 SELECT * FROM plant_lifecycle;
      DROP TABLE plant_lifecycle;
      ALTER TABLE plant_lifecycle_v2 RENAME TO plant_lifecycle;
      COMMIT;
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_plant_lifecycle_zone ON plant_lifecycle(zone_id, status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_plant_lifecycle_cell ON plant_lifecycle(cell_id) WHERE cell_id IS NOT NULL');
    db.exec('PRAGMA foreign_keys = ON');
  }
}

module.exports = db;
