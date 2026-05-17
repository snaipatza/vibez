// Admin Panel - real management tools
function AdminPage({ user, listeners, chatOpen, setChatOpen, toast }) {
  const { useState, useEffect } = React;
  const [tab, setTab] = useState('dashboard');
  const [roleRequests, setRoleRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [ads, setAds] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [adForm, setAdForm] = useState({
    title: '',
    body: '',
    cta_text: '',
    cta_url: '',
    image_url: '',
  });

  const loadAll = () => {
    fetch('/api/admin/stats').then(r => r.json()).then(setStats).catch(() => {});
    fetch('/api/admin/users').then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d); }).catch(() => {});
    fetch('/api/queue').then(r => r.json()).then(d => { if (Array.isArray(d)) setQueue(d); }).catch(() => {});
    fetch('/api/online').then(r => r.json()).then(d => { if (d.users) setOnlineUsers(d.users); }).catch(() => {});
    fetch('/api/admin/ads').then(r => r.json()).then(d => { if (Array.isArray(d)) setAds(d); }).catch(() => {});
    fetch('/api/admin/role-requests').then(r => r.json()).then(d => { if (Array.isArray(d)) setRoleRequests(d); }).catch(() => {});
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));

  const setRole = async (id, role) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      setUsers(us => us.map(u => u.id === id ? { ...u, role } : u));
      toast(`อัปเดตสิทธิ์เป็น ${role}`, 'success');
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  const setVipExpiry = async (id, dateStr) => {
    const ts = dateStr ? new Date(dateStr).setHours(23, 59, 59, 0) : 0;
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vip_expires_at: ts }),
      });
      if (!res.ok) { toast('อัปเดตวันหมดอายุไม่สำเร็จ'); return; }
      setUsers(us => us.map(u => u.id === id ? { ...u, vip_expires_at: ts } : u));
      toast(dateStr ? `ตั้งวันหมดอายุ VIP แล้ว` : 'ล้างวันหมดอายุแล้ว', 'success');
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  const removeUser = async (id) => {
    if (!confirm('ลบผู้ใช้นี้?')) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      setUsers(us => us.filter(u => u.id !== id));
      toast('ลบผู้ใช้แล้ว', 'success');
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  const removeQueue = async (id) => {
    try {
      const res = await fetch(`/api/queue/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setQueue(q => q.filter(x => x.id !== id));
      toast('ลบออกจากคิวแล้ว', 'success');
    } catch {}
  };

  const skipQueue = async (id) => {
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'skipped' }),
      });
      if (!res.ok) return;
      setQueue(q => q.filter(x => x.id !== id));
      toast('ข้ามเพลงแล้ว', 'success');
    } catch {}
  };

  const playQueue = async (item) => {
    if (!item.youtube_id) {
      toast('รายการนี้ยังไม่มี YouTube link');
      return;
    }
    try {
      const res = await fetch('/api/now-playing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          youtube_id: item.youtube_id,
          title: item.title,
          artist: item.artist,
          thumbnail: item.thumbnail,
          youtube_url: item.youtube_url,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      toast(`กำลังเล่น ${item.title}`, 'success');
      loadAll();
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  const toggleAd = async (ad) => {
    try {
      const res = await fetch(`/api/admin/ads/${ad.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: ad.active ? 0 : 1 }),
      });
      const d = await res.json();
      if (!res.ok) { toast(d.error || 'เกิดข้อผิดพลาด'); return; }
      setAds(prev => prev.map(a => a.id === ad.id ? { ...a, active: ad.active ? 0 : 1 } : a));
      toast(ad.active ? 'ปิดโฆษณาแล้ว' : 'เปิดโฆษณาแล้ว', 'success');
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  const createAd = async (e) => {
    e.preventDefault();
    if (!adForm.title.trim()) {
      toast('กรุณาใส่หัวข้อโฆษณา');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: adForm.title.trim(),
          body: adForm.body.trim(),
          cta_text: adForm.cta_text.trim(),
          cta_url: adForm.cta_url.trim(),
          image_url: adForm.image_url.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      setAdForm({ title: '', body: '', cta_text: '', cta_url: '', image_url: '' });
      toast('สร้างโฆษณาแล้ว', 'success');
      loadAll();
    } catch { toast('เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  return (
    <>
      <TopBar
        crumb="CONTROL ROOM / ADMIN"
        title="Dashboard"
        meta="เครื่องมือดูแล IIMVU Society Radio"
        listeners={listeners}
        onToggleChat={() => setChatOpen(v => !v)}
        chatOpen={chatOpen}
      />

      <div className="content no-chat">
        <div className="stage">
          <div className="tabs" style={{ marginBottom: 28 }}>
            {['dashboard','users','queue','ads','online'].map(t => (
              <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'dashboard' && 'Dashboard'}
                {t === 'users' && 'ผู้ใช้'}
                {t === 'queue' && 'คิวเพลง'}
                {t === 'ads' && 'โฆษณา'}
                {t === 'online' && 'ออนไลน์'}
              </button>
            ))}
            <button className={`tab-btn ${tab === 'role-requests' ? 'active' : ''}`} onClick={() => setTab('role-requests')}>
              ขอยศ {roleRequests.length > 0 && <span className="tab-badge">{roleRequests.length}</span>}
            </button>
          </div>

          {tab === 'dashboard' && (
            <>
              <div className="admin-grid">
                <div className="admin-stat dark">
                  <div className="label">Total Users</div>
                  <div className="v">{stats?.totalUsers ?? '...'}</div>
                  <div className="delta">ผู้ใช้ทั้งหมด</div>
                </div>
                <div className="admin-stat">
                  <div className="label">Messages Total</div>
                  <div className="v">{stats?.totalMessages ?? '...'}</div>
                  <div className="delta">ข้อความในระบบ</div>
                </div>
                <div className="admin-stat">
                  <div className="label">Songs in Queue</div>
                  <div className="v">{stats?.totalQueue ?? '...'}</div>
                  <div className="delta">คำขอเพลงทั้งหมด</div>
                </div>
                <div className="admin-stat">
                  <div className="label">Live Status</div>
                  <div className="v" style={{ color: stats?.nowPlaying?.youtube_id ? 'var(--orange)' : 'var(--ink-3)' }}>
                    {stats?.nowPlaying?.youtube_id ? 'ON AIR' : 'OFFLINE'}
                  </div>
                  <div className="delta">{listeners} online now</div>
                </div>
              </div>

              {stats?.nowPlaying?.youtube_id && (
                <div className="admin-card">
                  <div className="admin-card-head">
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>- Now Playing</div>
                      <h3>{stats.nowPlaying.title || 'Unknown'}</h3>
                    </div>
                    <span className="tag orange">ON AIR</span>
                  </div>
                  <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
                    {stats.nowPlaying.artist && <div>ศิลปิน: {stats.nowPlaying.artist}</div>}
                    <div>DJ: {stats.nowPlaying.dj_username}</div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'users' && (
            <div className="admin-card">
              <div className="admin-card-head">
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>- Manage</div>
                  <h3>ผู้ใช้ทั้งหมด ({filtered.length})</h3>
                </div>
                <div className="search-field" style={{ width: 280 }}>
                  <i className="fas fa-search"></i>
                  <input placeholder="ค้นหาผู้ใช้..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>
              <table className="admin-table">
                <thead>
                  <tr><th>ผู้ใช้</th><th>สิทธิ์</th><th>วันที่สมัคร</th><th>จัดการ</th></tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div className="user">
                          <img src={u.avatar_url || AVATAR(u.avatar_seed || u.username)} alt="" />
                          <div>
                            <div style={{ fontWeight: 600 }}>@{u.username}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>uid_{u.id}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={`role-tag ${u.role}`}>{
                        {admin:'🛡 Admin',dj:'🎧 DJ',vip:'💎 VIP',member:'👤 Member',user:'👤 Member',guest:'🌍 Guest'}[u.role] || u.role
                      }</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 11 }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('th-TH') : '-'}
                      </td>
                      <td>
                        <div className="row-actions">
                          {u.role !== 'admin' && (
                            <>
                              <select
                                className="btn-mini"
                                value={u.role === 'user' ? 'member' : u.role}
                                onChange={e => setRole(u.id, e.target.value)}
                                style={{ cursor: 'pointer' }}
                              >
                                <option value="guest">🌍 Guest</option>
                                <option value="member">👤 Member</option>
                                <option value="vip">💎 VIP</option>
                                <option value="dj">🎧 DJ</option>
                              </select>
                              {u.role === 'vip' && (
                                <input
                                  type="date"
                                  className="btn-mini"
                                  title="วันหมดอายุ VIP"
                                  style={{ cursor: 'pointer', minWidth: 130 }}
                                  value={u.vip_expires_at ? new Date(u.vip_expires_at).toISOString().slice(0,10) : ''}
                                  onChange={e => setVipExpiry(u.id, e.target.value)}
                                />
                              )}
                              {u.id !== user.id && (
                                <button className="btn-mini danger" onClick={() => removeUser(u.id)}>Ban</button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'queue' && (
            <div className="admin-card">
              <div className="admin-card-head">
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>- Now playing & next</div>
                  <h3>คิวเพลง ({queue.length})</h3>
                </div>
              </div>
              <div className="queue">
                {queue.length === 0 && (
                  <div style={{ padding: '20px', color: 'var(--ink-mute)', fontSize: 13 }}>ไม่มีเพลงในคิว</div>
                )}
                {queue.map((q, i) => (
                  <div key={q.id} className="queue-row">
                    <div className="pos">{q.status === 'playing' ? '▶' : String(i + 1).padStart(2, '0')}</div>
                    <div className="info">
                      <div className="t">{q.title}</div>
                      <div className="a">{q.artist || '-'}</div>
                    </div>
                    <div className="req">
                      <img src={AVATAR(q.requested_by || 'user')} alt="" />
                      <span>@{q.requested_by}</span>
                    </div>
                    <div className="row-actions">
                      {q.youtube_url && <a className="btn-mini" href={q.youtube_url} target="_blank" rel="noreferrer">YouTube</a>}
                      <button className="btn-mini" onClick={() => skipQueue(q.id)}>SKIP</button>
                      <button className="btn-mini danger" onClick={() => removeQueue(q.id)}>REMOVE</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'ads' && (
            <div className="admin-card">
              <div className="admin-card-head">
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>- Promotions</div>
                  <h3>โฆษณาและร้านค้า ({ads.length})</h3>
                </div>
              </div>

              <form onSubmit={createAd} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
                <div className="field">
                  <label>Title</label>
                  <input value={adForm.title} onChange={e => setAdForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="field">
                  <label>CTA text</label>
                  <input value={adForm.cta_text} onChange={e => setAdForm(f => ({ ...f, cta_text: e.target.value }))} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Body</label>
                  <input value={adForm.body} onChange={e => setAdForm(f => ({ ...f, body: e.target.value }))} />
                </div>
                <div className="field">
                  <label>CTA URL</label>
                  <input value={adForm.cta_url} onChange={e => setAdForm(f => ({ ...f, cta_url: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Image URL</label>
                  <input value={adForm.image_url} onChange={e => setAdForm(f => ({ ...f, image_url: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <button className="btn-mini solid" type="submit" disabled={loading}>
                    {loading ? 'Saving...' : 'Create Ad'}
                  </button>
                </div>
              </form>

              {ads.length === 0 && (
                <div style={{ padding: '20px', color: 'var(--ink-mute)', fontSize: 13 }}>ยังไม่มีโฆษณา</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                {ads.map(ad => (
                  <div key={ad.id} style={{ border: '1px solid var(--line)', padding: 18, borderRadius: 3, background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 10 }}>
                      <span className={`tag ${ad.active ? 'orange' : ''}`}>{ad.active ? 'ACTIVE' : 'PAUSED'}</span>
                    </div>
                    <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{ad.title}</h4>
                    <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 }}>{ad.body}</p>
                    <div className="row-actions">
                      <button className="btn-mini" onClick={() => toggleAd(ad)}>{ad.active ? 'PAUSE' : 'ACTIVATE'}</button>
                      {ad.cta_url && <a className="btn-mini" href={ad.cta_url} target="_blank" rel="noreferrer">Open</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'role-requests' && (
          <div className="admin-section">
            <h3>คำขอยศ Member ({roleRequests.length})</h3>
            {roleRequests.length === 0 ? (
              <div style={{ color: 'var(--ink-3)', padding: 20 }}>ไม่มีคำขอที่รอดำเนินการ</div>
            ) : (
              <div className="role-req-list">
                {roleRequests.map(r => (
                  <div key={r.id} className="role-req-row">
                    <div className="role-req-info">
                      <span className="role-req-name">@{r.username}</span>
                      <span className="role-req-meta">ยศปัจจุบัน: {r.current_role} · {new Date(r.created_at).toLocaleDateString('th-TH')}</span>
                    </div>
                    <div className="role-req-actions">
                      <button className="btn-approve" onClick={async () => {
                        const res = await fetch(`/api/admin/role-requests/${r.id}/approve`, { method: 'POST' });
                        if (res.ok) { toast(`อนุมัติ @${r.username} เป็น Member แล้ว`, 'success'); loadAll(); }
                        else toast('เกิดข้อผิดพลาด');
                      }}>อนุมัติ</button>
                      <button className="btn-reject" onClick={async () => {
                        const res = await fetch(`/api/admin/role-requests/${r.id}/reject`, { method: 'POST' });
                        if (res.ok) { toast(`ปฏิเสธคำขอของ @${r.username}`, ''); loadAll(); }
                        else toast('เกิดข้อผิดพลาด');
                      }}>ปฏิเสธ</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

          {tab === 'online' && (
            <div className="admin-card">
              <div className="admin-card-head">
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>- Live</div>
                  <h3>ผู้ใช้ออนไลน์ ({onlineUsers.length})</h3>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {onlineUsers.map(u => (
                  <div key={u.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--line-faint)', borderRadius: 3, background: 'var(--bg-card)' }}>
                    <div style={{ position: 'relative', width: 32, height: 32 }}>
                      <img
                        src={u.avatar_url || AVATAR(u.avatar_seed || u.username)}
                        alt=""
                        style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--orange-soft)' }}
                      />
                      <div style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, background: 'var(--green)', borderRadius: '50%', border: '2px solid #fff' }}></div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>@{u.username}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase' }}>{u.role}</div>
                    </div>
                  </div>
                ))}
                {onlineUsers.length === 0 && (
                  <div style={{ color: 'var(--ink-mute)', fontSize: 13, gridColumn: '1/-1', padding: 20 }}>ไม่มีผู้ใช้ออนไลน์</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

window.AdminPage = AdminPage;
