const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
const db = require('./database');

function createMailTransport() {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
}

async function sendOtpEmail(toEmail, code, username) {
    const transport = createMailTransport();
    if (!transport) return false;
    await transport.sendMail({
        from: `"IIMV Society Radio" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: `[IIMV Radio] รหัส OTP ของคุณ: ${code}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0a0b10;color:#fff;border-radius:16px">
            <div style="font-size:28px;font-weight:800;letter-spacing:-0.03em;margin-bottom:4px">🎧 IIMV Society Radio</div>
            <div style="color:#ff9f1c;font-size:12px;letter-spacing:0.15em;margin-bottom:28px">PASSWORD RESET</div>
            <p style="color:#ccc;margin-bottom:24px">สวัสดี <b style="color:#fff">@${username}</b>, นี่คือรหัส OTP สำหรับรีเซ็ตรหัสผ่าน</p>
            <div style="background:#1a1b25;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
              <div style="font-size:40px;font-weight:800;letter-spacing:0.2em;color:#ff9f1c">${code}</div>
              <div style="color:#888;font-size:12px;margin-top:8px">ใช้ได้ภายใน 10 นาที</div>
            </div>
            <p style="color:#666;font-size:12px">ถ้าไม่ได้ขอรีเซ็ต ไม่ต้องทำอะไร</p>
          </div>
        `,
    });
    return true;
}

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3000;

class SqliteSessionStore extends session.Store {
    constructor(database) {
        super();
        this.db = database;
        this.getStmt = this.db.prepare('SELECT data, expires FROM sessions WHERE sid=?');
        this.setStmt = this.db.prepare('INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET expires=excluded.expires, data=excluded.data');
        this.destroyStmt = this.db.prepare('DELETE FROM sessions WHERE sid=?');
        this.cleanupStmt = this.db.prepare('DELETE FROM sessions WHERE expires < ?');
    }
    get(sid, cb) {
        try {
            const row = this.getStmt.get(sid);
            if (!row || row.expires < Date.now()) {
                if (row) this.destroyStmt.run(sid);
                return cb(null, null);
            }
            cb(null, JSON.parse(row.data));
        } catch (err) { cb(err); }
    }
    set(sid, sess, cb) {
        try {
            const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000;
            this.setStmt.run(sid, expires, JSON.stringify(sess));
            cb?.(null);
        } catch (err) { cb?.(err); }
    }
    destroy(sid, cb) {
        try {
            this.destroyStmt.run(sid);
            cb?.(null);
        } catch (err) { cb?.(err); }
    }
    touch(sid, sess, cb) {
        this.set(sid, sess, cb);
    }
    cleanup() {
        this.cleanupStmt.run(Date.now());
    }
}

const avatarUploadDir = path.join(db.dataDir || __dirname, 'uploads', 'avatars');
const chatUploadDir = path.join(db.dataDir || __dirname, 'uploads', 'chat');
fs.mkdirSync(avatarUploadDir, { recursive: true });
fs.mkdirSync(chatUploadDir, { recursive: true });

app.use(express.json({ limit: '15mb' }));
app.use('/uploads/avatars', express.static(avatarUploadDir));
app.use('/uploads/chat', express.static(chatUploadDir));
app.use(express.static(path.join(__dirname, 'public')));
const sessionStore = new SqliteSessionStore(db);
setInterval(() => sessionStore.cleanup(), 60 * 60 * 1000).unref();
app.use(session({
    store: sessionStore,
    secret: 'vibez-super-secret-2024',
    resave: false,
    saveUninitialized: false,
    name: 'vibez.sid',
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' }
}));

// Role level: guest=0, member=1, vip=2, dj=3, admin=4  (legacy 'user'=member=1)
const ROLE_LEVEL = { guest: 0, user: 1, member: 1, vip: 2, dj: 3, admin: 4 };
function roleLevel(role) { return ROLE_LEVEL[role] || 0; }

// VIP donation packages — edit prices here
const VIP_PACKAGES = [
    { id: '1month',  label: '1 เดือน', days: 30, price: 19 },
    { id: '3months', label: '3 เดือน', days: 90, price: 49 },
];

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length < 9 || digits.length > 15) return null;
    return digits;
}

function maskPhone(phone) {
    const digits = normalizePhone(phone);
    if (!digits) return '';
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 3)}-${'*'.repeat(Math.max(0, digits.length - 6))}${digits.slice(-3)}`;
}

function bangkokDateKey(ts = Date.now()) {
    return new Date(ts + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function computeLevelSummary(totalSeconds = 0) {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const block = 90;
    const level = Math.min(50, Math.floor(minutes / block) + 1);
    const currentBase = (level - 1) * block;
    const nextBase = level * block;
    const progress = Math.max(0, Math.min(100, ((minutes - currentBase) / block) * 100));
    return {
        level,
        minutes,
        hours: Number((safeSeconds / 3600).toFixed(1)),
        progress,
        next_level_minutes: nextBase,
        label: level >= 15 ? 'Legend Listener' : level >= 10 ? 'Night Rider' : level >= 5 ? 'Vibe Supporter' : 'Fresh Listener',
    };
}

function buildUnlocks(level) {
    return [
        { level: 1, title: 'Member Chat', unlocked: level >= 1 },
        { level: 2, title: 'Profile badges', unlocked: level >= 2 },
        { level: 3, title: 'Priority requests', unlocked: level >= 3 },
        { level: 5, title: 'DJ follow alerts', unlocked: level >= 5 },
        { level: 8, title: 'Rare frame flex', unlocked: level >= 8 },
    ];
}

function buildBadges(user, extra = {}) {
    const badges = [];
    const listen = computeLevelSummary(user.total_listen_seconds || 0);
    if (['vip', 'dj', 'admin'].includes(user.role)) badges.push({ id: 'vip', label: 'VIP Access', tone: 'violet' });
    if (user.role === 'dj') badges.push({ id: 'dj', label: 'On Air DJ', tone: 'orange' });
    if ((user.checkin_streak || 0) >= 3) badges.push({ id: 'streak', label: `${user.checkin_streak} Day Streak`, tone: 'gold' });
    if (listen.hours >= 10) badges.push({ id: 'listener', label: `${listen.hours}h Listener`, tone: 'blue' });
    if ((extra.followCount || 0) >= 3) badges.push({ id: 'supporter', label: 'DJ Supporter', tone: 'green' });
    if ((extra.coins || user.coins || 0) >= 100) badges.push({ id: 'coins', label: 'Coin Collector', tone: 'rose' });
    return badges;
}

function touchListening(userId) {
    const row = db.prepare('SELECT total_listen_seconds, last_listen_ping FROM users WHERE id=?').get(userId);
    if (!row) return;
    const now = Date.now();
    let nextSeconds = row.total_listen_seconds || 0;
    const delta = row.last_listen_ping ? now - row.last_listen_ping : 0;
    if (delta >= 20000 && delta <= 120000) nextSeconds += Math.round(Math.min(delta, 30000) / 1000);
    db.prepare('UPDATE users SET total_listen_seconds=?, last_listen_ping=? WHERE id=?').run(nextSeconds, now, userId);
}

function createFollowerNotifications(djUserId, djUsername, title) {
    const followers = db.prepare(`
        SELECT u.id
        FROM dj_follows f
        JOIN users u ON u.id = f.user_id
        WHERE f.dj_user_id = ?
    `).all(djUserId);
    if (!followers.length) return;
    const insert = db.prepare('INSERT INTO live_notifications (user_id, type, title, body) VALUES (?, ?, ?, ?)');
    const tx = db.transaction(() => {
        for (const follower of followers) {
            insert.run(follower.id, 'dj_live', `${djUsername} is live now`, title || 'Jump back into the room and listen live.');
        }
    });
    tx();
}

function buildUserResponse(userRow, sessionData = {}) {
    const followCount = db.prepare('SELECT COUNT(*) AS c FROM dj_follows WHERE user_id=?').get(userRow.id).c;
    const followed = db.prepare(`
        SELECT u.username, u.display_name, u.avatar_seed, u.avatar_url
        FROM dj_follows f
        JOIN users u ON u.id = f.dj_user_id
        WHERE f.user_id=?
        ORDER BY f.created_at DESC
        LIMIT 8
    `).all(userRow.id);
    const notifications = db.prepare(`
        SELECT id, type, title, body, read_at, created_at
        FROM live_notifications
        WHERE user_id=?
        ORDER BY id DESC
        LIMIT 8
    `).all(userRow.id);
    const unreadNotifications = notifications.filter((item) => !item.read_at).length;
    const level = computeLevelSummary(userRow.total_listen_seconds || 0);
    return {
        loggedIn: true,
        userId: userRow.id,
        username: userRow.username,
        role: userRow.role,
        avatar_seed: userRow.avatar_seed || userRow.username,
        avatar_url: userRow.avatar_url || '',
        name_color: userRow.name_color || '',
        chat_color: userRow.chat_color || '',
        chat_frame: userRow.chat_frame || '',
        avatar_frame: userRow.avatar_frame || '',
        display_name: userRow.display_name || '',
        vip_expires_at: userRow.vip_expires_at || 0,
        can_admin: !!userRow.can_admin,
        email: userRow.email || '',
        phone: userRow.phone || '',
        phone_masked: maskPhone(userRow.phone || ''),
        phone_verified: !!userRow.phone_verified,
        coins: userRow.coins || 0,
        checkin_streak: userRow.checkin_streak || 0,
        last_checkin_date: userRow.last_checkin_date || '',
        total_listen_seconds: userRow.total_listen_seconds || 0,
        level: level.level,
        level_progress: level.progress,
        level_label: level.label,
        hours_listened: level.hours,
        badges: buildBadges(userRow, { followCount, coins: userRow.coins || 0 }),
        unlocks: buildUnlocks(level.level),
        unread_notifications: unreadNotifications,
        notifications,
        followed_djs: followed,
        ...sessionData,
    };
}

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
    next();
}
function requireMember(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
    if (roleLevel(req.session.role) < 1) return res.status(403).json({ error: 'เฉพาะ Member ขึ้นไปเท่านั้น' });
    next();
}
function requireVIP(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
    if (roleLevel(req.session.role) < 2) return res.status(403).json({ error: 'เฉพาะ VIP ขึ้นไปเท่านั้น' });
    next();
}
function requireDJ(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!['dj', 'admin'].includes(req.session.role)) return res.status(403).json({ error: 'เฉพาะ DJ เท่านั้น' });
    next();
}
function requirePlaybackDJ(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (req.session.role !== 'dj') return res.status(403).json({ error: 'DJ only' });
    next();
}
function requireAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (req.session.role === 'admin') return next();
    // Co-admin: DJ granted admin rights by a real admin
    const u = db.prepare('SELECT can_admin FROM users WHERE id=?').get(req.session.userId);
    if (u?.can_admin) return next();
    return res.status(403).json({ error: 'เฉพาะ Admin เท่านั้น' });
}
function requireRealAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'เฉพาะ Admin เท่านั้น' });
    next();
}

