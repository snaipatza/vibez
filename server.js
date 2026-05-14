const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'vibez-super-secret-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
    next();
}
function requireDJ(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (req.session.role !== 'dj' && req.session.role !== 'admin') return res.status(403).json({ error: 'เฉพาะ DJ/Admin เท่านั้น' });
    next();
}
function requireAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'เฉพาะ Admin เท่านั้น' });
    next();
}

// ── AUTH ──────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'กรุณากรอก username และ password' });
    if (username.length < 3) return res.status(400).json({ error: 'Username ต้องมีอย่างน้อย 3 ตัวอักษร' });
    if (password.length < 6) return res.status(400).json({ error: 'Password ต้องมีอย่างน้อย 6 ตัวอักษร' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username ใช้ได้แค่ a-z, 0-9, _' });

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
    if (existing) return res.status(400).json({ error: 'Username นี้ถูกใช้ไปแล้ว' });

    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash, avatar_seed) VALUES (?, ?, ?)').run(username, hash, username + Math.random());
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    req.session.role = 'user';
    res.json({ success: true, username, role: 'user' });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูล' });
    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
        return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.json({ success: true, username: user.username, role: user.role });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    // อัปเดต last_seen
    db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(), req.session.userId);
    const user = db.prepare('SELECT avatar_seed FROM users WHERE id=?').get(req.session.userId);
    res.json({
        loggedIn: true,
        userId: req.session.userId,
        username: req.session.username,
        role: req.session.role,
        avatar_seed: user?.avatar_seed || req.session.username
    });
});

app.patch('/api/me', requireAuth, (req, res) => {
    const avatarSeed = String(req.body.avatar_seed || '').trim();
    if (!avatarSeed) return res.status(400).json({ error: 'กรุณาใส่ค่าโปรไฟล์' });
    if (avatarSeed.length > 60) return res.status(400).json({ error: 'ค่าโปรไฟล์ยาวเกินไป' });

    db.prepare('UPDATE users SET avatar_seed=? WHERE id=?').run(avatarSeed, req.session.userId);
    res.json({
        success: true,
        username: req.session.username,
        role: req.session.role,
        avatar_seed: avatarSeed
    });
});

// นับจำนวนคนออนไลน์จริง (active ใน 2 นาทีที่ผ่านมา)
app.post('/api/ping', requireAuth, (req, res) => {
    db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(), req.session.userId);
    const cutoff = Date.now() - 2 * 60 * 1000;
    const count = db.prepare('SELECT COUNT(*) as c FROM users WHERE last_seen > ?').get(cutoff).c;
    res.json({ online: count });
});

app.get('/api/online', (req, res) => {
    const cutoff = Date.now() - 2 * 60 * 1000;
    const count = db.prepare('SELECT COUNT(*) as c FROM users WHERE last_seen > ?').get(cutoff).c;
    const users = db.prepare('SELECT username, role, avatar_seed FROM users WHERE last_seen > ? ORDER BY last_seen DESC LIMIT 50').all(cutoff);
    res.json({ online: count, users });
});

// ── ADS ───────────────────────────────────────────────────────────────
app.get('/api/ad', (req, res) => {
    const ad = db.prepare('SELECT * FROM ads WHERE active=1 ORDER BY id DESC LIMIT 1').get();
    res.json(ad || null);
});

app.get('/api/admin/ads', requireAdmin, (req, res) => {
    res.json(db.prepare('SELECT * FROM ads ORDER BY id DESC').all());
});

app.post('/api/admin/ads', requireAdmin, (req, res) => {
    const { title, body, cta_text, cta_url, image_url } = req.body;
    if (!title) return res.status(400).json({ error: 'กรุณาใส่หัวข้อโฆษณา' });
    const result = db.prepare('INSERT INTO ads (title,body,cta_text,cta_url,image_url,active) VALUES (?,?,?,?,?,0)')
        .run(title, body||'', cta_text||'คลิกดู', cta_url||'#', image_url||'');
    res.json({ success: true, id: result.lastInsertRowid });
});

