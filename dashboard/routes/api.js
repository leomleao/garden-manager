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
