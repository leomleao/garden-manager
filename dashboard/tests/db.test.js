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
