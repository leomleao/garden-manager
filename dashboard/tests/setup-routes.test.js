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
