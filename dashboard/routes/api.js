const express = require('express');
const db = require('../db');
const router = express.Router();

function addDays(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getPlantingDisplayName(planting) {
  if (!planting) return 'plant';
  return [planting.seed_name, planting.seed_variety].filter(Boolean).join(' - ') || `plant #${planting.id}`;
}

function createTask({ zone_id = null, title, due_date = null, priority = 'medium', notes = null, callback_type = null, callback_payload = null }) {
  const normalizedPayload = callback_payload == null || typeof callback_payload === 'string'
    ? callback_payload
    : JSON.stringify(callback_payload);
  return db.prepare(
    'INSERT INTO tasks(zone_id,title,due_date,priority,status,notes,callback_type,callback_payload) VALUES(?,?,?,?,?,?,?,?)'
  ).run([zone_id, title, due_date, priority, 'pending', notes, callback_type, normalizedPayload]);
}

function clearPlantLifecycleFromZone(plantingId, context = {}) {
  const planting = db.prepare(`
    SELECT p.*, z.name AS zone_name, z.view_type, s.name AS seed_name, s.variety AS seed_variety
    FROM plant_lifecycle p
    LEFT JOIN zones z ON z.id = p.zone_id
    LEFT JOIN seeds s ON s.id = p.seed_id
    WHERE p.id = ?
  `).get([plantingId]);

  if (!planting) return { ok: true, action: 'noop' };

  const zoneId = planting.zone_id;
  const zoneName = planting.zone_name || 'zone';
  db.prepare('UPDATE plant_lifecycle SET zone_id=NULL, cell_id=NULL WHERE id=?').run([plantingId]);
  db.prepare("INSERT INTO activity_log(action_type,zone_id,plant_lifecycle_id,description) VALUES('clear-plant',?,?,?)")
    .run([zoneId, plantingId, `Cleared ${getPlantingDisplayName(planting)} from ${zoneName}`]);
  return { ok: true, action: 'remove-from-zone' };
}

function executeTaskCallback(task) {
  if (!task?.callback_type) return { ok: true, action: 'none' };

  let payload = {};
  if (task.callback_payload) {
    payload = JSON.parse(task.callback_payload);
  }

  if (task.callback_type === 'clear_failed_plant') {
    return clearPlantLifecycleFromZone(payload.plant_lifecycle_id, payload);
  }

  throw new Error(`Unsupported task callback: ${task.callback_type}`);
}

function ensureFailedCleanupTask(plantingId) {
  const planting = db.prepare(`
    SELECT p.*, s.name AS seed_name, s.variety AS seed_variety, z.name AS zone_name, z.view_type, c.label AS cell_label
    FROM plant_lifecycle p
    LEFT JOIN seeds s ON s.id = p.seed_id
    LEFT JOIN zones z ON z.id = p.zone_id
    LEFT JOIN zone_cells c ON c.id = p.cell_id
    WHERE p.id = ?
  `).get([plantingId]);

  if (!planting || !planting.zone_id) return null;

  const callbackPayload = JSON.stringify({
    plant_lifecycle_id: planting.id,
    zone_id: planting.zone_id,
    cell_id: planting.cell_id,
    view_type: planting.view_type,
    cell_label: planting.cell_label || null
  });

  const existingTask = db.prepare(`
    SELECT id
    FROM tasks
    WHERE status='pending'
      AND callback_type='clear_failed_plant'
      AND callback_payload=?
  `).get([callbackPayload]);

  if (existingTask) return existingTask.id;

  const locationLabel = planting.view_type === 'grid'
    ? (planting.cell_label || planting.zone_name || 'grid cell')
    : (planting.zone_name || 'zone');

  const info = createTask({
    zone_id: planting.zone_id,
    title: `Clear plant ${getPlantingDisplayName(planting)} from ${locationLabel}`,
    due_date: addDays(new Date().toISOString().slice(0, 10), 7),
    priority: 'medium',
    notes: 'Created automatically after marking a plant as dead.',
    callback_type: 'clear_failed_plant',
    callback_payload: callbackPayload
  });

  db.prepare("INSERT INTO activity_log(action_type,zone_id,plant_lifecycle_id,description) VALUES('task-created',?,?,?)")
    .run([planting.zone_id, planting.id, `Created cleanup task #${info.lastInsertRowid} for ${getPlantingDisplayName(planting)} in ${locationLabel}`]);

  return info.lastInsertRowid;
}

// Config
router.get('/config', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM app_config').all();
  const config = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(config);
});

