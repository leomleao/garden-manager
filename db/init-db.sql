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
  view_type         TEXT DEFAULT 'loose',
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
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  variety       TEXT,
  type          TEXT,
  quantity      INTEGER DEFAULT 0,
  supplier      TEXT,
  purchase_year INTEGER,
  sow_by_year   INTEGER,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS plantings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_id          INTEGER REFERENCES seeds(id),
  zone_id          INTEGER NOT NULL REFERENCES zones(id),
  cell_id          INTEGER REFERENCES zone_cells(id),
  sown_date        TEXT,
  germinated_date  TEXT,
  moved_date       TEXT,
  harvested_date   TEXT,
  failed_date      TEXT,
  status           TEXT DEFAULT 'sown',
  quantity         INTEGER DEFAULT 1,
  notes            TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id   INTEGER REFERENCES zones(id),
  title     TEXT NOT NULL,
  due_date  TEXT,
  priority  TEXT DEFAULT 'medium',
  status    TEXT DEFAULT 'pending',
  notes     TEXT
);

CREATE TABLE IF NOT EXISTS growing_calendar (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  crop_name            TEXT NOT NULL,
  sow_indoors_start    TEXT,
  sow_indoors_end      TEXT,
  sow_outdoors_start   TEXT,
  sow_outdoors_end     TEXT,
  harvest_start        TEXT,
  harvest_end          TEXT,
  notes                TEXT
);

CREATE TABLE IF NOT EXISTS activity_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  action_type  TEXT,
  zone_id      INTEGER REFERENCES zones(id),
  planting_id  INTEGER REFERENCES plantings(id),
  description  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plantings_zone   ON plantings(zone_id, status);
CREATE INDEX IF NOT EXISTS idx_plantings_cell   ON plantings(cell_id) WHERE cell_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due        ON tasks(due_date, status);
CREATE INDEX IF NOT EXISTS idx_activity_ts      ON activity_log(timestamp DESC);

-- Example data (Scotland / Port of Menteith) — replace via Settings after setup
INSERT OR IGNORE INTO app_config(key, value) VALUES ('example_data_loaded', '1');

INSERT INTO zones(name,type,latitude,longitude,covered,cover_type,view_type,grid_rows,grid_cols,cell_width_cm,cell_height_cm,sort_order)
VALUES
  ('Germinator 1','germinator',56.1667,-4.2833,1,'glass','grid',5,8,2.5,2.5,1),
  ('Greenhouse','greenhouse',56.1667,-4.2833,1,'glass','loose',NULL,NULL,NULL,NULL,2),
  ('Polytunnel','polytunnel',56.1667,-4.2833,1,'polytunnel','grid',5,4,25,25,3),
  ('Outdoor Veg Plot','outdoor',56.1667,-4.2833,0,NULL,'loose',NULL,NULL,NULL,NULL,4);

INSERT INTO seeds(name,variety,type,quantity,supplier,purchase_year)
VALUES
  ('Tomato','Gardeners Delight','vegetable',30,'Thompson & Morgan',2024),
  ('Courgette','Black Beauty','vegetable',15,'RHS',2024),
  ('Lettuce','Little Gem','salad',50,'Suttons',2024),
  ('Basil','Sweet Genovese','herb',20,'Jekka''s',2024),
  ('Kale','Cavolo Nero','vegetable',25,'Thompson & Morgan',2024),
  ('Beetroot','Boltardy','vegetable',40,'Suttons',2024),
  ('Peas','Kelvedon Wonder','vegetable',60,'Thompson & Morgan',2024),
  ('Chilli','Apache','vegetable',10,'Nicky''s',2024);

INSERT INTO growing_calendar(crop_name,sow_indoors_start,sow_indoors_end,sow_outdoors_start,sow_outdoors_end,harvest_start,harvest_end,notes)
VALUES
  ('Tomato','02-01','03-31',NULL,NULL,'07-01','10-31','Start indoors, transplant after last frost'),
  ('Courgette','04-01','05-15','05-15','06-01','07-01','09-30','Direct sow outdoors after frosts'),
  ('Lettuce','02-01','08-31','03-15','09-01','05-01','11-30','Succession sow every 2-3 weeks'),
  ('Basil','03-01','05-31',NULL,NULL,'06-01','09-30','Needs warmth - ideal for germinator'),
  ('Kale','04-01','07-31','04-15','07-31','10-01','03-31','Hardy, survives Scottish winter'),
  ('Beetroot',NULL,NULL,'03-15','07-31','06-01','10-31','Direct sow only'),
  ('Peas',NULL,NULL,'02-15','06-30','06-01','09-30','Direct sow, can start early under cover'),
  ('Chilli','01-15','03-31',NULL,NULL,'08-01','10-31','Long season - start very early indoors'),
  ('Cucumber','03-01','04-30',NULL,NULL,'07-01','09-30','Greenhouse or polytunnel only in Scotland'),
  ('Runner Bean',NULL,NULL,'05-01','06-15','07-15','10-31','Frost tender - sow after last frost'),
  ('Carrot',NULL,NULL,'03-01','06-30','06-15','10-31','Direct sow, thin to 5cm'),
  ('Onion','01-15','02-28',NULL,NULL,'07-01','09-30','Start from seed indoors or use sets'),
  ('Spinach',NULL,NULL,'02-15','09-01','04-01','11-30','Bolt-prone in heat, ideal for Scotland'),
  ('Parsley','02-01','06-30','04-01','06-30','06-01','11-30','Slow to germinate'),
  ('Coriander',NULL,NULL,'04-01','08-31','06-01','10-31','Bolt-prone, succession sow monthly');
