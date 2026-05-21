/* Shared building blocks for Chat Society Radio */

const { useState, useEffect, useRef, useMemo } = React;

// ── SOUND ENGINE ─────────────────────────────────────────────
const SoundEngine = (() => {
  let ctx = null;
  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  };

  function playKeyClick() {
    try {
      const ac = getCtx();
      const t = ac.currentTime;
      // soft sine tap — low freq with quick decay
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220 + Math.random() * 40, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.06);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch {}
  }

  function playDMNotify() {
    try {
      const ac = getCtx();
      const freqs = [880, 1100, 1320];
      freqs.forEach((freq, i) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ac.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    } catch {}
  }

  return { playKeyClick, playDMNotify };
})();

const AVATAR = (seed) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
const CHAT_EMOJIS = ['\u2764\ufe0f', '\ud83d\udd25', '\ud83d\ude02', '\ud83d\ude0d', '\ud83e\udd73', '\ud83d\ude2d', '\ud83d\ude4f', '\u2728'];

const ROLE_META = {
  admin:  { emoji: '\ud83d\udee1', label: 'Admin',  level: 4 },
  dj:     { emoji: '\ud83c\udfa7', label: 'DJ',     level: 3 },
  vip:    { emoji: '\ud83d\udc8e', label: 'VIP',    level: 2 },
  member: { emoji: '\ud83d\udc64', label: 'Member', level: 1 },
  user:   { emoji: '\ud83d\udc64', label: 'Member', level: 1 },
  guest:  { emoji: '\ud83c\udf0d', label: 'Guest',  level: 0 },
};
function roleMeta(role) { return ROLE_META[role] || ROLE_META.guest; }
function roleLevel(role) { return roleMeta(role).level; }

const MEMBER_COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9f1c','#ffffff'];
const VIP_COLORS    = [...MEMBER_COLORS,'#ff3cac','#00d4ff','#02c39a','#f77f00','#e040fb','#00b4d8','#f72585','#90e0ef'];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

function ChatMessageMedia({ mediaUrl, mediaType }) {
  const { useState } = React;
  const [lightbox, setLightbox] = useState(false);
  if (!mediaUrl) return null;
  return (
    <>
      <div className={`chat-media ${mediaType === 'gif' ? 'gif' : 'image'}`} onClick={() => setLightbox(true)} style={{ cursor: 'zoom-in' }}>
        <img src={mediaUrl} alt="" />
        {mediaType === 'gif' && <span className="media-badge">GIF</span>}
      </div>
      {lightbox && (
        <div className="img-lightbox" onClick={() => setLightbox(false)}>
          <div className="img-lightbox-inner" onClick={e => e.stopPropagation()}>
            <img src={mediaUrl} alt="" />
            <button className="img-lightbox-close" onClick={() => setLightbox(false)}>
              <i className="fas fa-times" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ChatComposer({ value, onChange, onSubmit, placeholder, maxLength, pendingMedia, onPickMedia, onClearMedia, userRole }) {
  const { useState: useSt2, useRef: useRef2 } = React;
  const fileRef = useRef2(null);
  const inputRef = useRef2(null);
  const [showGif, setShowGif] = useSt2(false);
  const [gifUrl, setGifUrl] = useSt2('');
  const canUpload = roleLevel(userRole) >= 2;

  const handlePaste = async (e) => {
    if (!canUpload) return;
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(it => it.type.startsWith('image/'));
    if (imgItem) {
      e.preventDefault();
      try {
        const file = imgItem.getAsFile();
        const dataUrl = await readFileAsDataUrl(file);
        onPickMedia({ dataUrl, name: 'clipboard.png', kind: file.type === 'image/gif' ? 'gif' : 'image' });
      } catch {}
    }
  };

  const submitGif = () => {
    const url = gifUrl.trim();
    if (!url) return;
    onPickMedia({ dataUrl: url, name: 'GIF', kind: 'gif', isExternal: true });
    setGifUrl('');
    setShowGif(false);
  };

  return (
    <form className="chat-input" onSubmit={onSubmit}>
      <div className="chat-tools">
        <div className="emoji-strip">
          {CHAT_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" className="emoji-btn" onClick={() => onChange(`${value}${emoji}`)} title={emoji}>
              {emoji}
            </button>
          ))}
        </div>
        {canUpload && (
          <>
            <button type="button" className="attach-btn" onClick={() => fileRef.current?.click()} title="Upload image or GIF">
              <i className="fas fa-image"></i>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  const dataUrl = await readFileAsDataUrl(file);
                  onPickMedia({ dataUrl, name: file.name, kind: file.type === 'image/gif' ? 'gif' : 'image' });
                } catch (err) {
                  alert(err.message || 'Unable to read file');
                }
              }}
            />
          </>
        )}
        <button type="button" className="attach-btn gif-btn" onClick={() => setShowGif(v => !v)} title="แทรก GIF จาก URL">
          GIF
        </button>
      </div>

      {showGif && (
        <div className="gif-url-picker">
          <input
            value={gifUrl}
            onChange={e => setGifUrl(e.target.value)}
            placeholder="วาง URL ของ GIF (tenor.com, giphy.com, ...)"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submitGif(); }
              if (e.key === 'Escape') setShowGif(false);
            }}
          />
          <button type="button" onClick={submitGif}>แทรก</button>
          <button type="button" className="gif-cancel" onClick={() => setShowGif(false)}>
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      {pendingMedia && (
        <div className="chat-media-pending">
          <div className="preview">
            <img src={pendingMedia.dataUrl} alt="" />
            {pendingMedia.kind === 'gif' && <span className="media-badge">GIF</span>}
          </div>
          <div className="meta">
            <div className="name">{pendingMedia.name}</div>
            {pendingMedia.isExternal && <div className="name" style={{ fontSize: 10, opacity: 0.6 }}>External URL</div>}
          </div>
          <button type="button" className="clear-btn" onClick={onClearMedia}>
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      <div className="field">
        <i className="fas fa-face-smile" style={{ color: 'var(--ink-3)' }}></i>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); SoundEngine.playKeyClick(); }}
          onPaste={handlePaste}
          placeholder={placeholder}
          maxLength={maxLength}
        />
      </div>
      <button type="submit" className="send" title="Send">
        <i className="fas fa-paper-plane"></i>
      </button>
    </form>
  );
}

