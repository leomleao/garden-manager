PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS zones (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  type              TEXT DEFAULT 'other',
  -- Physical
  latitude          REAL,
  longitude         REAL,
  area_sqm          REAL,
  covered           INTEGER DEFAULT 0,
  cover_type        TEXT,
  orientation       TEXT,
  slope_degrees     REAL,
  -- Environment
  has_auto_watering INTEGER DEFAULT 0,
  watering_type     TEXT,
  has_heating       INTEGER DEFAULT 0,
  heating_type      TEXT,
  has_lighting      INTEGER DEFAULT 0,
  lighting_type     TEXT,
  soil_type         TEXT,
  -- Display
  view_type         TEXT NOT NULL DEFAULT 'loose',
  grid_rows         INTEGER,
  grid_cols         INTEGER,
  cell_width_cm     REAL,
  cell_height_cm    REAL,
  notes             TEXT,
  sort_order        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS zone_cells (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id  INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  row      INTEGER NOT NULL,
  col      INTEGER NOT NULL,
  label    TEXT NOT NULL,
  UNIQUE(zone_id, row, col)
);

CREATE TABLE IF NOT EXISTS seeds (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL,
  variety               TEXT,
  emoji                 TEXT,
  type                  TEXT,
  quantity              INTEGER DEFAULT 0,
  box_id                INTEGER,
  supplier              TEXT,
  purchase_year         INTEGER,
  sow_by_year           INTEGER,
  notes                 TEXT,
  purchase_link         TEXT,
  days_to_germinate     INTEGER,
  optimum_soil_temp     TEXT,
  optimum_soil_type     TEXT,
  plant_height          TEXT,
  light_requirements    TEXT,
  growing_instructions  TEXT,
  sow_indoors_start     TEXT,
  sow_indoors_end       TEXT,
  sow_outdoors_start    TEXT,
  sow_outdoors_end      TEXT,
  plant_out_start       TEXT,
  plant_out_end         TEXT,
  harvest_start         TEXT,
  harvest_end           TEXT,
  picture               BLOB
);

CREATE TABLE IF NOT EXISTS plant_lifecycle (
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

CREATE TABLE IF NOT EXISTS tasks (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id   INTEGER REFERENCES zones(id),
  title     TEXT NOT NULL,
  due_date  TEXT,
  priority  TEXT NOT NULL DEFAULT 'medium',
  status    TEXT NOT NULL DEFAULT 'pending',
  notes     TEXT,
  callback_type TEXT,
  callback_payload TEXT
);

CREATE TABLE IF NOT EXISTS activity_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  action_type  TEXT,
  zone_id      INTEGER REFERENCES zones(id),
  plant_lifecycle_id  INTEGER REFERENCES plant_lifecycle(id),
  description  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plant_lifecycle_zone ON plant_lifecycle(zone_id, status);
CREATE INDEX IF NOT EXISTS idx_plant_lifecycle_cell ON plant_lifecycle(cell_id) WHERE cell_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due            ON tasks(due_date, status);
CREATE INDEX IF NOT EXISTS idx_activity_ts          ON activity_log(timestamp DESC);

-- Example data (Scotland / Port of Menteith) — replace via Settings after setup
INSERT OR IGNORE INTO app_config(key, value) VALUES ('example_data_loaded', '1');

INSERT INTO zones(name,type,latitude,longitude,covered,cover_type,view_type,grid_rows,grid_cols,cell_width_cm,cell_height_cm,sort_order)
VALUES
  ('Germinator 1','germinator',56.1667,-4.2833,1,'glass','grid',8,5,2.5,2.5,1),
  ('Germinator 2','germinator',56.1667,-4.2833,1,'glass','grid',8,5,2.5,2.5,2),
  ('Greenhouse','greenhouse',56.1667,-4.2833,1,'glass','loose',NULL,NULL,NULL,NULL,3),
  ('Polytunnel','polytunnel',56.1667,-4.2833,1,'polytunnel','grid',5,4,25,25,4),
  ('Outdoor Veg Plot','outdoor',56.1667,-4.2833,0,NULL,'loose',NULL,NULL,NULL,NULL,5);

-- Generate cells for grid zones (mirrors the logic in PATCH /zones/:id)
WITH RECURSIVE
  rows(r) AS (SELECT 1 UNION ALL SELECT r+1 FROM rows WHERE r < 8),
  cols(c) AS (SELECT 1 UNION ALL SELECT c+1 FROM cols WHERE c < 5)
INSERT INTO zone_cells(zone_id, row, col, label)
SELECT (SELECT id FROM zones WHERE name='Germinator 1'), r, c, char(64+r)||c
FROM rows CROSS JOIN cols;

WITH RECURSIVE
  rows(r) AS (SELECT 1 UNION ALL SELECT r+1 FROM rows WHERE r < 8),
  cols(c) AS (SELECT 1 UNION ALL SELECT c+1 FROM cols WHERE c < 5)
INSERT INTO zone_cells(zone_id, row, col, label)
SELECT (SELECT id FROM zones WHERE name='Germinator 2'), r, c, char(64+r)||c
FROM rows CROSS JOIN cols;

WITH RECURSIVE
  rows(r) AS (SELECT 1 UNION ALL SELECT r+1 FROM rows WHERE r < 5),
  cols(c) AS (SELECT 1 UNION ALL SELECT c+1 FROM cols WHERE c < 4)
INSERT INTO zone_cells(zone_id, row, col, label)
SELECT (SELECT id FROM zones WHERE name='Polytunnel'), r, c, char(64+r)||c
FROM rows CROSS JOIN cols;

INSERT INTO seeds(name,variety,type,quantity,supplier,purchase_year,sow_indoors_start,sow_indoors_end,sow_outdoors_start,sow_outdoors_end,plant_out_start,plant_out_end,harvest_start,harvest_end)
VALUES
  ('Tomato',   'Gardeners Delight','vegetable',30,'Thompson & Morgan',2024, '01-02','31-03',NULL,    NULL,    '15-05','15-06','01-07','31-10'),
  ('Courgette','Black Beauty',      'vegetable',15,'RHS',              2024, '01-04','15-05','15-05','01-06', '01-06','15-06','01-07','30-09'),
  ('Lettuce',  'Little Gem',        'vegetable',50,'Suttons',          2024, '01-02','31-08','15-03','01-09', NULL,   NULL,   '01-05','30-11'),
  ('Basil',    'Sweet Genovese',    'herb',      20,'Jekka''s',         2024, '01-03','31-05',NULL,    NULL,    '01-06','15-06','01-06','30-09'),
  ('Kale',     'Cavolo Nero',       'vegetable', 25,'Thompson & Morgan',2024, '01-04','31-07','15-04','31-07', NULL,   NULL,   '01-10','31-03'),
  ('Beetroot', 'Boltardy',          'vegetable', 40,'Suttons',          2024, NULL,   NULL,   '15-03','31-07', NULL,   NULL,   '01-06','31-10'),
  ('Peas',     'Kelvedon Wonder',   'vegetable', 60,'Thompson & Morgan',2024, NULL,   NULL,   '15-02','30-06', NULL,   NULL,   '01-06','30-09'),
  ('Chilli',   'Apache',            'vegetable', 10,'Nicky''s',         2024, '15-01','31-03',NULL,    NULL,    '15-05','01-06','01-08','31-10');
