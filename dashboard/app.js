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
