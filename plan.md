# Garden Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted, Dockerised garden management system with a dynamic zone configuration wizard, SQLite persistence, Alpine.js dashboard, and OpenClaw AI integration.

**Architecture:** Node.js/Express backend serves a no-build-step SPA (Alpine.js + Tailwind via CDN). SQLite database lives on a host bind mount. A one-shot `garden-db-init` container creates the schema+seed data on first run only. A `/setup` wizard intercepts all requests until configured.

**Tech Stack:** Node.js 20, Express 4, better-sqlite3, Alpine.js (CDN), Tailwind CSS (CDN), Leaflet.js (CDN), SQLite 3, Docker Compose, Traefik (optional), Jest + Supertest (tests)

---

## File Map

```
garden-manager/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── SETUP.md                              # Non-Traefik setup guide
├── db/
│   └── init-db.sql                       # Schema + Scotland example data (idempotent)
└── dashboard/
    ├── Dockerfile
    ├── package.json
    ├── app.js                            # Express entry point + setup-guard middleware
    ├── db.js                             # DB connection singleton
    ├── routes/
    │   ├── api.js                        # REST: zones, plantings, seeds, tasks, calendar, log
    │   └── setup.js                      # REST: wizard read/write endpoints
    ├── public/
    │   ├── setup/
    │   │   ├── index.html                # 6-step wizard shell
    │   │   ├── wizard.js                 # Alpine.js wizard logic
    │   │   └── style.css
    │   └── app/
    │       ├── index.html                # Dashboard shell
    │       ├── app.js                    # Alpine.js dashboard logic
    │       └── style.css
    └── tests/
        ├── setup-routes.test.js
        └── api-routes.test.js
openclaw/
    ├── README.md
    ├── skills/
    │   └── garden-manager/
    │       └── SKILL.md
    └── cron-setup.sh
```

---

## Phase 1 — Foundation

### Task 1: Repo scaffold

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `dashboard/package.json`

- [ ] **Step 1: Create `.gitignore`**

```
.env
dashboard/node_modules/
data/
*.db
```

- [ ] **Step 2: Create `.env.example`**

```
# Path on host where garden.db will be stored
# For standalone use (no home-server): DATA_DIR=./data
DATA_DIR=/home/leo/garden

# Dashboard port (used when Traefik is NOT active - see docker-compose.yml)
PORT=8420

# Traefik domain (only used if Traefik labels are enabled)
DOMAIN=garden.home
```

- [ ] **Step 3: Create `dashboard/package.json`**

```json
{
  "name": "garden-manager-dashboard",
  "version": "1.0.0",
  "description": "Garden manager dashboard",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "node --watch app.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "express": "^4.18.3"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git init
git add .gitignore .env.example dashboard/package.json
git commit -m "feat: repo scaffold with gitignore, env example, package.json"
```

---

### Task 2: Docker Compose + Dockerfile

**Files:**
- Create: `docker-compose.yml`
- Create: `dashboard/Dockerfile`

- [ ] **Step 1: Create `dashboard/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
EXPOSE 8420
CMD ["node", "app.js"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  garden-db-init:
    image: keinos/sqlite3
    volumes:
      - ${DATA_DIR:-./data}:/data
      - ./db:/db
    entrypoint: >
      sh -c "[ -f /data/garden.db ] && echo 'DB exists, skipping init' || sqlite3 /data/garden.db < /db/init-db.sql && echo 'DB initialised'"
    restart: "no"

  garden-dashboard:
    build: ./dashboard
    depends_on:
      garden-db-init:
        condition: service_completed_successfully
    volumes:
      - ${DATA_DIR:-./data}:/data
    environment:
      - DB_PATH=/data/garden.db
      - PORT=${PORT:-8420}
    # Traefik labels — remove or comment out if not using Traefik
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.garden.rule=Host(`${DOMAIN:-garden.home}`)"
      - "traefik.http.routers.garden.entrypoints=websecure"
      - "traefik.http.services.garden.loadbalancer.server.port=8420"
    # Uncomment the lines below if NOT using Traefik:
    # ports:
    #   - "${PORT:-8420}:8420"
    restart: unless-stopped

networks:
  default:
    name: proxy
    external: true
```

- [ ] **Step 3: Create `data/.gitkeep` so the data dir exists for standalone users**

```bash
mkdir -p data && touch data/.gitkeep
echo "data/*.db" >> .gitignore
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml dashboard/Dockerfile data/.gitkeep .gitignore
git commit -m "feat: docker-compose with db-init one-shot and dashboard service"
```

---

### Task 3: Database schema

**Files:**
- Create: `db/init-db.sql`

- [ ] **Step 1: Create `db/init-db.sql` — app config + zones**

```sql
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
```

- [ ] **Step 2: Append zone_cells, seeds, plantings**

```sql
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
```

- [ ] **Step 3: Append tasks, growing_calendar, activity_log, indexes**

```sql
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
```

- [ ] **Step 4: Append Scotland example seed data**

```sql
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
```

- [ ] **Step 5: Verify SQL is valid**

```bash
sqlite3 /tmp/test.db < db/init-db.sql && echo "SQL OK" && rm /tmp/test.db
```
Expected output: `SQL OK`

- [ ] **Step 6: Commit**

```bash
git add db/init-db.sql
git commit -m "feat: full database schema and Scotland example seed data"
```

---

### Task 4: DB connection module

**Files:**
- Create: `dashboard/db.js`

- [ ] **Step 1: Write failing test**

Create `dashboard/tests/db.test.js`:
```js
const path = require('path');
process.env.DB_PATH = path.join(__dirname, 'test.db');

const db = require('../db');

afterAll(() => {
  db.close();
  require('fs').unlinkSync(process.env.DB_PATH);
});

test('db module returns a connected better-sqlite3 instance', () => {
  const row = db.prepare('SELECT 1 AS val').get();
  expect(row.val).toBe(1);
});

test('db is in WAL mode', () => {
  const row = db.prepare("PRAGMA journal_mode").get();
  expect(row.journal_mode).toBe('wal');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd dashboard && npm install && npx jest tests/db.test.js
```
Expected: FAIL — `Cannot find module '../db'`

- [ ] **Step 3: Create `dashboard/db.js`**

```js
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join('/data', 'garden.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/db.test.js
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/db.js dashboard/tests/db.test.js
git commit -m "feat: sqlite db connection module with WAL mode"
```

---

### Task 5: Express app + setup-guard middleware

**Files:**
- Create: `dashboard/app.js`

- [ ] **Step 1: Write failing test**

Create `dashboard/tests/setup-routes.test.js`:
```js
const path = require('path');
process.env.DB_PATH = path.join(__dirname, 'test.db');

// Initialise schema in test DB
const Database = require('better-sqlite3');
const fs = require('fs');
const db = new Database(process.env.DB_PATH);
const sql = fs.readFileSync(path.join(__dirname, '../../db/init-db.sql'), 'utf8');
// Run each statement (split on semicolons, skip empty)
sql.split(';').map(s => s.trim()).filter(Boolean).forEach(s => {
  try { db.exec(s + ';'); } catch(e) { /* ignore IF NOT EXISTS etc */ }
});
db.close();

const request = require('supertest');
const app = require('../app');

afterAll(() => {
  require('../db').close();
  fs.unlinkSync(process.env.DB_PATH);
});

test('GET / redirects to /setup when setup_complete not set', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe('/setup');
});

test('GET /setup returns 200', async () => {
  const res = await request(app).get('/setup');
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/setup-routes.test.js
```
Expected: FAIL — `Cannot find module '../app'`

- [ ] **Step 3: Create `dashboard/app.js`**

```js
const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Setup guard — redirect to /setup unless configured
app.use((req, res, next) => {
  if (req.path.startsWith('/setup') || req.path.startsWith('/api')) return next();
  const row = db.prepare("SELECT value FROM app_config WHERE key='setup_complete'").get();
  if (!row || row.value !== '1') return res.redirect('/setup');
  next();
});

// Static files
app.use('/setup', express.static(path.join(__dirname, 'public/setup')));
app.use('/', express.static(path.join(__dirname, 'public/app')));

// Routes
app.use('/api/setup', require('./routes/setup'));
app.use('/api', require('./routes/api'));

// Serve setup index for /setup (SPA fallback)
app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/setup/index.html'));
});

// Serve app index for everything else (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/app/index.html'));
});

if (require.main === module) {
  const port = process.env.PORT || 8420;
  app.listen(port, () => console.log(`Garden Manager running on port ${port}`));
}

module.exports = app;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/setup-routes.test.js
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/app.js dashboard/tests/setup-routes.test.js
git commit -m "feat: express app with setup-guard middleware and static file serving"
```

---

## Phase 2 — API Routes

### Task 6: Setup wizard API routes

**Files:**
- Create: `dashboard/routes/setup.js`

- [ ] **Step 1: Add setup route tests to `dashboard/tests/setup-routes.test.js`**

