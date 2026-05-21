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
  const [vipDonations, setVipDonations] = useState([]);
  const prevVipCountRef = useRef(0);
  const [adForm, setAdForm] = useState({
    title: '', body: '', cta_text: '', cta_url: '', image_url: '', fb_url: '', image_data: null,
  });
  const [adImagePreview, setAdImagePreview] = useState(null);

  const loadAll = () => {
    fetch('/api/admin/stats').then(r => r.json()).then(setStats).catch(() => {});
    fetch('/api/admin/users').then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d); }).catch(() => {});
    fetch('/api/queue').then(r => r.json()).then(d => { if (Array.isArray(d)) setQueue(d); }).catch(() => {});
    fetch('/api/online').then(r => r.json()).then(d => { if (d.users) setOnlineUsers(d.users); }).catch(() => {});
    fetch('/api/admin/ads').then(r => r.json()).then(d => { if (Array.isArray(d)) setAds(d); }).catch(() => {});
    fetch('/api/admin/role-requests').then(r => r.json()).then(d => { if (Array.isArray(d)) setRoleRequests(d); }).catch(() => {});
    fetch('/api/admin/vip-donations').then(r => r.json()).then(d => { if (Array.isArray(d)) setVipDonations(d); }).catch(() => {});
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Poll for new VIP donations every 10s and play sound alert
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/admin/vip-donations').then(r => r.json()).then(d => {
        if (!Array.isArray(d)) return;
        if (d.length > prevVipCountRef.current) {
          try {
            const ac = new (window.AudioContext || window.webkitAudioContext)();
            [880, 1100, 1320, 880].forEach((freq, i) => {
              const osc = ac.createOscillator();
              const gain = ac.createGain();
              osc.type = 'sine';
              osc.frequency.value = freq;
              const t = ac.currentTime + i * 0.12;
              gain.gain.setValueAtTime(0, t);
              gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
              osc.connect(gain); gain.connect(ac.destination);
              osc.start(t); osc.stop(t + 0.22);
            });
          } catch {}
        }
        prevVipCountRef.current = d.length;
        setVipDonations(d);
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
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

  const toggleCoAdmin = async (id) => {
    try {
      const res = await fetch(`/api/admin/users/${id}/co-admin`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      setUsers(us => us.map(u => u.id === id ? { ...u, can_admin: data.can_admin ? 1 : 0 } : u));
      toast(data.can_admin ? '✅ มอบสิทธิ์ Co-Admin แล้ว' : '🔒 ถอนสิทธิ์ Co-Admin แล้ว', data.can_admin ? 'success' : '');
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

  const [resetTarget, setResetTarget] = useState(null); // { id, username }
  const [resetNewPw, setResetNewPw] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const adminResetPassword = async (e) => {
    e.preventDefault();
    if (!resetTarget || resetNewPw.length < 6) return;
    setResetBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: resetNewPw }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      toast(`รีเซ็ต password ของ @${resetTarget.username} แล้ว ✓`, 'success');
      setResetTarget(null);
      setResetNewPw('');
    } catch { toast('เกิดข้อผิดพลาด'); }
    finally { setResetBusy(false); }
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
    if (!adForm.title.trim()) { toast('กรุณาใส่ชื่อโฆษณา'); return; }
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
          image_url: adForm.image_data ? '' : adForm.image_url.trim(),
          image_data: adForm.image_data || undefined,
          fb_url: adForm.fb_url.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      setAdForm({ title: '', body: '', cta_text: '', cta_url: '', image_url: '', fb_url: '', image_data: null });
      setAdImagePreview(null);
      toast('สร้างโฆษณาแล้ว ✓', 'success');
      loadAll();
    } catch { toast('เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  const deleteAd = async (id) => {
    if (!confirm('ลบโฆษณานี้?')) return;
    try {
      await fetch(`/api/admin/ads/${id}`, { method: 'DELETE' });
      setAds(prev => prev.filter(a => a.id !== id));
      toast('ลบโฆษณาแล้ว');
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  return (
    <>
      <TopBar
        crumb="CONTROL ROOM / ADMIN"
        title="Dashboard"
        meta="เครื่องมือดูแล Chat Society Radio"
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
            <button className={`tab-btn ${tab === 'vip-donations' ? 'active' : ''}`} onClick={() => setTab('vip-donations')}>
              💎 โดเนท VIP {vipDonations.length > 0 && <span className="tab-badge" style={{ background: 'var(--orange)' }}>{vipDonations.length}</span>}
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
                              {u.role === 'dj' && user.role === 'admin' && (
                                <button
                                  className={`btn-co-admin ${u.can_admin ? 'active' : ''}`}
                                  onClick={() => toggleCoAdmin(u.id)}
                                  title={u.can_admin ? 'ถอนสิทธิ์ Co-Admin' : 'มอบสิทธิ์ Co-Admin'}
                                >
                                  <i className="fas fa-shield-alt"></i>
                                  {u.can_admin ? ' Co-Admin' : ' ให้สิทธิ์'}
                                </button>
                              )}
                              <button className="btn-mini" onClick={() => { setResetTarget({ id: u.id, username: u.username }); setResetNewPw(''); }} title="รีเซ็ต password">
                                <i className="fas fa-key"></i>
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

              {/* ── Create Ad Form ── */}
              <form onSubmit={createAd} style={{ background: 'var(--bg)', border: '1px solid var(--line-faint)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>+ สร้างโฆษณาใหม่</div>

                {/* Image upload zone */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', display: 'block', marginBottom: 6 }}>รูปภาพโฆษณา</label>
                  <label style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    border: `2px dashed ${adImagePreview ? 'var(--orange)' : 'var(--line)'}`,
                    borderRadius: 10, cursor: 'pointer', overflow: 'hidden',
                    height: adImagePreview ? 'auto' : 100, minHeight: 80, background: 'var(--bg-card)', transition: 'border-color 0.15s',
                  }}>
                    {adImagePreview
                      ? <img src={adImagePreview} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
                      : <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, padding: 16 }}>
                          <i className="fas fa-image" style={{ fontSize: 28, marginBottom: 6, display: 'block', color: 'var(--line)' }} />
                          คลิกเพื่ออัปโหลดรูปภาพ
                        </div>
                    }
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        setAdImagePreview(ev.target.result);
                        setAdForm(f => ({ ...f, image_data: ev.target.result, image_url: '' }));
                      };
                      reader.readAsDataURL(file);
                    }} />
                  </label>
                  {adImagePreview && (
                    <button type="button" onClick={() => { setAdImagePreview(null); setAdForm(f => ({ ...f, image_data: null })); }}
                      style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      ✕ ลบรูป
                    </button>
                  )}
                  {!adImagePreview && (
                    <div style={{ marginTop: 8 }}>
                      <input
                        placeholder="หรือวาง URL รูปภาพ..."
                        value={adForm.image_url}
                        onChange={e => setAdForm(f => ({ ...f, image_url: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line-faint)', background: 'var(--bg)', fontSize: 13 }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>ชื่อโฆษณา / ร้านค้า *</label>
                    <input placeholder="เช่น ร้าน Gift Idea Print" value={adForm.title} onChange={e => setAdForm(f => ({ ...f, title: e.target.value }))} required />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>รายละเอียด</label>
                    <input placeholder="บอกสั้นๆ ว่าร้านขายอะไร..." value={adForm.body} onChange={e => setAdForm(f => ({ ...f, body: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>ข้อความปุ่ม CTA</label>
                    <input placeholder="เช่น ดูสินค้า, ติดต่อเลย" value={adForm.cta_text} onChange={e => setAdForm(f => ({ ...f, cta_text: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>ลิงก์ปุ่ม CTA</label>
                    <input placeholder="https://..." value={adForm.cta_url} onChange={e => setAdForm(f => ({ ...f, cta_url: e.target.value }))} />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label><i className="fab fa-facebook" style={{ color: '#1877f2', marginRight: 6 }}></i>ลิงก์ Facebook Page</label>
                    <input placeholder="https://facebook.com/yourpage" value={adForm.fb_url} onChange={e => setAdForm(f => ({ ...f, fb_url: e.target.value }))} />
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <button className="btn-mini solid" type="submit" disabled={loading} style={{ padding: '10px 24px', fontSize: 13 }}>
                    {loading ? 'กำลังบันทึก...' : '+ สร้างโฆษณา'}
                  </button>
                </div>
              </form>

              {/* ── Ad cards ── */}
              {ads.length === 0 && (
                <div style={{ padding: '20px', color: 'var(--ink-mute)', fontSize: 13, textAlign: 'center' }}>ยังไม่มีโฆษณา</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {ads.map(ad => (
                  <div key={ad.id} style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
                    {ad.image_url && (
                      <img src={ad.image_url} alt={ad.title} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                    )}
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span className={`tag ${ad.active ? 'orange' : ''}`} style={{ fontSize: 10 }}>{ad.active ? '● ACTIVE' : 'PAUSED'}</span>
                        {ad.fb_url && (
                          <a href={ad.fb_url} target="_blank" rel="noreferrer" title="Facebook Page" style={{ color: '#1877f2', fontSize: 18 }}>
                            <i className="fab fa-facebook"></i>
                          </a>
                        )}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{ad.title}</div>
                      {ad.body && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.5 }}>{ad.body}</div>}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn-mini" onClick={() => toggleAd(ad)} style={{ flex: 1 }}>
                          {ad.active ? '⏸ หยุดแสดง' : '▶ เปิดแสดง'}
                        </button>
                        {ad.cta_url && ad.cta_url !== '#' && (
                          <a className="btn-mini" href={ad.cta_url} target="_blank" rel="noreferrer">🔗 เปิด</a>
                        )}
                        <button className="btn-mini danger" onClick={() => deleteAd(ad.id)} title="ลบ">🗑</button>
                      </div>
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

          {tab === 'vip-donations' && (
            <div className="admin-section">
              <h3>คำขอโดเนท VIP ({vipDonations.length})</h3>
              {vipDonations.length === 0 ? (
                <div style={{ color: 'var(--ink-3)', padding: 20 }}>ไม่มีคำขอที่รอดำเนินการ</div>
              ) : (
                <div className="role-req-list">
                  {vipDonations.map(d => (
                    <div key={d.id} className="role-req-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
                        <div className="role-req-info">
                          <span className="role-req-name">@{d.username}</span>
                          <span className="role-req-meta">
                            💎 VIP {d.package === '1month' ? '1 เดือน' : d.package === '3months' ? '3 เดือน' : d.package === '6months' ? '6 เดือน' : '1 ปี'}
                            {' · '}{d.amount}฿ · {new Date(d.created_at).toLocaleString('th-TH')}
                          </span>
                        </div>
                        <div className="role-req-actions">
                          <button className="btn-approve" onClick={async () => {
                            const res = await fetch(`/api/admin/vip-donations/${d.id}/approve`, { method: 'POST' });
                            if (res.ok) { toast(`✅ อนุมัติ VIP ให้ @${d.username} แล้ว`, 'success'); loadAll(); }
                            else toast('เกิดข้อผิดพลาด');
                          }}>✅ ยืนยัน</button>
                          <button className="btn-reject" onClick={async () => {
                            const res = await fetch(`/api/admin/vip-donations/${d.id}/reject`, { method: 'POST' });
                            if (res.ok) { toast(`ปฏิเสธคำขอของ @${d.username}`, ''); loadAll(); }
                            else toast('เกิดข้อผิดพลาด');
                          }}>❌ ปฏิเสธ</button>
                        </div>
                      </div>
                      {d.slip_url && (
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>สลิปการโอน</div>
                          <img
                            src={d.slip_url}
                            alt="slip"
                            style={{ maxWidth: 280, maxHeight: 360, borderRadius: 8, border: '1px solid var(--line-faint)', cursor: 'pointer' }}
                            onClick={() => window.open(d.slip_url, '_blank')}
                          />
                        </div>
                      )}
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

      {resetTarget && (
        <div className="auth-modal-backdrop" onClick={() => setResetTarget(null)}>
          <div className="auth-modal-card" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="auth-modal-head">
              <div>
                <div className="pre">Admin Tool</div>
                <h3>รีเซ็ต Password</h3>
              </div>
              <button className="icon-square" onClick={() => setResetTarget(null)}><i className="fas fa-times"></i></button>
            </div>
            <div style={{ marginBottom: 16, color: 'var(--ink-3)', fontSize: 13 }}>
              ตั้ง password ใหม่ให้ <b style={{ color: 'var(--ink)' }}>@{resetTarget.username}</b>
            </div>
            <form onSubmit={adminResetPassword}>
              <div className="field">
                <label>Password ใหม่ (อย่างน้อย 6 ตัวอักษร)</label>
                <input
                  type="text"
                  value={resetNewPw}
                  onChange={e => setResetNewPw(e.target.value)}
                  placeholder="เช่น vibez1234"
                  autoComplete="off"
                />
              </div>
              <button className="submit-btn modern-submit-btn" type="submit" disabled={resetBusy || resetNewPw.length < 6}>
                {resetBusy ? 'กำลังรีเซ็ต...' : '🔑 รีเซ็ต Password'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

window.AdminPage = AdminPage;
