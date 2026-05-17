// Profile Page — nickname, avatar, subscription status
function ProfilePage({ user, onUpdate, toast }) {
  const { useState, useRef } = React;

  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [avatarPreview, setAvatarPreview] = useState(user.avatar_url || '');
  const [avatarData, setAvatarData] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const rm = roleMeta(user.role);
  const isVIP  = ['vip','dj','admin'].includes(user.role);
  const expTs  = user.vip_expires_at || 0;
  const expDate = expTs > 0 ? new Date(expTs) : null;
  const expired = expDate && expDate < new Date();

  const pickAvatar = async (e) => {
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
          avatar_image: avatarData || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'บันทึกไม่สำเร็จ'); return; }
      onUpdate({
        ...user,
        display_name: data.display_name ?? displayName,
        avatar_url: data.avatar_url || avatarPreview,
      });
      setAvatarData(null);
      toast('บันทึกโปรไฟล์แล้ว ✓', 'success');
    } catch { toast('บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  const BANK_INFO = 'กสิกรไทย xxx-x-xxxxx-x\nชื่อบัญชี: IMVU Society Radio\nส่งสลิปมาที่ Line: @imvuradio';

  return (
    <div className="profile-page">
      <TopBar
        crumb="ACCOUNT"
        title="โปรไฟล์ของฉัน"
        meta={`@${user.name}`}
        listeners={0}
        onToggleChat={() => {}}
        chatOpen={false}
      />

      {/* Avatar + Nickname */}
      <div className="profile-card">
        <div className="profile-card-head">— แก้ไขโปรไฟล์</div>
        <div className="profile-avatar-wrap">
          <img
            src={avatarPreview || AVATAR(user.avatar_seed || user.name)}
            className={`profile-avatar-img ${isVIP ? 'vip-ring' : ''}`}
            alt="avatar"
            onClick={() => fileRef.current?.click()}
            title="คลิกเพื่อเปลี่ยนรูป"
          />
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={pickAvatar} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{user.display_name || user.name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>@{user.name}</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>{rm.emoji} {rm.label}</div>
            <button className="btn-mini" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>
              เปลี่ยนรูปโปรไฟล์
            </button>
          </div>
        </div>

        <div className="profile-field">
          <label>ชื่อเล่น (Display Name)</label>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder={user.name}
            maxLength={30}
          />
          <div className="hint">ชื่อที่แสดงในแชท — max 30 ตัวอักษร</div>
        </div>

        <div className="profile-field">
          <label>Username</label>
          <input value={user.name} disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} />
          <div className="hint">ไม่สามารถเปลี่ยน username ได้</div>
        </div>

        <button className="btn-primary orange" style={{ width: '100%' }} onClick={save} disabled={saving}>
          {saving ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
        </button>
      </div>

      {/* Subscription */}
      <div className="sub-card">
        <div className="profile-card-head">— สมาชิกและ VIP</div>

        <div className={`sub-role-badge ${user.role === 'user' ? 'member' : (user.role || 'guest')}`}>
          {rm.emoji} {rm.label}
        </div>

        {user.role === 'vip' && expDate && (
          <div className={`sub-expiry ${expired ? 'expired' : ''}`}>
            {expired
              ? '⚠️ VIP หมดอายุแล้ว กรุณาต่ออายุ'
              : <>VIP หมดอายุ: <strong>{expDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></>
            }
          </div>
        )}
        {user.role === 'vip' && !expDate && (
          <div className="sub-expiry">VIP ตลอดชีพ (ไม่มีวันหมดอายุ)</div>
        )}
        {!['vip','dj','admin'].includes(user.role) && (
          <div className="sub-expiry">อัปเกรดเป็น VIP เพื่อรับสิทธิพิเศษ</div>
        )}

        {/* VIP perks */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>⭐ สิทธิ์ VIP</div>
          {['เปลี่ยนสีชื่อและสีแชทได้','กรอบ VIP รอบ message bubble','ใช้งาน Messenger ส่วนตัวได้','อัปโหลดรูปภาพในแชทได้','ใช้กรอบโปรไฟล์พิเศษ'].map(p => (
            <div key={p} style={{ fontSize: 13, color: isVIP ? 'var(--ink)' : 'var(--ink-mute)', marginBottom: 4 }}>
              {isVIP ? '✅' : '🔒'} {p}
            </div>
          ))}
        </div>

        {/* Plans */}
        {!['dj','admin'].includes(user.role) && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>แพ็กเกจ VIP</div>
            <div className="sub-plans">
              <div className="sub-plan">
                <div className="sub-plan-label">รายเดือน</div>
                <div className="sub-plan-price">฿19<span>/เดือน</span></div>
              </div>
              <div className="sub-plan popular">
                <div className="sub-plan-label">3 เดือน 🔥</div>
                <div className="sub-plan-price">฿45<span>/3 เดือน</span></div>
                <div className="sub-plan-tag">ประหยัด ฿12</div>
              </div>
            </div>

            <div className="sub-bank">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>วิธีสมัคร VIP</div>
              <div>1. โอนเงินตามแพ็กเกจที่เลือก</div>
              <div>2. แจ้ง Admin พร้อมสลิปและ Username</div>
              <div>3. Admin จะเปิด VIP ให้ภายใน 24 ชม.</div>
              <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'pre-line' }}>
                {BANK_INFO}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

window.ProfilePage = ProfilePage;