Append to the existing test file:
```js
test('GET /api/setup/status returns setup_complete false initially', async () => {
  const res = await request(app).get('/api/setup/status');
  expect(res.status).toBe(200);
  expect(res.body.setup_complete).toBe(false);
});

test('POST /api/setup/config saves owner_name', async () => {
  const res = await request(app)
    .post('/api/setup/config')
    .send({ key: 'owner_name', value: 'Test User' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});

test('POST /api/setup/zone creates a zone and returns id', async () => {
  const res = await request(app)
    .post('/api/setup/zone')
    .send({ name: 'Test Bed', type: 'outdoor', view_type: 'loose', area_sqm: 10 });
  expect(res.status).toBe(201);
  expect(res.body.id).toBeGreaterThan(0);
});

test('POST /api/setup/complete sets setup_complete flag', async () => {
  const res = await request(app).post('/api/setup/complete');
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  const row = require('../db').prepare("SELECT value FROM app_config WHERE key='setup_complete'").get();
  expect(row.value).toBe('1');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/setup-routes.test.js
```
Expected: 4 new failures (routes don't exist yet)

- [ ] **Step 3: Create `dashboard/routes/setup.js`**

```js
const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/setup/status
router.get('/status', (req, res) => {
  const row = db.prepare("SELECT value FROM app_config WHERE key='setup_complete'").get();
  res.json({ setup_complete: row?.value === '1' });
});

// POST /api/setup/config  { key, value }
router.post('/config', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  db.prepare("INSERT OR REPLACE INTO app_config(key,value) VALUES (?,?)").run(key, value);
  res.json({ ok: true });
});

// POST /api/setup/zone  — creates zone + cells if grid view
router.post('/zone', (req, res) => {
  const {
    name, type = 'other', latitude, longitude, area_sqm,
    covered = 0, cover_type, orientation, slope_degrees,
    has_auto_watering = 0, watering_type,
    has_heating = 0, heating_type,
    has_lighting = 0, lighting_type,
    soil_type, view_type = 'loose',
    grid_rows, grid_cols, cell_width_cm, cell_height_cm,
    notes, sort_order = 0
  } = req.body;

  if (!name) return res.status(400).json({ error: 'name required' });

  const info = db.prepare(`
    INSERT INTO zones(name,type,latitude,longitude,area_sqm,covered,cover_type,
      orientation,slope_degrees,has_auto_watering,watering_type,has_heating,heating_type,
      has_lighting,lighting_type,soil_type,view_type,grid_rows,grid_cols,
      cell_width_cm,cell_height_cm,notes,sort_order)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(name,type,latitude,longitude,area_sqm,covered,cover_type,
         orientation,slope_degrees,has_auto_watering,watering_type,has_heating,heating_type,
         has_lighting,lighting_type,soil_type,view_type,grid_rows,grid_cols,
         cell_width_cm,cell_height_cm,notes,sort_order);

  const zoneId = info.lastInsertRowid;

  // Generate cells for grid zones
  if (view_type === 'grid' && grid_rows && grid_cols) {
    const insert = db.prepare("INSERT INTO zone_cells(zone_id,row,col,label) VALUES(?,?,?,?)");
    const insertMany = db.transaction(() => {
      for (let r = 1; r <= grid_rows; r++) {
        for (let c = 1; c <= grid_cols; c++) {
          const label = String.fromCharCode(64 + r) + c;
          insert.run(zoneId, r, c, label);
        }
      }
    });
    insertMany();
  }

  res.status(201).json({ id: zoneId });
});

// DELETE /api/setup/example-data — clears example zones/seeds/calendar
router.delete('/example-data', (req, res) => {
  db.exec(`
    DELETE FROM activity_log;
    DELETE FROM plantings;
    DELETE FROM zone_cells;
    DELETE FROM zones;
    DELETE FROM seeds;
    DELETE FROM growing_calendar;
    DELETE FROM app_config WHERE key='example_data_loaded';
  `);
  res.json({ ok: true });
});

// POST /api/setup/complete
router.post('/complete', (req, res) => {
  db.prepare("INSERT OR REPLACE INTO app_config(key,value) VALUES('setup_complete','1')").run();
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/setup-routes.test.js
```
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/routes/setup.js dashboard/tests/setup-routes.test.js
git commit -m "feat: setup wizard API routes with zone creation and cell generation"
```

---

### Task 7: Main API routes

**Files:**
- Create: `dashboard/routes/api.js`
- Create: `dashboard/tests/api-routes.test.js`

- [ ] **Step 1: Write failing tests**

Create `dashboard/tests/api-routes.test.js`:
```js
const path = require('path');
process.env.DB_PATH = path.join(__dirname, 'api-test.db');

const Database = require('better-sqlite3');
const fs = require('fs');
const rawDb = new Database(process.env.DB_PATH);
const sql = fs.readFileSync(path.join(__dirname, '../../db/init-db.sql'), 'utf8');
sql.split(';').map(s => s.trim()).filter(Boolean).forEach(s => {
  try { rawDb.exec(s + ';'); } catch(e) {}
});
// Mark setup complete and seed a zone
rawDb.exec("INSERT OR REPLACE INTO app_config(key,value) VALUES('setup_complete','1')");
rawDb.exec("INSERT INTO zones(name,type,view_type) VALUES('Test Bed','outdoor','loose')");
rawDb.close();

const request = require('supertest');
const app = require('../app');

afterAll(() => {
  require('../db').close();
  fs.unlinkSync(process.env.DB_PATH);
});

test('GET /api/zones returns array', async () => {
  const res = await request(app).get('/api/zones');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.length).toBeGreaterThan(0);
});

test('GET /api/zones/:id returns zone with cells array', async () => {
  const res = await request(app).get('/api/zones/1');
  expect(res.status).toBe(200);
  expect(res.body.id).toBe(1);
  expect(Array.isArray(res.body.cells)).toBe(true);
});

test('GET /api/seeds returns array', async () => {
  const res = await request(app).get('/api/seeds');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('POST /api/seeds creates a seed', async () => {
  const res = await request(app)
    .post('/api/seeds')
    .send({ name: 'Carrot', variety: 'Nantes', type: 'vegetable', quantity: 20 });
  expect(res.status).toBe(201);
  expect(res.body.id).toBeGreaterThan(0);
});

test('GET /api/tasks returns array', async () => {
  const res = await request(app).get('/api/tasks');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('POST /api/tasks creates a task', async () => {
  const res = await request(app)
    .post('/api/tasks')
    .send({ title: 'Water seedlings', due_date: '2026-04-05', priority: 'high' });
  expect(res.status).toBe(201);
  expect(res.body.id).toBeGreaterThan(0);
});

test('GET /api/plantings returns array', async () => {
  const res = await request(app).get('/api/plantings');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('GET /api/calendar returns array', async () => {
  const res = await request(app).get('/api/calendar');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('GET /api/activity returns array', async () => {
  const res = await request(app).get('/api/activity');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('GET /api/config returns object', async () => {
  const res = await request(app).get('/api/config');
  expect(res.status).toBe(200);
  expect(typeof res.body).toBe('object');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/api-routes.test.js
```
Expected: FAIL (all 10 tests — routes don't exist)

- [ ] **Step 3: Create `dashboard/routes/api.js`**

```js
const express = require('express');
const db = require('../db');
const router = express.Router();

// Config
router.get('/config', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM app_config').all();
  const config = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(config);
});

// Zones
router.get('/zones', (req, res) => {
  res.json(db.prepare('SELECT * FROM zones ORDER BY sort_order, id').all());
});

router.get('/zones/:id', (req, res) => {
  const zone = db.prepare('SELECT * FROM zones WHERE id=?').get(req.params.id);
  if (!zone) return res.status(404).json({ error: 'not found' });
  zone.cells = db.prepare('SELECT * FROM zone_cells WHERE zone_id=? ORDER BY row,col').all(zone.id);
  res.json(zone);
});

router.patch('/zones/:id', (req, res) => {
  const allowed = ['name','type','latitude','longitude','area_sqm','covered','cover_type',
    'orientation','slope_degrees','has_auto_watering','watering_type','has_heating','heating_type',
    'has_lighting','lighting_type','soil_type','view_type','grid_rows','grid_cols',
    'cell_width_cm','cell_height_cm','notes','sort_order'];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'no valid fields' });
  const set = fields.map(f => `${f}=?`).join(',');
  const vals = fields.map(f => req.body[f]);
  db.prepare(`UPDATE zones SET ${set} WHERE id=?`).run(...vals, req.params.id);
  res.json({ ok: true });
});

// Seeds
router.get('/seeds', (req, res) => {
  const q = req.query.q;
  if (q) {
    res.json(db.prepare("SELECT * FROM seeds WHERE name LIKE ? OR variety LIKE ?").all(`%${q}%`, `%${q}%`));
  } else {
    res.json(db.prepare('SELECT * FROM seeds ORDER BY name').all());
  }
});

router.post('/seeds', (req, res) => {
  const { name, variety, type, quantity = 0, supplier, purchase_year, sow_by_year, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare(
    'INSERT INTO seeds(name,variety,type,quantity,supplier,purchase_year,sow_by_year,notes) VALUES(?,?,?,?,?,?,?,?)'
  ).run(name, variety, type, quantity, supplier, purchase_year, sow_by_year, notes);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/seeds/:id', (req, res) => {
  const allowed = ['name','variety','type','quantity','supplier','purchase_year','sow_by_year','notes'];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'no valid fields' });
  const set = fields.map(f => `${f}=?`).join(',');
  db.prepare(`UPDATE seeds SET ${set} WHERE id=?`).run(...fields.map(f => req.body[f]), req.params.id);
  res.json({ ok: true });
});

// Plantings
router.get('/plantings', (req, res) => {
  const { zone_id, status } = req.query;
  let q = `SELECT p.*, s.name as seed_name, s.variety as seed_variety
           FROM plantings p LEFT JOIN seeds s ON p.seed_id=s.id WHERE 1=1`;
  const params = [];
  if (zone_id) { q += ' AND p.zone_id=?'; params.push(zone_id); }
  if (status)  { q += ' AND p.status=?';  params.push(status);  }
  res.json(db.prepare(q + ' ORDER BY p.sown_date DESC').all(...params));
});

router.post('/plantings', (req, res) => {
  const { seed_id, zone_id, cell_id, sown_date, quantity = 1, notes } = req.body;
  if (!zone_id) return res.status(400).json({ error: 'zone_id required' });
  const info = db.prepare(
    'INSERT INTO plantings(seed_id,zone_id,cell_id,sown_date,status,quantity,notes) VALUES(?,?,?,?,?,?,?)'
  ).run(seed_id, zone_id, cell_id, sown_date || new Date().toISOString().slice(0,10), 'sown', quantity, notes);
  // Log
  db.prepare("INSERT INTO activity_log(action_type,zone_id,planting_id,description) VALUES('sow',?,?,?)")
    .run(zone_id, info.lastInsertRowid, `Sowed planting #${info.lastInsertRowid}`);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/plantings/:id', (req, res) => {
  const allowed = ['status','germinated_date','moved_date','harvested_date','failed_date','notes','cell_id'];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'no valid fields' });
  const set = fields.map(f => `${f}=?`).join(',');
  db.prepare(`UPDATE plantings SET ${set} WHERE id=?`).run(...fields.map(f => req.body[f]), req.params.id);
  // Log status changes
  if (req.body.status) {
    const p = db.prepare('SELECT zone_id FROM plantings WHERE id=?').get(req.params.id);
    db.prepare("INSERT INTO activity_log(action_type,zone_id,planting_id,description) VALUES(?,?,?,?)")
      .run(req.body.status, p?.zone_id, req.params.id, `Planting #${req.params.id} → ${req.body.status}`);
  }
  res.json({ ok: true });
});