// ── REACTIONS ─────────────────────────────────────────────────────────────
const MSG_REACT_EMOJIS = ['❤️','🔥','😂','😮','😢','👍','😍','🎉'];

function ReactionPicker({ onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onClose]);
  return (
    <div className="reaction-picker" ref={ref}>
      {MSG_REACT_EMOJIS.map(e => (
        <button
          key={e}
          className="react-pick-btn"
          onMouseDown={ev => { ev.preventDefault(); ev.stopPropagation(); onPick(e); onClose?.(); }}
        >{e}</button>
      ))}
    </div>
  );
}

function ReactionRow({ reactions, myUsername, onReact }) {
  if (!reactions || Object.keys(reactions).length === 0) return null;
  return (
    <div className="reaction-row">
      {Object.entries(reactions).map(([emoji, users]) => {
        const mine = Array.isArray(users) && users.includes(myUsername);
        return (
          <button
            key={emoji}
            className={`reaction-pill${mine ? ' mine' : ''}`}
            onClick={() => onReact(emoji)}
            title={Array.isArray(users) ? users.join(', ') : ''}
          >
            {emoji}<span className="reaction-count">{Array.isArray(users) ? users.length : 0}</span>
          </button>
        );
      })}
    </div>
  );
}

// -------- SIDEBAR -----------------------------------------------------------
function Sidebar({ page, onNav, user, queueCount, dmUnread, onAvatarSave, rooms, activeRoom, onRoomClick, onCreateRoom, onDeleteRoom, nowPlaying, onlineUsers, offlineUsers, onOpenDM, onLogout, onOpenProfile, theme, onToggleTheme }) {
  const { useState: useSt } = React;
  const [showCreateRoom, setShowCreateRoom] = useSt(false);
  const [newRoomName, setNewRoomName] = useSt('');
  const [newRoomSkin, setNewRoomSkin] = useSt('pink');
  const [createError, setCreateError] = useSt('');
  const [creating, setCreating] = useSt(false);
  const [showMobileSettings, setShowMobileSettings] = useSt(false);
  const [mobileAvatarPreview, setMobileAvatarPreview] = useSt(null);
  const [mobileAvatarSaving, setMobileAvatarSaving] = useSt(false);
  const canManageRooms = user && (user.role === 'dj' || user.role === 'admin');

  const submitCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      await onCreateRoom(newRoomName.trim(), newRoomSkin);
      setNewRoomName('');
      setShowCreateRoom(false);
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const np = nowPlaying || { dj: 'Chat Society Radio', track: 'Waiting for DJ', progress: 0, djSeed: 'imvu-society-radio', djAvatarUrl: '' };
  const allOnlineUsers = Array.isArray(onlineUsers)
    ? onlineUsers.filter((person) => person?.username)
    : [];
  const totalOnline = allOnlineUsers.length;

  // Group by role, ordered highest → lowest
  const ROLE_ORDER = ['admin', 'dj', 'vip', 'member', 'user', 'guest'];
  const ROLE_LABEL = { admin: 'Admin', dj: 'DJ', vip: 'VIP', member: 'Member', user: 'Member', guest: 'Guest' };
  const grouped = ROLE_ORDER.reduce((acc, r) => {
    const members = allOnlineUsers.filter(p => (p.role === r) || (r === 'member' && p.role === 'user'));
    // avoid duplicating 'user' under 'member'
    if (r === 'user') return acc;
    if (members.length > 0) acc.push({ role: r, label: ROLE_LABEL[r], members });
    return acc;
  }, []);

  return (
    <>
    <aside className="sidebar">
      <div className="brand">
        <img src="/logo.png" alt="Chat Society Radio" className="brand-logo-img" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
        <div className="brand-mark orange" style={{display:'none'}}>V</div>
        <div className="brand-name">Chat Society Radio</div>
        <div className="brand-tag">FM/01</div>
      </div>

      {/* Now Playing mini */}
      <div className="now-mini" onClick={() => onNav('live')}>
        <div className="now-mini-top">
          <span className="dot"></span>
          <span>NOW ON AIR</span>
          <span style={{ marginLeft: 'auto' }}>LIVE</span>
        </div>
        <div className="now-mini-body">
          <div className="now-mini-avatar">
            <img src={np.djAvatarUrl || AVATAR(np.djSeed)} alt="" />
          </div>
          <div className="now-mini-info">
            <div className="t">{np.dj}</div>
            <div className="a">{np.track}</div>
          </div>
          <div className="mini-eq"><span /><span /><span /></div>
        </div>
        <div className="mini-progress">
          <div className="mini-progress-fill" style={{ width: `${np.progress}%` }}></div>
        </div>
      </div>

      <div className="sidebar-nav-section">
        <div className="section-label">
          <span>Navigate</span>
        </div>
        <div className="nav">
          <div className={`nav-item ${page === 'live' ? 'active' : ''}`} onClick={() => onNav('live')}>
            <i className="fas fa-broadcast-tower nav-icon"></i>
            <span>Live</span>
            {page === 'live' ? (
              <div className="pulse-bars"><span /><span /><span /></div>
            ) : (
              <div className="live-dot"></div>
            )}
          </div>
          <div className={`nav-item ${page === 'explore' ? 'active' : ''}`} onClick={() => onNav('explore')}>
            <i className="fas fa-compass nav-icon"></i>
            <span>Explore</span>
            {page === 'explore' && <div className="pulse-bars"><span /><span /><span /></div>}
          </div>
          <div className={`nav-item ${page === 'request' ? 'active' : ''}`} onClick={() => onNav('live')}>
            <i className="fas fa-music nav-icon"></i>
            <span>Request</span>
          </div>
          <div className={`nav-item ${page === 'queue' ? 'active' : ''}`} onClick={() => onNav('live')}>
            <i className="fas fa-list-ol nav-icon"></i>
            <span>Queue</span>
            <span className="badge">{queueCount}</span>
          </div>
          {roleLevel(user.role) >= 2 && (
            <div className={`nav-item ${page === 'dm' ? 'active' : ''}`} onClick={() => onNav('dm')}>
              <i className="fas fa-comment-dots nav-icon"></i>
              <span>Messages</span>
              {dmUnread > 0 && page !== 'dm' ? <span className="badge">{dmUnread}</span> : page === 'dm' && <div className="pulse-bars"><span /><span /><span /></div>}
            </div>
          )}
          {(user.role === 'admin' || user.can_admin) && (
            <div className={`nav-item ${page === 'admin' ? 'active' : ''}`} onClick={() => onNav('admin')}>
              <i className="fas fa-sliders-h nav-icon"></i>
              <span>Admin{user.can_admin && user.role !== 'admin' && <span className="co-admin-tag"> ★</span>}</span>
              {page === 'admin' && <div className="pulse-bars"><span /><span /><span /></div>}
            </div>
          )}
          <div className={`nav-item ${page === 'rules' ? 'active' : ''}`} onClick={() => onNav('rules')}>
            <i className="fas fa-clipboard-list nav-icon"></i>
            <span>กฎห้อง</span>
          </div>
          {user && (
            <div className={`nav-item mobile-only ${showMobileSettings ? 'active' : ''}`} onClick={() => setShowMobileSettings(v => !v)}>
              <img src={mobileAvatarPreview || user.avatar_url || AVATAR(user.avatar_seed || user.name)} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
              <span>ฉัน</span>
            </div>
          )}
        </div>
      </div>

      <div className="stripe"></div>

      <div>
        <div className="section-label">
          <span>Rooms</span>
          {canManageRooms && (
            <span
              className="room-add-btn"
              title="สร้างห้องใหม่"
              onClick={() => { setShowCreateRoom(v => !v); setCreateError(''); }}
            >
              <i className="fas fa-plus" style={{ fontSize: 9 }}></i>
            </span>
          )}
        </div>

        {showCreateRoom && canManageRooms && (
          <div className="room-create-form">
            <input
              className="room-create-input"
              placeholder="ชื่อห้อง (a-z, 0-9, -)"
              value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitCreateRoom()}
              maxLength={30}
              autoFocus
            />
            <div className="room-skin-picker">
              {[['pink','#E87BA1'],['peach','#F19772'],['indigo','#9387D8'],['ocher','#D4A442']].map(([s, c]) => (
                <span
                  key={s}
                  className={`room-skin-dot ${newRoomSkin === s ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewRoomSkin(s)}
                />
              ))}
            </div>
            {createError && <div className="room-create-error">{createError}</div>}
            <div className="room-create-actions">
              <button className="room-create-submit" onClick={submitCreateRoom} disabled={creating}>
                {creating ? '...' : 'สร้างห้อง'}
              </button>
              <button className="room-create-cancel" onClick={() => setShowCreateRoom(false)}>ยกเลิก</button>
            </div>
          </div>
        )}

        <div className="rooms">
          {rooms.map(r => {
            const skinColor = { pink: '#E87BA1', peach: '#F19772', indigo: '#9387D8', ocher: '#D4A442' }[r.skin] || '#E87BA1';
            return (
              <div
                key={r.id}
                className={`room ${activeRoom === r.id ? 'active' : ''}`}
                onClick={() => onRoomClick && onRoomClick(r.id)}
              >
                <span className="hash">#</span>
                <span className="room-name">{r.name}</span>
                {r.listeners > 0 && <span className="listeners">{r.listeners}</span>}
                <span className="skin-dot" style={{ background: skinColor }}></span>
                {canManageRooms && !r.is_default && (
                  <span
                    className="room-delete-btn"
                    title="ลบห้อง"
                    onClick={e => { e.stopPropagation(); onDeleteRoom && onDeleteRoom(r.id); }}
                  >
                    <i className="fas fa-times"></i>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="section-label">
          <span>Online</span>
          <span>{totalOnline}</span>
        </div>
        <div className="online-list">
          {grouped.length === 0 ? (
            <div className="online-empty">ไม่มีคนออนไลน์เพิ่มตอนนี้</div>
          ) : grouped.map(({ role, label, members }) => (
            <div key={role} className="online-group">
              <div className="online-group-label">
                {roleMeta(role).emoji} {label} — {members.length}
              </div>
              {members.map((person) => (
                <div
                  key={person.username}
                  className="online-user"
                  onClick={() => { if (onOpenDM) onOpenDM(person.username); }}
                  onContextMenu={(e) => { e.preventDefault(); if (onOpenDM) onOpenDM(person.username); }}
                  title={`คลิกเพื่อแชทกับ @${person.username}`}
                >
                  <div className="avatar">
                    <img src={person.avatar_url || AVATAR(person.avatar_seed || person.username)} alt="" />
                    <div className="status"></div>
                  </div>
                  <div className="info">
                    <div className="name" style={person.name_color ? { color: person.name_color } : undefined}>
                      {roleMeta(person.role).emoji} {person.display_name || person.username}
                    </div>
                  </div>
                  <i className="fas fa-comment-dots action"></i>
                </div>
              ))}
            </div>
          ))}

          {/* Recently offline */}
          {Array.isArray(offlineUsers) && offlineUsers.length > 0 && (
            <div className="online-group offline-group">
              <div className="online-group-label offline-label">
                💤 Offline — {offlineUsers.length}
              </div>
              {offlineUsers.map((person) => (
                <div key={person.username} className="online-user offline-user">
                  <div className="avatar">
                    <img src={person.avatar_url || AVATAR(person.avatar_seed || person.username)} alt="" />
                    <div className="status offline"></div>
                  </div>
                  <div className="info">
                    <div className="name offline-name">
                      {roleMeta(person.role).emoji} {person.display_name || person.username}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="user-pill">
        <div className="avatar">
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" />
            : <img src={AVATAR(user.avatar_seed || user.name)} alt="" />
          }
          <div className="status"></div>
        </div>
        <div className="info">
          <div className="name">{user.display_name || user.name}</div>
          <div className="role">{roleMeta(user.role).emoji} {roleMeta(user.role).label}</div>
        </div>
        <div className="user-pill-actions">
          <button
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'เปลี่ยนเป็น Light Mode' : 'เปลี่ยนเป็น Dark Mode'}
          >
            <i className={`fas fa-${theme === 'dark' ? 'sun' : 'moon'}`}></i>
          </button>
          {onOpenProfile && (
            <div className="icon-btn" title="ตั้งค่าโปรไฟล์" onClick={onOpenProfile} style={{ cursor: 'pointer' }}>
              <i className="fas fa-gear"></i>
            </div>
          )}
          {onLogout && (
            <div className="icon-btn" title="ออกจากระบบ" onClick={onLogout} style={{ cursor: 'pointer' }}>
              <i className="fas fa-sign-out-alt"></i>
            </div>
          )}
        </div>
      </div>
    </aside>

    {showMobileSettings && user && (
      <div className="mobile-settings-overlay" onClick={() => setShowMobileSettings(false)}>
        <div className="mobile-settings-sheet" onClick={e => e.stopPropagation()}>
          <div className="mobile-settings-handle" />

          {/* Avatar + info */}
          <div className="mobile-settings-profile">
            <label className="mobile-settings-avatar-label">
              <img src={mobileAvatarPreview || user.avatar_url || AVATAR(user.avatar_seed || user.name)} alt="" />
              <div className="mobile-settings-avatar-overlay">
                <i className="fas fa-camera" />
              </div>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={async e => {
                const file = e.target.files?.[0];
                if (!file || !onAvatarSave) return;
                const reader = new FileReader();
                reader.onload = async ev => {
                  const b64 = ev.target.result;
                  setMobileAvatarPreview(b64);
                  setMobileAvatarSaving(true);
                  await onAvatarSave(b64);
                  setMobileAvatarSaving(false);
                };
                reader.readAsDataURL(file);
              }} />
            </label>
            {mobileAvatarSaving && <div style={{ fontSize: 11, color: 'var(--pink)', marginTop: 4 }}>กำลังบันทึก...</div>}
            <div className="mobile-settings-display-name">{user.display_name || user.name}</div>
            <div className="mobile-settings-role">{roleMeta(user.role).emoji} {roleMeta(user.role).label}</div>
          </div>

          {/* Action buttons */}
          <div className="mobile-settings-actions">
            <button className="mobile-settings-btn" onClick={onToggleTheme}>
              <i className={`fas fa-${theme === 'dark' ? 'sun' : 'moon'}`} />
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            {onOpenProfile && (
              <button className="mobile-settings-btn" onClick={() => { setShowMobileSettings(false); onOpenProfile(); }}>
                <i className="fas fa-user-edit" />
                <span>แก้ไขโปรไฟล์</span>
              </button>
            )}
            {onLogout && (
              <button className="mobile-settings-btn danger" onClick={onLogout}>
                <i className="fas fa-sign-out-alt" />
                <span>ออกจากระบบ</span>
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// -------- PROMO BANNER -------------------------------------------------------
function PromoBanner({ onSignup, user }) {
  if (user && ['vip','dj','admin'].includes(user.role)) return null;
  const texts = [
    '💎 สมัคร VIP รับสิทธิพิเศษทันที!',
    '🎨 เปลี่ยนสีชื่อและสีแชทได้',
    '📩 ใช้งาน Messenger ส่วนตัวได้',
    '🖼️ อัปโหลดรูปภาพในแชทได้',
    '✨ VIP เพียง ฿19/เดือน หรือ ฿49/3 เดือน',
  ];
  return (
    <div className="promo-banner">
      <div className="promo-track">
        {[...texts, ...texts].map((t, i) => (
          <span key={i} className="promo-item">{t}</span>
        ))}
      </div>
      <button className="promo-cta" onClick={onSignup}>สมัครเลย →</button>
    </div>
  );
}

// -------- TOPBAR -----------------------------------------------------------
function TopBar({ crumb, title, meta, listeners, onToggleChat, chatOpen }) {
  return (
    <header className="topbar">
      <div>
        <div className="crumb">{crumb}</div>
        <div className="title">{title}</div>
      </div>
      <div className="sep"></div>
      <div className="meta">{meta}</div>

      <div className="topbar-right">
        <div className="listener-pill">
          <div className="pulse"></div>
          <span>{listeners.toLocaleString()} listeners</span>
        </div>
        <button className="icon-square" title="Notifications">
          <i className="fas fa-bell"></i>
          <div className="dot"></div>
        </button>
        <button
          className="icon-square"
          onClick={onToggleChat}
          title="Toggle request & queue"
          style={chatOpen ? { background: 'var(--ink)', color: 'var(--bg)' } : null}
        >
          <i className="fas fa-list-ol"></i>
        </button>
      </div>
    </header>
  );
}

// -------- CHAT -----------------------------------------------------------
function ChatPanel({ messages, onSend, onClose }) {
  const [text, setText] = useState('');
  const [pendingMedia, setPendingMedia] = useState(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim() && !pendingMedia) return;
    onSend({ message: text.trim(), media: pendingMedia });
    setText('');
    setPendingMedia(null);
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <div>
          <div className="pre">channel</div>
          <h3>Live Chat</h3>
        </div>
        <div className="right">
          <button className="icon-btn-sm" title="Slow mode"><i className="fas fa-clock"></i></button>
          <button className="icon-btn-sm" onClick={onClose} title="Close"><i className="fas fa-times"></i></button>
        </div>
      </div>

      <div className="chat-body" ref={bodyRef}>
        {messages.map((m, i) => (
          m.system ? (
            <div key={i} className="msg system">
              <div className="text">{m.text}</div>
            </div>
          ) : (
            <div key={i} className="msg">
              <div className="av"><img src={AVATAR(m.name)} alt="" /></div>
              <div className="body">
                <div className="head-line">
                  <span className={`name ${m.dj ? 'dj' : ''}`}>{m.name}</span>
                  <span className="time">{m.time}</span>
                </div>
                <div className="text">{m.text}</div>
                <ChatMessageMedia mediaUrl={m.media_url} mediaType={m.media_type} />
              </div>
            </div>
          )
        ))}
      </div>

      <ChatComposer
        value={text}
        onChange={setText}
        onSubmit={submit}
        placeholder="Message the room..."
        maxLength={300}
        pendingMedia={pendingMedia}
        onPickMedia={setPendingMedia}
        onClearMedia={() => setPendingMedia(null)}
      />
    </div>
  );
}

// Floating emoji animator
function FloatLayer({ items }) {
  return (
    <div className="float-area">
      {items.map(it => (
        <div
          key={it.id}
          className="float-emoji"
          style={{ left: it.x, animationDuration: `${it.dur}s` }}
        >
          {it.emoji}
        </div>
      ))}
    </div>
  );
}

// Toast
function Toasts({ items }) {
  return (
    <div className="toast-container">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>
          <i className={`fas fa-${t.kind === 'success' ? 'check' : 'info-circle'}`}></i>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Sidebar, TopBar, ChatPanel, FloatLayer, Toasts, AVATAR });
