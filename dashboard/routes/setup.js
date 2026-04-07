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
    DELETE FROM plant_lifecycle;
    DELETE FROM zone_cells;
    DELETE FROM zones;
    DELETE FROM seeds;
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
