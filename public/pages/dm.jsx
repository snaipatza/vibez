// DM (Direct Messages) page - wired to backend
function DMPage({ user, listeners, chatOpen, setChatOpen, toast, initialTarget }) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeUser, setActiveUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const bodyRef = useRef(null);
  const lastMsgIdRef = useRef(0);

  const loadInbox = async () => {
    try {
      const r = await fetch('/api/dm/inbox');
      const data = await r.json();
      setConversations(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInbox();
    const id = setInterval(loadInbox, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0].username);
      setActiveUser(conversations[0]);
    }
    if (activeId) {
      const match = conversations.find(c => c.username === activeId);
      if (match) setActiveUser(match);
    }
  }, [conversations, activeId]);

  useEffect(() => {
    if (!initialTarget) return;
    const targetUsername = typeof initialTarget === 'string' ? initialTarget : initialTarget.username;
    if (!targetUsername) return;
    setActiveId(targetUsername);
    const match = conversations.find(c => c.username === targetUsername);
    if (match) {
      setActiveUser(match);
      return;
    }
    if (typeof initialTarget === 'object') {
      setActiveUser({
        username: targetUsername,
        avatar_seed: initialTarget.avatar_seed,
        avatar_url: initialTarget.avatar_url,
        role: initialTarget.role,
        online: true,
      });
    }
  }, [initialTarget, conversations]);

  useEffect(() => {
    if (!activeId) return;
    lastMsgIdRef.current = 0;
    setMessages([]);
    let stopped = false;

    const loadMsgs = async () => {
      try {
        const r = await fetch(`/api/dm/${encodeURIComponent(activeId)}?after=${lastMsgIdRef.current}`);
        const data = await r.json();
        if (stopped || !Array.isArray(data) || data.length === 0) return;
        lastMsgIdRef.current = data[data.length - 1].id;
        setMessages(m => [...m, ...data].slice(-200));
      } catch {}
    };

    loadMsgs();
    const id = setInterval(loadMsgs, 2500);
    return () => { stopped = true; clearInterval(id); };
  }, [activeId]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeId) return;
    const t = text.trim();
    setText('');
    try {
      const res = await fetch('/api/dm/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: activeId, message: t }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'ส่งไม่สำเร็จ');
        setText(t);
        return;
      }
      setMessages(prev => [...prev, {
        id: data.id || Date.now(),
        from_username: user.name,
        to_username: activeId,
        message: t,
        created_at: new Date().toISOString(),
      }].slice(-200));
      loadInbox();
    } catch {
      toast('ส่งไม่สำเร็จ');
      setText(t);
    }
  };

  const filtered = conversations.filter(c =>
    c.username.toLowerCase().includes(search.toLowerCase())
  );
  const totalUnread = conversations.reduce((s, c) => s + (c.unread || 0), 0);

  const fmtTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000 / 86400;
    if (diff < 1 && d.toDateString() === now.toDateString()) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    if (diff < 2) return 'YDAY';
    if (diff < 7) return d.toLocaleDateString('en', { weekday: 'short' }).toUpperCase();
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };

  return (
    <>
      <TopBar
        crumb="MESSAGES / INBOX"
        title="Messages"
        meta={`${conversations.length} conversations / ${totalUnread} unread`}
        listeners={listeners}
        onToggleChat={() => setChatOpen(v => !v)}
        chatOpen={chatOpen}
      />

      <div className="content no-chat">
        <div className="dm-layout">
          <aside className="dm-inbox">
            <div className="dm-inbox-head">
              <div className="pre">- Inbox</div>
              <h2>ข้อความ {totalUnread > 0 && <span style={{ color: 'var(--orange-deep)' }}>· {totalUnread}</span>}</h2>
            </div>
            <div className="dm-search">
              <div className="search-field">
                <i className="fas fa-search"></i>
                <input
                  placeholder="ค้นหาคน..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="dm-list">
              {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
                  <i className="fas fa-spinner fa-spin"></i> กำลังโหลด...
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
                  ยังไม่มีข้อความส่วนตัว
                </div>
              ) : filtered.map(c => (
                <div
                  key={c.username}
                  className={`dm-row ${c.username === activeId ? 'active' : ''} ${c.unread > 0 ? 'unread' : ''}`}
                  onClick={() => { setActiveId(c.username); setActiveUser(c); }}
                >
                  <div className="av">
                    <img src={c.avatar_url || AVATAR(c.avatar_seed || c.username)} alt="" />
                    {c.online ? <div className="online-dot"></div> : null}
                  </div>
                  <div className="info">
                    <div className="top-line">
                      <span className="name">@{c.username}</span>
                      {c.role === 'dj' && <span className="name-tag">DJ</span>}
                    </div>
                    <div className="preview">{c.last_message || '-'}</div>
                  </div>
                  <div className="meta">
                    <span className="time">{fmtTime(c.last_at)}</span>
                    {c.unread > 0 && <span className="unread-pill">{c.unread}</span>}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {activeUser ? (
            <section className="dm-thread">
              <header className="dm-thread-head">
                <div className="av">
                  <img src={activeUser.avatar_url || AVATAR(activeUser.avatar_seed || activeUser.username)} alt="" />
                  {activeUser.online ? <div className="online-dot"></div> : null}
                </div>
                <div className="info">
                  <div className="name">
                    @{activeUser.username}
                    {activeUser.role === 'dj' && <span className="name-tag" style={{ fontSize: 9, padding: '2px 7px' }}>DJ</span>}
                  </div>
                  <div className="status">
                    {activeUser.online
                      ? <>active now<span className="live-mini">ONLINE</span></>
                      : 'offline'}
                  </div>
                </div>
              </header>

              <div className="dm-thread-body" ref={bodyRef}>
                {messages.map((m) => {
                  const mine = m.from_username === user.name;
                  return (
                    <div key={m.id} className={`dm-msg ${mine ? 'mine' : 'theirs'}`}>
                      <div className="bubble">{m.message}</div>
                      <div className="stamp">
                        {m.created_at ? new Date(m.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
                      </div>
                    </div>
                  );
                })}
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 30, fontSize: 13 }}>
                    เริ่มการสนทนาด้วยข้อความแรกของคุณ
                  </div>
                )}
              </div>

              <div className="dm-input">
                <form onSubmit={sendMessage}>
                  <div className="field">
                    <span className="icon-mini"><i className="fas fa-smile"></i></span>
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={`ส่งข้อความหา @${activeUser.username}...`}
                      maxLength={500}
                    />
                  </div>
                  <button type="submit" className="send">
                    <i className="fas fa-paper-plane"></i>
                  </button>
                </form>
              </div>
            </section>
          ) : (
            <div className="dm-empty">
              <div className="icon"><i className="fas fa-comment-dots"></i></div>
              <h3>เลือกการสนทนา</h3>
              <p>เลือกคนจากด้านซ้ายเพื่อเริ่มแชต</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

window.DMPage = DMPage;
