const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATABASE_DIR || process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'vibez.db');
const bundledDbPath = path.join(__dirname, 'vibez.db');
if (dbPath !== bundledDbPath && !fs.existsSync(dbPath) && fs.existsSync(bundledDbPath)) {
    fs.copyFileSync(bundledDbPath, dbPath);
}

const db = new Database(dbPath);
db.dataDir = dataDir;
db.dbPath = dbPath;
db.pragma('journal_mode = WAL');
console.log(`Database path: ${dbPath}`);

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
    media_url TEXT DEFAULT '',
    media_type TEXT DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    cta_text TEXT DEFAULT 'คลิกดู',
    cta_url TEXT DEFAULT '#',
    image_url TEXT DEFAULT '',
    active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS direct_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    message TEXT NOT NULL,
    media_url TEXT DEFAULT '',
    media_type TEXT DEFAULT '',
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS role_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    current_role TEXT DEFAULT 'guest',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    expires INTEGER NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    skin TEXT DEFAULT 'pink',
    created_by TEXT DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    is_default INTEGER DEFAULT 0
  );

  INSERT OR IGNORE INTO rooms (id, name, skin, is_default) VALUES ('main-stage', 'main-stage', 'pink', 1);

  CREATE TABLE IF NOT EXISTS password_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS dj_follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    dj_user_id INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, dj_user_id)
  );

  CREATE TABLE IF NOT EXISTS live_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT DEFAULT 'dj_live',
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    read_at INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS vip_donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    package TEXT NOT NULL,
    amount INTEGER NOT NULL,
    duration_days INTEGER NOT NULL,
    slip_url TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );
`);

// Add new columns to existing databases (safe to run multiple times)
const alterations = [
    "ALTER TABLE now_playing ADD COLUMN dj_username TEXT DEFAULT ''",
    "ALTER TABLE now_playing ADD COLUMN dj_user_id INTEGER DEFAULT 0",
    "ALTER TABLE now_playing ADD COLUMN dj_avatar_seed TEXT DEFAULT ''",
    "ALTER TABLE now_playing ADD COLUMN dj_avatar_url TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN last_seen INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN name_color TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN chat_color TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN vip_expires_at INTEGER DEFAULT 0",
    "ALTER TABLE messages ADD COLUMN media_url TEXT DEFAULT ''",
    "ALTER TABLE messages ADD COLUMN media_type TEXT DEFAULT ''",
    "ALTER TABLE messages ADD COLUMN name_color TEXT DEFAULT ''",
    "ALTER TABLE messages ADD COLUMN chat_color TEXT DEFAULT ''",
    "ALTER TABLE direct_messages ADD COLUMN media_url TEXT DEFAULT ''",
    "ALTER TABLE direct_messages ADD COLUMN media_type TEXT DEFAULT ''",
    "ALTER TABLE queue ADD COLUMN type TEXT DEFAULT 'user'",
    "ALTER TABLE queue ADD COLUMN order_idx INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN can_admin INTEGER DEFAULT 0",
    "ALTER TABLE messages ADD COLUMN room_id TEXT DEFAULT 'main-stage'",
    "ALTER TABLE messages ADD COLUMN reply_to_id INTEGER DEFAULT 0",
    "ALTER TABLE messages ADD COLUMN reply_to_name TEXT DEFAULT ''",
    "ALTER TABLE messages ADD COLUMN reply_to_text TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN chat_frame TEXT DEFAULT ''",
    "ALTER TABLE messages ADD COLUMN chat_frame TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN avatar_frame TEXT DEFAULT ''",
    "ALTER TABLE messages ADD COLUMN avatar_frame TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN checkin_streak INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN last_checkin_date TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN total_listen_seconds INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN last_listen_ping INTEGER DEFAULT 0",
    "ALTER TABLE now_playing ADD COLUMN shoutout_text TEXT DEFAULT ''",
    "ALTER TABLE now_playing ADD COLUMN shoutout_until INTEGER DEFAULT 0",
    "ALTER TABLE now_playing ADD COLUMN shoutout_by TEXT DEFAULT ''",
    "ALTER TABLE now_playing ADD COLUMN collab_dj_username TEXT DEFAULT ''",
    "ALTER TABLE now_playing ADD COLUMN collab_dj_user_id INTEGER DEFAULT 0",
    "ALTER TABLE now_playing ADD COLUMN collab_dj_avatar_seed TEXT DEFAULT ''",
    "ALTER TABLE now_playing ADD COLUMN collab_dj_avatar_url TEXT DEFAULT ''",
    "ALTER TABLE ads ADD COLUMN fb_url TEXT DEFAULT ''",
    "ALTER TABLE ads ADD COLUMN image_data TEXT DEFAULT ''"
];
for (const sql of alterations) {
    try { db.exec(sql); } catch(e) { /* column already exists */ }
}

// Migrate old 'user' role → 'member'
try { db.exec("UPDATE users SET role='member' WHERE role='user'"); } catch(e) {}
// Default role column to 'guest' for new registrations going forward (handled in app logic)

// Create default DJ account
const djExists = db.prepare("SELECT id FROM users WHERE username = 'IMVURADIO'").get();
if (!djExists) {
    const hash = bcrypt.hashSync('vibez1234', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, avatar_seed) VALUES ('IMVURADIO', ?, 'dj', 'imvu-society-radio')")
      .run(hash);
    console.log('✅ DJ account: IMVURADIO / vibez1234');
}

// Create default admin account
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'ADMIN'").get();
if (!adminExists) {
    const hash = bcrypt.hashSync('admin1234', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, avatar_seed) VALUES ('ADMIN', ?, 'admin', 'admin-vibez')")
      .run(hash);
    console.log('✅ Admin account: ADMIN / admin1234');
}

// Create second admin account
const admin2Exists = db.prepare("SELECT id FROM users WHERE username = 'ADMIN2'").get();
if (!admin2Exists) {
    const hash = bcrypt.hashSync('admin5678', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, avatar_seed) VALUES ('ADMIN2', ?, 'admin', 'admin2-vibez')")
      .run(hash);
    console.log('✅ Admin account: ADMIN2 / admin5678');
}

// Create second DJ account
const dj2Exists = db.prepare("SELECT id FROM users WHERE username = 'DJ2'").get();
if (!dj2Exists) {
    const hash = bcrypt.hashSync('dj5678', 10);
    db.prepare("INSERT INTO users (username, password_hash, role, avatar_seed) VALUES ('DJ2', ?, 'dj', 'dj2-vibez')")
      .run(hash);
    console.log('✅ DJ account: DJ2 / dj5678');
}

module.exports = db;