app.patch('/api/admin/ads/:id', requireAdmin, (req, res) => {
    const { title, body, cta_text, cta_url, image_url, active } = req.body;
    if (active === 1) db.prepare('UPDATE ads SET active=0').run(); // ปิดอันเก่าก่อน
    db.prepare('UPDATE ads SET title=COALESCE(?,title), body=COALESCE(?,body), cta_text=COALESCE(?,cta_text), cta_url=COALESCE(?,cta_url), image_url=COALESCE(?,image_url), active=COALESCE(?,active) WHERE id=?')
        .run(title, body, cta_text, cta_url, image_url, active, req.params.id);
    res.json({ success: true });
});

app.delete('/api/admin/ads/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM ads WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// ── NOW PLAYING ────────────────────────────────────────────────────────
app.get('/api/now-playing', (req, res) => {
    const row = db.prepare('SELECT * FROM now_playing WHERE id = 1').get();
    if (!row || !row.youtube_id) return res.json({ youtube_id: null, is_playing: false });

    const now = Date.now() / 1000;
    const elapsed = row.is_playing
        ? Math.max(0, now - row.started_at)
        : Math.max(0, row.paused_elapsed);

    res.json({ ...row, elapsed_seconds: elapsed });
});

// DJ: set now playing
app.post('/api/now-playing', requireDJ, (req, res) => {
    const { queue_id, youtube_id, title, artist, thumbnail, youtube_url } = req.body;
    if (!youtube_id) return res.status(400).json({ error: 'youtube_id required' });
    const now = Date.now() / 1000;
    db.prepare(`
        UPDATE now_playing SET
            queue_id=?, youtube_id=?, title=?, artist=?,
            thumbnail=?, youtube_url=?, started_at=?, paused_elapsed=0, is_playing=1,
            dj_username=?, dj_user_id=?, dj_avatar_seed=?
        WHERE id=1
    `).run(queue_id || null, youtube_id, title || '', artist || '', thumbnail || '', youtube_url || '', now,
           req.session.username, req.session.userId, req.session.username);
    if (queue_id) db.prepare("UPDATE queue SET status='playing' WHERE id=?").run(queue_id);
    db.prepare("INSERT INTO messages (user_id,username,role,message) VALUES (?,?,?,?)")
      .run(0, 'SYSTEM', 'system', `🎧 ${req.session.username} กำลังเล่น "${title || youtube_id}"`);
    res.json({ success: true });
});

// DJ: pause / resume
app.patch('/api/now-playing', requireDJ, (req, res) => {
    const { is_playing } = req.body;
    const row = db.prepare('SELECT * FROM now_playing WHERE id=1').get();
    if (!row) return res.status(404).json({ error: 'Not found' });

    const now = Date.now() / 1000;
    if (is_playing) {
        const elapsed = row.paused_elapsed || 0;
        db.prepare('UPDATE now_playing SET is_playing=1, started_at=? WHERE id=1').run(now - elapsed);
    } else {
        const elapsed = Math.max(0, now - row.started_at);
        db.prepare('UPDATE now_playing SET is_playing=0, paused_elapsed=? WHERE id=1').run(elapsed);
    }
    res.json({ success: true });
});

// DJ: stop
app.delete('/api/now-playing', requireDJ, (req, res) => {
    db.prepare("UPDATE now_playing SET youtube_id='', is_playing=0, paused_elapsed=0 WHERE id=1").run();
    db.prepare("UPDATE queue SET status='pending' WHERE status='playing'").run();
    res.json({ success: true });
});

// ── QUEUE ──────────────────────────────────────────────────────────────
app.get('/api/queue', (req, res) => {
    const queue = db.prepare(
        "SELECT * FROM queue WHERE status IN ('pending','playing') ORDER BY CASE status WHEN 'playing' THEN 0 ELSE 1 END, votes DESC, created_at ASC"
    ).all();
    if (req.session.userId) {
        const userVotes = db.prepare('SELECT queue_id FROM votes WHERE user_id=?').all(req.session.userId).map(v => v.queue_id);
        queue.forEach(item => { item.userVoted = userVotes.includes(item.id); });
    }
    res.json(queue);
});

app.post('/api/queue', requireAuth, (req, res) => {
    const { title, artist, youtube_url, youtube_id, thumbnail } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'กรุณาใส่ชื่อเพลง' });
    const activeQueueCount = db.prepare("SELECT COUNT(*) as c FROM queue WHERE status IN ('pending','playing')").get().c;
    if (activeQueueCount >= 20) return res.status(409).json({ error: 'คิวเพลงเต็มแล้ว จำกัดสูงสุด 20 เพลง' });

    const result = db.prepare(
        'INSERT INTO queue (title,artist,youtube_url,youtube_id,thumbnail,requested_by,user_id) VALUES (?,?,?,?,?,?,?)'
    ).run(title.trim(), artist || '', youtube_url || '', youtube_id || '', thumbnail || '', req.session.username, req.session.userId);

    db.prepare("INSERT INTO messages (user_id,username,role,message) VALUES (?,?,?,?)")
      .run(0, 'SYSTEM', 'system', `🎵 ${req.session.username} ขอเพลง "${title.trim()}"`);

    res.json({ success: true, id: result.lastInsertRowid });
});