// Tasks
router.get('/tasks', (req, res) => {
  const { zone_id, status, priority } = req.query;
  let q = 'SELECT t.*, z.name as zone_name FROM tasks t LEFT JOIN zones z ON t.zone_id=z.id WHERE 1=1';
  const params = [];
  if (zone_id)  { q += ' AND t.zone_id=?';  params.push(zone_id); }
  if (status)   { q += ' AND t.status=?';   params.push(status);  }
  if (priority) { q += ' AND t.priority=?'; params.push(priority);}
  res.json(db.prepare(q + ' ORDER BY t.due_date ASC NULLS LAST').all(...params));
});

router.post('/tasks', (req, res) => {
  const { zone_id, title, due_date, priority = 'medium', notes } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const info = db.prepare(
    'INSERT INTO tasks(zone_id,title,due_date,priority,status,notes) VALUES(?,?,?,?,?,?)'
  ).run(zone_id, title, due_date, priority, 'pending', notes);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/tasks/:id', (req, res) => {
  const allowed = ['title','due_date','priority','status','notes','zone_id'];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'no valid fields' });
  const set = fields.map(f => `${f}=?`).join(',');
  db.prepare(`UPDATE tasks SET ${set} WHERE id=?`).run(...fields.map(f => req.body[f]), req.params.id);
  res.json({ ok: true });
});

// Growing Calendar
router.get('/calendar', (req, res) => {
  res.json(db.prepare('SELECT * FROM growing_calendar ORDER BY crop_name').all());
});

