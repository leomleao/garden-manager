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
