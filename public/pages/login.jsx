function LoginPage({ onLogin }) {
  const { useState } = React;
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetUser, setResetUser] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetInfo, setResetInfo] = useState('');
  const [resetHint, setResetHint] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const resetModal = () => {
    setResetStep(1); setResetUser(''); setResetEmail('');
    setResetCode(''); setResetPassword('');
    setResetInfo(''); setResetHint(''); setResetLoading(false);
  };

  const submitAuth = async (e) => {
    e.preventDefault();
    setError('');
    if (!username || !password) { setError('กรอก username และ password'); return; }
    if (tab === 'register') {
      if (!email || !email.includes('@')) { setError('กรอก email ให้ถูกต้อง'); return; }
      if (password !== confirm) { setError('Password ไม่ตรงกัน'); return; }
    }
    setLoading(true);
    try {
      const endpoint = tab === 'login' ? '/api/login' : '/api/register';
      const payload = tab === 'login'
        ? { username, password, remember }
        : { username, password, email };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Request failed'); return; }
      onLogin({
        id: data.userId,
        name: data.username,
        role: data.role,
        avatar_seed: data.avatar_seed || data.username,
        avatar_url: data.avatar_url || '',
        display_name: data.display_name || '',
        email: data.email || '',
        coins: data.coins || 0,
        checkin_streak: data.checkin_streak || 0,
        total_listen_seconds: data.total_listen_seconds || 0,
        level: data.level || 1,
        level_progress: data.level_progress || 0,
        hours_listened: data.hours_listened || 0,
        badges: data.badges || [],
        unlocks: data.unlocks || [],
        notifications: data.notifications || [],
        unread_notifications: data.unread_notifications || 0,
        followed_djs: data.followed_djs || [],
      });
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  };

  const requestResetOtp = async (e) => {
    e.preventDefault();
    setResetLoading(true); setResetInfo(''); setResetHint('');
    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetUser, email: resetEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setResetInfo(data.error || 'ไม่สำเร็จ'); return; }
      setResetStep(2);
      setResetInfo(`ส่ง OTP ไปที่ ${data.email_masked} แล้ว`);
      if (data.demo_code) setResetHint(`[DEV] OTP: ${data.demo_code}`);
    } catch { setResetInfo('Network error'); }
    finally { setResetLoading(false); }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setResetLoading(true); setResetInfo('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetUser, email: resetEmail, code: resetCode, new_password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setResetInfo(data.error || 'ไม่สำเร็จ'); return; }
      setResetInfo('เปลี่ยนรหัสผ่านแล้ว ✓ เข้าสู่ระบบได้เลย');
      setTimeout(() => { setResetOpen(false); resetModal(); }, 1400);
    } catch { setResetInfo('Network error'); }
    finally { setResetLoading(false); }
  };

  // Animated equalizer bars
  const EqBars = () => (
    <div className="lp-eq">
      {[...Array(14)].map((_, i) => <span key={i} style={{ animationDelay: `${(i * 0.11) % 0.9}s` }} />)}
    </div>
  );

  return (
    <div className="lp-shell">
      {/* ── Left Visual Panel ── */}
      <div className="lp-visual">
        <div className="lp-orb lp-orb-1" />
        <div className="lp-orb lp-orb-2" />
        <div className="lp-orb lp-orb-3" />

        <div className="lp-visual-top">
          <span className="lp-badge-live"><span className="lp-live-dot" />LIVE NOW</span>
          <span className="lp-badge-tag">24/7 BROADCAST</span>
        </div>

        <div className="lp-visual-center">
          <div className="lp-vinyl-wrap">
            <div className="lp-vinyl-ring lp-ring-1" />
            <div className="lp-vinyl-ring lp-ring-2" />
            <div className="lp-vinyl-ring lp-ring-3" />
            <div className="lp-vinyl">
              <div className="lp-vinyl-groove" />
              <div className="lp-vinyl-hole" />
            </div>
          </div>

          <div className="lp-station">
            <div className="lp-station-name">CHAT<br /><span>SOCIETY</span></div>
            <div className="lp-station-sub">Radio · Live · Social Club</div>
          </div>

          <div className="lp-feat-list">
            <div className="lp-feat"><i className="fas fa-headphones-alt"></i><span>ฟังสดและขอเพลง</span></div>
            <div className="lp-feat"><i className="fas fa-coins"></i><span>เก็บ Coins ทุกวัน</span></div>
            <div className="lp-feat"><i className="fas fa-microphone"></i><span>ขอขึ้นพูดกับ DJ</span></div>
            <div className="lp-feat"><i className="fas fa-star"></i><span>Level Up &amp; Badges</span></div>
          </div>
        </div>

        <EqBars />
      </div>

      {/* ── Right Form Panel ── */}
      <div className="lp-form-panel">
        <div className="lp-form-card">
          <div className="lp-form-logo">🎧</div>
          <h1 className="lp-form-title">
            {tab === 'login' ? 'ยินดีต้อนรับกลับ' : 'สมัครสมาชิก'}
          </h1>
          <p className="lp-form-sub">
            {tab === 'login'
              ? 'เข้าสู่ห้องสดของ Chat Society Radio'
              : 'เข้าร่วม community ของเรา'}
          </p>

          {/* Tab switcher */}
          <div className="lp-tabs">
            <button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setError(''); }}>
              เข้าสู่ระบบ
            </button>
            <button className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setError(''); }}>
              สมัครสมาชิก
            </button>
            <div className="lp-tab-slider" style={{ left: tab === 'login' ? 4 : 'calc(50% + 2px)', width: tab === 'login' ? 'calc(50% - 6px)' : 'calc(50% - 6px)' }} />
          </div>

          <form onSubmit={submitAuth} className="lp-fields">
            <div className="lp-field">
              <i className="fas fa-user lp-field-icon" />
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Username"
                autoComplete="username"
              />
            </div>

            {tab === 'register' && (
              <div className="lp-field">
                <i className="fas fa-envelope lp-field-icon" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Email (สำหรับรีเซ็ต password)"
                  autoComplete="email"
                />
              </div>
            )}

            <div className="lp-field">
              <i className="fas fa-lock lp-field-icon" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              />
              <button type="button" className="lp-pw-eye" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                <i className={`fas fa-eye${showPw ? '-slash' : ''}`} />
              </button>
            </div>

            {tab === 'register' && (
              <div className="lp-field">
                <i className="fas fa-lock lp-field-icon" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="ยืนยัน Password"
                  autoComplete="new-password"
                />
              </div>
            )}

            {tab === 'login' && (
              <div className="lp-row-between">
                <label className="lp-remember">
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                  <span>จดจำฉัน</span>
                </label>
                <button type="button" className="lp-forgot" onClick={() => { setResetOpen(true); resetModal(); }}>
                  ลืมรหัสผ่าน?
                </button>
              </div>
            )}

            {error && (
              <div className="lp-error">
                <i className="fas fa-exclamation-circle" /> {error}
              </div>
            )}

            <button type="submit" className="lp-submit" disabled={loading}>
              {loading
                ? <><i className="fas fa-spinner fa-spin" /> กำลังดำเนินการ...</>
                : tab === 'login'
                  ? <><i className="fas fa-sign-in-alt" /> เข้าสู่ระบบ</>
                  : <><i className="fas fa-user-plus" /> สมัครสมาชิก</>
              }
            </button>

            {tab === 'register' && (
              <div className="lp-hint">
                <i className="fas fa-info-circle" /> Email ใช้สำหรับรีเซ็ต password เท่านั้น ไม่มีการส่ง spam
              </div>
            )}
          </form>
        </div>
      </div>

      {/* ── Reset Password Modal ── */}
      {resetOpen && (
        <div className="auth-modal-backdrop" onClick={() => { setResetOpen(false); resetModal(); }}>
          <div className="lp-reset-card" onClick={e => e.stopPropagation()}>
            <div className="lp-reset-head">
              <div>
                <div className="lp-reset-pre">Password Recovery</div>
                <h3>รีเซ็ตรหัสผ่าน</h3>
              </div>
              <button className="icon-square" onClick={() => { setResetOpen(false); resetModal(); }}>
                <i className="fas fa-times" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="lp-steps">
              <div className={`lp-step ${resetStep >= 1 ? 'done' : ''}`}>
                <span>1</span><small>ยืนยันตัวตน</small>
              </div>
              <div className="lp-step-line" />
              <div className={`lp-step ${resetStep >= 2 ? 'done' : ''}`}>
                <span>2</span><small>ใส่ OTP</small>
              </div>
              <div className="lp-step-line" />
              <div className={`lp-step ${resetStep >= 3 ? 'done' : ''}`}>
                <span>3</span><small>เสร็จ!</small>
              </div>
            </div>

            {resetStep === 1 && (
              <form onSubmit={requestResetOtp}>
                <div className="lp-field" style={{ marginBottom: 12 }}>
                  <i className="fas fa-user lp-field-icon" />
                  <input value={resetUser} onChange={e => setResetUser(e.target.value)} placeholder="Username" />
                </div>
                <div className="lp-field" style={{ marginBottom: 16 }}>
                  <i className="fas fa-envelope lp-field-icon" />
                  <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="Email ที่ใช้ตอนสมัคร" />
                </div>
                {resetInfo && <div className="lp-error" style={{ marginBottom: 12 }}>{resetInfo}</div>}
                <button className="lp-submit" type="submit" disabled={resetLoading}>
                  {resetLoading ? <><i className="fas fa-spinner fa-spin" /> กำลังส่ง...</> : <><i className="fas fa-paper-plane" /> ส่ง OTP ไปที่ Email</>}
                </button>
                <div className="lp-hint" style={{ marginTop: 12 }}>OTP จะถูกส่งไปที่ email ที่ลงทะเบียนไว้ หมดอายุใน 10 นาที</div>
              </form>
            )}

            {resetStep === 2 && (
              <form onSubmit={submitReset}>
                {resetInfo && <div className="lp-reset-ok">{resetInfo}</div>}
                {resetHint && <div className="lp-error" style={{ marginBottom: 8, background: 'rgba(255,159,28,0.1)', borderColor: 'var(--orange)', color: 'var(--orange-deep)' }}>{resetHint}</div>}
                <div className="lp-otp-field">
                  <input
                    value={resetCode}
                    onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    maxLength={6}
                  />
                  <div className="lp-otp-label">รหัส OTP 6 หลัก</div>
                </div>
                <div className="lp-field" style={{ marginBottom: 16 }}>
                  <i className="fas fa-lock lp-field-icon" />
                  <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Password ใหม่ (อย่างน้อย 6 ตัว)" autoComplete="new-password" />
                </div>
                <button className="lp-submit" type="submit" disabled={resetLoading || resetCode.length < 6 || resetPassword.length < 6}>
                  {resetLoading ? <><i className="fas fa-spinner fa-spin" /> กำลังเปลี่ยน...</> : <><i className="fas fa-check" /> เปลี่ยนรหัสผ่าน</>}
                </button>
                <button type="button" className="lp-forgot" style={{ display: 'block', marginTop: 10 }} onClick={() => setResetStep(1)}>← กลับ</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

window.LoginPage = LoginPage;
