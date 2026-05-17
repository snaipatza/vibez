// Login / Register page
function LoginPage({ onLogin }) {
  const { useState } = React;
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username || !password) { setError('กรุณากรอกข้อมูลให้ครบ'); return; }
    if (tab === 'register' && password !== confirm) { setError('Password ไม่ตรงกัน'); return; }

    setLoading(true);
    try {
      const endpoint = tab === 'login' ? '/api/login' : '/api/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return; }
      onLogin({ name: data.username, role: data.role, avatar_seed: data.avatar_seed || data.username, avatar_url: data.avatar_url || '' });
    } catch {
      setError('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-art">
        <div className="login-art-top">
          <span>IMVU SOCIETY RADIO ⁄ FM 01</span>
          <span>EST. 2026 — BANGKOK</span>
        </div>

        <div className="login-art-center">
          <div className="display">
            FEEL<br />
            THE <span className="orange">VIBE.</span>
          </div>
          <div className="sub">
            แพลตฟอร์มไลฟ์สตรีมสำหรับ DJ และคนรักเสียงเพลง — ขอเพลง โหวต แชต และฟังสดไปด้วยกัน
          </div>
          <div className="vinyl-mini"></div>
        </div>

        <div className="login-art-bottom">
          <div><span className="pulse"></span>NOW LIVE — IMVU RADIO</div>
          <div>MAIN-STAGE</div>
        </div>
      </div>

      <div className="login-form-area">
        <div className="pre">— Welcome back</div>
        <h1>เข้าสู่<br />คลื่นความถี่</h1>
        <p className="lede">เข้าสู่ระบบเพื่อขอเพลง โหวต และร่วมแชตกับ DJ และผู้ฟังคนอื่นๆ ในห้องไลฟ์</p>

        <div className="tabs">
          <button className={`tab ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); setError(''); }}>
            เข้าสู่ระบบ
          </button>
          <button className={`tab ${tab === 'register' ? 'active' : ''}`} onClick={() => { setTab('register'); setError(''); }}>
            สมัครสมาชิก
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ใส่ username ของคุณ"
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="ใส่ password"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
          {tab === 'register' && (
            <div className="field">
              <label>ยืนยัน Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="พิมพ์อีกครั้ง"
                autoComplete="new-password"
              />
            </div>
          )}
          {error && <div style={{ color: 'var(--red)', fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 12 }}>{error}</div>}

          <button className="submit-btn" type="submit" disabled={loading}>
            {loading ? (
              <><i className="fas fa-spinner fa-spin"></i> {tab === 'login' ? 'กำลังเข้าสู่ระบบ...' : 'กำลังสมัคร...'}</>
            ) : (
              <>
                <span>{tab === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</span>
                <span className="arr">→</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

window.LoginPage = LoginPage;