router.patch('/config', (req, res) => {
  const { key, value } = req.body;
  const ALLOWED_KEYS = [
    'owner_name', 'location_name', 'timezone', 'units',
    'latitude', 'longitude', 'openclaw_enabled',
    'default_soil_type', 'default_watering_type',
    'spring_frost_date', 'autumn_frost_date', 'growing_season_notes'
  ];
  if (!key || !ALLOWED_KEYS.includes(key)) return res.status(400).json({ error: 'invalid key' });
  db.prepare('INSERT OR REPLACE INTO app_config(key,value) VALUES(?,?)').run([key, String(value ?? '')]);
  res.json({ ok: true });
});

// Zones
router.get('/zones', (req, res) => {
  res.json(db.prepare('SELECT * FROM zones ORDER BY sort_order, id').all());
});

router.get('/zones/:id', (req, res) => {
  const zone = db.prepare('SELECT * FROM zones WHERE id=?').get([req.params.id]);
  if (!zone) return res.status(404).json({ error: 'not found' });
  zone.cells = db.prepare('SELECT * FROM zone_cells WHERE zone_id=? ORDER BY row,col').all([zone.id]);
  res.json(zone);
});

router.patch('/zones/:id', (req, res) => {
  const zoneId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM zones WHERE id=?').get([zoneId]);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const allowed = ['name','type','latitude','longitude','area_sqm','covered','cover_type',
    'orientation','slope_degrees','has_auto_watering','watering_type','has_heating','heating_type',
    'has_lighting','lighting_type','soil_type','view_type','grid_rows','grid_cols',
    'cell_width_cm','cell_height_cm','notes','sort_order'];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'no valid fields' });

  const activePlantings = db.prepare(`
    SELECT COUNT(*) AS count
    FROM plant_lifecycle
    WHERE zone_id=?
      AND status NOT IN ('harvested','failed')
  `).get([zoneId]).count;

  const currentIsGrid = existing.view_type === 'grid';
  const gridStructureChanged =
    (fields.includes('view_type') && req.body.view_type !== existing.view_type) ||
    (fields.includes('grid_rows') && Number(req.body.grid_rows) !== Number(existing.grid_rows)) ||
    (fields.includes('grid_cols') && Number(req.body.grid_cols) !== Number(existing.grid_cols)) ||
    (fields.includes('cell_width_cm') && Number(req.body.cell_width_cm) !== Number(existing.cell_width_cm)) ||
    (fields.includes('cell_height_cm') && Number(req.body.cell_height_cm) !== Number(existing.cell_height_cm));

  if (currentIsGrid && activePlantings > 0 && gridStructureChanged) {
    return res.status(400).json({ error: 'cannot change grid settings while plants are active in this zone' });
  }

  const set = fields.map(f => `${f}=?`).join(',');
  const vals = fields.map(f => req.body[f]);

  db.prepare(`UPDATE zones SET ${set} WHERE id=?`).run([...vals, zoneId]);

  if (gridStructureChanged) {
    const zone = db.prepare('SELECT view_type, grid_rows, grid_cols FROM zones WHERE id=?').get([zoneId]);
    db.prepare('DELETE FROM zone_cells WHERE zone_id=?').run([zoneId]);
    if (zone.view_type === 'grid' && zone.grid_rows && zone.grid_cols) {
      const insert = db.prepare('INSERT INTO zone_cells(zone_id,row,col,label) VALUES(?,?,?,?)');
      for (let r = 1; r <= zone.grid_rows; r++) {
        for (let c = 1; c <= zone.grid_cols; c++) {
          insert.run([zoneId, r, c, String.fromCharCode(64 + r) + c]);
        }
      }
    }
  }

  res.json({ ok: true });
});

