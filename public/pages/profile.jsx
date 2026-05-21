function MicTestCard() {
  const { useState, useEffect, useRef } = React;
  const [status, setStatus] = useState('idle');
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState('');
  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const rafRef = useRef(null);

  const stopTest = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (contextRef.current) { try { contextRef.current.close(); } catch {} }
    streamRef.current = null;
    contextRef.current = null;
    setStatus('idle');
    setVolume(0);
  };

  const startTest = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      contextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      setStatus('testing');
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, value) => sum + value, 0) / data.length;
        setVolume(Math.min(100, Math.round((avg / 128) * 100)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setError('เปิดไมค์ไม่สำเร็จ');
      setStatus('idle');
    }
  };

  useEffect(() => () => stopTest(), []);

  return (
    <div className="profile-card">
      <div className="profile-card-head">Mic test</div>
      <div className="profile-mic-meter">
        <div className="profile-mic-bar">
          <div className="profile-mic-fill" style={{ width: `${volume}%` }}></div>
        </div>
        <span>{volume}%</span>
      </div>
      <button className="btn-primary orange" onClick={status === 'testing' ? stopTest : startTest}>
        {status === 'testing' ? 'หยุดทดสอบไมค์' : 'เริ่มทดสอบไมค์'}
      </button>
      {error && <div className="login-inline-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}

function ProfilePage({ user, onUpdate, toast }) {
  const { useState, useEffect, useRef } = React;
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [email, setEmail] = useState(user.email || '');
  const [avatarPreview, setAvatarPreview] = useState(user.avatar_url || '');
  const [avatarData, setAvatarData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState([]);
  const [notifications, setNotifications] = useState(user.notifications || []);
  const [followedDjs, setFollowedDjs] = useState(user.followed_djs || []);
  const [checkInState, setCheckInState] = useState({ loading: false });
  const fileRef = useRef(null);

  useEffect(() => {
    fetch('/api/profile/activity')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setActivity(data); })
      .catch(() => {});
    fetch('/api/notifications')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setNotifications(data); })
      .catch(() => {});
    fetch('/api/follows')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setFollowedDjs(data); })
      .catch(() => {});
    fetch('/api/notifications/read', { method: 'POST' }).catch(() => {});
  }, []);

  const pickAvatar = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(String(reader.result));
      setAvatarData(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_seed: user.avatar_seed || user.name,
          display_name: displayName,
          email,
          avatar_image: avatarData || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Save failed');
        return;
      }
      onUpdate({ ...user, ...data });
      setAvatarData(null);
      toast('อัปเดตโปรไฟล์แล้ว', 'success');
    } catch {
      toast('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const dailyCheckIn = async () => {
    setCheckInState({ loading: true });
    try {
      const res = await fetch('/api/check-in', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Check-in failed');
        return;
      }
      if (data.already_checked_in) {
        toast('เช็กอินวันนี้ไปแล้ว');
      } else {
        toast(`รับ ${data.reward} coins แล้ว`, 'success');
        onUpdate({
          ...user,
          coins: (user.coins || 0) + (data.reward || 0),
          checkin_streak: data.checkin_streak || user.checkin_streak || 0,
        });
      }
    } catch {
      toast('Check-in failed');
    } finally {
      setCheckInState({ loading: false });
    }
  };

  const statCards = [
    { label: 'Level', value: `Lv.${user.level || 1}` },
    { label: 'Hours listened', value: `${user.hours_listened || 0}h` },
    { label: 'Coins', value: user.coins || 0 },
    { label: 'Daily streak', value: `${user.checkin_streak || 0}d` },
  ];

  return (
    <>
      <TopBar
        crumb="ACCOUNT"
        title="User profile"
        meta={`@${user.name}`}
        listeners={0}
        onToggleChat={() => {}}
        chatOpen={false}
      />

      <div className="profile-layout profile-layout-modern">
        <div className="profile-col">
          <div className="profile-card profile-hero-card">
            <div className="profile-avatar-center">
              <div className="profile-avatar-ring" onClick={() => fileRef.current?.click()} title="Change avatar">
                <img
                  src={avatarPreview || AVATAR(user.avatar_seed || user.name)}
                  className="profile-avatar-img"
                  alt="avatar"
                />
                <div className="profile-avatar-overlay"><i className="fas fa-camera"></i></div>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={pickAvatar} />
              <div className="profile-avatar-info">
                <div className="profile-username">{displayName || user.display_name || user.name}</div>
                <div className="profile-at">@{user.name}</div>
                <div className="profile-role-pill">{roleMeta(user.role).emoji} {roleMeta(user.role).label}</div>
              </div>
            </div>

            <div className="profile-stat-grid">
              {statCards.map((card) => (
                <div key={card.label} className="profile-stat-box">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </div>
              ))}
            </div>

            <div className="profile-level-meter">
              <div className="profile-level-head">
                <span>{user.level_label || 'Fresh Listener'}</span>
                <span>{Math.round(user.level_progress || 0)}%</span>
              </div>
              <div className="profile-mic-bar">
                <div className="profile-mic-fill" style={{ width: `${user.level_progress || 0}%` }}></div>
              </div>
            </div>
          </div>

          <div className="profile-card">
            <div className="profile-card-head">Edit profile</div>
            <div className="profile-field">
              <label>Display name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={user.name} maxLength={30} />
            </div>
            <div className="profile-field">
              <label>Email สำหรับรีเซ็ตรหัสผ่าน</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
              <div className="hint">ใช้ยืนยันตัวตนเมื่อลืมรหัสผ่าน ไม่มีการส่ง spam</div>
            </div>
            <button className="btn-primary orange" style={{ width: '100%' }} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'บันทึกโปรไฟล์'}
            </button>
          </div>

          <MicTestCard />
        </div>

        <div className="profile-col">
          <div className="profile-card">
            <div className="profile-card-head">Daily check-in</div>
            <div className="profile-checkin-card">
              <p>เข้าเว็บทุกวันเพื่อรับ coins เพิ่ม และดัน streak ให้ยาวขึ้น</p>
              <button className="btn-primary orange" onClick={dailyCheckIn} disabled={checkInState.loading}>
                {checkInState.loading ? 'Checking...' : 'รับเช็กอินวันนี้'}
              </button>
            </div>
          </div>

          <div className="profile-card">
            <div className="profile-card-head">Reward badges</div>
            <div className="profile-badge-grid">
              {(user.badges || []).length > 0 ? (user.badges || []).map((badge) => (
                <div key={badge.id} className={`profile-badge-chip tone-${badge.tone || 'orange'}`}>
                  {badge.label}
                </div>
              )) : <div className="hint">ยังไม่มี badge มากนัก ลองฟังต่อและเช็กอินต่อเนื่อง</div>}
            </div>
          </div>

          <div className="profile-card">
            <div className="profile-card-head">Followed DJs</div>
            <div className="profile-follow-list">
              {followedDjs.length > 0 ? followedDjs.map((dj) => (
                <div key={dj.username} className="profile-follow-row">
                  <img src={dj.avatar_url || AVATAR(dj.avatar_seed || dj.username)} alt="" />
                  <div>
                    <strong>{dj.display_name || dj.username}</strong>
                    <span>@{dj.username}</span>
                  </div>
                </div>
              )) : <div className="hint">ยังไม่ได้ follow DJ คนไหน</div>}
            </div>
          </div>

          <div className="profile-card">
            <div className="profile-card-head">Recent notifications</div>
            <div className="profile-activity-list">
              {notifications.length > 0 ? notifications.map((item) => (
                <div key={item.id} className="profile-activity-row">
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </div>
              )) : <div className="hint">ยังไม่มี notification</div>}
            </div>
          </div>

          <div className="profile-card">
            <div className="profile-card-head">History</div>
            <div className="profile-activity-list">
              {activity.length > 0 ? activity.map((item, index) => (
                <div key={`${item.type}-${index}`} className="profile-activity-row">
                  <strong>{item.type}</strong>
                  <span>{item.title}</span>
                </div>
              )) : <div className="hint">ยังไม่มี activity มากพอ</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.ProfilePage = ProfilePage;
