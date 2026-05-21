// โ”€โ”€ ADMIN PANEL โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
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
            if (tab === 'ads') loadAds();
            if (tab === 'online') loadOnlineUsers();
        });
    });
}

async function loadDashboard() {
    const stats = await api('/api/admin/stats');
    document.getElementById('statUsers').textContent = stats.totalUsers ?? '-';
    document.getElementById('statMessages').textContent = stats.totalMessages ?? '-';
    document.getElementById('statQueue').textContent = stats.totalQueue ?? '-';
    const np = stats.nowPlaying;
    document.getElementById('statLive').textContent = np?.youtube_id ? `๐�”ด ${np.title || 'เธ�เธณเธฅเธฑเธ�เน€เธฅเน�เธ�'}` : 'โ�ซ เน�เธกเน�เธกเธตเธ�เธฒเธฃเน€เธฅเน�เธ�';
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
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px">เน�เธกเน�เธ�เธ�เธ�เธนเน�เน�เธ�เน�</td></tr>';
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
                <button class="save-role-btn" onclick="saveRole(${u.id})">เธ�เธฑเธ�เธ—เธถเธ�</button>
            </td>
            <td style="color:var(--text-muted);font-size:12px">${new Date(u.created_at).toLocaleDateString('th-TH')}</td>
            <td>
                <button class="delete-user-btn" onclick="deleteUser(${u.id}, '${escHtml(u.username)}')">
                    <i class="fas fa-trash"></i> เธฅเธ�
                </button>
            </td>
        </tr>`).join('');
}

async function saveRole(userId) {
    const role = document.getElementById(`role-${userId}`).value;
    const data = await api(`/api/admin/users/${userId}`, 'PATCH', { role });
    if (data.error) showToast('error', data.error);
    else { showToast('success', `เน€เธ�เธฅเธตเน�เธขเธ�เธขเธจเน€เธ�เน�เธ� ${role.toUpperCase()} เน�เธฅเน�เธง`); await loadUsers(); }
}

async function deleteUser(userId, username) {
    if (!confirm(`เธฅเธ�เธ�เธนเน�เน�เธ�เน� "${username}" เธญเธญเธ�เธ�เธฒเธ�เธฃเธฐเธ�เธ�?`)) return;
    const data = await api(`/api/admin/users/${userId}`, 'DELETE');
    if (data.error) showToast('error', data.error);
    else { showToast('success', `เธฅเธ�เธ�เธนเน�เน�เธ�เน� ${username} เน�เธฅเน�เธง`); await loadUsers(); }
}

async function loadQueue() {
    const queue = await api('/api/queue');
    const list = document.getElementById('adminQueueList');
    if (!Array.isArray(queue) || !queue.length) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">เน�เธกเน�เธกเธตเน€เธ�เธฅเธ�เน�เธ�เธ�เธดเธง</p>';
        return;
    }
    list.innerHTML = queue.map(item => `
        <div class="admin-queue-item">
            ${item.thumbnail ? `<img class="admin-queue-thumb" src="${escHtml(item.thumbnail)}" alt="">` : ''}
            <div class="admin-queue-info">
                <div class="admin-queue-title">${escHtml(item.title)}</div>
                <div class="admin-queue-artist">${escHtml(item.artist)} โ€ข เธ�เธญเน�เธ”เธข @${escHtml(item.requested_by)}</div>
            </div>
            <span class="admin-queue-status ${item.status === 'playing' ? 'status-playing' : 'status-pending'}">
                ${item.status === 'playing' ? '๐�”ด เธ�เธณเธฅเธฑเธ�เน€เธฅเน�เธ�' : 'โ�ณ เธฃเธญ'}
            </span>
            <span style="font-size:13px;font-weight:700;color:var(--accent-primary)">โ–ฒ ${item.votes}</span>
        </div>`).join('');
}

// โ”€โ”€ ADS โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
let editingAdId = null;

async function loadAds() {
    const ads = await api('/api/admin/ads');
    const list = document.getElementById('adsList');
    if (!Array.isArray(ads) || !ads.length) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">เธขเธฑเธ�เน�เธกเน�เธกเธตเน�เธ�เธฉเธ“เธฒ โ€” เธ�เธ”เน€เธ�เธดเน�เธกเน�เธ�เธฉเธ“เธฒเธ”เน�เธฒเธ�เธ�เธ�</p>';
    } else {
        list.innerHTML = ads.map(ad => `
            <div class="ad-admin-card ${ad.active ? 'ad-active' : ''}">
                <div class="ad-admin-status">${ad.active ? '<span class="ad-on-badge">๐��ข เธ�เธณเธฅเธฑเธ�เน�เธชเธ”เธ�</span>' : '<span class="ad-off-badge">โ�ซ เธ�เธดเธ”เธญเธขเธนเน�</span>'}</div>
                ${ad.image_url ? `<img class="ad-admin-img" src="${escHtml(ad.image_url)}" alt="">` : ''}
                <div class="ad-admin-info">
                    <div class="ad-admin-title">${escHtml(ad.title)}</div>
                    <div class="ad-admin-body">${escHtml(ad.body)}</div>
                    <a class="ad-admin-link" href="${escHtml(ad.cta_url)}" target="_blank">${escHtml(ad.cta_text)} โ�’</a>
                </div>
                <div class="ad-admin-actions">
                    ${ad.active
                        ? `<button class="save-role-btn" onclick="setAdActive(${ad.id},0)">เธ�เธดเธ”</button>`
                        : `<button class="save-role-btn" onclick="setAdActive(${ad.id},1)">เน€เธ�เธดเธ”เน�เธชเธ”เธ�</button>`}
                    <button class="delete-user-btn" onclick="deleteAd(${ad.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>`).join('');
    }
    // setup form
    document.getElementById('showAdFormBtn').onclick = () => {
        document.getElementById('adFormCard').style.display = 'block';
        document.getElementById('showAdFormBtn').style.display = 'none';
    };
    document.getElementById('adFormCancel').onclick = () => {
        document.getElementById('adFormCard').style.display = 'none';
        document.getElementById('showAdFormBtn').style.display = 'flex';
        clearAdForm();
    };
    document.getElementById('adFormSave').onclick = saveAd;
}

