// DM (Direct Messages) page - wired to backend
function DMPage({ user, listeners, chatOpen, setChatOpen, toast, initialTarget }) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeUser, setActiveUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [pendingMedia, setPendingMedia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reactions, setReactions] = useState({});   // { [dmId]: { [emoji]: [usernames] } }
  const [pickerMsgId, setPickerMsgId] = useState(null);
  const bodyRef = useRef(null);
  const lastMsgIdRef = useRef(0);

  const prevUnreadRef = useRef(0);

  const loadInbox = async () => {
    try {
      const r = await fetch('/api/dm/inbox');
      const data = await r.json();
      if (Array.isArray(data)) {
        const totalUnread = data.reduce((s, c) => s + (c.unread || 0), 0);
        if (totalUnread > prevUnreadRef.current) SoundEngine.playDMNotify();
        prevUnreadRef.current = totalUnread;
        setConversations(data);
      }
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

  const initialTargetApplied = useRef(false);
  useEffect(() => {
    if (!initialTarget || initialTargetApplied.current) return;
    const targetUsername = typeof initialTarget === 'string' ? initialTarget : initialTarget.username;
    if (!targetUsername) return;
    initialTargetApplied.current = true;
    setActiveId(targetUsername);
    if (typeof initialTarget === 'object') {
      setActiveUser({
        username: targetUsername,
        avatar_seed: initialTarget.avatar_seed,
        avatar_url: initialTarget.avatar_url,
        role: initialTarget.role,
        online: true,
      });
    }
  }, [initialTarget]);

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

  // Poll DM reactions every 5s when a conversation is open
  useEffect(() => {
    if (!activeId) return;
    setReactions({});
    const fetchRx = async () => {
      try {
        const r = await fetch(`/api/dm/${encodeURIComponent(activeId)}/reactions`);
        const data = await r.json();
        if (data && typeof data === 'object') setReactions(data);
      } catch {}
    };
    fetchRx();
    const id = setInterval(fetchRx, 5000);
    return () => clearInterval(id);
  }, [activeId]);

  const onReact = async (dmId, emoji) => {
    setReactions(prev => {
      const msgRx = { ...(prev[dmId] || {}) };
      const users = [...(msgRx[emoji] || [])];
      const idx = users.indexOf(user.name);
      if (idx >= 0) users.splice(idx, 1); else users.push(user.name);
      if (users.length === 0) { delete msgRx[emoji]; } else { msgRx[emoji] = users; }
      return { ...prev, [dmId]: msgRx };
    });
    setPickerMsgId(null);
    try {
      await fetch(`/api/dm/message/${dmId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
    } catch {}
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if ((!text.trim() && !pendingMedia) || !activeId) return;
    const t = text.trim();
    setText('');
    try {
      const res = await fetch('/api/dm/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: activeId, message: t, media_data: pendingMedia?.dataUrl || '' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'ส่งไม่สำเร็จ');
        setText(t);
        return;
      }
      const newId = data.id || Date.now();
      if (data.id) lastMsgIdRef.current = Math.max(lastMsgIdRef.current, data.id);
      setMessages(prev => [...prev, {
        id: newId,
        from_username: user.name,
        to_username: activeId,
        message: t,
        media_url: data.media_url || '',
        media_type: data.media_type || '',
        created_at: new Date().toISOString(),
      }].slice(-200));
      setPendingMedia(null);
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

  const conversationPreview = (c) => {
    if (c.last_message) return c.last_message;
    if (c.last_media_type === 'gif') return '[GIF]';
    if (c.last_media_type === 'image') return '[Image]';
    return '-';
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
                    <div className="preview">{conversationPreview(c)}</div>
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
                    <div key={m.id} className={`dm-msg ${mine ? 'mine' : 'theirs'}`} style={{ position: 'relative' }}>
                      <div className="dm-msg-inner">
                        {!mine && (
                          <button
                            className={`dm-react-trigger${pickerMsgId === m.id ? ' active' : ''}`}
                            onClick={() => setPickerMsgId(pickerMsgId === m.id ? null : m.id)}
                            title="React"
                          >😊</button>
                        )}
                        <div className="dm-bubble-wrap">
                          <div className="bubble">
                            {m.message ? <div>{m.message}</div> : null}
                            <ChatMessageMedia mediaUrl={m.media_url} mediaType={m.media_type} />
                          </div>
                          <ReactionRow
                            reactions={reactions[m.id]}
                            myUsername={user.name}
                            onReact={(emoji) => onReact(m.id, emoji)}
                          />
                          {pickerMsgId === m.id && (
                            <ReactionPicker
                              onPick={(emoji) => onReact(m.id, emoji)}
                              onClose={() => setPickerMsgId(null)}
                            />
                          )}
                        </div>
                        {mine && (
                          <button
                            className={`dm-react-trigger${pickerMsgId === m.id ? ' active' : ''}`}
                            onClick={() => setPickerMsgId(pickerMsgId === m.id ? null : m.id)}
                            title="React"
                          >😊</button>
                        )}
                      </div>
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
                <ChatComposer
                  value={text}
                  onChange={setText}
                  onSubmit={sendMessage}
                  placeholder={`Message @${activeUser.username}...`}
                  maxLength={500}
                  pendingMedia={pendingMedia}
                  onPickMedia={setPendingMedia}
                  onClearMedia={() => setPendingMedia(null)}
                  userRole={user.role}
                />
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
