// ── ADMIN PANEL ────────────────────────────────────────────────────────
async function api(url, method = 'GET', body = null) {
    const opts = { method, headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    try { const r = await fetch(url, opts); return await r.json(); } catch { return {}; }
}

async function init() {
    const me = await api('/api/me');
    if (!me.loggedIn || me.role !== 'admin') {
        window.location.href = '/login.html';
        return;
    }
    setupNav();
    loadDashboard();
}

function setupNav() {
    document.querySelectorAll('.admin-nav-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            item.classList.add('active');
            const tab = item.dataset.tab;
            document.getElementById(`tab-${tab}`).classList.add('active');
            if (tab === 'dashboard') loadDashboard();
            if (tab === 'users') loadUsers();
            if (tab === 'queue') loadQueue();
        });
    });
}

async function loadDashboard() {
    const stats = await api('/api/admin/stats');
    document.getElementById('statUsers').textContent = stats.totalUsers ?? '-';
    document.getElementById('statMessages').textContent = stats.totalMessages ?? '-';
    document.getElementById('statQueue').textContent = stats.totalQueue ?? '-';
    const np = stats.nowPlaying;
    document.getElementById('statLive').textContent = np?.youtube_id ? `🔴 ${np.title || 'กำลังเล่น'}` : '⚫ ไม่มีการเล่น';
}

let allUsers = [];
async function loadUsers() {
    allUsers = await api('/api/admin/users');
    renderUsers(allUsers);
    document.getElementById('userSearch').oninput = () => {
        const q = document.getElementById('userSearch').value.toLowerCase();
        renderUsers(allUsers.filter(u => u.username.toLowerCase().includes(q)));
    };
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    const roles = ['user', 'vip', 'dj', 'admin'];
    if (!Array.isArray(users) || !users.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px">ไม่พบผู้ใช้</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>
                <div class="user-cell">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.username)}" alt="">
                    <div>
                        <div class="user-cell-name">${escHtml(u.username)}</div>
                        <div style="font-size:11px;color:var(--text-muted)">ID: ${u.id}</div>
                    </div>
                </div>
            </td>
            <td>
                <select class="role-select role-${u.role}" id="role-${u.id}" onchange="this.className='role-select role-'+this.value">
                    ${roles.map(r => `<option value="${r}" ${u.role===r?'selected':''}>${r.toUpperCase()}</option>`).join('')}
                </select>
                <button class="save-role-btn" onclick="saveRole(${u.id})">บันทึก</button>
            </td>
            <td style="color:var(--text-muted);font-size:12px">${new Date(u.created_at).toLocaleDateString('th-TH')}</td>
            <td>
                <button class="delete-user-btn" onclick="deleteUser(${u.id}, '${escHtml(u.username)}')">
                    <i class="fas fa-trash"></i> ลบ
                </button>
            </td>
        </tr>`).join('');
}

async function saveRole(userId) {
    const role = document.getElementById(`role-${userId}`).value;
    const data = await api(`/api/admin/users/${userId}`, 'PATCH', { role });
    if (data.error) showToast('error', data.error);
    else { showToast('success', `เปลี่ยนยศเป็น ${role.toUpperCase()} แล้ว`); await loadUsers(); }
}

async function deleteUser(userId, username) {
    if (!confirm(`ลบผู้ใช้ "${username}" ออกจากระบบ?`)) return;
    const data = await api(`/api/admin/users/${userId}`, 'DELETE');
    if (data.error) showToast('error', data.error);
    else { showToast('success', `ลบผู้ใช้ ${username} แล้ว`); await loadUsers(); }
}

async function loadQueue() {
    const queue = await api('/api/queue');
    const list = document.getElementById('adminQueueList');
    if (!Array.isArray(queue) || !queue.length) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">ไม่มีเพลงในคิว</p>';
        return;
    }
    list.innerHTML = queue.map(item => `
        <div class="admin-queue-item">
            ${item.thumbnail ? `<img class="admin-queue-thumb" src="${escHtml(item.thumbnail)}" alt="">` : ''}
            <div class="admin-queue-info">
                <div class="admin-queue-title">${escHtml(item.title)}</div>
                <div class="admin-queue-artist">${escHtml(item.artist)} • ขอโดย @${escHtml(item.requested_by)}</div>
            </div>
            <span class="admin-queue-status ${item.status === 'playing' ? 'status-playing' : 'status-pending'}">
                ${item.status === 'playing' ? '🔴 กำลังเล่น' : '⏳ รอ'}
            </span>
            <span style="font-size:13px;font-weight:700;color:var(--accent-primary)">▲ ${item.votes}</span>
        </div>`).join('');
}

function showToast(type, msg) {
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fas ${icons[type]||'fa-info-circle'}"></i><span>${escHtml(msg)}</span>`;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