app.post('/api/queue/:id/vote', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const item = db.prepare("SELECT * FROM queue WHERE id=? AND status IN ('pending','playing')").get(id);
    if (!item) return res.status(404).json({ error: 'ไม่พบเพลงในคิว' });
    const existing = db.prepare('SELECT id FROM votes WHERE user_id=? AND queue_id=?').get(req.session.userId, id);
    if (existing) {
        db.prepare('DELETE FROM votes WHERE user_id=? AND queue_id=?').run(req.session.userId, id);
        db.prepare('UPDATE queue SET votes=MAX(0,votes-1) WHERE id=?').run(id);
        return res.json({ voted: false, votes: db.prepare('SELECT votes FROM queue WHERE id=?').get(id).votes });
    } else {
        db.prepare('INSERT INTO votes (user_id,queue_id) VALUES (?,?)').run(req.session.userId, id);
        db.prepare('UPDATE queue SET votes=votes+1 WHERE id=?').run(id);
        return res.json({ voted: true, votes: db.prepare('SELECT votes FROM queue WHERE id=?').get(id).votes });
    }
});

app.patch('/api/queue/:id', requireDJ, (req, res) => {
    const { status } = req.body;
    if (!['played', 'skipped', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    db.prepare('UPDATE queue SET status=? WHERE id=?').run(status, req.params.id);
    res.json({ success: true });
});

app.delete('/api/queue/:id', requireDJ, (req, res) => {
    db.prepare('DELETE FROM votes WHERE queue_id=?').run(req.params.id);
    db.prepare('DELETE FROM queue WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// ── MESSAGES ──────────────────────────────────────────────────────────
app.get('/api/messages', (req, res) => {
    const after = parseInt(req.query.after) || 0;
    const messages = db.prepare(`
        SELECT messages.*, users.avatar_seed
        FROM messages
        LEFT JOIN users ON users.id = messages.user_id
        WHERE messages.id > ?
        ORDER BY messages.created_at ASC
        LIMIT 60
    `).all(after);
    res.json(messages);
});

app.post('/api/messages', requireAuth, (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'ข้อความว่าง' });
    if (message.trim().length > 300) return res.status(400).json({ error: 'ข้อความยาวเกินไป' });
    const user = db.prepare('SELECT role FROM users WHERE id=?').get(req.session.userId);
    const result = db.prepare('INSERT INTO messages (user_id,username,role,message) VALUES (?,?,?,?)').run(req.session.userId, req.session.username, user.role, message.trim());
    res.json({ success: true, id: result.lastInsertRowid });
});

// ── ADMIN ──────────────────────────────────────────────────────────────
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = db.prepare('SELECT id, username, role, avatar_seed, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
});

app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
    const { role } = req.body;
    const validRoles = ['user', 'vip', 'dj', 'admin'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const user = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.prepare('UPDATE users SET role=? WHERE id=?').run(role, req.params.id);
    res.json({ success: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    const user = db.prepare('SELECT id, role FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'ไม่สามารถลบ Admin ได้' });
    db.prepare('DELETE FROM votes WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM messages WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const totalMessages = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
    const totalQueue = db.prepare('SELECT COUNT(*) as c FROM queue').get().c;
    const nowPlaying = db.prepare('SELECT * FROM now_playing WHERE id=1').get();
    res.json({ totalUsers, totalMessages, totalQueue, nowPlaying });
});

app.get('/api/admin', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`\n🎧 VIBEZ running at http://localhost:${PORT}\n`);
});
