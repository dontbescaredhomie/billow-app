const express = require('express');
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');

const app = express();

// --- Paths for DB and sessions ---
const dataDir = process.env.DATA_DIR || '.'; // Render: /data, Local: .
const dbPath = path.join(dataDir, 'billow.db');
const sessionDir = path.join(dataDir, 'sessions');

// Ensure data directories exist
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

// --- Middleware ---
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(fileUpload());
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: sessionDir }),
  secret: 'billow-secret',
  resave: false,
  saveUninitialized: false
}));

// --- Setup SQLite database ---
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to database:', err.message);
  } else {
    console.log('Connected to SQLite database at', dbPath);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      filename TEXT,
      text TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
});

// --- Register ---
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (email, password) VALUES (?, ?)`, [email, hashedPassword], function (err) {
      if (err) return res.status(400).json({ error: 'User already exists' });
      res.json({ message: 'User registered successfully' });
    });
  } catch {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// --- Login ---
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.userId = user.id;
    res.json({ message: 'Logged in successfully' });
  });
});

// --- Logout ---
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});

// --- Upload receipt ---
app.post('/upload', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
  if (!req.files || !req.files.receipt) return res.status(400).json({ error: 'No file uploaded' });

  const receiptFile = req.files.receipt;
  const uploadDir = path.join(dataDir, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const uploadPath = path.join(uploadDir, receiptFile.name);

  receiptFile.mv(uploadPath, async (err) => {
    if (err) return res.status(500).json({ error: 'File upload failed' });

    const text = await Tesseract.recognize(uploadPath, 'eng')
      .then(result => result.data.text)
      .catch(() => '');

    db.run(`INSERT INTO receipts (user_id, filename, text) VALUES (?, ?, ?)`,
      [req.session.userId, receiptFile.name, text],
      function (err) {
        if (err) return res.status(500).json({ error: 'DB insert failed' });
        res.json({ message: 'Receipt saved', text });
      });
  });
});

// --- Search receipts ---
app.get('/search', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });

  const query = req.query.q ? `%${req.query.q}%` : '%';

  db.all(`SELECT * FROM receipts WHERE user_id = ? AND text LIKE ? ORDER BY created_at DESC`,
    [req.session.userId, query],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB search failed' });
      res.json(rows);
    });
});

// --- Get all receipts ---
app.get('/receipts', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });

  db.all(`SELECT * FROM receipts WHERE user_id = ? ORDER BY created_at DESC`,
    [req.session.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB query failed' });
      res.json(rows);
    });
});

// --- Serve frontend root ---
app.get('/', (req, res) => {
  res.sendFile(path.resolve('public/index.html'));
});

// --- Catch-all for SPA ---
app.use((req, res) => {
  res.sendFile(path.resolve('public/index.html'));
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
