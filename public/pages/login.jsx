function LoginPage({ onLogin }) {
  const { useState } = React;
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetUser, setResetUser] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetInfo, setResetInfo] = useState('');
  const [resetHint, setResetHint] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const resetModal = () => {
    setResetStep(1);
    setResetUser('');
    setResetPhone('');
    setResetCode('');
    setResetPassword('');
    setResetInfo('');
    setResetHint('');
    setResetLoading(false);
  };

  const submitAuth = async (e) => {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('กรอก username และ password');
      return;
    }
    if (tab === 'register') {
      if (!phone) {
        setError('กรอกเบอร์โทรสำหรับ OTP reset');
        return;
      }
      if (password !== confirm) {
        setError('Password ไม่ตรงกัน');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = tab === 'login' ? '/api/login' : '/api/register';
      const payload = tab === 'login'
        ? { username, password, remember }
        : { username, password, phone };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Request failed');
        return;
      }
      onLogin({
        id: data.userId,
        name: data.username,
        role: data.role,
        avatar_seed: data.avatar_seed || data.username,
        avatar_url: data.avatar_url || '',
        display_name: data.display_name || '',
        phone: data.phone || '',
        phone_masked: data.phone_masked || '',
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
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const requestResetOtp = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetInfo('');
    setResetHint('');
    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetUser, phone: resetPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetInfo(data.error || 'OTP request failed');
        return;
      }
      setResetStep(2);
      setResetInfo(`ส่ง OTP ไปที่ ${data.phone_masked}`);
      if (data.demo_code) setResetHint(`OTP demo: ${data.demo_code}`);
    } catch {
      setResetInfo('Network error');
    } finally {
      setResetLoading(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetInfo('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: resetUser,
          phone: resetPhone,
          code: resetCode,
          new_password: resetPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetInfo(data.error || 'Reset failed');
        return;
      }
      setResetInfo('เปลี่ยนรหัสผ่านแล้ว เข้าสู่ระบบได้ทันที');
      setTimeout(() => {
        setResetOpen(false);
        resetModal();
      }, 1200);
    } catch {
      setResetInfo('Network error');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="login-shell login-shell-modern">
      <div className="login-art login-art-modern">
        <div className="login-art-top">
          <span>LIVE RADIO SOCIAL CLUB</span>
          <span>MODERN LISTENER ACCESS</span>
        </div>

        <div className="login-art-center">
          <div className="display">
            VIBEZ<br />
            <span className="orange">DJ ROOM</span>
          </div>
          <div className="sub">
            ฟังสด ติดตาม DJ ที่ชอบ รับ shoutout บนจอ และเก็บเลเวลจากทุกชั่วโมงที่อยู่กับห้องไลฟ์
          </div>

          <div className="login-feature-stack">
            <div className="login-feature-pill"><i className="fas fa-bell"></i> Follow DJ + live alerts</div>
            <div className="login-feature-pill"><i className="fas fa-signal"></i> Daily check-in + coins</div>
            <div className="login-feature-pill"><i className="fas fa-star"></i> Level up + reward badges</div>
          </div>

          <div className="vinyl-mini"></div>
        </div>

        <div className="login-art-bottom">
          <div><span className="pulse"></span>ON AIR EXPERIENCE</div>
          <div>OTP READY PROFILE</div>
        </div>
      </div>

      <div className="login-form-area login-form-modern">
        <div className="pre">Secure access</div>
        <h1>เข้าสู่ห้องสดแบบมีสไตล์</h1>
        <p className="lede">
          ล็อกอินเพื่อฟังสด ขอเพลง เก็บเลเวล และรับแจ้งเตือน DJ ที่คุณติดตามไว้
        </p>

        <div className="tabs modern-tabs">
          <button className={`tab ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); setError(''); }}>
            Login
          </button>
          <button className={`tab ${tab === 'register' ? 'active' : ''}`} onClick={() => { setTab('register'); setError(''); }}>
            Sign up
          </button>
        </div>

        <form onSubmit={submitAuth} className="login-card-modern">
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" autoComplete="username" />
          </div>

          {tab === 'register' && (
            <div className="field">
              <label>Phone for OTP reset</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" autoComplete="tel" />
            </div>
          )}

          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} />
          </div>

          {tab === 'register' && (
            <div className="field">
              <label>Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type again" autoComplete="new-password" />
            </div>
          )}

          <div className="login-actions-row">
            <label className="remember-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>จดจำฉัน</span>
            </label>
            <button type="button" className="link-btn" onClick={() => { setResetOpen(true); resetModal(); }}>
              ลืมรหัส?
            </button>
          </div>

          {error && <div className="login-inline-error">{error}</div>}

          <button className="submit-btn modern-submit-btn" type="submit" disabled={loading}>
            {loading ? 'กำลังดำเนินการ...' : tab === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
          </button>

          <div className="login-mini-note">
            สมัครครั้งแรกจะได้ช่องกรอกเบอร์โทรทันที เพื่อใช้ OTP เปลี่ยนรหัสผ่านในภายหลัง
          </div>
        </form>
      </div>

      {resetOpen && (
        <div className="auth-modal-backdrop" onClick={() => { setResetOpen(false); resetModal(); }}>
          <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal-head">
              <div>
                <div className="pre">Password recovery</div>
                <h3>รีเซ็ตรหัสผ่านด้วย OTP</h3>
              </div>
              <button className="icon-square" type="button" onClick={() => { setResetOpen(false); resetModal(); }}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            {resetStep === 1 ? (
              <form onSubmit={requestResetOtp}>
                <div className="field">
                  <label>Username</label>
                  <input value={resetUser} onChange={(e) => setResetUser(e.target.value)} placeholder="@username" />
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input value={resetPhone} onChange={(e) => setResetPhone(e.target.value)} placeholder="Phone number used on signup" />
                </div>
                {resetInfo && <div className="login-inline-error">{resetInfo}</div>}
                <button className="submit-btn modern-submit-btn" type="submit" disabled={resetLoading}>
                  {resetLoading ? 'Sending OTP...' : 'ส่ง OTP'}
                </button>
              </form>
            ) : (
              <form onSubmit={submitReset}>
                <div className="field">
                  <label>OTP code</label>
                  <input value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="6-digit code" />
                </div>
                <div className="field">
                  <label>New password</label>
                  <input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="New password" />
                </div>
                {resetInfo && <div className="login-inline-note">{resetInfo}</div>}
                {resetHint && <div className="login-inline-note accent">{resetHint}</div>}
                <button className="submit-btn modern-submit-btn" type="submit" disabled={resetLoading}>
                  {resetLoading ? 'Resetting...' : 'เปลี่ยนรหัสผ่าน'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

window.LoginPage = LoginPage;
