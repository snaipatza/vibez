// Live Stream page — wired to real APIs with 3s polling
const { useState, useEffect, useRef } = React;

const REACTIONS_INIT = [
  { emoji: '🔥', count: 0, hot: false },
  { emoji: '❤️', count: 0, hot: false },
  { emoji: '🎵', count: 0, hot: false },
  { emoji: '🎉', count: 0, hot: false },
  { emoji: '💜', count: 0, hot: false },
  { emoji: '🙌', count: 0, hot: false },
];

function fmtTime(d) {
  try {
    const t = new Date(d);
    return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
  } catch { return ''; }
}

function fmtSec(s) {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
}

function msgFromApi(m) {
  if (m.role === 'system' || m.username === 'SYSTEM') {
    return { system: true, text: m.message };
  }
  return {
    name: m.username,
    dj: m.role === 'dj',
    text: m.message,
    time: fmtTime(m.created_at),
    id: m.id,
    avatar_seed: m.avatar_seed || m.username,
    avatar_url: m.avatar_url || '',
  };
}

function adIcon(ad) {
  if (ad.image_url) return null;
  const icons = ['fa-mug-hot','fa-record-vinyl','fa-utensils','fa-headphones','fa-store','fa-tag'];
  return 'fas ' + icons[ad.id % icons.length];
}

