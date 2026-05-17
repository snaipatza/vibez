/* Shared building blocks for IMVU Society Radio */

const { useState, useEffect, useRef, useMemo } = React;

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
  if (!mediaUrl) return null;
  return (
    <div className={`chat-media ${mediaType === 'gif' ? 'gif' : 'image'}`}>
      <img src={mediaUrl} alt="" loading="lazy" />
      {mediaType === 'gif' && <span className="media-badge">GIF</span>}
    </div>
  );
}

function ChatComposer({ value, onChange, onSubmit, placeholder, maxLength, pendingMedia, onPickMedia, onClearMedia, userRole }) {
  const fileRef = useRef(null);
  const canUpload = roleLevel(userRole) >= 2;

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
                  onPickMedia({
                    dataUrl,
                    name: file.name,
                    kind: file.type === 'image/gif' ? 'gif' : 'image',
                  });
                } catch (err) {
                  alert(err.message || 'Unable to read file');
                }
              }}
            />
          </>
        )}
      </div>

      {pendingMedia && (
        <div className="chat-media-pending">
          <div className="preview">
            <img src={pendingMedia.dataUrl} alt="" />
            {pendingMedia.kind === 'gif' && <span className="media-badge">GIF</span>}
          </div>
          <div className="meta">
            <div className="name">{pendingMedia.name}</div>
          </div>
          <button type="button" className="clear-btn" onClick={onClearMedia}>
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      <div className="field">
        <i className="fas fa-face-smile" style={{ color: 'var(--ink-3)' }}></i>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
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

// -------- SIDEBAR -----------------------------------------------------------
function Sidebar({ page, onNav, user, queueCount, rooms, activeRoom, onRoomClick, nowPlaying, onlineUsers, onOpenDM, onLogout, onOpenProfile }) {
  const np = nowPlaying || { dj: 'IMVU Society Radio', track: 'Waiting for DJ', progress: 0, djSeed: 'imvu-society-radio', djAvatarUrl: '' };
  const visibleOnlineUsers = Array.isArray(onlineUsers)
    ? onlineUsers.filter((person) => person?.username && person.username !== user.name).slice(0, 8)
    : [];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark orange">V</div>
        <div className="brand-name">IMVU Society Radio</div>
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

      <div>
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
              {page === 'dm' && <div className="pulse-bars"><span /><span /><span /></div>}
            </div>
          )}
          {user.role === 'admin' && (
            <div className={`nav-item ${page === 'admin' ? 'active' : ''}`} onClick={() => onNav('admin')}>
              <i className="fas fa-sliders-h nav-icon"></i>
              <span>Admin</span>
              {page === 'admin' && <div className="pulse-bars"><span /><span /><span /></div>}
            </div>
          )}
        </div>
      </div>

      <div className="stripe"></div>

      <div>
        <div className="section-label">
          <span>Rooms</span>
          <span><i className="fas fa-plus" style={{ fontSize: 9, color: 'var(--ink-3)' }}></i></span>
        </div>
        <div className="rooms">
          {rooms.map(r => {
            const skinColor = {
              pink: '#E87BA1',
              peach: '#F19772',
              indigo: '#9387D8',
              ocher: '#D4A442',
            }[r.skin] || '#E87BA1';
            return (
              <div
                key={r.id}
                className={`room ${activeRoom === r.id ? 'active' : ''}`}
                onClick={() => onRoomClick && onRoomClick(r.id)}
              >
                <span className="hash">#</span>
                <span>{r.name}</span>
                <span className="listeners">{r.listeners}</span>
                <span className="skin-dot" style={{ background: skinColor }}></span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="section-label">
          <span>Online</span>
          <span>{visibleOnlineUsers.length}</span>
        </div>
        <div className="online-list">
          {visibleOnlineUsers.length === 0 ? (
            <div className="online-empty">ไม่มีคนออนไลน์เพิ่มตอนนี้</div>
          ) : visibleOnlineUsers.map((person) => (
            <div
              key={person.username}
              className="online-user"
              onClick={() => {
                if (onOpenDM) onOpenDM(person.username);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (onOpenDM) onOpenDM(person.username);
              }}
              title={`คลิกเพื่อแชทกับ @${person.username}`}
            >
              <div className="avatar">
                <img src={person.avatar_url || AVATAR(person.avatar_seed || person.username)} alt="" />
                <div className="status"></div>
              </div>
              <div className="info">
                <div className="name">@{person.username}</div>
                <div className="role">{roleMeta(person.role).emoji} {roleMeta(person.role).label}</div>
              </div>
              <i className="fas fa-comment-dots action"></i>
            </div>
          ))}
        </div>
      </div>

      <div className="user-pill" onClick={onOpenProfile} style={{ cursor: onOpenProfile ? 'pointer' : 'default' }} title="แก้ไขโปรไฟล์">
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
        {onLogout && (
          <div className="icon-btn" title="ออกจากระบบ" onClick={(e) => { e.stopPropagation(); onLogout(); }} style={{ cursor: 'pointer' }}>
            <i className="fas fa-sign-out-alt"></i>
          </div>
        )}
      </div>
    </aside>
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