router.delete('/zones/:id', (req, res) => {
  const zoneId = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM zones WHERE id=?').get([zoneId]);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const activePlantings = db.prepare(`
    SELECT COUNT(*) AS count
    FROM plant_lifecycle
    WHERE zone_id=?
      AND status NOT IN ('harvested','failed')
  `).get([zoneId]).count;

  if (activePlantings > 0) {
    return res.status(400).json({ error: 'cannot delete zone while plants are active in this zone' });
  }

  db.prepare('DELETE FROM zones WHERE id=?').run([zoneId]);
  res.json({ ok: true });
});

// Seeds
router.get('/seeds', (req, res) => {
  const q = req.query.q;
  if (q) {
    res.json(db.prepare("SELECT * FROM seeds WHERE name LIKE ? OR variety LIKE ?").all([`%${q}%`, `%${q}%`]));
  } else {
    res.json(db.prepare('SELECT * FROM seeds ORDER BY box_id NULLS LAST, name').all());
  }
});

router.post('/seeds', (req, res) => {
  const {
    name, variety, type, quantity = 0, box_id, emoji, supplier, purchase_year, sow_by_year, notes,
    purchase_link, days_to_germinate, optimum_soil_temp, optimum_soil_type,
    plant_height, light_requirements, growing_instructions,
    sow_indoors_start, sow_indoors_end, sow_outdoors_start, sow_outdoors_end,
    plant_out_start, plant_out_end, harvest_start, harvest_end, picture
  } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare(
    `INSERT INTO seeds(
      name,variety,type,quantity,box_id,emoji,supplier,purchase_year,sow_by_year,notes,
      purchase_link,days_to_germinate,optimum_soil_temp,optimum_soil_type,
      plant_height,light_requirements,growing_instructions,
      sow_indoors_start,sow_indoors_end,sow_outdoors_start,sow_outdoors_end,
      plant_out_start,plant_out_end,harvest_start,harvest_end,picture
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run([
    name, variety, type, quantity, box_id, emoji, supplier, purchase_year, sow_by_year, notes,
    purchase_link, days_to_germinate, optimum_soil_temp, optimum_soil_type,
    plant_height, light_requirements, growing_instructions,
    sow_indoors_start, sow_indoors_end, sow_outdoors_start, sow_outdoors_end,
    plant_out_start, plant_out_end, harvest_start, harvest_end, picture
  ].map(v => v === undefined ? null : v));
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/seeds/:id', (req, res) => {
  const allowed = [
    'name','variety','type','quantity','box_id','emoji','supplier','purchase_year','sow_by_year','notes',
    'purchase_link','days_to_germinate','optimum_soil_temp','optimum_soil_type',
    'plant_height','light_requirements','growing_instructions',
    'sow_indoors_start','sow_indoors_end','sow_outdoors_start','sow_outdoors_end',
    'plant_out_start','plant_out_end','harvest_start','harvest_end','picture'
  ];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'no valid fields' });
  const set = fields.map(f => `${f}=?`).join(',');
  db.prepare(`UPDATE seeds SET ${set} WHERE id=?`).run([...fields.map(f => req.body[f]), req.params.id]);
  res.json({ ok: true });
});