function LivePage({ user, chatOpen, setChatOpen, listeners, setListeners, setQueueCount, toast, floats, sendReaction }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(75);
  const [queue, setQueue] = useState([]);
  const [chat, setChat] = useState([]);
  const [ads, setAds] = useState([]);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [searchVal, setSearchVal] = useState('');
  const [reactions, setReactions] = useState(REACTIONS_INIT);
  const [openAd, setOpenAd] = useState(null);

  // Feature state
  const [hype, setHype] = useState(20);
  const [tips, setTips] = useState(0);
  const [hearts, setHearts] = useState([]);
  const [confetti, setConfetti] = useState(false);
  const [mood, setMood] = useState('hype');
  const [poll, setPoll] = useState(null);
  const tipBtnRef = useRef(null);
  const lastMsgIdRef = useRef(0);
  const totalSecRef = useRef(252);

  // Poll every 3s
  useEffect(() => {
    const loadAll = async () => {
      try {
        const [qRes, mRes, npRes, onRes] = await Promise.all([
          fetch('/api/queue').then(r => r.json()),
          fetch(`/api/messages?after=${lastMsgIdRef.current}`).then(r => r.json()),
          fetch('/api/now-playing').then(r => r.json()),
          fetch('/api/online').then(r => r.json()),
        ]);

        // Queue
        if (Array.isArray(qRes)) {
          const mapped = qRes.map(q => ({
            id: q.id,
            title: q.title,
            artist: q.artist || '',
            requester: q.requested_by || '',
            votes: q.votes || 0,
            voted: q.userVoted || false,
            status: q.status,
          }));
          setQueue(mapped);
          setQueueCount(mapped.filter(q => q.status !== 'played').length);
        }

        // Messages — append new ones
        if (Array.isArray(mRes) && mRes.length > 0) {
          const newMsgs = mRes.map(msgFromApi);
          setChat(prev => {
            const existingIds = new Set(prev.filter(m => m.id).map(m => m.id));
            const toAdd = newMsgs.filter(m => !m.id || !existingIds.has(m.id));
            if (toAdd.length === 0) return prev;
            return [...prev, ...toAdd].slice(-100);
          });
          lastMsgIdRef.current = mRes[mRes.length - 1].id;
        }

        // Now playing
        if (npRes.youtube_id) {
          setNowPlaying(npRes);
          setPlaying(!!npRes.is_playing);
          if (npRes.duration) totalSecRef.current = npRes.duration;
          if (npRes.elapsed_seconds != null) {
            const pct = Math.min(100, (npRes.elapsed_seconds / (totalSecRef.current || 252)) * 100);
            setProgress(pct);
          }
        } else {
          setNowPlaying(null);
          setPlaying(false);
          setProgress(0);
        }

        // Online
        if (onRes.online != null) setListeners(onRes.online);
      } catch {}
    };

    loadAll();
    const id = setInterval(loadAll, 3000);
    return () => clearInterval(id);
  }, []);

  // Load ads once
  useEffect(() => {
    fetch('/api/ads')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setAds(d);
      })
      .catch(() => {});
  }, []);

  // Hype decay
  useEffect(() => {
    const t = setInterval(() => setHype(h => Math.max(0, h - 0.4)), 1500);
    return () => clearInterval(t);
  }, []);

  // Confetti at 100
  useEffect(() => {
    if (hype >= 100) {
      setConfetti(true);
      toast('🎉 HYPE เต็ม! ขอบคุณทุกคน', 'success');
      setHype(40);
      setTimeout(() => setConfetti(false), 2800);
    }
  }, [hype]);

  const curSec = (progress / 100) * totalSecRef.current;

  const vote = async (id) => {
    try {
      const res = await fetch(`/api/queue/${id}/vote`, { method: 'POST' });
      const data = await res.json();
      setQueue(q => q.map(item =>
        item.id === id ? { ...item, votes: data.votes, voted: data.voted } : item
      ).sort((a, b) => b.votes - a.votes));
    } catch {}
  };

  const submitRequest = async (e) => {
    e.preventDefault();
    if (!searchVal.trim()) return;
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: searchVal.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      setSearchVal('');
      toast(`ส่งคำขอแล้ว ✓`, 'success');
      setHype(h => Math.min(100, h + 5));
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  const onSendChat = async (text) => {
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      setHype(h => Math.min(100, h + 2));
    } catch {}
  };

  const onReaction = (emoji) => {
    setReactions(rs => rs.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, hot: true } : r));
    sendReaction(emoji);
    setHype(h => Math.min(100, h + 6));
  };

  const sendTip = () => {
    if (!tipBtnRef.current) return;
    const btn = tipBtnRef.current.getBoundingClientRect();
    const portrait = document.querySelector('.dj-portrait');
    const pr = portrait?.getBoundingClientRect();
    const targetX = pr ? pr.left + pr.width / 2 : btn.left;
    const targetY = pr ? pr.top + pr.height / 2 : btn.top - 200;
    const id = Date.now() + Math.random();
    const dx = targetX - btn.left + (Math.random() - 0.5) * 40;
    const dy = targetY - btn.top + (Math.random() - 0.5) * 30;
    const emojis = ['❤️','💗','💖','💕'];
    setHearts(hs => [...hs, { id, x: btn.left + 4, y: btn.top + 4, dx, dy, emoji: emojis[Math.floor(Math.random() * emojis.length)] }]);
    setTimeout(() => setHearts(hs => hs.filter(h => h.id !== id)), 1700);
    setTips(t => t + 1);
    setHype(h => Math.min(100, h + 3));
  };

  const djSeed = nowPlaying?.dj_avatar_seed || 'IMVURADIO';
  const djAvatarUrl = nowPlaying?.dj_avatar_url || '';
  const djName = nowPlaying?.dj_username || 'IMVU Radio';
  const trackTitle = nowPlaying?.title || 'รอ VJ เปิดเพลง...';
  const trackArtist = nowPlaying?.artist || '';

  return (
    <>
      <TopBar
        crumb="ROOM ⁄ MAIN-STAGE"
        title="IMVU Society Radio"
        meta={nowPlaying?.title ? `🎧 ${nowPlaying.title}` : 'รอ VJ เปิดเพลง...'}
        listeners={listeners}
        onToggleChat={() => setChatOpen(v => !v)}
        chatOpen={chatOpen}
      />

      <div className={`content ${chatOpen ? '' : 'no-chat'}`}>
        <div className="stage">
          {/* Player */}
          <div className="player">
            <HypeMeter value={hype} />
            <div className="player-grid">
              <div className="vinyl-stage" data-mood={mood}>
                <span className="corner-tick tl"></span>
                <span className="corner-tick tr"></span>
                <span className="corner-tick bl"></span>
                <span className="corner-tick br"></span>
                <div className="corner-label">IMVU RADIO</div>
                <div className="corner-label right">ON AIR ⁄ LIVE</div>
                {nowPlaying?.youtube_id && <div className="corner-label bottom">YOUTUBE LIVE</div>}

                <BeatWaves />
                <div className="dj-portrait">
                  <div className={`ring-outer ${playing ? '' : 'paused'}`}></div>
                  <div className="ring-mid"></div>
                  <div className={`ring-inner ${playing ? '' : 'paused'}`}></div>
                  <div className="dj-photo">
                    {djAvatarUrl
                      ? <img src={djAvatarUrl} alt="DJ" />
                      : <img src={AVATAR(djSeed)} alt="DJ" />
                    }
                  </div>
                  <MoodSticker mood={mood} />
                  <div className="dj-handle">@{djName}</div>
                </div>
              </div>

              <div className="player-body">
                <div className="now-row">
                  <div className="live-tag"><div className="dot"></div> ON AIR</div>
                  {nowPlaying && <div className="eq"><span /><span /><span /><span /><span /></div>}
                  <div className="meta">— IMVU Society Radio</div>
                </div>

                <div>
                  <h1 className="track-title">{trackTitle}</h1>
                  {trackArtist && (
                    <p className="track-artist">
                      <span className="by">by</span>
                      {trackArtist}
                    </p>
                  )}
                </div>

                {nowPlaying && (
                  <div className="progress-row">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="progress-times">
                      <span>{fmtSec(curSec)}</span>
                      <span>—{fmtSec(totalSecRef.current - curSec)}</span>
                    </div>
                  </div>
                )}

                {/* Mood picker + tip jar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                  <MoodPicker mood={mood} onPick={setMood} />
                  <div style={{ marginLeft: 'auto' }}>
                    <TipJar count={tips} onTip={sendTip} btnRef={tipBtnRef} />
                  </div>
                </div>
              </div>
            </div>

            <div className="reactions">
              {reactions.map(r => (
                <button key={r.emoji} className={`reaction ${r.hot ? 'hot' : ''}`} onClick={() => onReaction(r.emoji)}>
                  <span className="emoji">{r.emoji}</span>
                  <span>{r.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="section">
            <div className="section-head">
              <div>
                <div className="pre">— Live Chat</div>
                <h2>แชทห้อง main-stage</h2>
              </div>
              <div className="right">
                <span>{listeners} กำลังออนไลน์</span>
                <span>·</span>
                <span style={{ color: 'var(--orange-deep)' }}>● LIVE</span>
              </div>
            </div>

            <div className="chat-card">
              <ChatPanelInline messages={chat} onSend={onSendChat} user={user} />
            </div>

            {poll && <LivePoll poll={poll} onVote={(idx) => {
              setPoll(p => {
                if (p.voted === idx) return p;
                const options = p.options.map((o, i) => ({
                  ...o,
                  votes: i === idx ? o.votes + 1 : p.voted === i ? o.votes - 1 : o.votes,
                }));
                return { ...p, voted: idx, options };
              });
            }} />}
          </div>
        </div>

        {chatOpen && (
          <aside className="right-rail">
            {/* Request */}
            <div className="rail-section">
              <div className="rail-head">
                <div>
                  <div className="pre">— Request</div>
                  <h3>ขอเพลง</h3>
                </div>
              </div>
              <form className="rail-request" onSubmit={submitRequest}>
                <div className="search-field">
                  <i className="fas fa-search"></i>
                  <input
                    placeholder="ชื่อเพลง — ศิลปิน..."
                    value={searchVal}
                    onChange={e => setSearchVal(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary orange">
                  <i className="fas fa-paper-plane"></i> ส่งคำขอ
                </button>
              </form>
            </div>

            {/* Queue */}
            <div className="rail-section">
              <div className="rail-head">
                <div>
                  <div className="pre">— Up Next</div>
                  <h3>คิวเพลง</h3>
                </div>
                <span className="right">{queue.length} เพลง</span>
              </div>
              <div className="queue compact">
                {queue.length === 0 && (
                  <div style={{ padding: '14px 10px', color: 'var(--ink-mute)', fontSize: 13 }}>
                    ยังไม่มีเพลงในคิว
                  </div>
                )}
                {queue.map((q, i) => (
                  <div key={q.id} className="queue-row">
                    <div className="pos">{q.status === 'playing' ? '▶' : String(i + 1).padStart(2, '0')}</div>
                    <div className="info">
                      <div className="t">{q.title}</div>
                      <div className="a">{q.artist}{q.artist && q.requester ? ' · ' : ''}{q.requester ? `@${q.requester}` : ''}</div>
                    </div>
                    <button className={`vote ${q.voted ? 'up' : ''}`} onClick={() => vote(q.id)}>
                      <i className="fas fa-chevron-up"></i>
                      <span>{q.votes}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Ads — always visible */}
            <div className="rail-section">
              <div className="rail-head">
                <div>
                  <div className="pre">— Sponsored</div>
                  <h3>ร้านค้าแนะนำ</h3>
                </div>
                <span className="right">{ads.length} ช่อง</span>
              </div>
              {ads.length === 0 ? (
                <div className="ads-list">
                  {[
                    { id: 'p1', title: 'ช่องโฆษณา 1', body: 'ติดต่อแอดมินเพื่อลงโฆษณาของคุณ', cta_text: 'ติดต่อ', icon: 'fas fa-store', kind: 'placeholder' },
                    { id: 'p2', title: 'ช่องโฆษณา 2', body: 'ติดต่อแอดมินเพื่อลงโฆษณาของคุณ', cta_text: 'ติดต่อ', icon: 'fas fa-tag', kind: 'dark' },
                    { id: 'p3', title: 'ช่องโฆษณา 3', body: 'ติดต่อแอดมินเพื่อลงโฆษณาของคุณ', cta_text: 'ติดต่อ', icon: 'fas fa-ad', kind: 'placeholder' },
                    { id: 'p4', title: 'ช่องโฆษณา 4', body: 'ติดต่อแอดมินเพื่อลงโฆษณาของคุณ', cta_text: 'ติดต่อ', icon: 'fas fa-bullhorn', kind: 'dark' },
                  ].map(ad => (
                    <div key={ad.id} className="ad-card" style={{ opacity: 0.55, cursor: 'default' }}>
                      <span className="ad-badge">AD</span>
                      <div className={`ad-img ${ad.kind}`}>
                        <i className={ad.icon}></i>
                      </div>
                      <div className="ad-copy">
                        <h4>{ad.title}</h4>
                        <p>{ad.body}</p>
                        <span className="ad-cta">{ad.cta_text} →</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ads-list">
                  {ads.map(ad => (
                    <div key={ad.id} className="ad-card" onClick={() => setOpenAd(ad)}>
                      <span className="ad-badge">AD</span>
                      <div className={`ad-img ${ad.image_url ? '' : 'placeholder'}`}>
                        {ad.image_url
                          ? <img src={ad.image_url} alt={ad.title} />
                          : <i className={adIcon(ad)}></i>
                        }
                      </div>
                      <div className="ad-copy">
                        <h4>{ad.title}</h4>
                        <p>{ad.body}</p>
                        <span className="ad-cta">{ad.cta_text || 'ดูเพิ่มเติม'} →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <FloatLayer items={floats} />
      <FlyingHearts items={hearts} />
      <ConfettiLayer active={confetti} />

      {/* Ad modal */}
      {openAd && (
        <div className="modal-backdrop" onClick={() => setOpenAd(null)}>
          <div className="ad-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setOpenAd(null)}>
              <i className="fas fa-times"></i>
            </button>
            <div className="ad-modal-img">
              {openAd.image_url
                ? <img src={openAd.image_url} alt={openAd.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <i className={adIcon(openAd)} style={{ fontSize: 56, color: 'var(--orange)' }}></i>
              }
            </div>
            <div className="ad-modal-body">
              <span className="tag orange">SPONSORED</span>
              <h3>{openAd.title}</h3>
              <p>{openAd.body}</p>
              <a
                className="ad-cta-btn"
                href={openAd.cta_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpenAd(null)}
              >
                {openAd.cta_text || 'ดูเพิ่มเติม'} <i className="fas fa-arrow-right"></i>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Inline chat (no header — header lives in section above)
function ChatPanelInline({ messages, onSend, user }) {
  const { useState, useEffect, useRef } = React;
  const [text, setText] = useState('');
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <>
      <div className="chat-body" ref={bodyRef}>
        {messages.map((m, i) => (
          m.system ? (
            <div key={i} className="msg system">
              <div className="body"><div className="text">{m.text}</div></div>
            </div>
          ) : (
            <div key={m.id || i} className="msg">
              <div className="av">
                {m.avatar_url
                  ? <img src={m.avatar_url} alt="" />
                  : <img src={AVATAR(m.avatar_seed || m.name)} alt="" />
                }
              </div>
              <div className="body">
                <div className="head-line">
                  <span className={`name ${m.dj ? 'dj' : ''}`}>{m.name}</span>
                  <span className="time">{m.time}</span>
                </div>
                <div className="text">{m.text}</div>
              </div>
            </div>
          )
        ))}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <div className="field">
          <i className="fas fa-smile" style={{ color: 'var(--ink-3)' }}></i>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="พิมพ์ข้อความ..."
            maxLength={300}
          />
        </div>
        <button type="submit" className="send" title="Send">
          <i className="fas fa-paper-plane"></i>
        </button>
      </form>
    </>
  );
}

window.LivePage = LivePage;