// ── AUTH ──────────────────────────────────────────────────────────────
function saveAvatarImage(userId, imageData) {
    if (!imageData) return null;
    const match = String(imageData).match(/^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error('รองรับเฉพาะไฟล์รูปภาพ PNG, JPG, WEBP หรือ GIF');

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 10 * 1024 * 1024) throw new Error('รูปโปรไฟล์ต้องไม่เกิน 10MB');

    const fileName = `user-${userId}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(avatarUploadDir, fileName), buffer);
    return `/uploads/avatars/${fileName}`;
}

function saveChatMedia(ownerKey, mediaData) {
    if (!mediaData) return { mediaUrl: '', mediaType: '' };
    const match = String(mediaData).match(/^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error('รองรับเฉพาะไฟล์ PNG, JPG, WEBP หรือ GIF');

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 8 * 1024 * 1024) throw new Error('ไฟล์ต้องไม่เกิน 8MB');

    const safeKey = String(ownerKey || 'chat').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'chat';
    const fileName = `${safeKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(chatUploadDir, fileName), buffer);
    return {
        mediaUrl: `/uploads/chat/${fileName}`,
        mediaType: ext === 'gif' ? 'gif' : 'image'
    };
}

function extractYouTubeId(input) {
    const value = String(input || '').trim();
    if (!value) return null;
    const match = value.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i);
    return match ? match[1] : null;
}