router.post('/calendar', (req, res) => {
  const { crop_name, sow_indoors_start, sow_indoors_end, sow_outdoors_start,
          sow_outdoors_end, harvest_start, harvest_end, notes } = req.body;
  if (!crop_name) return res.status(400).json({ error: 'crop_name required' });
  const info = db.prepare(`
    INSERT INTO growing_calendar(crop_name,sow_indoors_start,sow_indoors_end,sow_outdoors_start,
      sow_outdoors_end,harvest_start,harvest_end,notes) VALUES(?,?,?,?,?,?,?,?)
  `).run(crop_name, sow_indoors_start, sow_indoors_end, sow_outdoors_start,
         sow_outdoors_end, harvest_start, harvest_end, notes);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/calendar/:id', (req, res) => {
  db.prepare('DELETE FROM growing_calendar WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Activity log
router.get('/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(db.prepare('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT ?').all(limit));
});

// Summary stats (for overview cards)
router.get('/summary', (req, res) => {
  const zones         = db.prepare('SELECT COUNT(*) as count FROM zones').get().count;
  const activePlants  = db.prepare("SELECT COUNT(*) as count FROM plantings WHERE status NOT IN ('harvested','failed')").get().count;
  const overdueTasks  = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status='pending' AND due_date < date('now')").get().count;
  const seedsInStock  = db.prepare('SELECT COUNT(*) as count FROM seeds WHERE quantity > 0').get().count;
  res.json({ zones, activePlants, overdueTasks, seedsInStock });
});

module.exports = router;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/api-routes.test.js
```
Expected: PASS (all 10 tests)

- [ ] **Step 5: Run all tests**

```bash
npx jest
```
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add dashboard/routes/api.js dashboard/tests/api-routes.test.js
git commit -m "feat: full REST API for zones, seeds, plantings, tasks, calendar, activity"
```

---

## Phase 3 — Setup Wizard UI

### Task 8: Wizard shell + steps 1–3

**Files:**
- Create: `dashboard/public/setup/index.html`
- Create: `dashboard/public/setup/wizard.js`
- Create: `dashboard/public/setup/style.css`

- [ ] **Step 1: Create `dashboard/public/setup/style.css`**

```css
:root { --green: #4ade80; --amber: #fbbf24; --red: #f87171; --blue: #60a5fa; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui,sans-serif; background: #111827; color: #f3f4f6; min-height: 100vh; }
.wizard { max-width: 720px; margin: 0 auto; padding: 2rem 1rem; }
.step-indicator { display: flex; gap: .5rem; margin-bottom: 2rem; }
.step-dot { width: 10px; height: 10px; border-radius: 50%; background: #374151; transition: background .2s; }
.step-dot.active { background: var(--green); }
.step-dot.done   { background: #065f46; }
.card { background: #1f2937; border-radius: .75rem; padding: 1.5rem; margin-bottom: 1rem; }
h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: .5rem; color: var(--green); }
h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; }
label { display: block; font-size: .875rem; color: #9ca3af; margin-bottom: .25rem; }
input, select, textarea {
  width: 100%; background: #374151; border: 1px solid #4b5563;
  color: #f3f4f6; border-radius: .375rem; padding: .5rem .75rem;
  font-size: .875rem; margin-bottom: .75rem;
}
input:focus, select:focus { outline: none; border-color: var(--green); }
.btn { padding: .625rem 1.25rem; border-radius: .375rem; font-weight: 600; cursor: pointer; border: none; }
.btn-primary { background: var(--green); color: #111827; }
.btn-secondary { background: #374151; color: #f3f4f6; }
.btn-danger { background: #7f1d1d; color: #fca5a5; }
.btn-row { display: flex; gap: .75rem; justify-content: flex-end; margin-top: 1rem; }
.toggle { display: flex; align-items: center; gap: .5rem; margin-bottom: .75rem; cursor: pointer; }
.toggle input[type=checkbox] { width: auto; margin: 0; accent-color: var(--green); }
.zone-card { border: 1px solid #374151; border-radius: .5rem; padding: 1rem; margin-bottom: 1rem; }
.zone-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; }
.grid-preview { display: inline-grid; gap: 2px; margin-top: .5rem; }
.grid-cell { background: #374151; border-radius: 2px; }
#map { height: 300px; border-radius: .5rem; margin-bottom: .75rem; }
```

- [ ] **Step 2: Create `dashboard/public/setup/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Garden Manager — Setup</title>
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/alpinejs@3.13.7/dist/cdn.min.js" defer></script>
</head>
<body>
  <div class="wizard" x-data="wizard()" x-init="init()">
    <!-- Step indicator -->
    <div class="step-indicator">
      <template x-for="(s,i) in steps">
        <div class="step-dot"
          :class="{ active: currentStep===i+1, done: currentStep>i+1 }">
        </div>
      </template>
    </div>

    <!-- Step 1: Welcome -->
    <div x-show="currentStep===1">
      <div class="card">
        <h1>Welcome to Garden Manager</h1>
        <p style="color:#9ca3af;margin-bottom:1rem">
          Let's get your garden set up. This wizard will configure your growing zones,
          seed inventory, and optional AI integration.
        </p>
        <div x-show="exampleDataLoaded"
             style="background:#1e3a2e;border:1px solid #065f46;border-radius:.5rem;padding:.75rem;margin-bottom:1rem;font-size:.875rem">
          Scotland (Port of Menteith) example data is preloaded. You can keep it, modify it, or clear it during setup.
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="currentStep=2">Get Started →</button>
        </div>
      </div>
    </div>

    <!-- Step 2: About Your Garden -->
    <div x-show="currentStep===2">
      <div class="card">
        <h2>About Your Garden</h2>
        <label>Your name</label>
        <input type="text" x-model="config.owner_name" placeholder="e.g. Leo">
        <label>Garden / location name</label>
        <input type="text" x-model="config.location_name" placeholder="e.g. Port of Menteith">
        <label>Timezone</label>
        <input type="text" x-model="config.timezone" placeholder="Auto-detected">
        <label>Units</label>
        <select x-model="config.units">
          <option value="metric">Metric (cm, sqm)</option>
          <option value="imperial">Imperial (in, sqft)</option>
        </select>
        <label>Pin your garden location (click map to set coordinates)</label>
        <div id="map"></div>
        <div style="display:flex;gap:.5rem">
          <div style="flex:1"><label>Latitude</label>
            <input type="number" step="0.0001" x-model="config.latitude" @change="updateMapPin()"></div>
          <div style="flex:1"><label>Longitude</label>
            <input type="number" step="0.0001" x-model="config.longitude" @change="updateMapPin()"></div>
        </div>
        <div class="btn-row">
          <button class="btn btn-secondary" @click="currentStep=1">← Back</button>
          <button class="btn btn-primary" @click="saveConfigStep()">Next →</button>
        </div>
      </div>
    </div>

    <!-- Step 3: Zones -->
    <div x-show="currentStep===3">
      <div class="card">
        <h2>Define Your Growing Zones</h2>
        <p style="color:#9ca3af;font-size:.875rem;margin-bottom:1rem">
          Add as many zones as you have. Each zone can be a grid (track every cell) or loose (general planting overview).
        </p>
        <template x-for="(zone, idx) in zones" :key="idx">
          <div class="zone-card" x-data="{ open: true }">
            <div class="zone-card-header">
              <strong x-text="zone.name || 'New Zone'"></strong>
              <div style="display:flex;gap:.5rem">
                <button class="btn btn-secondary" style="padding:.25rem .5rem;font-size:.75rem"
                  @click="open=!open" x-text="open?'▲':'▼'"></button>
                <button class="btn btn-danger" style="padding:.25rem .5rem;font-size:.75rem"
                  @click="zones.splice(idx,1)">✕</button>
              </div>
            </div>
            <div x-show="open">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
                <div><label>Zone name</label>
                  <input type="text" x-model="zone.name" placeholder="e.g. Germinator 1"></div>
                <div><label>Type</label>
                  <select x-model="zone.type">
                    <option>germinator</option><option>greenhouse</option>
                    <option>polytunnel</option><option>outdoor</option>
                    <option>indoor</option><option>other</option>
                  </select></div>
              </div>
              <label>View type</label>
              <select x-model="zone.view_type">
                <option value="grid">Grid — track every cell individually</option>
                <option value="loose">Loose — general planting overview</option>
              </select>
              <!-- Grid options -->
              <div x-show="zone.view_type==='grid'" style="background:#111827;border-radius:.5rem;padding:.75rem;margin-bottom:.75rem">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:.5rem">
                  <div><label>Rows</label><input type="number" x-model.number="zone.grid_rows" min="1"></div>
                  <div><label>Cols</label><input type="number" x-model.number="zone.grid_cols" min="1"></div>
                  <div><label>Cell W (cm)</label><input type="number" step="0.1" x-model.number="zone.cell_width_cm"></div>
                  <div><label>Cell H (cm)</label><input type="number" step="0.1" x-model.number="zone.cell_height_cm"></div>
                </div>
                <div x-show="zone.grid_rows && zone.grid_cols">
                  <label style="margin-bottom:.25rem">Preview</label>
                  <div class="grid-preview"
                    :style="`grid-template-columns: repeat(${zone.grid_cols},1fr)`">
                    <template x-for="n in (zone.grid_rows||0)*(zone.grid_cols||0)">
                      <div class="grid-cell" style="width:16px;height:16px"></div>
                    </template>
                  </div>
                  <p style="font-size:.75rem;color:#9ca3af;margin-top:.25rem"
                    x-text="`${zone.grid_rows}×${zone.grid_cols} = ${zone.grid_rows*zone.grid_cols} cells`"></p>
                </div>
              </div>
              <!-- Loose options -->
              <div x-show="zone.view_type==='loose'">
                <label>Area (sqm)</label>
                <input type="number" step="0.1" x-model.number="zone.area_sqm">
              </div>
              <!-- Environment toggles -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
                <label class="toggle">
                  <input type="checkbox" x-model="zone.covered">
                  <span>Covered</span>
                </label>
                <label class="toggle">
                  <input type="checkbox" x-model="zone.has_auto_watering">
                  <span>Auto-watering</span>
                </label>
                <label class="toggle">
                  <input type="checkbox" x-model="zone.has_heating">
                  <span>Heating</span>
                </label>
                <label class="toggle">
                  <input type="checkbox" x-model="zone.has_lighting">
                  <span>Lighting</span>
                </label>
              </div>
              <div x-show="zone.covered">
                <label>Cover type</label>
                <select x-model="zone.cover_type">
                  <option>glass</option><option>polycarbonate</option>
                  <option>fleece</option><option>polytunnel</option><option>other</option>
                </select>
              </div>
              <div x-show="zone.has_auto_watering">
                <label>Watering type</label>
                <select x-model="zone.watering_type">
                  <option>drip</option><option>sprinkler</option>
                  <option>misting</option><option>flood</option>
                </select>
              </div>
              <div x-show="zone.has_heating">
                <label>Heating type</label>
                <select x-model="zone.heating_type">
                  <option>electric mat</option><option>fan heater</option>
                  <option>underfloor</option><option>radiator</option><option>other</option>
                </select>
              </div>
              <div x-show="zone.has_lighting">
                <label>Lighting type</label>
                <select x-model="zone.lighting_type">
                  <option>LED grow light</option><option>fluorescent</option>
                  <option>HPS</option><option>natural only</option>
                </select>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
                <div><label>Orientation</label>
                  <select x-model="zone.orientation">
                    <option value="">Unknown</option>
                    <option>N</option><option>NE</option><option>E</option><option>SE</option>
                    <option>S</option><option>SW</option><option>W</option><option>NW</option>
                  </select></div>
                <div><label>Slope (°)</label>
                  <input type="number" min="0" max="90" x-model.number="zone.slope_degrees"></div>
              </div>
              <label>Soil / growing medium</label>
              <select x-model="zone.soil_type">
                <option value="">Unknown</option>
                <option>raised_bed</option><option>ground</option>
                <option>hydroponic</option><option>container</option><option>none</option>
              </select>
              <label>GPS (overrides garden location for this zone)</label>
              <div style="display:flex;gap:.5rem">
                <input type="number" step="0.0001" x-model.number="zone.latitude" placeholder="Latitude">
                <input type="number" step="0.0001" x-model.number="zone.longitude" placeholder="Longitude">
              </div>
              <label>Notes</label>
              <textarea rows="2" x-model="zone.notes"></textarea>
            </div>
          </div>
        </template>
        <button class="btn btn-secondary" @click="addZone()" style="width:100%;margin-bottom:1rem">
          + Add Zone
        </button>
        <div class="btn-row">
          <button class="btn btn-secondary" @click="currentStep=2">← Back</button>
          <button class="btn btn-primary" @click="currentStep=4">Next →</button>
        </div>
      </div>
    </div>

    <!-- Steps 4-6 loaded from wizard.js -->
    <div x-show="currentStep===4" x-html="step4Html"></div>
    <div x-show="currentStep===5" x-html="step5Html"></div>
    <div x-show="currentStep===6" x-html="step6Html"></div>
  </div>

  <script src="wizard.js"></script>
</body>
</html>
```

- [ ] **Step 3: Commit wizard shell and steps 1–3**

```bash
git add dashboard/public/setup/
git commit -m "feat: setup wizard shell with steps 1-3 (welcome, garden info, zones)"
```

---

### Task 9: Wizard steps 4–6 + Alpine.js logic

**Files:**
- Create/update: `dashboard/public/setup/wizard.js`

- [ ] **Step 1: Create `dashboard/public/setup/wizard.js`**

```js
function wizard() {
  return {
    currentStep: 1,
    steps: [1,2,3,4,5,6],
    exampleDataLoaded: false,
    config: {
      owner_name: '', location_name: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      units: 'metric', latitude: null, longitude: null
    },
    zones: [],
    seedOption: 'keep',   // keep | clear | skip
    openclawEnabled: false,
    map: null, marker: null,

    // Step 4 HTML (seed inventory)
    get step4Html() {
      return `
        <div class="card">
          <h2>Seed Inventory</h2>
          <p style="color:#9ca3af;font-size:.875rem;margin-bottom:1rem">
            Example seeds are preloaded. What would you like to do?
          </p>
          <label class="toggle" style="margin-bottom:.5rem">
            <input type="radio" name="seeds" value="keep" x-model="seedOption"> Keep example seeds
          </label>
          <label class="toggle" style="margin-bottom:.5rem">
            <input type="radio" name="seeds" value="clear" x-model="seedOption"> Clear all — start fresh
          </label>
          <label class="toggle" style="margin-bottom:1rem">
            <input type="radio" name="seeds" value="skip" x-model="seedOption"> Skip — manage later in dashboard
          </label>
          <div class="btn-row">
            <button class="btn btn-secondary" @click="currentStep=3">← Back</button>
            <button class="btn btn-primary" @click="currentStep=5">Next →</button>
          </div>
        </div>`;
    },

    // Step 5 HTML (OpenClaw)
    get step5Html() {
      return `
        <div class="card">
          <h2>OpenClaw Integration <span style="font-size:.75rem;color:#9ca3af;font-weight:400">(optional)</span></h2>
          <p style="color:#9ca3af;font-size:.875rem;margin-bottom:1rem">
            OpenClaw is an AI agent that can query and update your garden by chat or WhatsApp.
            See <code>openclaw/README.md</code> for full details.
          </p>
          <label class="toggle" style="margin-bottom:1rem">
            <input type="checkbox" x-model="openclawEnabled"> I use OpenClaw
          </label>
          <div x-show="openclawEnabled" style="background:#111827;border-radius:.5rem;padding:1rem;font-size:.875rem">
            <p style="margin-bottom:.5rem"><strong>1. Copy the skill:</strong></p>
            <pre style="background:#1f2937;padding:.5rem;border-radius:.25rem;overflow-x:auto;margin-bottom:.75rem">cp -r openclaw/skills/garden-manager /path/to/openclaw/skills/</pre>
            <p style="margin-bottom:.5rem"><strong>2. Install cron jobs:</strong></p>
            <pre style="background:#1f2937;padding:.5rem;border-radius:.25rem;overflow-x:auto">chmod +x openclaw/cron-setup.sh && ./openclaw/cron-setup.sh</pre>
            <p style="margin-top:.75rem;color:#9ca3af">You can re-run these steps from Settings at any time.</p>
          </div>
          <div class="btn-row">
            <button class="btn btn-secondary" @click="currentStep=4">← Back</button>
            <button class="btn btn-primary" @click="currentStep=6">Next →</button>
          </div>
        </div>`;
    },

    // Step 6 HTML (review & launch) — built dynamically
    get step6Html() {
      const zoneList = this.zones.map(z =>
        `<div style="padding:.5rem;background:#111827;border-radius:.375rem;margin-bottom:.5rem">
          <strong>${z.name}</strong>
          <span style="color:#9ca3af;font-size:.875rem;margin-left:.5rem">${z.type} · ${z.view_type}</span>
          ${z.view_type==='grid' ? `<span style="color:#9ca3af;font-size:.75rem;margin-left:.5rem">${z.grid_rows}×${z.grid_cols} cells</span>` : ''}
        </div>`
      ).join('');
      return `
        <div class="card">
          <h2>Review & Launch</h2>
          <div style="margin-bottom:1rem">
            <p><strong>${this.config.owner_name || 'Your'}</strong> garden at
               <strong>${this.config.location_name || 'your location'}</strong></p>
            <p style="color:#9ca3af;font-size:.875rem">${this.config.timezone} · ${this.config.units}</p>
          </div>
          <p style="font-weight:600;margin-bottom:.5rem">Zones (${this.zones.length})</p>
          ${zoneList || '<p style="color:#9ca3af;font-size:.875rem">No zones configured</p>'}
          <div class="btn-row" style="margin-top:1.5rem">
            <button class="btn btn-secondary" @click="currentStep=5">← Back</button>
            <button class="btn btn-primary" @click="launch()">Launch Garden Manager →</button>
          </div>
        </div>`;
    },

    async init() {
      // Check if example data is loaded
      const res = await fetch('/api/config');
      const cfg = await res.json();
      this.exampleDataLoaded = cfg.example_data_loaded === '1';
      // Pre-fill if re-running wizard
      if (cfg.owner_name) this.config.owner_name = cfg.owner_name;
      if (cfg.location_name) this.config.location_name = cfg.location_name;
      if (cfg.timezone) this.config.timezone = cfg.timezone;
      if (cfg.units) this.config.units = cfg.units;

      // Init map after DOM is ready
      this.$nextTick(() => this.initMap());
    },

    initMap() {
      const lat = parseFloat(this.config.latitude) || 54.5;
      const lng = parseFloat(this.config.longitude) || -3.5;
      this.map = L.map('map').setView([lat, lng], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(this.map);
      if (this.config.latitude) {
        this.marker = L.marker([lat, lng]).addTo(this.map);
      }
      this.map.on('click', (e) => {
        this.config.latitude  = parseFloat(e.latlng.lat.toFixed(4));
        this.config.longitude = parseFloat(e.latlng.lng.toFixed(4));
        if (this.marker) this.map.removeLayer(this.marker);
        this.marker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(this.map);
      });
    },

    updateMapPin() {
      if (!this.map || !this.config.latitude || !this.config.longitude) return;
      if (this.marker) this.map.removeLayer(this.marker);
      this.marker = L.marker([this.config.latitude, this.config.longitude]).addTo(this.map);
      this.map.setView([this.config.latitude, this.config.longitude], 12);
    },

    addZone() {
      this.zones.push({
        name: '', type: 'outdoor', view_type: 'loose',
        grid_rows: null, grid_cols: null, cell_width_cm: null, cell_height_cm: null,
        area_sqm: null, covered: false, cover_type: '',
        has_auto_watering: false, watering_type: '',
        has_heating: false, heating_type: '',
        has_lighting: false, lighting_type: '',
        orientation: '', slope_degrees: null, soil_type: '', notes: '',
        latitude: this.config.latitude, longitude: this.config.longitude
      });
    },

    async saveConfigStep() {
      const keys = ['owner_name','location_name','timezone','units','latitude','longitude'];
      for (const key of keys) {
        if (this.config[key] !== null && this.config[key] !== '') {
          await fetch('/api/setup/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: String(this.config[key]) })
          });
        }
      }
      this.currentStep = 3;
    },

    async launch() {
      // Handle seed option
      if (this.seedOption === 'clear') {
        await fetch('/api/setup/example-data', { method: 'DELETE' });
      }

      // Save zones
      for (const zone of this.zones) {
        await fetch('/api/setup/zone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(zone)
        });
      }

      // Save OpenClaw preference
      await fetch('/api/setup/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'openclaw_enabled', value: this.openclawEnabled ? '1' : '0' })
      });

      // Mark complete
      await fetch('/api/setup/complete', { method: 'POST' });
      window.location.href = '/';
    }
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/setup/wizard.js
git commit -m "feat: wizard steps 4-6 with seed options, openclaw toggle, and launch flow"
```

---

## Phase 4 — Dashboard UI

### Task 10: Dashboard shell + Overview + Zones tabs

**Files:**
- Create: `dashboard/public/app/index.html`
- Create: `dashboard/public/app/style.css`
- Create: `dashboard/public/app/app.js`

- [ ] **Step 1: Create `dashboard/public/app/style.css`**

```css
:root { --green: #4ade80; --amber: #fbbf24; --red: #f87171; --blue: #60a5fa; --purple: #c084fc; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui,sans-serif; background: #111827; color: #f3f4f6; }
.layout { display: grid; grid-template-rows: auto 1fr; min-height: 100vh; }
header { background: #1f2937; padding: .75rem 1rem; display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid #374151; }
header h1 { font-size: 1.125rem; font-weight: 700; color: var(--green); flex: 1; }
nav { display: flex; overflow-x: auto; background: #1f2937; border-bottom: 1px solid #374151; }
nav button { padding: .625rem 1rem; font-size: .875rem; border: none; background: none; color: #9ca3af; cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent; }
nav button.active { color: var(--green); border-bottom-color: var(--green); }
main { padding: 1rem; max-width: 1200px; margin: 0 auto; width: 100%; }
.card { background: #1f2937; border-radius: .75rem; padding: 1.25rem; margin-bottom: 1rem; }
.card h2 { font-size: 1rem; font-weight: 600; margin-bottom: .75rem; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: .75rem; margin-bottom: 1rem; }
.stat-card { background: #1f2937; border-radius: .75rem; padding: 1rem; text-align: center; }
.stat-card .value { font-size: 2rem; font-weight: 700; color: var(--green); }
.stat-card .label { font-size: .75rem; color: #9ca3af; margin-top: .25rem; }
.badge { display: inline-block; padding: .125rem .5rem; border-radius: 9999px; font-size: .75rem; font-weight: 600; }
.badge-sown        { background: #1e3a5f; color: var(--blue); }
.badge-germinated  { background: #1a3a2e; color: var(--green); }
.badge-established { background: #1a3a1a; color: #86efac; }
.badge-harvested   { background: #2d2d00; color: var(--amber); }
.badge-failed      { background: #3b1111; color: var(--red); }
.badge-pending     { background: #2d2d00; color: var(--amber); }
.badge-done        { background: #1a3a2e; color: var(--green); }
.badge-high        { background: #3b1111; color: var(--red); }
.badge-medium      { background: #2d2d00; color: var(--amber); }
.badge-low         { background: #1a2a3a; color: #7dd3fc; }
.grid-view { display: inline-grid; gap: 3px; }
.grid-cell { width: 28px; height: 28px; border-radius: 3px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: .5rem; color: #9ca3af; background: #374151; transition: transform .1s; }
.grid-cell:hover { transform: scale(1.1); }
.grid-cell.sown        { background: #1e3a5f; }
.grid-cell.germinated  { background: #1a3a2e; }
.grid-cell.established { background: #14532d; }
.grid-cell.failed      { background: #3b1111; }
table { width: 100%; border-collapse: collapse; font-size: .875rem; }
th { text-align: left; padding: .5rem; color: #9ca3af; font-weight: 500; border-bottom: 1px solid #374151; }
td { padding: .5rem; border-bottom: 1px solid #1f2937; }
tr:hover td { background: #1f2937; }
input, select, textarea { background: #374151; border: 1px solid #4b5563; color: #f3f4f6; border-radius: .375rem; padding: .375rem .625rem; font-size: .875rem; }
input:focus, select:focus { outline: none; border-color: var(--green); }
.btn { padding: .5rem 1rem; border-radius: .375rem; font-weight: 500; cursor: pointer; border: none; font-size: .875rem; }
.btn-primary { background: var(--green); color: #111827; }
.btn-sm { padding: .25rem .5rem; font-size: .75rem; }
.overdue { color: var(--red); }
.weather-widget { display: flex; align-items: center; gap: 1rem; padding: .75rem; background: #111827; border-radius: .5rem; font-size: .875rem; }
```

- [ ] **Step 2: Create `dashboard/public/app/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Garden Manager</title>
  <link rel="stylesheet" href="style.css">
  <script src="https://unpkg.com/alpinejs@3.13.7/dist/cdn.min.js" defer></script>
</head>
<body>
  <div class="layout" x-data="app()" x-init="init()">
    <header>
      <h1>🌱 Garden Manager</h1>
      <span style="font-size:.75rem;color:#9ca3af" x-text="config.location_name || ''"></span>
      <span style="font-size:.75rem;color:#4b5563" x-text="lastRefresh"></span>
    </header>
    <nav>
      <button :class="{active:tab==='overview'}" @click="tab='overview'">Overview</button>
      <button :class="{active:tab==='zones'}"    @click="tab='zones'">Zones</button>
      <button :class="{active:tab==='seeds'}"    @click="tab='seeds'">Seeds</button>
      <button :class="{active:tab==='tasks'}"    @click="tab='tasks'">Tasks</button>
      <button :class="{active:tab==='calendar'}" @click="tab='calendar'">Calendar</button>
      <button :class="{active:tab==='settings'}" @click="tab='settings'">Settings</button>
    </nav>
    <main>

      <!-- OVERVIEW -->
      <div x-show="tab==='overview'">
        <div class="stats">
          <div class="stat-card"><div class="value" x-text="summary.zones"></div><div class="label">Zones</div></div>
          <div class="stat-card"><div class="value" x-text="summary.activePlants"></div><div class="label">Active Plantings</div></div>
          <div class="stat-card"><div class="value" style="color:var(--red)" x-text="summary.overdueTasks"></div><div class="label">Overdue Tasks</div></div>
          <div class="stat-card"><div class="value" x-text="summary.seedsInStock"></div><div class="label">Seed Types</div></div>
        </div>
        <div class="card" x-show="weather.temp !== null">
          <div class="weather-widget">
            <span style="font-size:1.5rem" x-text="weather.icon"></span>
            <div>
              <div style="font-weight:600" x-text="(weather.temp ?? '--') + '°C · ' + (weather.desc || '')"></div>
              <div style="color:#9ca3af;font-size:.75rem" x-text="config.location_name"></div>
            </div>
          </div>
        </div>
        <div class="card">
          <h2>Recent Activity</h2>
          <table>
            <template x-for="entry in activity">
              <tr>
                <td style="color:#9ca3af;font-size:.75rem;width:160px" x-text="entry.timestamp.slice(0,16).replace('T',' ')"></td>
                <td><span class="badge" :class="'badge-'+entry.action_type" x-text="entry.action_type"></span></td>
                <td x-text="entry.description"></td>
              </tr>
            </template>
          </table>
        </div>
      </div>

      <!-- ZONES -->
      <div x-show="tab==='zones'">
        <template x-for="zone in zones" :key="zone.id">
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">
              <div>
                <h2 x-text="zone.name"></h2>
                <span style="font-size:.75rem;color:#9ca3af"
                  x-text="zone.type + (zone.covered?' · covered':'') + (zone.has_auto_watering?' · auto-water':'')">
                </span>
              </div>
              <span class="badge" :class="zone.view_type==='grid'?'badge-sown':'badge-germinated'"
                x-text="zone.view_type"></span>
            </div>
            <!-- Grid view -->
            <div x-show="zone.view_type==='grid'" style="overflow-x:auto">
              <div class="grid-view" :style="`grid-template-columns:repeat(${zone.grid_cols},1fr)`">
                <template x-for="cell in zone.cells" :key="cell.id">
                  <div class="grid-cell"
                    :class="getCellStatus(cell.id)"
                    :title="cell.label + ': ' + getCellDesc(cell.id)"
                    x-text="cell.label">
                  </div>
                </template>
              </div>
              <div style="display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap">
                <template x-for="s in ['empty','sown','germinated','established','failed']">
                  <span style="font-size:.75rem;display:flex;align-items:center;gap:.25rem">
                    <span class="grid-cell" :class="s==='empty'?'':s" style="width:12px;height:12px;display:inline-block"></span>
                    <span x-text="s" style="color:#9ca3af"></span>
                  </span>
                </template>
              </div>
            </div>
            <!-- Loose view -->
            <div x-show="zone.view_type==='loose'">
              <template x-for="p in getZonePlantings(zone.id)" :key="p.id">
                <div style="display:flex;align-items:center;gap:.5rem;padding:.375rem 0;border-bottom:1px solid #374151">
                  <span class="badge" :class="'badge-'+p.status" x-text="p.status"></span>
                  <span x-text="p.seed_name + (p.seed_variety ? ' · '+p.seed_variety : '')"></span>
                  <span style="color:#9ca3af;font-size:.75rem;margin-left:auto" x-text="p.sown_date"></span>
                </div>
              </template>
              <p x-show="!getZonePlantings(zone.id).length" style="color:#9ca3af;font-size:.875rem">No active plantings</p>
            </div>
          </div>
        </template>
      </div>

      <!-- SEEDS, TASKS, CALENDAR, SETTINGS tabs rendered via app.js -->
      <div x-show="tab==='seeds'"    x-html="seedsTabHtml"></div>
      <div x-show="tab==='tasks'"    x-html="tasksTabHtml"></div>
      <div x-show="tab==='calendar'" x-html="calendarTabHtml"></div>
      <div x-show="tab==='settings'" x-html="settingsTabHtml"></div>

    </main>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/app/index.html dashboard/public/app/style.css
git commit -m "feat: dashboard shell with overview and zones tabs"
```

---

### Task 11: Dashboard Alpine.js logic + remaining tabs

**Files:**
- Create: `dashboard/public/app/app.js`

- [ ] **Step 1: Create `dashboard/public/app/app.js`**

```js
function app() {
  return {
    tab: 'overview',
    config: {},
    summary: { zones: 0, activePlants: 0, overdueTasks: 0, seedsInStock: 0 },
    zones: [],
    plantings: [],
    seeds: [],
    tasks: [],
    calendar: [],
    activity: [],
    weather: { temp: null, desc: '', icon: '' },
    lastRefresh: '',
    seedSearch: '',
    taskFilter: { zone_id: '', status: 'pending', priority: '' },
    newSeed: { name:'', variety:'', type:'', quantity:0, supplier:'' },
    newTask: { title:'', due_date:'', priority:'medium', zone_id:'' },

    async init() {
      await this.refresh();
      setInterval(() => this.refresh(), 60000);
    },

    async refresh() {
      const [cfg, sum, zones, plantings, seeds, tasks, cal, act] = await Promise.all([
        fetch('/api/config').then(r=>r.json()),
        fetch('/api/summary').then(r=>r.json()),
        fetch('/api/zones').then(r=>r.json()),
        fetch('/api/plantings').then(r=>r.json()),
        fetch('/api/seeds').then(r=>r.json()),
        fetch('/api/tasks').then(r=>r.json()),
        fetch('/api/calendar').then(r=>r.json()),
        fetch('/api/activity').then(r=>r.json()),
      ]);
      this.config = cfg;
      this.summary = sum;
      this.plantings = plantings;
      this.seeds = seeds;
      this.tasks = tasks;
      this.calendar = cal;
      this.activity = act;
      this.lastRefresh = new Date().toLocaleTimeString();

      // Fetch zone detail (with cells) for grid zones
      this.zones = await Promise.all(zones.map(z =>
        z.view_type === 'grid'
          ? fetch(`/api/zones/${z.id}`).then(r=>r.json())
          : Promise.resolve({ ...z, cells: [] })
      ));

      this.fetchWeather();
    },

    async fetchWeather() {
      const lat = this.config.latitude;
      const lng = this.config.longitude;
      if (!lat || !lng) return;
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode&timezone=auto`
        );
        const d = await r.json();
        this.weather.temp = Math.round(d.current.temperature_2m);
        const code = d.current.weathercode;
        if (code === 0) { this.weather.desc = 'Clear'; this.weather.icon = '☀️'; }
        else if (code <= 3) { this.weather.desc = 'Partly cloudy'; this.weather.icon = '⛅'; }
        else if (code <= 48) { this.weather.desc = 'Foggy'; this.weather.icon = '🌫️'; }
        else if (code <= 67) { this.weather.desc = 'Rainy'; this.weather.icon = '🌧️'; }
        else if (code <= 77) { this.weather.desc = 'Snowy'; this.weather.icon = '❄️'; }
        else { this.weather.desc = 'Stormy'; this.weather.icon = '⛈️'; }
      } catch(e) { /* weather is optional */ }
    },

    // Grid helpers
    getCellStatus(cellId) {
      const p = this.plantings.find(p => p.cell_id === cellId && !['harvested','failed'].includes(p.status));
      return p ? p.status : 'empty';
    },
    getCellDesc(cellId) {
      const p = this.plantings.find(p => p.cell_id === cellId && !['harvested','failed'].includes(p.status));
      return p ? `${p.seed_name} (${p.status})` : 'Empty';
    },
    getZonePlantings(zoneId) {
      return this.plantings.filter(p => p.zone_id === zoneId && !['harvested','failed'].includes(p.status));
    },

    // Seeds tab
    get filteredSeeds() {
      if (!this.seedSearch) return this.seeds;
      const q = this.seedSearch.toLowerCase();
      return this.seeds.filter(s => s.name.toLowerCase().includes(q) || (s.variety||'').toLowerCase().includes(q));
    },
    get seedsTabHtml() {
      const rows = this.filteredSeeds.map(s => `
        <tr>
          <td>${s.name}</td>
          <td style="color:#9ca3af">${s.variety||''}</td>
          <td><span class="badge badge-sown">${s.type||''}</span></td>
          <td style="text-align:center">${s.quantity}</td>
          <td style="color:#9ca3af">${s.supplier||''}</td>
          <td style="color:#9ca3af">${s.sow_by_year||''}</td>
        </tr>`).join('');
      return `
        <div class="card">
          <div style="display:flex;gap:.5rem;margin-bottom:.75rem;align-items:center">
            <h2 style="flex:1">Seed Inventory</h2>
            <input type="search" placeholder="Search…" style="width:200px" x-model="seedSearch">
          </div>
          <table>
            <thead><tr>
              <th>Name</th><th>Variety</th><th>Type</th>
              <th style="text-align:center">Qty</th><th>Supplier</th><th>Sow By</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="card">
          <h2>Add Seed</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-bottom:.5rem">
            <input placeholder="Name *" x-model="newSeed.name">
            <input placeholder="Variety" x-model="newSeed.variety">
            <input placeholder="Type" x-model="newSeed.type">
            <input placeholder="Quantity" type="number" x-model.number="newSeed.quantity">
            <input placeholder="Supplier" x-model="newSeed.supplier">
          </div>
          <button class="btn btn-primary btn-sm" @click="addSeed()">Add Seed</button>
        </div>`;
    },
    async addSeed() {
      if (!this.newSeed.name) return;
      await fetch('/api/seeds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.newSeed)
      });
      this.newSeed = { name:'', variety:'', type:'', quantity:0, supplier:'' };
      await this.refresh();
    },

    // Tasks tab
    get filteredTasks() {
      return this.tasks.filter(t => {
        if (this.taskFilter.zone_id && t.zone_id !== parseInt(this.taskFilter.zone_id)) return false;
        if (this.taskFilter.status && t.status !== this.taskFilter.status) return false;
        if (this.taskFilter.priority && t.priority !== this.taskFilter.priority) return false;
        return true;
      });
    },
    isOverdue(t) { return t.status === 'pending' && t.due_date && t.due_date < new Date().toISOString().slice(0,10); },
    get tasksTabHtml() {
      const zoneOptions = this.zones.map(z => `<option value="${z.id}">${z.name}</option>`).join('');
      const rows = this.filteredTasks.map(t => `
        <tr class="${this.isOverdue(t)?'overdue':''}">
          <td>${t.title}</td>
          <td><span class="badge badge-${t.priority}">${t.priority}</span></td>
          <td><span class="badge badge-${t.status}">${t.status}</span></td>
          <td style="color:#9ca3af">${t.due_date||''}</td>
          <td style="color:#9ca3af">${t.zone_name||'All zones'}</td>
          <td>
            <button class="btn btn-sm" style="background:#1a3a2e;color:#86efac"
              @click="completeTask(${t.id})">✓</button>
          </td>
        </tr>`).join('');
      return `
        <div class="card">
          <div style="display:flex;gap:.5rem;margin-bottom:.75rem;align-items:center;flex-wrap:wrap">
            <h2 style="flex:1">Tasks</h2>
            <select x-model="taskFilter.zone_id" style="width:130px">
              <option value="">All zones</option>${zoneOptions}
            </select>
            <select x-model="taskFilter.status" style="width:110px">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
            </select>
            <select x-model="taskFilter.priority" style="width:100px">
              <option value="">All priorities</option>
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </div>
          <table>
            <thead><tr><th>Task</th><th>Priority</th><th>Status</th><th>Due</th><th>Zone</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="card">
          <h2>Add Task</h2>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:.5rem;margin-bottom:.5rem">
            <input placeholder="Task title *" x-model="newTask.title">
            <input type="date" x-model="newTask.due_date">
            <select x-model="newTask.priority">
              <option>high</option><option selected>medium</option><option>low</option>
            </select>
            <select x-model.number="newTask.zone_id">
              <option value="">All zones</option>${zoneOptions}
            </select>
          </div>
          <button class="btn btn-primary btn-sm" @click="addTask()">Add Task</button>
        </div>`;
    },
    async addTask() {
      if (!this.newTask.title) return;
      await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.newTask)
      });
      this.newTask = { title:'', due_date:'', priority:'medium', zone_id:'' };
      await this.refresh();
    },
    async completeTask(id) {
      await fetch(`/api/tasks/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' })
      });
      await this.refresh();
    },

    // Calendar tab
    get calendarTabHtml() {
      const today = new Date();
      const mm = String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
      const relevant = this.calendar.filter(c =>
        (c.sow_indoors_start && c.sow_indoors_start <= mm && mm <= (c.sow_indoors_end||'12-31')) ||
        (c.sow_outdoors_start && c.sow_outdoors_start <= mm && mm <= (c.sow_outdoors_end||'12-31'))
      );
      const rows = this.calendar.map(c => `
        <tr>
          <td>${c.crop_name}</td>
          <td style="color:#9ca3af">${c.sow_indoors_start||''}${c.sow_indoors_end?' – '+c.sow_indoors_end:''}</td>
          <td style="color:#9ca3af">${c.sow_outdoors_start||''}${c.sow_outdoors_end?' – '+c.sow_outdoors_end:''}</td>
          <td style="color:var(--green)">${c.harvest_start||''}${c.harvest_end?' – '+c.harvest_end:''}</td>
          <td style="color:#9ca3af;font-size:.75rem">${c.notes||''}</td>
        </tr>`).join('');
      const nowRows = relevant.map(c => `
        <div style="padding:.375rem 0;border-bottom:1px solid #374151">
          <strong>${c.crop_name}</strong>
          ${c.sow_indoors_start && c.sow_indoors_start<=mm ? '<span class="badge badge-sown" style="margin-left:.5rem">Sow indoors</span>' : ''}
          ${c.sow_outdoors_start && c.sow_outdoors_start<=mm ? '<span class="badge badge-germinated" style="margin-left:.5rem">Sow outdoors</span>' : ''}
        </div>`).join('');
      return `
        <div class="card">
          <h2>Sow Now</h2>
          ${nowRows || '<p style="color:#9ca3af">Nothing to sow right now.</p>'}
        </div>
        <div class="card">
          <h2>Full Calendar</h2>
          <table>
            <thead><tr><th>Crop</th><th>Sow Indoors</th><th>Sow Outdoors</th><th>Harvest</th><th>Notes</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    },

    // Settings tab
    get settingsTabHtml() {
      const zoneCards = this.zones.map(z => `
        <div class="card" style="margin-bottom:.5rem">
          <div style="display:flex;justify-content:space-between">
            <strong>${z.name}</strong>
            <span style="color:#9ca3af;font-size:.75rem">${z.type} · ${z.view_type}</span>
          </div>
        </div>`).join('');
      return `
        <div class="card">
          <h2>About</h2>
          <p style="color:#9ca3af;font-size:.875rem">
            Garden: <strong>${this.config.location_name||'–'}</strong> ·
            Owner: <strong>${this.config.owner_name||'–'}</strong> ·
            Timezone: <strong>${this.config.timezone||'–'}</strong>
          </p>
        </div>
        <div class="card">
          <h2>Zones</h2>
          ${zoneCards}
          <p style="color:#9ca3af;font-size:.75rem;margin-top:.5rem">
            To add or edit zones, re-run setup: clear <code>setup_complete</code> from app_config and restart.
          </p>
        </div>
        <div class="card">
          <h2>OpenClaw</h2>
          <p style="color:#9ca3af;font-size:.875rem;margin-bottom:.75rem">
            ${this.config.openclaw_enabled==='1' ? '✓ Enabled' : 'Not configured'}
          </p>
          <p style="font-size:.875rem">Run <code>./openclaw/cron-setup.sh</code> from the repo root to install cron jobs.</p>
        </div>`;
    }
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/app/app.js
git commit -m "feat: full dashboard Alpine.js app with all 6 tabs"
```

---

## Phase 5 — OpenClaw Integration

### Task 12: OpenClaw skill + README

**Files:**
- Create: `openclaw/README.md`
- Create: `openclaw/skills/garden-manager/SKILL.md`

- [ ] **Step 1: Create `openclaw/skills/garden-manager/SKILL.md`**

````markdown
# Skill: Garden Manager

You have access to a SQLite database at the path specified in `GARDEN_DB_PATH`
(default: `/home/leo/garden/garden.db`). Use the `sqlite3` command to query it.

## Schema Summary

- `zones(id, name, type, view_type, grid_rows, grid_cols, ...)`
- `zone_cells(id, zone_id, row, col, label)`
- `seeds(id, name, variety, type, quantity, ...)`
- `plantings(id, seed_id, zone_id, cell_id, status, sown_date, ...)`  
  status: sown | germinated | established | harvested | failed
- `tasks(id, zone_id, title, due_date, priority, status)`
- `growing_calendar(crop_name, sow_indoors_start, sow_outdoors_start, harvest_start, ...)`
- `activity_log(timestamp, action_type, zone_id, planting_id, description)`

Dates are ISO 8601 (YYYY-MM-DD). Calendar dates are MM-DD.

## Querying

```bash
sqlite3 $GARDEN_DB_PATH "SELECT * FROM zones;"
sqlite3 $GARDEN_DB_PATH "
  SELECT z.name, zc.label, s.name as seed, p.status
  FROM plantings p
  JOIN zones z ON p.zone_id=z.id
  LEFT JOIN zone_cells zc ON p.cell_id=zc.id
  LEFT JOIN seeds s ON p.seed_id=s.id
  WHERE p.status NOT IN ('harvested','failed')
  ORDER BY z.sort_order, zc.row, zc.col;"
```

## Recording

Always insert into `activity_log` after making changes:

```bash
# Sow a seed into a grid cell
sqlite3 $GARDEN_DB_PATH "
  INSERT INTO plantings(seed_id,zone_id,cell_id,sown_date,status,quantity)
  VALUES(1, 1, 5, date('now'), 'sown', 1);
  INSERT INTO activity_log(action_type,zone_id,planting_id,description)
  VALUES('sow', 1, last_insert_rowid(), 'Sowed Tomato in A5');"

# Update planting status
sqlite3 $GARDEN_DB_PATH "
  UPDATE plantings SET status='germinated', germinated_date=date('now') WHERE id=?;
  INSERT INTO activity_log(action_type,zone_id,planting_id,description)
  VALUES('germinated', ?, ?, 'Tomato germinated in A5');"
```

## WhatsApp-Friendly Summary Format

Keep responses under 300 words. Use this structure:

```
🌱 Garden Update — {date}

GERMINATOR ({n}/{total} occupied)
• A1: Tomato (Gardeners Delight) — germinated ✓
• A2: Basil — sown 3 days ago
• B4–B8: Empty

TASKS ({overdue} overdue)
⚠️ Water seedlings — due yesterday
• Pot on tomatoes — due Friday

CALENDAR — Sow this week:
• Lettuce (indoors), Peas (outdoors)
```

## Cron Triggers

This skill is called by three scheduled jobs (see `cron-setup.sh`):
1. **Daily 7:30 AM** — brief task + germinator check
2. **Weekly Sunday 9 AM** — full planning summary
3. **Every 6 hours** — germinator watch (flag overdue germination updates)
````

- [ ] **Step 2: Create `openclaw/README.md`**

```markdown
# OpenClaw Integration

This folder contains everything needed to connect Garden Manager with [OpenClaw](https://github.com/your/openclaw),
an AI agent that provides natural-language garden queries and WhatsApp notifications.

## What OpenClaw can do with this skill

- Query any zone, cell, or planting by natural language
- Record sowing, germination, moves, harvests
- Generate WhatsApp-ready daily/weekly summaries
- Proactively flag overdue tasks and slow germination

## Requirements

- OpenClaw running on the same host (or with access to `GARDEN_DB_PATH`)
- `sqlite3` CLI available in the OpenClaw container

## Setup

**1. Copy the skill:**
```bash
cp -r skills/garden-manager /path/to/openclaw/skills/
```

**2. Set the DB path** in OpenClaw's environment:
```
GARDEN_DB_PATH=/home/leo/garden/garden.db
```

**3. Install cron jobs:**
```bash
chmod +x cron-setup.sh && ./cron-setup.sh
```

## Adapting for other AI agents

The skill works via plain `sqlite3` CLI calls. Any AI agent with shell access and sqlite3
can use the same queries. The full schema is documented in `skills/garden-manager/SKILL.md`.
The database format is stable — you can also build integrations directly against the SQLite file
using any sqlite3 library (Python, Node, Rust, etc).
```

- [ ] **Step 3: Commit**

```bash
git add openclaw/
git commit -m "feat: openclaw skill, README, and integration guide"
```

---

### Task 13: OpenClaw cron setup script

**Files:**
- Create: `openclaw/cron-setup.sh`

- [ ] **Step 1: Create `openclaw/cron-setup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_CMD="${OPENCLAW_CMD:-openclaw}"
GARDEN_DB="${GARDEN_DB_PATH:-/home/leo/garden/garden.db}"

echo "Installing Garden Manager cron jobs..."
echo "OpenClaw command: $OPENCLAW_CMD"
echo "DB path: $GARDEN_DB"

# Remove existing garden-manager cron jobs
crontab -l 2>/dev/null | grep -v 'garden-manager' | crontab - || true

# Add new jobs
(crontab -l 2>/dev/null; cat <<EOF

# Garden Manager — daily briefing (7:30 AM)
30 7 * * * GARDEN_DB_PATH=$GARDEN_DB $OPENCLAW_CMD run garden-manager "Daily garden briefing: check germinator status and list today's tasks. Format for WhatsApp." >> /var/log/garden-cron.log 2>&1

# Garden Manager — weekly planning (Sunday 9 AM)
0 9 * * 0 GARDEN_DB_PATH=$GARDEN_DB $OPENCLAW_CMD run garden-manager --model high "Weekly garden planning summary: full zone review, what to sow this week, upcoming tasks, seed stock warnings." >> /var/log/garden-cron.log 2>&1

# Garden Manager — germinator watch (every 6 hours)
0 */6 * * * GARDEN_DB_PATH=$GARDEN_DB $OPENCLAW_CMD run garden-manager "Germinator check: flag any slots sown more than 14 days ago with no germination update. List by cell label." >> /var/log/garden-cron.log 2>&1
EOF
) | crontab -

echo "Cron jobs installed:"
crontab -l | grep garden-manager
```

- [ ] **Step 2: Make script executable and commit**

```bash
chmod +x openclaw/cron-setup.sh
git add openclaw/cron-setup.sh
git commit -m "feat: cron-setup.sh for daily, weekly, and germinator-watch jobs"
```

---

## Phase 6 — Documentation

### Task 14: README + SETUP.md

**Files:**
- Create: `README.md`
- Create: `SETUP.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# Garden Manager

A self-hosted garden management system with zone tracking, seed inventory,
task management, and AI integration via [OpenClaw](./openclaw/README.md).

## Features

- **Dynamic zones** — grid (cell-by-cell) or loose tracking, fully configurable
- **First-run wizard** — set up your zones, location, and preferences via browser
- **Dashboard** — overview, zone grids, seeds, tasks, sowing calendar
- **Weather** — live conditions via open-meteo.com (no API key needed)
- **OpenClaw AI** — natural-language queries and WhatsApp notifications
- **SQLite** — single file, easy to back up

## Quick Start

```bash
cp .env.example .env
# Edit .env — set DATA_DIR, PORT, DOMAIN
docker compose up
# Open http://localhost:8420 (or https://garden.home with Traefik)
```

On first launch, a setup wizard guides you through configuring your garden.

## Reverse Proxy

Traefik labels are **active by default** in `docker-compose.yml`.
If you're not using Traefik, see [SETUP.md](./SETUP.md).

## Backup

```bash
cp $DATA_DIR/garden.db /your/backup/location/garden.db
```

## OpenClaw Integration

See [openclaw/README.md](./openclaw/README.md) for setup.

## Tech Stack

Node.js · Express · SQLite · Alpine.js · Tailwind CSS (CDN) · Leaflet.js · Docker
```

- [ ] **Step 2: Create `SETUP.md`**

```markdown
# Setup Without Traefik

By default, `docker-compose.yml` uses Traefik labels and assumes a `proxy` Docker network.

If you don't use Traefik:

**1. Edit `docker-compose.yml`:**

Comment out the `labels:` section and uncomment `ports:`:

```yaml
# labels:
#   - "traefik.enable=true"
#   ...

ports:
  - "${PORT:-8420}:8420"
```

**2. Remove the external network:**

Comment out or remove:
```yaml
networks:
  default:
    name: proxy
    external: true
```

**3. Start:**
```bash
docker compose up
```

Access at `http://localhost:8420`.

## Data Directory

Set `DATA_DIR` in `.env`. For a standalone install without a home server:
```
DATA_DIR=./data
```

The SQLite file will be at `./data/garden.db`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md SETUP.md
git commit -m "docs: README and SETUP.md with Traefik/standalone instructions"
```

---

## Phase 7 — Verification

### Task 15: End-to-end verification

- [ ] **Step 1: Run full test suite**

```bash
cd dashboard && npx jest
```
Expected: All tests pass

- [ ] **Step 2: Test fresh Docker install (standalone)**

```bash
# In .env set DATA_DIR=./data
docker compose up
```
Expected: browser at `http://localhost:8420` shows wizard

- [ ] **Step 3: Complete wizard and verify dashboard loads**

Go through all 6 steps. After launch, dashboard should show:
- Overview with example Scotland seed data
- Zones tab with Germinator grid (5×8) and other zones
- Calendar tab with "Sow Now" populated (depends on current date)

- [ ] **Step 4: Verify data persistence**

```bash
docker compose down && docker compose up
```
Expected: dashboard loads directly (no wizard), all data intact

- [ ] **Step 5: Simulate restore**

```bash
cp data/garden.db /tmp/garden-backup.db
docker compose down
rm data/garden.db
cp /tmp/garden-backup.db data/garden.db
docker compose up
```
Expected: dashboard loads with all data intact, no wizard

- [ ] **Step 6: Verify init idempotency**

```bash
docker compose restart garden-db-init
```
Expected: logs show `DB exists, skipping init`

- [ ] **Step 7: Final commit**

```bash
git tag v0.1.0
git log --oneline
```