router.delete('/seeds/:id', (req, res) => {
  db.prepare('DELETE FROM seeds WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Plant Lifecycle
router.get('/plant-lifecycle', (req, res) => {
  const { zone_id, status } = req.query;
  let q = `SELECT p.*, s.name as seed_name, s.variety as seed_variety
           FROM plant_lifecycle p LEFT JOIN seeds s ON p.seed_id=s.id WHERE 1=1`;
  const params = [];
  if (zone_id) { q += ' AND p.zone_id=?'; params.push(zone_id); }
  if (status)  { q += ' AND p.status=?';  params.push(status);  }
  res.json(db.prepare(q + ' ORDER BY p.sown_date DESC').all(params));
});

router.post('/plant-lifecycle', (req, res) => {
  const { seed_id, zone_id, cell_id = null, sown_date, quantity = 1, notes = null } = req.body;
  if (!zone_id) return res.status(400).json({ error: 'zone_id required' });
  const info = db.prepare(
    'INSERT INTO plant_lifecycle(seed_id,zone_id,cell_id,sown_date,status,quantity,notes) VALUES(?,?,?,?,?,?,?)'
  ).run([seed_id, zone_id, cell_id, sown_date || new Date().toISOString().slice(0,10), 'sown', quantity, notes]);
  // Log
  db.prepare("INSERT INTO activity_log(action_type,zone_id,plant_lifecycle_id,description) VALUES('sow',?,?,?)")
    .run([zone_id, info.lastInsertRowid, `Sowed plant #${info.lastInsertRowid}`]);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/plant-lifecycle/:id', (req, res) => {
  const allowed = ['status','sown_date','germinated_date','moved_date','harvested_date','failed_date','notes','cell_id','zone_id','quantity'];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'no valid fields' });
  const existing = db.prepare('SELECT * FROM plant_lifecycle WHERE id=?').get([req.params.id]);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const set = fields.map(f => `${f}=?`).join(',');
  db.prepare(`UPDATE plant_lifecycle SET ${set} WHERE id=?`).run([...fields.map(f => req.body[f]), req.params.id]);
  if (req.body.status) {
    const p = db.prepare('SELECT zone_id FROM plant_lifecycle WHERE id=?').get([req.params.id]);
    db.prepare("INSERT INTO activity_log(action_type,zone_id,plant_lifecycle_id,description) VALUES(?,?,?,?)")
      .run([req.body.status, p?.zone_id, req.params.id, `Plant lifecycle #${req.params.id} -> ${req.body.status}`]);
  }
  const nextFailed = req.body.status === 'failed' || (fields.includes('failed_date') && !!req.body.failed_date);
  if (existing.status !== 'failed' && nextFailed) {
    ensureFailedCleanupTask(req.params.id);
  }
  res.json({ ok: true });
});
router.delete('/plant-lifecycle/:id', (req, res) => {
  const existing = db.prepare('SELECT zone_id FROM plant_lifecycle WHERE id=?').get([req.params.id]);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM activity_log WHERE plant_lifecycle_id=?').run([req.params.id]);
  db.prepare('DELETE FROM plant_lifecycle WHERE id=?').run([req.params.id]);
  db.prepare("INSERT INTO activity_log(action_type,zone_id,plant_lifecycle_id,description) VALUES('reset-soil',?,?,?)")
    .run([existing.zone_id, null, `Reset soil for plant lifecycle #${req.params.id}`]);
  // Auto-complete any pending cleanup task for this planting
  const pendingTasks = db.prepare(`SELECT id, callback_payload FROM tasks WHERE status='pending' AND callback_type='clear_failed_plant'`).all();
  for (const task of pendingTasks) {
    try {
      const payload = task.callback_payload ? JSON.parse(task.callback_payload) : {};
      if (Number(payload.plant_lifecycle_id) === Number(req.params.id)) {
        db.prepare(`UPDATE tasks SET status='done' WHERE id=?`).run([task.id]);
      }
    } catch (_) {}
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
  res.json(db.prepare(q + ' ORDER BY t.due_date ASC NULLS LAST').all(params));
});

router.post('/tasks', (req, res) => {
  const { zone_id, title, due_date, priority = 'medium', notes, callback_type = null, callback_payload = null } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const info = createTask({ zone_id, title, due_date, priority, notes, callback_type, callback_payload });
  res.status(201).json({ id: info.lastInsertRowid });
});
router.patch('/tasks/:id', (req, res) => {
  const allowed = ['title','due_date','priority','status','notes','zone_id','callback_type','callback_payload'];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'no valid fields' });
  const existing = db.prepare('SELECT * FROM tasks WHERE id=?').get([req.params.id]);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const taskForCallback = {
    ...existing,
    ...Object.fromEntries(fields.map(field => [field, req.body[field]]))
  };
  if (req.body.status === 'done' && existing.status !== 'done') {
    try {
      executeTaskCallback(taskForCallback);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  const set = fields.map(f => `${f}=?`).join(',');
  db.prepare(`UPDATE tasks SET ${set} WHERE id=?`).run([...fields.map(f => req.body[f]), req.params.id]);
  res.json({ ok: true });
});
// Activity log
router.get('/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(db.prepare(`
    SELECT
      a.*,
      z.name  AS zone_name,
      s.name  AS seed_name,
      s.variety AS seed_variety,
      pl.status AS plant_status
    FROM activity_log a
    LEFT JOIN zones           z  ON z.id  = a.zone_id
    LEFT JOIN plant_lifecycle pl ON pl.id = a.plant_lifecycle_id
    LEFT JOIN seeds           s  ON s.id  = pl.seed_id
    ORDER BY a.timestamp DESC LIMIT ?
  `).all([limit]));
});

// Summary stats (for overview cards)
router.get('/summary', (req, res) => {
  const zones         = db.prepare('SELECT COUNT(*) as count FROM zones').get().count;
  const activePlants  = db.prepare("SELECT COUNT(*) as count FROM plant_lifecycle WHERE status NOT IN ('harvested','failed')").get().count;
  const overdueTasks  = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status='pending' AND due_date < date('now')").get().count;
  const seedsInStock  = db.prepare('SELECT COUNT(*) as count FROM seeds WHERE quantity > 0').get().count;
  res.json({ zones, activePlants, overdueTasks, seedsInStock });
});

module.exports = router;
