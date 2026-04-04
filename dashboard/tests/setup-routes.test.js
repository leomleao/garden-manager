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
