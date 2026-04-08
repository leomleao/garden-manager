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

function addDays(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

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

test('GET /api/plant-lifecycle returns array', async () => {
  const res = await request(app).get('/api/plant-lifecycle');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('PATCH /api/plant-lifecycle/:id updates sown_date and quantity', async () => {
  const seedRes = await request(app)
    .post('/api/seeds')
    .send({ name: 'Lettuce', variety: 'Little Gem', type: 'vegetable', quantity: 12 });

  const plantingRes = await request(app)
    .post('/api/plant-lifecycle')
    .send({ seed_id: seedRes.body.id, zone_id: 1, sown_date: '2026-04-01', quantity: 1 });

  const patchRes = await request(app)
    .patch(`/api/plant-lifecycle/${plantingRes.body.id}`)
    .send({ sown_date: '2026-04-02', quantity: 3, notes: 'thinned and regrouped' });

  expect(patchRes.status).toBe(200);

  const listRes = await request(app).get('/api/plant-lifecycle');
  const planting = listRes.body.find(p => p.id === plantingRes.body.id);

  expect(planting.sown_date).toBe('2026-04-02');
  expect(planting.quantity).toBe(3);
  expect(planting.notes).toBe('thinned and regrouped');
});

test('DELETE /api/plant-lifecycle/:id removes a planting', async () => {
  const seedRes = await request(app)
    .post('/api/seeds')
    .send({ name: 'Beetroot', variety: 'Boltardy', type: 'vegetable', quantity: 8 });

  const plantingRes = await request(app)
    .post('/api/plant-lifecycle')
    .send({ seed_id: seedRes.body.id, zone_id: 1, cell_id: 5, sown_date: '2026-04-03', quantity: 1 });

  const deleteRes = await request(app)
    .delete(`/api/plant-lifecycle/${plantingRes.body.id}`);

  expect(deleteRes.status).toBe(200);

  const listRes = await request(app).get('/api/plant-lifecycle');
  expect(listRes.body.find(p => p.id === plantingRes.body.id)).toBeUndefined();
});

test('PATCH /api/plant-lifecycle/:id updates zone_id and cell_id for transplant', async () => {
  const seedRes = await request(app)
    .post('/api/seeds')
    .send({ name: 'Cabbage', variety: 'Greyhound', type: 'vegetable', quantity: 6 });

  const plantingRes = await request(app)
    .post('/api/plant-lifecycle')
    .send({ seed_id: seedRes.body.id, zone_id: 1, cell_id: 4, sown_date: '2026-04-04', quantity: 1 });

  const patchRes = await request(app)
    .patch(`/api/plant-lifecycle/${plantingRes.body.id}`)
    .send({ zone_id: 1, cell_id: null, moved_date: '2026-04-08', status: 'sown' });

  expect(patchRes.status).toBe(200);

  const listRes = await request(app).get('/api/plant-lifecycle');
  const planting = listRes.body.find(p => p.id === plantingRes.body.id);

  expect(planting.zone_id).toBe(1);
  expect(planting.cell_id).toBeNull();
  expect(planting.moved_date).toBe('2026-04-08');
});

test('PATCH /api/plant-lifecycle/:id to failed creates a cleanup task with callback metadata', async () => {
  const zonesRes = await request(app).get('/api/zones');
  const gridZone = zonesRes.body.find(z => z.view_type === 'grid');
  const gridZoneRes = await request(app).get(`/api/zones/${gridZone.id}`);
  const firstCell = gridZoneRes.body.cells[0];

  const seedRes = await request(app)
    .post('/api/seeds')
    .send({ name: 'Pepper', variety: 'Hungarian Hot Wax', type: 'vegetable', quantity: 6 });

  const plantingRes = await request(app)
    .post('/api/plant-lifecycle')
    .send({ seed_id: seedRes.body.id, zone_id: gridZone.id, cell_id: firstCell.id, sown_date: '2026-04-06', quantity: 1 });

  const failRes = await request(app)
    .patch(`/api/plant-lifecycle/${plantingRes.body.id}`)
    .send({ failed_date: '2026-04-08', status: 'failed' });

  expect(failRes.status).toBe(200);

  const tasksRes = await request(app).get('/api/tasks');
  const cleanupTask = tasksRes.body.find(t => t.callback_type === 'clear_failed_plant' && JSON.parse(t.callback_payload).plant_lifecycle_id === plantingRes.body.id);

  expect(cleanupTask).toBeTruthy();
  expect(cleanupTask.title).toContain('Clear plant Pepper');
  expect(cleanupTask.title).toContain(firstCell.label);
  expect(cleanupTask.due_date).toBe(addDays(new Date().toISOString().slice(0, 10), 7));

  const activityRes = await request(app).get('/api/activity');
  const taskCreatedLog = activityRes.body.find(entry => entry.action_type === 'task-created' && entry.plant_lifecycle_id === plantingRes.body.id);

  expect(taskCreatedLog).toBeTruthy();
  expect(taskCreatedLog.description).toContain('Created cleanup task');
});

test('PATCH /api/tasks/:id completion callback resets soil for grid plantings', async () => {
  const zonesRes = await request(app).get('/api/zones');
  const gridZone = zonesRes.body.find(z => z.view_type === 'grid');
  const gridZoneRes = await request(app).get(`/api/zones/${gridZone.id}`);
  const firstCell = gridZoneRes.body.cells[1];

  const seedRes = await request(app)
    .post('/api/seeds')
    .send({ name: 'Spinach', variety: 'Matador', type: 'vegetable', quantity: 10 });

  const plantingRes = await request(app)
    .post('/api/plant-lifecycle')
    .send({ seed_id: seedRes.body.id, zone_id: gridZone.id, cell_id: firstCell.id, sown_date: '2026-04-06', quantity: 1 });

  await request(app)
    .patch(`/api/plant-lifecycle/${plantingRes.body.id}`)
    .send({ failed_date: '2026-04-08', status: 'failed' });

  const tasksRes = await request(app).get('/api/tasks');
  const cleanupTask = tasksRes.body.find(t => t.callback_type === 'clear_failed_plant' && JSON.parse(t.callback_payload).plant_lifecycle_id === plantingRes.body.id);

  const completeRes = await request(app)
    .patch(`/api/tasks/${cleanupTask.id}`)
    .send({ status: 'done' });

  expect(completeRes.status).toBe(200);

  const listRes = await request(app).get('/api/plant-lifecycle');
  expect(listRes.body.find(p => p.id === plantingRes.body.id)).toBeUndefined();
});

test('PATCH /api/tasks/:id completion callback removes failed loose plantings from their zone', async () => {
  const zonesRes = await request(app).get('/api/zones');
  const looseZone = zonesRes.body.find(z => z.view_type === 'loose');

  const seedRes = await request(app)
    .post('/api/seeds')
    .send({ name: 'Basil', variety: 'Genovese', type: 'herb', quantity: 10 });

  const plantingRes = await request(app)
    .post('/api/plant-lifecycle')
    .send({ seed_id: seedRes.body.id, zone_id: looseZone.id, sown_date: '2026-04-06', quantity: 1 });

  await request(app)
    .patch(`/api/plant-lifecycle/${plantingRes.body.id}`)
    .send({ failed_date: '2026-04-08', status: 'failed' });

  const tasksRes = await request(app).get('/api/tasks');
  const cleanupTask = tasksRes.body.find(t => t.callback_type === 'clear_failed_plant' && JSON.parse(t.callback_payload).plant_lifecycle_id === plantingRes.body.id);

  const completeRes = await request(app)
    .patch(`/api/tasks/${cleanupTask.id}`)
    .send({ status: 'done' });

  expect(completeRes.status).toBe(200);

  const listRes = await request(app).get('/api/plant-lifecycle');
  const planting = listRes.body.find(p => p.id === plantingRes.body.id);

  expect(planting.zone_id).toBeNull();
  expect(planting.cell_id).toBeNull();
  expect(planting.status).toBe('failed');
});

test('GET /api/seeds returns full seed fields', async () => {
  // Seed a record first so the response is non-empty
  await request(app)
    .post('/api/seeds')
    .send({ name: 'Tomato', variety: 'Roma', type: 'vegetable', quantity: 10 });
  const res = await request(app).get('/api/seeds');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.length).toBeGreaterThan(0);
  const seed = res.body[0];
  expect(seed).toHaveProperty('sow_indoors_start');
  expect(seed.sow_indoors_start === null || typeof seed.sow_indoors_start === 'string').toBe(true);
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
