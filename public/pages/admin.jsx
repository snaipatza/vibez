// Admin Panel — wired to real APIs
function AdminPage({ user, listeners, chatOpen, setChatOpen, toast }) {
  const { useState, useEffect } = React;
  const [tab, setTab] = useState('dashboard');
  const [users, setUsers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [ads, setAds] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Load stats and users on mount
  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(setStats).catch(() => {});
    fetch('/api/admin/users').then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d); }).catch(() => {});
    fetch('/api/queue').then(r => r.json()).then(d => { if (Array.isArray(d)) setQueue(d); }).catch(() => {});
    fetch('/api/online').then(r => r.json()).then(d => { if (d.users) setOnlineUsers(d.users); }).catch(() => {});
    fetch('/api/admin/ads').then(r => r.json()).then(d => { if (Array.isArray(d)) setAds(d); }).catch(() => {});
  }, []);

  const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));

  const setRole = async (id, role) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) { const d = await res.json(); toast(d.error || 'เกิดข้อผิดพลาด'); return; }
      setUsers(us => us.map(u => u.id === id ? { ...u, role } : u));
      toast(`อัปเดตยศแล้ว → ${role}`, 'success');
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  const removeUser = async (id) => {
    if (!confirm('ลบผู้ใช้นี้?')) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); toast(d.error || 'เกิดข้อผิดพลาด'); return; }
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

  return (
    <>
      <TopBar
        crumb="CONTROL ROOM ⁄ ADMIN"
        title="Dashboard"
        meta="System status: nominal"
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
                  <div className="delta">ข้อความทั้งหมด</div>
                </div>
                <div className="admin-stat">
                  <div className="label">Songs in Queue</div>
                  <div className="v">{stats?.totalQueue ?? '...'}</div>
                  <div className="delta">ทั้งหมดในคิว</div>
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
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>— Now Playing</div>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>— Manage</div>
                  <h3>ผู้ใช้ทั้งหมด ({filtered.length})</h3>
                </div>
                <div className="search-field" style={{ width: 280 }}>
                  <i className="fas fa-search"></i>
                  <input placeholder="ค้นหาผู้ใช้..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>
              <table className="admin-table">
                <thead>
                  <tr><th>ผู้ใช้</th><th>ยศ</th><th>วันที่สมัคร</th><th>การจัดการ</th></tr>
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
                      <td><span className={`role-tag ${u.role}`}>{u.role}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 11 }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('th') : '—'}
                      </td>
                      <td>
                        <div className="row-actions">
                          {u.role !== 'admin' && (
                            <>
                              <button className="btn-mini" onClick={() => setRole(u.id, u.role === 'dj' ? 'user' : 'dj')}>
                                {u.role === 'dj' ? 'Demote' : 'Make DJ'}
                              </button>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>— Now playing & next</div>
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
                      <div className="a">{q.artist || '—'}</div>
                    </div>
                    <div className="req">
                      <img src={AVATAR(q.requested_by || 'user')} alt="" />
                      <span>@{q.requested_by}</span>
                    </div>
                    <div className="row-actions">
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>— Promotions</div>
                  <h3>โฆษณา & ร้านค้า ({ads.length})</h3>
                </div>
              </div>
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'online' && (
            <div className="admin-card">
              <div className="admin-card-head">
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--ink-3)', marginBottom: 4, textTransform: 'uppercase' }}>— Live</div>
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
