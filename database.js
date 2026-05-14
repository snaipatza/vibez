const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'vibez.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    avatar_seed TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT DEFAULT '',
    youtube_url TEXT DEFAULT '',
    youtube_id TEXT DEFAULT '',
    thumbnail TEXT DEFAULT '',
    requested_by TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    votes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    queue_id INTEGER NOT NULL,
    UNIQUE(user_id, queue_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS now_playing (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    queue_id INTEGER DEFAULT NULL,
    youtube_id TEXT DEFAULT '',
    title TEXT DEFAULT '',
    artist TEXT DEFAULT '',
    thumbnail TEXT DEFAULT '',
    youtube_url TEXT DEFAULT '',
    started_at REAL DEFAULT 0,
    paused_elapsed REAL DEFAULT 0,
    is_playing INTEGER DEFAULT 0
  );

  INSERT OR IGNORE INTO now_playing (id) VALUES (1);
`);

// Add new columns to existing databases (safe to run multiple times)
const alterations = [
    "ALTER TABLE now_playing ADD COLUMN dj_username TEXT DEFAULT ''",
    "ALTER TABLE now_playing ADD COLUMN dj_user_id INTEGER DEFAULT 0",
    "ALTER TABLE now_playing ADD COLUMN dj_avatar_seed TEXT DEFAULT ''"
];
for (const sql of alterations) {
    try { db.exec(sql); } catch(e) { /* column already exists */ }
}

// Create default DJ account
const djExists = db.prepare("SELECT id FROM users WHERE username = 'DJVIBEZ'").get();
if (!djExists) {
    const hash = bcrypt.hashSync('vibez1234', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, avatar_seed) VALUES ('DJVIBEZ', ?, 'dj', 'dj-vibez')")
      .run(hash);
    console.log('✅ DJ account: DJVIBEZ / vibez1234');
}

// Create default admin account
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'ADMIN'").get();
if (!adminExists) {
    const hash = bcrypt.hashSync('admin1234', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, avatar_seed) VALUES ('ADMIN', ?, 'admin', 'admin-vibez')")
      .run(hash);
    console.log('✅ Admin account: ADMIN / admin1234');
}

module.exports = db;