async function resolveQueueRequest(payload) {
    const rawTitle = String(payload.title || '').trim();
    const rawArtist = String(payload.artist || '').trim();
    const rawYoutubeUrl = String(payload.youtube_url || '').trim();
    const directVideoId = String(payload.youtube_id || '').trim();
    const videoId = directVideoId || extractYouTubeId(rawYoutubeUrl || rawTitle);
    const typedTitleIsYouTube = !!extractYouTubeId(rawTitle);

    if (!videoId) {
        return {
            title: rawTitle,
            artist: rawArtist,
            youtube_url: rawYoutubeUrl,
            youtube_id: '',
            thumbnail: String(payload.thumbnail || '').trim()
        };
    }

    let oEmbed = null;
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`);
        if (response.ok) oEmbed = await response.json();
    } catch {}

    return {
        title: rawTitle && rawTitle !== rawYoutubeUrl && !typedTitleIsYouTube ? rawTitle : (oEmbed?.title || `YouTube Video (${videoId})`),
        artist: rawArtist || oEmbed?.author_name || '',
        youtube_url: youtubeUrl,
        youtube_id: videoId,
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    };
}

app.post('/api/auth/request-reset', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!username || !email) return res.status(400).json({ error: 'กรุณากรอก username และ email' });

    const user = db.prepare('SELECT id, username, email FROM users WHERE LOWER(username)=LOWER(?)').get(username);
    if (!user) return res.status(404).json({ error: 'ไม่พบ username นี้ในระบบ' });
    if (!(user.email || '').trim()) {
        return res.status(400).json({ error: 'บัญชีนี้ยังไม่ได้ตั้งค่า Email — กรุณาติดต่อ Admin เพื่อรีเซ็ตรหัสผ่าน' });
    }
    if ((user.email || '').toLowerCase() !== email) {
        return res.status(404).json({ error: 'Email ไม่ตรงกับที่ลงทะเบียนไว้' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 10 * 60 * 1000;
    db.prepare('UPDATE password_otps SET used_at=? WHERE user_id=? AND used_at=0').run(Date.now(), user.id);
    db.prepare('INSERT INTO password_otps (user_id, phone, email, code, expires_at) VALUES (?, ?, ?, ?, ?)').run(user.id, '', email, code, expiresAt);

    const emailSent = await sendOtpEmail(email, code, user.username);
    const maskedEmail = email.replace(/(.{2}).+(@.+)/, '$1***$2');

    const payload = { success: true, email_masked: maskedEmail, expires_in_seconds: 600 };
    if (!emailSent) payload.demo_code = code; // dev fallback if no Gmail configured
    res.json(payload);
});

app.post('/api/auth/reset-password', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.new_password || '').trim();
    if (!username || !email || !code || !newPassword) return res.status(400).json({ error: 'Missing reset fields' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password ต้องมีอย่างน้อย 6 ตัวอักษร' });

    const user = db.prepare('SELECT id, username, email FROM users WHERE LOWER(username)=LOWER(?)').get(username);
    if (!user || (user.email || '').toLowerCase() !== email) return res.status(404).json({ error: 'ไม่พบ username หรือ email ไม่ตรงกัน' });

    const otp = db.prepare(`
        SELECT * FROM password_otps
        WHERE user_id=? AND email=? AND code=? AND used_at=0
        ORDER BY id DESC LIMIT 1
    `).get(user.id, email, code);
    if (!otp || otp.expires_at < Date.now()) return res.status(400).json({ error: 'OTP ไม่ถูกต้องหรือหมดอายุ' });

    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, user.id);
    db.prepare('UPDATE password_otps SET used_at=? WHERE id=?').run(Date.now(), otp.id);
    res.json({ success: true });
});

app.post('/api/register', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!username || !password) return res.status(400).json({ error: 'กรุณากรอก username และ password' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'กรุณากรอก email ที่ถูกต้อง' });
    if (username.length < 3) return res.status(400).json({ error: 'Username ต้องมีอย่างน้อย 3 ตัวอักษร' });
    if (password.length < 6) return res.status(400).json({ error: 'Password ต้องมีอย่างน้อย 6 ตัวอักษร' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username ใช้ได้แค่ a-z, 0-9, _' });

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
    if (existing) return res.status(400).json({ error: 'Username นี้ถูกใช้ไปแล้ว' });

    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare("INSERT INTO users (username, password_hash, role, avatar_seed, email, coins) VALUES (?, ?, 'guest', ?, ?, 10)").run(username, hash, username + Math.random(), email);
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    req.session.role = 'guest';
    const userRow = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
    res.json({ success: true, ...buildUserResponse(userRow) });
});

app.post('/api/login', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();
    const remember = !!req.body.remember;
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: 'Username or password is incorrect' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.cookie.maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    db.prepare('UPDATE users SET last_listen_ping=? WHERE id=?').run(Date.now(), user.id);
    res.json({ success: true, ...buildUserResponse(user, { remember }) });
});

app.post('/api/register', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();
    const phone = normalizePhone(req.body.phone);
    if (!username || !password) return res.status(400).json({ error: 'กรุณากรอก username และ password' });
    if (username.length < 3) return res.status(400).json({ error: 'Username ต้องมีอย่างน้อย 3 ตัวอักษร' });
    if (password.length < 6) return res.status(400).json({ error: 'Password ต้องมีอย่างน้อย 6 ตัวอักษร' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username ใช้ได้แค่ a-z, 0-9, _' });

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
    if (existing) return res.status(400).json({ error: 'Username นี้ถูกใช้ไปแล้ว' });

    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare("INSERT INTO users (username, password_hash, role, avatar_seed) VALUES (?, ?, 'guest', ?)").run(username, hash, username + Math.random());
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    req.session.role = 'guest';
    res.json({ success: true, userId: result.lastInsertRowid, username, role: 'guest', avatar_seed: username, avatar_url: '', name_color: '', chat_color: '', chat_frame: '', avatar_frame: '' });
});

app.post('/api/login', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();
    if (!username || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูล' });
    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
        return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.json({
        success: true,
        userId: user.id,
        username: user.username,
        role: user.role,
        avatar_seed: user.avatar_seed || user.username,
        avatar_url: user.avatar_url || '',
        name_color: user.name_color || '',
        chat_color: user.chat_color || '',
        chat_frame: user.chat_frame || '',
        avatar_frame: user.avatar_frame || ''
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

function checkVipExpiry(userId, sessionRole) {
    if (!['vip'].includes(sessionRole)) return sessionRole;
    const row = db.prepare('SELECT vip_expires_at, role FROM users WHERE id=?').get(userId);
    if (!row) return sessionRole;
    if (row.vip_expires_at > 0 && row.vip_expires_at < Date.now()) {
        db.prepare("UPDATE users SET role='member' WHERE id=?").run(userId);
        return 'member';
    }
    return row.role;
}

app.get('/api/me', (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(), req.session.userId);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
    if (!user) return res.json({ loggedIn: false });
    const currentRole = checkVipExpiry(req.session.userId, user.role || req.session.role);
    if (currentRole !== req.session.role) req.session.role = currentRole;
    res.json(buildUserResponse({ ...user, role: currentRole }));
});

app.patch('/api/me', requireAuth, (req, res) => {
    const avatarSeed = String(req.body.avatar_seed || '').trim();
    const displayName = String(req.body.display_name ?? '').trim().slice(0, 30);
    const phone = req.body.phone === undefined ? undefined : normalizePhone(req.body.phone);
    const email = req.body.email === undefined ? undefined : String(req.body.email).trim().toLowerCase();
    if (!avatarSeed) return res.status(400).json({ error: 'Profile seed is required' });
    if (avatarSeed.length > 60) return res.status(400).json({ error: 'Profile seed is too long' });
    if (req.body.phone !== undefined && !phone) return res.status(400).json({ error: 'Invalid phone number' });
    if (email !== undefined && email && !email.includes('@')) return res.status(400).json({ error: 'Email ไม่ถูกต้อง' });

    let avatarUrl = '';
    try {
        avatarUrl = saveAvatarImage(req.session.userId, req.body.avatar_image) || '';
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    const current = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
    const finalAvatarUrl = avatarUrl || current?.avatar_url || '';
    db.prepare(`
        UPDATE users SET
            avatar_seed=?,
            avatar_url=?,
            display_name=?,
            phone=CASE WHEN ? IS NULL THEN phone ELSE ? END,
            phone_verified=CASE WHEN ? IS NULL THEN phone_verified WHEN ? != COALESCE(phone, '') THEN 1 ELSE phone_verified END,
            email=CASE WHEN ? IS NULL THEN email ELSE ? END
        WHERE id=?
    `).run(avatarSeed, finalAvatarUrl, displayName, phone ?? null, phone ?? '', phone ?? null, phone ?? '', email ?? null, email ?? '', req.session.userId);

    const updated = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
    res.json({ success: true, ...buildUserResponse(updated) });
});

app.post('/api/ping', requireAuth, (req, res) => {
    db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(), req.session.userId);
    touchListening(req.session.userId);
    const cutoff = Date.now() - 2 * 60 * 1000;
    const count = db.prepare('SELECT COUNT(*) as c FROM users WHERE last_seen > ?').get(cutoff).c;
    const user = db.prepare('SELECT total_listen_seconds FROM users WHERE id=?').get(req.session.userId);
    const level = computeLevelSummary(user?.total_listen_seconds || 0);
    res.json({ online: count, total_listen_seconds: user?.total_listen_seconds || 0, level: level.level, level_progress: level.progress });
});

app.get('/api/me', (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(), req.session.userId);
    const user = db.prepare('SELECT role, avatar_seed, avatar_url, name_color, chat_color, chat_frame, avatar_frame, display_name, vip_expires_at, can_admin FROM users WHERE id=?').get(req.session.userId);
    const currentRole = checkVipExpiry(req.session.userId, user?.role || req.session.role);
    if (currentRole !== req.session.role) req.session.role = currentRole;
    res.json({
        loggedIn: true,
        userId: req.session.userId,
        username: req.session.username,
        role: currentRole,
        avatar_seed: user?.avatar_seed || req.session.username,
        avatar_url: user?.avatar_url || '',
        name_color: user?.name_color || '',
        chat_color: user?.chat_color || '',
        chat_frame: user?.chat_frame || '',
        avatar_frame: user?.avatar_frame || '',
        display_name: user?.display_name || '',
        vip_expires_at: user?.vip_expires_at || 0,
        can_admin: user?.can_admin ? true : false,
    });
});

app.patch('/api/me', requireAuth, (req, res) => {
    const avatarSeed = String(req.body.avatar_seed || '').trim();
    const displayName = String(req.body.display_name ?? '').trim().slice(0, 30);
    if (!avatarSeed) return res.status(400).json({ error: 'กรุณาใส่ค่าโปรไฟล์' });
    if (avatarSeed.length > 60) return res.status(400).json({ error: 'ค่าโปรไฟล์ยาวเกินไป' });

    let avatarUrl = null;
    try {
        avatarUrl = saveAvatarImage(req.session.userId, req.body.avatar_image);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    if (avatarUrl) {
        db.prepare('UPDATE users SET avatar_seed=?, avatar_url=?, display_name=? WHERE id=?').run(avatarSeed, avatarUrl, displayName, req.session.userId);
    } else {
        db.prepare('UPDATE users SET avatar_seed=?, display_name=? WHERE id=?').run(avatarSeed, displayName, req.session.userId);
        const user = db.prepare('SELECT avatar_url FROM users WHERE id=?').get(req.session.userId);
        avatarUrl = user?.avatar_url || '';
    }

    res.json({
        success: true,
        username: req.session.username,
        role: req.session.role,
        avatar_seed: avatarSeed,
        avatar_url: avatarUrl,
        display_name: displayName,
    });
});

app.patch('/api/me/colors', requireAuth, (req, res) => {
    const role = req.session.role;
    const level = roleLevel(role);
    if (level < 1) return res.status(403).json({ error: 'ไม่มีสิทธิ์เปลี่ยนสี' });

    const MEMBER_COLORS = ['', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9f1c', '#ffffff'];
    const VIP_COLORS = [...MEMBER_COLORS, '#ff3cac', '#00d4ff', '#02c39a', '#f77f00', '#e040fb', '#00b4d8', '#f72585', '#7b2d8b', '#43aa8b', '#90e0ef'];

    const nameColor = String(req.body.name_color || '').trim();
    const chatColor = String(req.body.chat_color || '').trim();
    const chatFrame = String(req.body.chat_frame !== undefined ? req.body.chat_frame || '' : '').trim();
    const VALID_FRAMES = ['', 'glow-orange', 'glow-pink', 'rainbow', 'neon-blue', 'gold', 'purple', 'green', 'fire', 'ice', 'galaxy', 'red-alert'];
    const VALID_AVATAR_FRAMES = ['', 'electric', 'fire-av', 'ice-av', 'galaxy-av', 'holo', 'neon-pink', 'matrix', 'gold-cool',
        'cat', 'panda', 'bunny', 'frog', 'fox', 'bear', 'penguin', 'unicorn'];

    if (nameColor && level < 2 && !MEMBER_COLORS.includes(nameColor))
        return res.status(403).json({ error: 'Member เปลี่ยนได้เฉพาะสีพื้นฐาน' });
    if (chatColor && level < 2 && !MEMBER_COLORS.includes(chatColor))
        return res.status(403).json({ error: 'Member เปลี่ยนได้เฉพาะสีพื้นฐาน' });

    const allowed = level >= 2 ? VIP_COLORS : MEMBER_COLORS;
    if (nameColor && !allowed.includes(nameColor) && level < 3)
        return res.status(400).json({ error: 'สีไม่ถูกต้อง' });
    if (chatColor && !allowed.includes(chatColor) && level < 3)
        return res.status(400).json({ error: 'สีไม่ถูกต้อง' });

    const frameToSave = req.body.chat_frame !== undefined ? (VALID_FRAMES.includes(chatFrame) ? chatFrame : '') : undefined;
    const avatarFrameRaw = String(req.body.avatar_frame || '').trim();
    const avatarFrameToSave = req.body.avatar_frame !== undefined ? (VALID_AVATAR_FRAMES.includes(avatarFrameRaw) ? avatarFrameRaw : '') : undefined;

    let fields = 'name_color=?, chat_color=?';
    let vals = [nameColor, chatColor];
    if (frameToSave !== undefined) { fields += ', chat_frame=?'; vals.push(frameToSave); }
    if (avatarFrameToSave !== undefined) { fields += ', avatar_frame=?'; vals.push(avatarFrameToSave); }
    vals.push(req.session.userId);
    db.prepare(`UPDATE users SET ${fields} WHERE id=?`).run(...vals);

    const saved = db.prepare('SELECT name_color, chat_color, chat_frame, avatar_frame FROM users WHERE id=?').get(req.session.userId);
    res.json({ success: true, name_color: saved.name_color, chat_color: saved.chat_color, chat_frame: saved.chat_frame, avatar_frame: saved.avatar_frame });
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
    const recentCutoff = Date.now() - 10 * 60 * 1000;
    const count = db.prepare('SELECT COUNT(*) as c FROM users WHERE last_seen > ?').get(cutoff).c;
    const users = db.prepare('SELECT username, display_name, role, avatar_seed, avatar_url, name_color FROM users WHERE last_seen > ? ORDER BY last_seen DESC LIMIT 50').all(cutoff);
    const recently_offline = db.prepare('SELECT username, display_name, role, avatar_seed, avatar_url FROM users WHERE last_seen > ? AND last_seen <= ? ORDER BY last_seen DESC LIMIT 20').all(recentCutoff, cutoff);
    res.json({ online: count, users, recently_offline });
});

// ── ADS ───────────────────────────────────────────────────────────────
app.get('/api/ad', (req, res) => {
    const ad = db.prepare('SELECT * FROM ads WHERE active=1 ORDER BY id DESC LIMIT 1').get();
    res.json(ad || null);
});

app.get('/api/ads', (req, res) => {
    const ads = db.prepare('SELECT * FROM ads WHERE active=1 ORDER BY id DESC LIMIT 4').all();
    res.json(ads);
});

app.get('/api/profile/activity', requireAuth, (req, res) => {
    const activity = db.prepare(`
        SELECT 'message' AS type, message AS title, created_at
        FROM messages
        WHERE user_id = ?
        UNION ALL
        SELECT 'request' AS type, title, created_at
        FROM queue
        WHERE user_id = ?
        UNION ALL
        SELECT 'follow' AS type, 'Followed DJ' AS title, datetime(created_at, 'unixepoch') AS created_at
        FROM dj_follows
        WHERE user_id = ?
        UNION ALL
        SELECT 'checkin' AS type, 'Daily check-in' AS title, last_checkin_date || ' 00:00:00' AS created_at
        FROM users
        WHERE id = ? AND last_checkin_date != ''
        ORDER BY created_at DESC
        LIMIT 12
    `).all(req.session.userId, req.session.userId, req.session.userId, req.session.userId);
    res.json(activity);
});

app.get('/api/notifications', requireAuth, (req, res) => {
    const items = db.prepare(`
        SELECT id, type, title, body, read_at, created_at
        FROM live_notifications
        WHERE user_id=?
        ORDER BY id DESC
        LIMIT 20
    `).all(req.session.userId);
    res.json(items);
});

app.post('/api/notifications/read', requireAuth, (req, res) => {
    db.prepare('UPDATE live_notifications SET read_at=? WHERE user_id=? AND read_at=0').run(Date.now(), req.session.userId);
    res.json({ success: true });
});

app.post('/api/check-in', requireAuth, (req, res) => {
    const today = bangkokDateKey();
    const user = db.prepare('SELECT last_checkin_date, checkin_streak, coins FROM users WHERE id=?').get(req.session.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.last_checkin_date === today) {
        return res.json({ success: true, already_checked_in: true, coins: user.coins || 0, checkin_streak: user.checkin_streak || 0 });
    }
    const yesterday = bangkokDateKey(Date.now() - 24 * 60 * 60 * 1000);
    const nextStreak = user.last_checkin_date === yesterday ? (user.checkin_streak || 0) + 1 : 1;
    const reward = nextStreak >= 7 ? 25 : nextStreak >= 3 ? 15 : 10;
    db.prepare('UPDATE users SET last_checkin_date=?, checkin_streak=?, coins=coins+? WHERE id=?').run(today, nextStreak, reward, req.session.userId);
    res.json({ success: true, reward, checkin_streak: nextStreak });
});

app.get('/api/djs', requireAuth, (req, res) => {
    const djs = db.prepare(`
        SELECT id, username, display_name, avatar_seed, avatar_url, role
        FROM users
        WHERE role IN ('dj', 'admin')
        ORDER BY username ASC
    `).all();
    res.json(djs);
});

app.get('/api/follows', requireAuth, (req, res) => {
    const items = db.prepare(`
        SELECT u.username, u.display_name, u.avatar_seed, u.avatar_url
        FROM dj_follows f
        JOIN users u ON u.id = f.dj_user_id
        WHERE f.user_id=?
        ORDER BY f.created_at DESC
    `).all(req.session.userId);
    res.json(items);
});

app.post('/api/follows/:username', requireAuth, (req, res) => {
    const target = db.prepare(`SELECT id, username FROM users WHERE LOWER(username)=LOWER(?) AND role IN ('dj', 'admin')`).get(req.params.username);
    if (!target) return res.status(404).json({ error: 'DJ not found' });
    if (target.id === req.session.userId) return res.status(400).json({ error: 'You cannot follow yourself' });
    db.prepare('INSERT OR IGNORE INTO dj_follows (user_id, dj_user_id) VALUES (?, ?)').run(req.session.userId, target.id);
    res.json({ success: true });
});

app.delete('/api/follows/:username', requireAuth, (req, res) => {
    const target = db.prepare(`SELECT id FROM users WHERE LOWER(username)=LOWER(?) AND role IN ('dj', 'admin')`).get(req.params.username);
    if (!target) return res.status(404).json({ error: 'DJ not found' });
    db.prepare('DELETE FROM dj_follows WHERE user_id=? AND dj_user_id=?').run(req.session.userId, target.id);
    res.json({ success: true });
});

// ── DM ────────────────────────────────────────────────────────────────
app.get('/api/users/online', requireAuth, (req, res) => {
    const users = db.prepare(`
        SELECT username, role, avatar_seed, avatar_url
        FROM users
        WHERE username != ?
        ORDER BY username
    `).all(req.session.username);
    res.json(users);
});

app.get('/api/users/search', requireAuth, (req, res) => {
    const q = `%${String(req.query.q || '').trim().toLowerCase()}%`;
    const users = db.prepare(`
        SELECT username, role, avatar_seed, avatar_url
        FROM users
        WHERE LOWER(username) LIKE ? AND username != ?
        ORDER BY username
        LIMIT 20
    `).all(q, req.session.username);
    res.json(users);
});

app.get('/api/dm/inbox', requireAuth, (req, res) => {
    const me = req.session.username;
    const cutoff = Date.now() - 2 * 60 * 1000;
    const conversations = db.prepare(`
        WITH contacts AS (
            SELECT CASE WHEN from_user = ? THEN to_user ELSE from_user END AS username
            FROM direct_messages
            WHERE from_user = ? OR to_user = ?
            GROUP BY 1
        )
        SELECT
            contacts.username,
            users.role,
            users.avatar_seed,
            users.avatar_url,
            users.last_seen > ? AS online,
            (
                SELECT dm.message
                FROM direct_messages dm
                WHERE (dm.from_user = contacts.username AND dm.to_user = ?)
                   OR (dm.from_user = ? AND dm.to_user = contacts.username)
                ORDER BY dm.id DESC
                LIMIT 1
            ) AS last_message,
            (
                SELECT dm.created_at
                FROM direct_messages dm
                WHERE (dm.from_user = contacts.username AND dm.to_user = ?)
                   OR (dm.from_user = ? AND dm.to_user = contacts.username)
                ORDER BY dm.id DESC
                LIMIT 1
            ) AS last_at,
            (
                SELECT dm.media_type
                FROM direct_messages dm
                WHERE (dm.from_user = contacts.username AND dm.to_user = ?)
                   OR (dm.from_user = ? AND dm.to_user = contacts.username)
                ORDER BY dm.id DESC
                LIMIT 1
            ) AS last_media_type,
            (
                SELECT COUNT(*)
                FROM direct_messages dm
                WHERE dm.from_user = contacts.username AND dm.to_user = ? AND dm.read = 0
            ) AS unread
        FROM contacts
        LEFT JOIN users ON users.username = contacts.username
        ORDER BY datetime(last_at) DESC, contacts.username ASC
    `).all(me, me, me, cutoff, me, me, me, me, me, me, me);
    res.json(conversations);
});

app.get('/api/dm/:with', requireAuth, (req, res) => {
    const me = req.session.username;
    const other = req.params.with;
    const after = parseInt(req.query.after, 10) || 0;
    db.prepare('UPDATE direct_messages SET read=1 WHERE from_user=? AND to_user=?').run(other, me);
    const msgs = db.prepare(`
        SELECT
            id,
            from_user AS from_username,
            to_user AS to_username,
            message,
            media_url,
            media_type,
            read,
            created_at
        FROM direct_messages
        WHERE ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?))
          AND id > ?
        ORDER BY id ASC
        LIMIT 100
    `).all(me, other, other, me, after);
    res.json(msgs);
});

app.post('/api/dm/send', requireVIP, (req, res) => {
    const from = req.session.username;
    const to = String(req.body.to || '').trim();
    const message = String(req.body.message || '').trim();
    if (!to || (!message && !req.body.media_data)) return res.status(400).json({ error: 'invalid' });
    if (message.length > 500) return res.status(400).json({ error: 'message too long' });
    const toUser = db.prepare('SELECT id FROM users WHERE username=?').get(to);
    if (!toUser) return res.status(404).json({ error: 'user not found' });
    let media = { mediaUrl: '', mediaType: '' };
    try {
        media = saveChatMedia(`${from}-${to}`, req.body.media_data);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
    const result = db.prepare('INSERT INTO direct_messages (from_user, to_user, message, media_url, media_type, created_at) VALUES (?,?,?,?,?,?)')
        .run(from, to, message, media.mediaUrl, media.mediaType, new Date().toISOString());
    res.json({ ok: true, id: result.lastInsertRowid, media_url: media.mediaUrl, media_type: media.mediaType });
});

app.get('/api/admin/ads', requireAdmin, (req, res) => {
    res.json(db.prepare('SELECT * FROM ads ORDER BY id DESC').all());
});

app.post('/api/admin/ads', requireAdmin, (req, res) => {
    const { title, body, cta_text, cta_url, fb_url } = req.body;
    if (!title) return res.status(400).json({ error: 'กรุณาใส่หัวข้อโฆษณา' });
    let imageUrl = String(req.body.image_url || '').trim();
    if (req.body.image_data) {
        try { const saved = saveChatMedia(`ad-${Date.now()}`, req.body.image_data); imageUrl = saved.mediaUrl || imageUrl; }
        catch (e) { return res.status(400).json({ error: 'รูปภาพไม่ถูกต้อง: ' + e.message }); }
    }
    const result = db.prepare('INSERT INTO ads (title,body,cta_text,cta_url,image_url,fb_url,active) VALUES (?,?,?,?,?,?,0)')
        .run(title, body||'', cta_text||'คลิกดู', cta_url||'#', imageUrl, fb_url||'');
    res.json({ success: true, id: result.lastInsertRowid });
});

app.patch('/api/admin/ads/:id', requireAdmin, (req, res) => {
    const { title, body, cta_text, cta_url, fb_url, active } = req.body;
    if (active === 1) {
        const activeCount = db.prepare('SELECT COUNT(*) as c FROM ads WHERE active=1 AND id<>?').get(req.params.id).c;
        if (activeCount >= 4) return res.status(400).json({ error: 'เปิดแสดงโฆษณาได้สูงสุด 4 ช่อง' });
    }
    let imageUrl = req.body.image_url !== undefined ? String(req.body.image_url || '').trim() : undefined;
    if (req.body.image_data) {
        try { const saved = saveChatMedia(`ad-${req.params.id}`, req.body.image_data); imageUrl = saved.mediaUrl; }
        catch (e) { return res.status(400).json({ error: 'รูปภาพไม่ถูกต้อง: ' + e.message }); }
    }
    db.prepare('UPDATE ads SET title=COALESCE(?,title), body=COALESCE(?,body), cta_text=COALESCE(?,cta_text), cta_url=COALESCE(?,cta_url), image_url=COALESCE(?,image_url), fb_url=COALESCE(?,fb_url), active=COALESCE(?,active) WHERE id=?')
        .run(title, body, cta_text, cta_url, imageUrl, fb_url, active, req.params.id);
    res.json({ success: true });
});

app.delete('/api/admin/ads/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM ads WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// ── NOW PLAYING ────────────────────────────────────────────────────────
app.post('/api/shoutout', requireDJ, (req, res) => {
    const targetName = String(req.body.target_name || '').trim().slice(0, 40);
    if (!targetName) return res.status(400).json({ error: 'Target name is required' });
    const until = Date.now() + 12 * 1000;
    db.prepare('UPDATE now_playing SET shoutout_text=?, shoutout_until=?, shoutout_by=? WHERE id=1').run(targetName, until, req.session.username);
    db.prepare("INSERT INTO messages (user_id,username,role,message) VALUES (?,?,?,?)")
      .run(0, 'SYSTEM', 'system', `Shoutout to ${targetName} from @${req.session.username}`);
    res.json({ success: true, shoutout_text: targetName, shoutout_until: until, shoutout_by: req.session.username });
});

app.post('/api/collab', requireDJ, (req, res) => {
    const username = String(req.body.username || '').trim();
    if (!username) {
        db.prepare("UPDATE now_playing SET collab_dj_username='', collab_dj_user_id=0, collab_dj_avatar_seed='', collab_dj_avatar_url='' WHERE id=1").run();
        return res.json({ success: true, cleared: true });
    }
    const collab = db.prepare(`SELECT id, username, display_name, avatar_seed, avatar_url FROM users WHERE LOWER(username)=LOWER(?) AND role IN ('dj', 'admin')`).get(username);
    if (!collab) return res.status(404).json({ error: 'Collaborator not found' });
    db.prepare(`
        UPDATE now_playing SET
            collab_dj_username=?,
            collab_dj_user_id=?,
            collab_dj_avatar_seed=?,
            collab_dj_avatar_url=?
        WHERE id=1
    `).run(collab.username, collab.id, collab.avatar_seed || collab.username, collab.avatar_url || '');
    res.json({ success: true, collab });
});

app.get('/api/now-playing', (req, res) => {
    const row = db.prepare('SELECT * FROM now_playing WHERE id = 1').get();
    if (!row || !row.youtube_id) return res.json({ youtube_id: null, is_playing: false });

    const now = Date.now() / 1000;
    const elapsed = row.is_playing
        ? Math.max(0, now - row.started_at)
        : Math.max(0, row.paused_elapsed);

    const djUser = row.dj_username ? db.prepare('SELECT display_name FROM users WHERE username=?').get(row.dj_username) : null;
    const collabUser = row.collab_dj_username ? db.prepare('SELECT display_name FROM users WHERE username=?').get(row.collab_dj_username) : null;

    res.json({
        ...row,
        elapsed_seconds: elapsed,
        stage_active: stageState.active,
        stage_dj: stageState.djUsername,
        dj_display_name: djUser?.display_name || '',
        collab_dj_display_name: collabUser?.display_name || '',
    });
});

// DJ: set now playing
app.post('/api/now-playing', requirePlaybackDJ, (req, res) => {
    const { queue_id, youtube_id, title, artist, thumbnail, youtube_url } = req.body;
    if (!youtube_id) return res.status(400).json({ error: 'youtube_id required' });
    const now = Date.now() / 1000;
    const dj = db.prepare('SELECT avatar_seed, avatar_url FROM users WHERE id=?').get(req.session.userId) || {};
    db.prepare(`
        UPDATE now_playing SET
            queue_id=?, youtube_id=?, title=?, artist=?,
            thumbnail=?, youtube_url=?, started_at=?, paused_elapsed=0, is_playing=1,
            dj_username=?, dj_user_id=?, dj_avatar_seed=?, dj_avatar_url=?
        WHERE id=1
    `).run(queue_id || null, youtube_id, title || '', artist || '', thumbnail || '', youtube_url || '', now,
           req.session.username, req.session.userId, dj.avatar_seed || req.session.username, dj.avatar_url || '');
    if (queue_id) db.prepare("UPDATE queue SET status='playing' WHERE id=?").run(queue_id);
    createFollowerNotifications(req.session.userId, req.session.username, title || youtube_id);
    db.prepare("INSERT INTO messages (user_id,username,role,message) VALUES (?,?,?,?)")
      .run(0, 'SYSTEM', 'system', `🎧 ${req.session.username} กำลังเล่น "${title || youtube_id}"`);
    res.json({ success: true });
});

// DJ: pause / resume
app.patch('/api/now-playing', requirePlaybackDJ, (req, res) => {
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
app.delete('/api/now-playing', requirePlaybackDJ, (req, res) => {
    db.prepare("UPDATE now_playing SET youtube_id='', is_playing=0, paused_elapsed=0 WHERE id=1").run();
    db.prepare("UPDATE queue SET status='pending' WHERE status='playing'").run();
    res.json({ success: true });
});

// ── QUEUE ──────────────────────────────────────────────────────────────
app.get('/api/queue', (req, res) => {
    const queue = db.prepare(
        "SELECT * FROM queue WHERE status IN ('pending','playing') ORDER BY CASE status WHEN 'playing' THEN 0 ELSE 1 END, CASE WHEN type='dj' THEN order_idx ELSE 9999 END ASC, votes DESC, created_at ASC"
    ).all();
    if (req.session.userId) {
        const userVotes = db.prepare('SELECT queue_id FROM votes WHERE user_id=?').all(req.session.userId).map(v => v.queue_id);
        queue.forEach(item => { item.userVoted = userVotes.includes(item.id); });
    }
    res.json(queue);
});

app.post('/api/queue', requireMember, async (req, res) => {
    const rawTitle = String(req.body.title || '').trim();
    const rawYoutubeUrl = String(req.body.youtube_url || '').trim();
    if (!rawTitle && !rawYoutubeUrl) return res.status(400).json({ error: 'กรุณาใส่ชื่อเพลง' });
    const activeQueueCount = db.prepare("SELECT COUNT(*) as c FROM queue WHERE status IN ('pending','playing')").get().c;
    if (activeQueueCount >= 20) return res.status(409).json({ error: 'คิวเพลงเต็มแล้ว จำกัดสูงสุด 20 เพลง' });

    const resolved = await resolveQueueRequest(req.body);
    if (!resolved.title) return res.status(400).json({ error: 'กรุณาใส่ชื่อเพลง' });
    if (resolved.youtube_id) {
        const duplicate = db.prepare("SELECT id FROM queue WHERE youtube_id=? AND status IN ('pending','playing')").get(resolved.youtube_id);
        if (duplicate) return res.status(409).json({ error: 'เพลงนี้อยู่ในคิวแล้ว' });
    }

    const result = db.prepare(
        'INSERT INTO queue (title,artist,youtube_url,youtube_id,thumbnail,requested_by,user_id) VALUES (?,?,?,?,?,?,?)'
    ).run(
        resolved.title,
        resolved.artist || '',
        resolved.youtube_url || '',
        resolved.youtube_id || '',
        resolved.thumbnail || '',
        req.session.username,
        req.session.userId
    );

    db.prepare("INSERT INTO messages (user_id,username,role,message) VALUES (?,?,?,?)")
      .run(0, 'SYSTEM', 'system', `🎵 ${req.session.username} ขอเพลง "${resolved.title}"`);

    res.json({ success: true, id: result.lastInsertRowid, item: resolved });
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

// DJ adds song to their own playlist
app.post('/api/dj-playlist', requireDJ, async (req, res) => {
    const rawTitle = String(req.body.title || '').trim();
    const rawYoutubeUrl = String(req.body.youtube_url || '').trim();
    if (!rawTitle && !rawYoutubeUrl) return res.status(400).json({ error: 'กรุณาใส่ชื่อเพลง' });
    const resolved = await resolveQueueRequest(req.body);
    if (!resolved.title) return res.status(400).json({ error: 'กรุณาใส่ชื่อเพลง' });
    if (resolved.youtube_id) {
        const duplicate = db.prepare("SELECT id FROM queue WHERE youtube_id=? AND status IN ('pending','playing')").get(resolved.youtube_id);
        if (duplicate) return res.status(409).json({ error: 'เพลงนี้อยู่ในคิวแล้ว' });
    }
    const maxIdx = db.prepare("SELECT MAX(order_idx) as m FROM queue WHERE type='dj' AND status='pending'").get();
    const nextIdx = (maxIdx?.m ?? -1) + 1;
    const result = db.prepare(
        "INSERT INTO queue (title,artist,youtube_url,youtube_id,thumbnail,requested_by,user_id,type,order_idx) VALUES (?,?,?,?,?,?,?,'dj',?)"
    ).run(resolved.title, resolved.artist||'', resolved.youtube_url||'', resolved.youtube_id||'', resolved.thumbnail||'', req.session.username, req.session.userId, nextIdx);
    res.json({ success: true, id: result.lastInsertRowid, item: resolved });
});

// Reorder DJ playlist (drag-drop)
app.patch('/api/queue/reorder', requireDJ, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids required' });
    const stmt = db.prepare("UPDATE queue SET order_idx=? WHERE id=?");
    const run = db.transaction(() => ids.forEach((id, i) => stmt.run(i, id)));
    run();
    res.json({ success: true });
});

// Auto-play next song in queue
app.post('/api/queue/play-next', requirePlaybackDJ, async (req, res) => {
    const current = db.prepare("SELECT id FROM queue WHERE status='playing'").get();
    if (current) db.prepare("UPDATE queue SET status='played' WHERE id=?").run(current.id);
    let next = db.prepare("SELECT * FROM queue WHERE status='pending' AND type='dj' ORDER BY order_idx ASC LIMIT 1").get();
    if (!next) next = db.prepare("SELECT * FROM queue WHERE status='pending' ORDER BY votes DESC, created_at ASC LIMIT 1").get();
    if (!next || !next.youtube_id) {
        db.prepare("UPDATE now_playing SET youtube_id='', is_playing=0, paused_elapsed=0 WHERE id=1").run();
        return res.json({ success: true, next: null });
    }
    const now = Date.now() / 1000;
    const dj = db.prepare('SELECT avatar_seed, avatar_url FROM users WHERE id=?').get(req.session.userId) || {};
    db.prepare(`UPDATE now_playing SET queue_id=?, youtube_id=?, title=?, artist=?, thumbnail=?, youtube_url=?, started_at=?, paused_elapsed=0, is_playing=1, dj_username=?, dj_user_id=?, dj_avatar_seed=?, dj_avatar_url=? WHERE id=1`)
      .run(next.id, next.youtube_id, next.title, next.artist||'', next.thumbnail||'', next.youtube_url||'', now, req.session.username, req.session.userId, dj.avatar_seed||req.session.username, dj.avatar_url||'');
    db.prepare("UPDATE queue SET status='playing' WHERE id=?").run(next.id);
    createFollowerNotifications(req.session.userId, req.session.username, next.title || next.youtube_id);
    db.prepare("INSERT INTO messages (user_id,username,role,message) VALUES (?,?,?,?)").run(0,'SYSTEM','system',`🎧 ${req.session.username} กำลังเล่น "${next.title}"`);
    res.json({ success: true, next });
});

// Stage management
app.post('/api/stage/on', requireDJ, (req, res) => {
    const dj = db.prepare('SELECT avatar_seed, avatar_url FROM users WHERE id=?').get(req.session.userId) || {};
    stageState.active = true;
    stageState.djUsername = req.session.username;
    stageState.djAvatarSeed = dj.avatar_seed || req.session.username;
    stageState.djAvatarUrl = dj.avatar_url || '';
    res.json({ success: true });
});

app.post('/api/stage/off', requireDJ, (req, res) => {
    stageState.active = false;
    stageState.djUsername = null;
    stageState.djAvatarSeed = '';
    stageState.djAvatarUrl = '';
    db.prepare("UPDATE now_playing SET youtube_id='', is_playing=0, paused_elapsed=0 WHERE id=1").run();
    db.prepare("UPDATE queue SET status='pending' WHERE status='playing'").run();
    res.json({ success: true });
});

// ── ROOMS ─────────────────────────────────────────────────────────────
app.get('/api/rooms', (req, res) => {
    const rooms = db.prepare('SELECT * FROM rooms ORDER BY is_default DESC, created_at ASC').all();
    res.json(rooms);
});

app.post('/api/rooms', requireAuth, (req, res) => {
    if (!['dj', 'admin'].includes(req.session.role)) return res.status(403).json({ error: 'เฉพาะ DJ ขึ้นไปเท่านั้น' });
    const rawName = String(req.body.name || '').trim();
    const name = rawName.toLowerCase().replace(/[^a-z0-9ก-๙-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
    if (!name) return res.status(400).json({ error: 'ชื่อห้องไม่ถูกต้อง' });
    const skin = ['pink', 'peach', 'indigo', 'ocher'].includes(req.body.skin) ? req.body.skin : 'pink';
    const id = name + '-' + Date.now();
    try {
        db.prepare('INSERT INTO rooms (id, name, skin, created_by) VALUES (?,?,?,?)').run(id, name, skin, req.session.username);
        res.json({ success: true, id, name, skin });
    } catch {
        res.status(400).json({ error: 'ชื่อห้องนี้มีอยู่แล้ว' });
    }
});

app.delete('/api/rooms/:id', requireAuth, (req, res) => {
    if (!['dj', 'admin'].includes(req.session.role)) return res.status(403).json({ error: 'เฉพาะ DJ ขึ้นไปเท่านั้น' });
    const room = db.prepare('SELECT * FROM rooms WHERE id=?').get(req.params.id);
    if (!room) return res.status(404).json({ error: 'ไม่พบห้อง' });
    if (room.is_default) return res.status(400).json({ error: 'ไม่สามารถลบห้องหลักได้' });
    db.prepare('DELETE FROM rooms WHERE id=?').run(req.params.id);
    res.json({ success: true });
});

// ── MESSAGES ──────────────────────────────────────────────────────────
app.get('/api/messages', (req, res) => {
    const after = parseInt(req.query.after) || 0;
    const roomId = String(req.query.room || 'main-stage').slice(0, 80);
    // On initial load (after=0), only return messages from the last 1 hour
    const cutoff = after === 0
        ? new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
        : '2000-01-01 00:00:00';
    const messages = db.prepare(`
        SELECT messages.*,
            users.avatar_seed, users.avatar_url, users.display_name,
            users.chat_frame as user_chat_frame,
            users.avatar_frame as user_avatar_frame
        FROM messages
        LEFT JOIN users ON users.id = messages.user_id
        WHERE messages.id > ? AND messages.room_id = ? AND messages.created_at >= ?
        ORDER BY messages.created_at ASC
        LIMIT 60
    `).all(after, roomId, cutoff);
    res.json(messages.map(m => ({
        ...m,
        name_color: m.name_color || '',
        chat_color: m.chat_color || '',
        chat_frame: m.chat_frame || m.user_chat_frame || '',
        avatar_frame: m.avatar_frame || m.user_avatar_frame || '',
    })));
});

app.post('/api/messages', requireAuth, (req, res) => {
    const message = String(req.body.message || '').trim();
    const gifUrl = String(req.body.gif_url || '').trim();
    if (!message && !req.body.media_data && !gifUrl) return res.status(400).json({ error: 'Empty message' });
    if (message.length > 300) return res.status(400).json({ error: 'Message too long' });
    const roomId = String(req.body.room_id || 'main-stage').slice(0, 80);
    const roomExists = db.prepare('SELECT id FROM rooms WHERE id=?').get(roomId);
    if (!roomExists) return res.status(400).json({ error: 'ห้องไม่มีอยู่' });
    const user = db.prepare('SELECT role, name_color, chat_color, chat_frame, avatar_frame FROM users WHERE id=?').get(req.session.userId);
    if (req.body.media_data && roleLevel(user.role) < 2)
        return res.status(403).json({ error: 'เฉพาะ VIP ขึ้นไปเท่านั้นที่อัปโหลดรูปได้' });
    let media = { mediaUrl: '', mediaType: '' };
    if (gifUrl && /^https?:\/\/.{3,}/i.test(gifUrl)) {
        media = { mediaUrl: gifUrl, mediaType: 'gif' };
    } else {
        try {
            media = saveChatMedia(req.session.username, req.body.media_data);
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
    }
    const replyToId  = parseInt(req.body.reply_to_id) || 0;
    const replyToName = String(req.body.reply_to_name || '').slice(0, 32);
    const replyToText = String(req.body.reply_to_text || '').slice(0, 120);
    const result = db.prepare('INSERT INTO messages (user_id,username,role,message,media_url,media_type,name_color,chat_color,chat_frame,avatar_frame,room_id,reply_to_id,reply_to_name,reply_to_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(req.session.userId, req.session.username, user.role, message, media.mediaUrl, media.mediaType, user.name_color || '', user.chat_color || '', user.chat_frame || '', user.avatar_frame || '', roomId, replyToId, replyToName, replyToText);
    res.json({ success: true, id: result.lastInsertRowid, media_url: media.mediaUrl, media_type: media.mediaType });
});

// ADMIN
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = db.prepare('SELECT id, username, display_name, role, avatar_seed, avatar_url, vip_expires_at, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
});

app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
    const { role, vip_expires_at } = req.body;
    const validRoles = ['guest', 'member', 'vip', 'dj', 'admin'];
    const user = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (role !== undefined) {
        if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
        db.prepare('UPDATE users SET role=? WHERE id=?').run(role, req.params.id);
    }
    if (vip_expires_at !== undefined) {
        const exp = Number(vip_expires_at) || 0;
        db.prepare('UPDATE users SET vip_expires_at=? WHERE id=?').run(exp, req.params.id);
    }
    res.json({ success: true });
});

// Toggle co-admin (only real admin can grant/revoke)
app.post('/api/admin/users/:id/co-admin', requireRealAdmin, (req, res) => {
    const target = db.prepare('SELECT id, role, can_admin FROM users WHERE id=?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'admin') return res.status(400).json({ error: 'ไม่จำเป็นสำหรับ Admin จริง' });
    if (target.role !== 'dj') return res.status(400).json({ error: 'ให้สิทธิ์ได้เฉพาะ DJ เท่านั้น' });
    const newVal = target.can_admin ? 0 : 1;
    db.prepare('UPDATE users SET can_admin=? WHERE id=?').run(newVal, target.id);
    res.json({ success: true, can_admin: !!newVal });
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

app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
    const newPassword = String(req.body.new_password || '').trim();
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password ต้องมีอย่างน้อย 6 ตัวอักษร' });
    const user = db.prepare('SELECT id, role FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'ไม่สามารถรีเซ็ต Admin ได้' });
    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, user.id);
    res.json({ success: true });
});

// Role upgrade requests
app.post('/api/role-request', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const username = req.session.username;
    const currentRole = req.session.role;
    if (roleLevel(currentRole) >= 1) return res.status(400).json({ error: 'คุณมียศเพียงพอแล้ว' });
    const existing = db.prepare("SELECT id FROM role_requests WHERE user_id=? AND status='pending'").get(userId);
    if (existing) return res.status(400).json({ error: 'คุณส่งคำขออยู่แล้ว กรุณารอการยืนยัน' });
    db.prepare("INSERT INTO role_requests (user_id, username, current_role) VALUES (?,?,?)").run(userId, username, currentRole);
    res.json({ success: true });
});

app.get('/api/admin/role-requests', requireAdmin, (req, res) => {
    const rows = db.prepare("SELECT * FROM role_requests WHERE status='pending' ORDER BY created_at ASC").all();
    res.json(rows);
});

app.post('/api/admin/role-requests/:id/approve', requireAdmin, (req, res) => {
    const row = db.prepare("SELECT * FROM role_requests WHERE id=?").get(req.params.id);
    if (!row) return res.status(404).json({ error: 'ไม่พบคำขอ' });
    db.prepare("UPDATE users SET role='member' WHERE id=?").run(row.user_id);
    db.prepare("UPDATE role_requests SET status='approved' WHERE id=?").run(row.id);
    // Send DM notification
    db.prepare("INSERT INTO direct_messages (from_user, to_user, message) VALUES (?,?,?)").run(
        'ADMIN', row.username, '✅ คำขอยศของคุณได้รับการอนุมัติแล้ว! คุณได้รับยศ Member เรียบร้อยแล้ว'
    );
    res.json({ success: true });
});

app.post('/api/admin/role-requests/:id/reject', requireAdmin, (req, res) => {
    const row = db.prepare("SELECT * FROM role_requests WHERE id=?").get(req.params.id);
    if (!row) return res.status(404).json({ error: 'ไม่พบคำขอ' });
    db.prepare("UPDATE role_requests SET status='rejected' WHERE id=?").run(row.id);
    // Send DM notification
    db.prepare("INSERT INTO direct_messages (from_user, to_user, message) VALUES (?,?,?)").run(
        'ADMIN', row.username, '❌ คำขอยศของคุณถูกปฏิเสธ หากมีข้อสงสัยกรุณาติดต่อแอดมิน'
    );
    res.json({ success: true });
});

// ── VIP Donation System ──────────────────────────────────────────────────

app.get('/api/vip-packages', (req, res) => {
    res.json(VIP_PACKAGES);
});

app.post('/api/vip-donations', requireAuth, (req, res) => {
    const pkgId = String(req.body.package || '');
    const pkg = VIP_PACKAGES.find(p => p.id === pkgId);
    if (!pkg) return res.status(400).json({ error: 'แพ็กเกจไม่ถูกต้อง' });
    const existing = db.prepare("SELECT id FROM vip_donations WHERE user_id=? AND status='pending'").get(req.session.userId);
    if (existing) return res.status(400).json({ error: 'คุณมีคำขออยู่แล้ว กรุณารอการยืนยัน' });
    let slipUrl = '';
    if (req.body.slip_data) {
        try { const saved = saveChatMedia(req.session.username, req.body.slip_data); slipUrl = saved.mediaUrl || ''; }
        catch (e) { return res.status(400).json({ error: 'ไฟล์สลิปไม่ถูกต้อง (รองรับ JPG, PNG, WEBP, GIF)' }); }
    }
    db.prepare('INSERT INTO vip_donations (user_id,username,package,amount,duration_days,slip_url,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(req.session.userId, req.session.username, pkg.id, pkg.price, pkg.days, slipUrl, 'pending', Date.now());
    const admins = db.prepare("SELECT username FROM users WHERE role='admin' OR (role='dj' AND can_admin=1)").all();
    for (const admin of admins) {
        db.prepare("INSERT INTO direct_messages (from_user,to_user,message,created_at) VALUES (?,?,?,?)")
            .run('SYSTEM', admin.username, `💰 @${req.session.username} ส่งสลิปขอ VIP (${pkg.label} · ${pkg.price}฿) รออนุมัติ`, new Date().toISOString());
    }
    res.json({ success: true });
});

app.get('/api/admin/vip-donations', requireAdmin, (req, res) => {
    const rows = db.prepare("SELECT * FROM vip_donations WHERE status='pending' ORDER BY created_at DESC").all();
    res.json(rows);
});

app.post('/api/admin/vip-donations/:id/approve', requireAdmin, (req, res) => {
    const donation = db.prepare('SELECT * FROM vip_donations WHERE id=?').get(req.params.id);
    if (!donation) return res.status(404).json({ error: 'ไม่พบรายการ' });
    const now = Date.now();
    const urow = db.prepare('SELECT vip_expires_at, role FROM users WHERE id=?').get(donation.user_id);
    const base = (urow && urow.role === 'vip' && urow.vip_expires_at > now) ? urow.vip_expires_at : now;
    const newExpiry = base + donation.duration_days * 24 * 60 * 60 * 1000;
    db.prepare("UPDATE users SET role='vip', vip_expires_at=? WHERE id=?").run(newExpiry, donation.user_id);
    db.prepare("UPDATE vip_donations SET status='approved' WHERE id=?").run(donation.id);
    const pkg = VIP_PACKAGES.find(p => p.id === donation.package);
    const expDate = new Date(newExpiry).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    db.prepare("INSERT INTO direct_messages (from_user,to_user,message,created_at) VALUES (?,?,?,?)")
        .run('ADMIN', donation.username, `✅ ยืนยันการโอนแล้ว! คุณได้รับยศ 💎 VIP (${pkg?.label || donation.package}) หมดอายุ ${expDate} ยินดีต้อนรับ 🎉`, new Date().toISOString());
    res.json({ success: true });
});

app.post('/api/admin/vip-donations/:id/reject', requireAdmin, (req, res) => {
    const donation = db.prepare('SELECT * FROM vip_donations WHERE id=?').get(req.params.id);
    if (!donation) return res.status(404).json({ error: 'ไม่พบรายการ' });
    db.prepare("UPDATE vip_donations SET status='rejected' WHERE id=?").run(donation.id);
    db.prepare("INSERT INTO direct_messages (from_user,to_user,message,created_at) VALUES (?,?,?,?)")
        .run('ADMIN', donation.username, `❌ ไม่สามารถยืนยันการโอนได้ กรุณาตรวจสอบสลิปแล้วส่งใหม่ หรือติดต่อแอดมิน`, new Date().toISOString());
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

// ── SOCKET.IO — MIC / VOICE ───────────────────────────────────────────
// In-memory mic state
const micState = {
  isLive: false,
  djSocketId: null,
  djUsername: null,
  djAvatarSeed: null,
  djAvatarUrl: null,
  requestsOpen: false,
  requests: [],  // [{socketId, userId, username, avatar_seed, avatar_url}]
  speakers: [],  // [{socketId, userId, username, avatar_seed, avatar_url}]
};
// typing state per room: roomId → Map of socketId → { username, display_name, timer }
const typingInRoom = new Map();
const stageState = { active: false, djUsername: null, djAvatarSeed: '', djAvatarUrl: '' };
let micAudioHeader = null; // stored for late-joining HTTP stream clients
let micAudioMime = 'audio/webm;codecs=opus';
const micStreamClients = new Set(); // HTTP chunked-stream listeners
const socketToUser = new Map();

// HTTP chunked audio stream — listeners GET this, browser handles buffering
app.get('/api/mic-stream', (req, res) => {
  if (!micState.isLive) return res.status(503).send('Mic is not live');
  if (req.socket) req.socket.setTimeout(0);
  res.setHeader('Content-Type', micAudioMime || 'audio/webm;codecs=opus');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  if (micAudioHeader) {
    const buf = Buffer.isBuffer(micAudioHeader) ? micAudioHeader : Buffer.from(new Uint8Array(micAudioHeader));
    res.write(buf);
  }
  micStreamClients.add(res);
  req.on('close', () => micStreamClients.delete(res));
});

function closeMicStream() {
  for (const res of micStreamClients) { try { res.end(); } catch {} }
  micStreamClients.clear();
}

const io = new Server(httpServer, { cors: { origin: '*' } });

function broadcastTyping(room, excludeSocketId) {
  const roomTyping = typingInRoom.get(room);
  const users = roomTyping ? [...roomTyping.values()].map(t => ({ username: t.username, display_name: t.display_name || t.username })) : [];
  if (excludeSocketId) {
    io.sockets.sockets.forEach((s) => {
      if (s.id !== excludeSocketId) s.emit('chat:typing_update', { room, users });
    });
  } else {
    io.emit('chat:typing_update', { room, users });
  }
}

io.on('connection', (socket) => {
  socket.on('auth', ({ userId, username, role, avatar_seed, avatar_url }) => {
    socketToUser.set(socket.id, { userId, username, role, avatar_seed: avatar_seed || username, avatar_url: avatar_url || '' });
    socket.emit('mic:status', micState);
  });

  socket.on('mic:start', () => {
    const user = socketToUser.get(socket.id);
    if (!user || (user.role !== 'dj' && user.role !== 'admin')) return;
    micState.isLive = true;
    micState.djSocketId = socket.id;
    micState.djUsername = user.username;
    micState.djAvatarSeed = user.avatar_seed || user.username;
    micState.djAvatarUrl = user.avatar_url || '';
    micAudioHeader = null;
    io.emit('mic:status', micState);
  });

  socket.on('mic:stop', () => {
    if (socket.id !== micState.djSocketId) return;
    micState.isLive = false;
    micState.djSocketId = null;
    micState.djUsername = null;
    micState.djAvatarSeed = null;
    micState.djAvatarUrl = null;
    micState.requestsOpen = false;
    micState.requests = [];
    micState.speakers = [];
    micAudioHeader = null;
    closeMicStream();
    io.emit('mic:status', micState);
  });

  // Relay MediaRecorder chunks to Socket.IO listeners + HTTP stream clients
  socket.on('mic:audio_header', ({ header, mime }) => {
    if (socket.id !== micState.djSocketId) return;
    micAudioMime = mime || 'audio/webm;codecs=opus';
    micAudioHeader = header;
    const buf = Buffer.isBuffer(header) ? header : Buffer.from(new Uint8Array(header));
    // Relay via Socket.IO (primary — low latency)
    socket.broadcast.emit('mic:audio_header', { header: buf, mime: micAudioMime });
    // Relay via HTTP chunked stream (fallback)
    for (const res of micStreamClients) {
      try { res.write(buf); } catch { micStreamClients.delete(res); }
    }
  });

  socket.on('mic:audio_chunk', (chunk) => {
    if (socket.id !== micState.djSocketId) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(new Uint8Array(chunk));
    // Relay via Socket.IO (primary — low latency)
    socket.broadcast.emit('mic:audio_chunk', buf);
    // Relay via HTTP chunked stream (fallback)
    for (const res of micStreamClients) {
      try { res.write(buf); } catch { micStreamClients.delete(res); }
    }
  });

  // Late-joiner requests stored header
  socket.on('mic:request_header', () => {
    if (micAudioHeader && micState.isLive) {
      const buf = Buffer.isBuffer(micAudioHeader) ? micAudioHeader : Buffer.from(new Uint8Array(micAudioHeader));
      socket.emit('mic:audio_header', { header: buf, mime: micAudioMime });
    }
  });

  // DJ toggles whether listeners can request to speak
  socket.on('mic:toggle_requests', () => {
    if (socket.id !== micState.djSocketId) return;
    micState.requestsOpen = !micState.requestsOpen;
    io.emit('mic:status', micState);
  });

  // Raise hand — only allowed when DJ has opened requests
  socket.on('hand:raise', () => {
    const user = socketToUser.get(socket.id);
    if (!user || !micState.isLive || !micState.requestsOpen) return;
    if (!micState.requests.find(r => r.socketId === socket.id) && !micState.speakers.find(s => s.socketId === socket.id)) {
      micState.requests.push({ socketId: socket.id, userId: user.userId, username: user.username, avatar_seed: user.avatar_seed, avatar_url: user.avatar_url });
      io.emit('mic:status', micState);
    }
  });

  socket.on('hand:lower', () => {
    micState.requests = micState.requests.filter(r => r.socketId !== socket.id);
    micState.speakers = micState.speakers.filter(s => s.socketId !== socket.id);
    io.emit('mic:status', micState);
  });

  socket.on('hand:approve', ({ socketId }) => {
    if (socket.id !== micState.djSocketId) return;
    const req = micState.requests.find(r => r.socketId === socketId);
    if (req) {
      micState.requests = micState.requests.filter(r => r.socketId !== socketId);
      micState.speakers.push({ ...req });
      io.to(socketId).emit('mic:approved');
      io.emit('mic:status', micState);
    }
  });

  socket.on('hand:reject', ({ socketId }) => {
    if (socket.id !== micState.djSocketId) return;
    micState.requests = micState.requests.filter(r => r.socketId !== socketId);
    io.to(socketId).emit('mic:rejected');
    io.emit('mic:status', micState);
  });

  socket.on('hand:remove', ({ socketId }) => {
    if (socket.id !== micState.djSocketId) return;
    micState.speakers = micState.speakers.filter(s => s.socketId !== socketId);
    io.to(socketId).emit('mic:removed');
    io.emit('mic:status', micState);
  });

  // ── WebRTC signaling ──────────────────────────────────────────────────
  socket.on('mic:sync', () => {
    socket.emit('mic:status', micState);
  });

  // Typing indicator
  socket.on('chat:typing', ({ room, username: clientUsername, display_name: clientDisplayName }) => {
    const user = socketToUser.get(socket.id);
    const uname = (user && user.username) || clientUsername;
    const dname = (user && (user.display_name || user.username)) || clientDisplayName || uname;
    if (!uname || !room) return;
    if (!typingInRoom.has(room)) typingInRoom.set(room, new Map());
    const roomTyping = typingInRoom.get(room);
    const existing = roomTyping.get(socket.id);
    if (existing?.timer) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      roomTyping.delete(socket.id);
      broadcastTyping(room);
    }, 4000);
    roomTyping.set(socket.id, { username: uname, display_name: dname, timer });
    broadcastTyping(room, socket.id);
  });

  socket.on('chat:stop_typing', ({ room }) => {
    if (!room) return;
    const roomTyping = typingInRoom.get(room);
    if (!roomTyping) return;
    const existing = roomTyping.get(socket.id);
    if (existing?.timer) clearTimeout(existing.timer);
    roomTyping.delete(socket.id);
    broadcastTyping(room, socket.id);
  });

  socket.on('rtc:request', () => {
    if (micState.isLive && micState.djSocketId && socket.id !== micState.djSocketId) {
      io.to(micState.djSocketId).emit('rtc:new-listener', { listenerSocketId: socket.id });
    }
  });

  socket.on('rtc:offer', ({ listenerSocketId, offer }) => {
    io.to(listenerSocketId).emit('rtc:offer', { djSocketId: socket.id, offer });
  });

  socket.on('rtc:answer', ({ djSocketId, answer }) => {
    io.to(djSocketId).emit('rtc:answer', { listenerSocketId: socket.id, answer });
  });

  socket.on('rtc:ice', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('rtc:ice', { fromSocketId: socket.id, candidate });
  });

  socket.on('user:frame_update', ({ username, chat_frame, avatar_frame }) => {
    if (typeof username !== 'string') return;
    const payload = { username };
    if (chat_frame !== undefined) payload.chat_frame = chat_frame || '';
    if (avatar_frame !== undefined) payload.avatar_frame = avatar_frame || '';
    socket.broadcast.emit('user:frame_update', payload);
  });

  socket.on('disconnect', () => {
    const sid = socket.id;
    // Notify DJ when a listener leaves so it can clean up its RTCPeerConnection
    if (micState.isLive && micState.djSocketId && micState.djSocketId !== sid) {
      io.to(micState.djSocketId).emit('rtc:listener-left', { listenerSocketId: sid });
    }
    micState.requests = micState.requests.filter(r => r.socketId !== sid);
    micState.speakers = micState.speakers.filter(s => s.socketId !== sid);
    if (micState.djSocketId === sid) {
      micState.isLive = false;
      micState.djSocketId = null;
      micState.requests = [];
      micState.speakers = [];
      micAudioHeader = null;
      closeMicStream();
    }
    io.emit('mic:status', micState);
    // Clear typing state for disconnected socket
    typingInRoom.forEach((roomTyping, room) => {
      const entry = roomTyping.get(sid);
      if (entry) {
        if (entry.timer) clearTimeout(entry.timer);
        roomTyping.delete(sid);
        broadcastTyping(room);
      }
    });
    socketToUser.delete(sid);
  });
});

httpServer.listen(PORT, () => {
    console.log(`\n📻 IIMVU Society Radio running at http://localhost:${PORT}\n`);
});