function clearAdForm() {
    ['adFormTitle','adFormBody','adFormCta','adFormUrl','adFormImg'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = id === 'adFormCta' ? 'เธ�เธฅเธดเธ�เธ”เธน' : '';
    });
}

async function saveAd() {
    const payload = {
        title: document.getElementById('adFormTitle').value.trim(),
        body: document.getElementById('adFormBody').value.trim(),
        cta_text: document.getElementById('adFormCta').value.trim() || 'เธ�เธฅเธดเธ�เธ”เธน',
        cta_url: document.getElementById('adFormUrl').value.trim() || '#',
        image_url: document.getElementById('adFormImg').value.trim()
    };
    if (!payload.title) { showToast('error', 'เธ�เธฃเธธเธ“เธฒเน�เธชเน�เธซเธฑเธงเธ�เน�เธญ'); return; }
    const data = await api('/api/admin/ads', 'POST', payload);
    if (data.error) { showToast('error', data.error); return; }
    showToast('success', 'เน€เธ�เธดเน�เธกเน�เธ�เธฉเธ“เธฒเน�เธฅเน�เธง');
    clearAdForm();
    document.getElementById('adFormCard').style.display = 'none';
    document.getElementById('showAdFormBtn').style.display = 'flex';
    await loadAds();
}

async function setAdActive(id, active) {
    const data = await api(`/api/admin/ads/${id}`, 'PATCH', { active });
    if (data.error) { showToast('error', data.error); return; }
    showToast('success', active ? '๐��ข เน€เธ�เธดเธ”เน�เธ�เธฉเธ“เธฒเน�เธฅเน�เธง' : 'โ�ซ เธ�เธดเธ”เน�เธ�เธฉเธ“เธฒเน�เธฅเน�เธง');
    await loadAds();
}

async function deleteAd(id) {
    if (!confirm('เธฅเธ�เน�เธ�เธฉเธ“เธฒเธ�เธตเน�?')) return;
    await api(`/api/admin/ads/${id}`, 'DELETE');
    showToast('success', 'เธฅเธ�เน�เธ�เธฉเธ“เธฒเน�เธฅเน�เธง');
    await loadAds();
}

// โ”€โ”€ ONLINE USERS โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
async function loadOnlineUsers() {
    const data = await api('/api/online');
    const el = document.getElementById('adminOnlineCount');
    const list = document.getElementById('adminOnlineList');
    if (!data || !data.users) return;
    if (el) el.textContent = `${data.online} เธ�เธ�เธญเธญเธ�เน�เธฅเธ�เน�`;
    const roleMap = { admin: ['role-admin-badge','ADMIN'], dj: ['role-dj-badge','DJ'], vip: ['role-vip-badge','VIP'] };
    if (!data.users.length) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;grid-column:1/-1">เน�เธกเน�เธกเธตเธ�เธ�เธญเธญเธ�เน�เธฅเธ�เน�เน�เธ�เธ�เธ“เธฐเธ�เธตเน�</p>';
        return;
    }
    list.innerHTML = data.users.map(u => {
        const [cls, txt] = roleMap[u.role] || [];
        const badge = cls ? `<span class="online-user-role-badge ${cls}">${txt}</span>` : '';
        return `<div class="admin-online-card">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.avatar_seed||u.username)}" alt="">
            <div class="admin-online-name">${escHtml(u.username)}</div>
            ${badge}
            <span class="online-dot-sm"></span>
        </div>`;
    }).join('');
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
