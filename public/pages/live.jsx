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

const ROLE_META = {
  admin:  { emoji: '🛡', label: 'Admin',  level: 4 },
  dj:     { emoji: '🎧', label: 'DJ',     level: 3 },
  vip:    { emoji: '💎', label: 'VIP',    level: 2 },
  member: { emoji: '👤', label: 'Member', level: 1 },
  user:   { emoji: '👤', label: 'Member', level: 1 },
  guest:  { emoji: '🌍', label: 'Guest',  level: 0 },
};
function liveRoleMeta(role) { return ROLE_META[role] || ROLE_META.guest; }
function liveRoleLevel(role) { return liveRoleMeta(role).level; }

function msgFromApi(m) {
  if (m.role === 'system' || m.username === 'SYSTEM') {
    return { system: true, text: m.message };
  }
  return {
    name: m.username,
    role: m.role,
    dj: m.role === 'dj',
    text: m.message,
    name_color: m.name_color || '',
    chat_color: m.chat_color || '',
    media_url: m.media_url || '',
    media_type: m.media_type || '',
    time: fmtTime(m.created_at),
    id: m.id,
    avatar_seed: m.avatar_seed || m.username,
    avatar_url: m.avatar_url || '',
    reply_to_id: m.reply_to_id || 0,
    reply_to_name: m.reply_to_name || '',
    reply_to_text: m.reply_to_text || '',
  };
}

function adIcon(ad) {
  if (ad.image_url) return null;
  const icons = ['fa-mug-hot','fa-record-vinyl','fa-utensils','fa-headphones','fa-store','fa-tag'];
  return 'fas ' + icons[ad.id % icons.length];
}

function GuestRoleRequestBox({ toast }) {
  const { useState } = React;
  const [status, setStatus] = useState('idle'); // idle | pending | done

  const requestRole = async () => {
    if (status !== 'idle') return;
    setStatus('pending');
    try {
      const res = await fetch('/api/role-request', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'เกิดข้อผิดพลาด');
        setStatus('idle');
        return;
      }
      setStatus('done');
      toast('ส่งคำขอแล้ว รอการยืนยันจากแอดมิน', 'success');
    } catch {
      toast('เกิดข้อผิดพลาด');
      setStatus('idle');
    }
  };

  return (
    <div className="guest-lock">
      <i className="fas fa-lock"></i>
      <span>เฉพาะ Member ขึ้นไปเท่านั้นที่ขอเพลงได้</span>
      {status === 'done' ? (
        <div className="role-req-sent">
          <i className="fas fa-clock"></i> รอการยืนยันจากแอดมิน...
        </div>
      ) : (
        <button
          className="role-req-btn"
          onClick={requestRole}
          disabled={status === 'pending'}
        >
          {status === 'pending' ? <><i className="fas fa-spinner fa-spin"></i> กำลังส่ง...</> : '✋ ขอยศ Member'}
        </button>
      )}
    </div>
  );
}

function LivePage({
  user,
  chatOpen,
  setChatOpen,
  listeners,
  setListeners,
  setQueueCount,
  setStationNowPlaying,
  stationNowPlaying,
  toast,
  floats,
  sendReaction,
  playerPlaying,
  playerProgress,
  playerDuration,
  playerVolume,
  playerMuted,
  canManagePlayback,
  onTogglePlayback,
  onSeekPlayback,
  onToggleMute,
  onSetVolume,
  onMicLive,
  activeRoom = 'main-stage',
}) {
  const [queue, setQueue] = useState([]);
  const [chat, setChat] = useState([]);
  const [ads, setAds] = useState([]);
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
  const [qTab, setQTab] = useState('dj');
  const [djQueue, setDjQueue] = useState([]);
  const [userQueue, setUserQueue] = useState([]);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [djSearchVal, setDjSearchVal] = useState('');
  const [stageActive, setStageActive] = useState(false);
  const tipBtnRef = useRef(null);
  const lastMsgIdRef = useRef(0);
  const activeRoomRef = useRef(activeRoom); // avoid stale closure in poll
  const socketRef = useRef(null);

  useEffect(() => { activeRoomRef.current = activeRoom; }, [activeRoom]);

  // Initialize Socket.io + auth
  useEffect(() => {
    const s = io();
    socketRef.current = s;
    s.emit('auth', {
      userId: user.id || 0,
      username: user.name,
      role: user.role,
      avatar_seed: user.avatar_seed || user.name,
      avatar_url: user.avatar_url || '',
    });
    return () => s.disconnect();
  }, []);

  // Reset chat when switching rooms
  useEffect(() => {
    setChat([]);
    lastMsgIdRef.current = 0;
  }, [activeRoom]);

  // Poll every 3s
  useEffect(() => {
    const loadAll = async () => {
      // Snapshot current room + afterId at call time (avoids stale closure)
      const currentRoom = activeRoomRef.current;
      const afterId = lastMsgIdRef.current;
      try {
        const [qRes, mRes, npRes, onRes] = await Promise.all([
          fetch('/api/queue').then(r => r.json()),
          fetch(`/api/messages?after=${afterId}&room=${encodeURIComponent(currentRoom)}`).then(r => r.json()),
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
            youtube_url: q.youtube_url || '',
            youtube_id: q.youtube_id || '',
            thumbnail: q.thumbnail || '',
            votes: q.votes || 0,
            voted: q.userVoted || false,
            status: q.status,
            type: q.type || 'user',
            order_idx: q.order_idx || 0,
          }));
          setQueue(mapped);
          setDjQueue(prev => {
            // Only update if not currently dragging
            if (dragIdx !== null) return prev;
            return mapped.filter(q => q.type === 'dj');
          });
          setUserQueue(mapped.filter(q => q.type === 'user'));
          setQueueCount(mapped.filter(q => q.status !== 'played').length);
        }

        // Messages — discard if room changed while fetch was in flight
        if (activeRoomRef.current !== currentRoom) return;
        if (Array.isArray(mRes) && mRes.length > 0) {
          const newMsgs = mRes.map(msgFromApi);
          const lastId = mRes[mRes.length - 1].id;
          setChat(prev => {
            const existingIds = new Set(prev.filter(m => m.id).map(m => m.id));
            const toAdd = newMsgs.filter(m => !m.id || !existingIds.has(m.id));
            if (toAdd.length === 0) return prev;
            return [...prev, ...toAdd].slice(-100);
          });
          // Only advance pointer if this fetch was for the same starting point
          if (afterId === lastMsgIdRef.current) lastMsgIdRef.current = lastId;
        }

        // Now playing
        if (npRes.youtube_id) {
          setStationNowPlaying?.(npRes);
        } else {
          setStationNowPlaying?.(null);
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

  const nowPlaying = stationNowPlaying;
  const curSec = (playerProgress / 100) * playerDuration;

  useEffect(() => {
    if (stationNowPlaying?.stage_active !== undefined) {
      setStageActive(!!stationNowPlaying.stage_active);
    }
  }, [stationNowPlaying?.stage_active]);

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
    const value = searchVal.trim();
    const looksLikeUrl = /(?:youtube\.com|youtu\.be)/i.test(value);
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(looksLikeUrl ? { youtube_url: value, title: value } : { title: value }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      setSearchVal('');
      toast(`ส่งคำขอแล้ว ✓`, 'success');
      setHype(h => Math.min(100, h + 5));
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  const submitDjSong = async (e) => {
    e.preventDefault();
    if (!djSearchVal.trim()) return;
    const value = djSearchVal.trim();
    const looksLikeUrl = /(?:youtube\.com|youtu\.be)/i.test(value);
    try {
      const res = await fetch('/api/dj-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(looksLikeUrl ? { youtube_url: value, title: value } : { title: value }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      setDjSearchVal('');
      toast('เพิ่มเพลงใน Playlist แล้ว ✓', 'success');
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  const handleDrop = async (dropIdx) => {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const newOrder = [...djQueue];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(dropIdx, 0, moved);
    setDjQueue(newOrder);
    setDragIdx(null);
    setDragOverIdx(null);
    try {
      await fetch('/api/queue/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newOrder.map(q => q.id) }),
      });
    } catch {}
  };

  const joinStage = async () => {
    await fetch('/api/stage/on', { method: 'POST' }).catch(() => {});
    setStageActive(true);
    toast('ขึ้นเวทีแล้ว 🎤', 'success');
  };

  const leaveStage = async () => {
    await fetch('/api/stage/off', { method: 'POST' }).catch(() => {});
    setStageActive(false);
    setStationNowPlaying?.(null);
    toast('ลงจากเวทีแล้ว', '');
  };

  const onSendChat = async ({ message, media, replyTo }) => {
    try {
      const body = { message, room_id: activeRoom };
      if (media?.isExternal) {
        body.gif_url = media.dataUrl;
      } else if (media?.dataUrl) {
        body.media_data = media.dataUrl;
      }
      if (replyTo?.id) {
        body.reply_to_id = replyTo.id;
        body.reply_to_name = replyTo.name;
        body.reply_to_text = (replyTo.text || '').slice(0, 120);
      }
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setHype(h => Math.min(100, h + 2));
    } catch {}
  };

  const onReaction = (emoji) => {
    setReactions(rs => rs.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, hot: true } : r));
    sendReaction(emoji);
    setHype(h => Math.min(100, h + 6));
  };

  const togglePlayback = () => {
    if (!canManagePlayback) return;
    onTogglePlayback?.();
  };

  const toggleMute = () => {
    onToggleMute?.();
  };

  const seekFromClick = (e) => {
    if (!canManagePlayback || !nowPlaying?.youtube_id || !playerDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeekPlayback?.(ratio);
  };

  const playQueueItem = async (item) => {
    if (!item.youtube_id) {
      toast('รายการนี้ยังไม่มี YouTube link');
      return;
    }
    try {
      const res = await fetch('/api/now-playing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          youtube_id: item.youtube_id,
          title: item.title,
          artist: item.artist,
          thumbnail: item.thumbnail,
          youtube_url: item.youtube_url,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      toast(`กำลังเล่น ${item.title}`, 'success');
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  const stopPlaying = async () => {
    try {
      const res = await fetch('/api/now-playing', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      toast('หยุดการออกอากาศแล้ว', 'success');
    } catch { toast('เกิดข้อผิดพลาด'); }
  };

  const removeQueueItem = async (id) => {
    try {
      const res = await fetch(`/api/queue/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'เกิดข้อผิดพลาด'); return; }
      setDjQueue(q => q.filter(x => x.id !== id));
      setUserQueue(q => q.filter(x => x.id !== id));
      setQueue(q => q.filter(x => x.id !== id));
    } catch { toast('เกิดข้อผิดพลาด'); }
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
  const djName = nowPlaying?.dj_username || 'IIMVU Society Radio';
  const trackTitle = nowPlaying?.title || 'รอ VJ เปิดเพลง...';
  const trackArtist = nowPlaying?.artist || '';

  return (
    <>
      <TopBar
        crumb="ROOM ⁄ MAIN-STAGE"
        title="IIMVU Society Radio"
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
                  <div className={`ring-outer ${playerPlaying ? '' : 'paused'}`}></div>
                  <div className="ring-mid"></div>
                  <div className={`ring-inner ${playerPlaying ? '' : 'paused'}`}></div>
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
                  <div className="meta">— IIMVU Society Radio</div>
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
                    <div className="progress-bar" style={{ cursor: 'default' }}>
                      <div className="progress-fill" style={{ width: `${playerProgress}%` }}></div>
                    </div>
                    <div className="progress-times">
                      <span>{fmtSec(curSec)}</span>
                      <span>—{fmtSec(playerDuration - curSec)}</span>
                    </div>
                  </div>
                )}

                {nowPlaying && (
                  <div className="controls">
                    {canManagePlayback && (
                      <button className={`ctrl play ${playerPlaying ? 'active' : ''}`} onClick={togglePlayback} title={playerPlaying ? 'Pause' : 'Play'}>
                        <i className={`fas fa-${playerPlaying ? 'pause' : 'play'}`}></i>
                      </button>
                    )}
                    <button className={`ctrl ${playerMuted || playerVolume === 0 ? 'active' : ''}`} onClick={toggleMute} title={playerMuted || playerVolume === 0 ? 'Unmute' : 'Mute'}>
                      <i className={`fas fa-${playerMuted || playerVolume === 0 ? 'volume-mute' : 'volume-up'}`}></i>
                    </button>
                    <div className="volume-row" style={{ marginLeft: 0 }}>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={playerVolume}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          onSetVolume?.(next);
                        }}
                        style={{ width: 120 }}
                      />
                      <span className="volume-val">{playerVolume}</span>
                    </div>
                  </div>
                )}

                {/* Mood picker + tip jar + color picker */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                  <MoodPicker mood={mood} onPick={setMood} />
                  <ColorPickerPanel user={user} toast={toast} />
                  {user.role === 'dj' && (
                    stageActive ? (
                      <button className="btn-stage-off" onClick={leaveStage}>
                        <i className="fas fa-sign-out-alt"></i> ลงจากเวที
                      </button>
                    ) : (
                      <button className="btn-stage-on" onClick={joinStage}>
                        <i className="fas fa-microphone-alt"></i> ขึ้นเวที
                      </button>
                    )
                  )}
                  {user.role === 'dj' && nowPlaying?.youtube_id && (
                    <button className="btn-mini solid" onClick={stopPlaying}>
                      Stop Live
                    </button>
                  )}
                  <div style={{ marginLeft: 'auto' }}>
                    <TipJar count={tips} onTip={sendTip} btnRef={tipBtnRef} />
                  </div>
                </div>

                <div style={{ marginTop: 18 }}>
                  <MicPanel user={user} socket={socketRef.current} onMicLive={onMicLive} />
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
                <h2>แชทห้อง {activeRoom}</h2>
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
              {liveRoleLevel(user.role) < 1 ? (
                <GuestRoleRequestBox toast={toast} />
              ) : (
                <>
                  <form className="rail-request" onSubmit={submitRequest}>
                    <div className="search-field">
                      <i className="fas fa-search"></i>
                      <input
                        placeholder="ชื่อเพลง หรือวาง YouTube link"
                        value={searchVal}
                        onChange={e => setSearchVal(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn-primary orange">
                      <i className="fas fa-paper-plane"></i> ส่งคำขอ
                    </button>
                  </form>
                  <div style={{ marginTop: 8, color: 'var(--ink-3)', fontSize: 12 }}>
                    รองรับทั้งชื่อเพลงทั่วไป และ YouTube URL เพื่อดึงชื่อเพลงจริงเข้าคิวอัตโนมัติ
                  </div>
                </>
              )}
            </div>

            {/* Queue */}
            <div className="rail-section">
              <div className="rail-head">
                <div>
                  <div className="pre">— Up Next</div>
                  <h3>คิวเพลง</h3>
                </div>
                <span className="right">{(djQueue.length + userQueue.length)} เพลง</span>
              </div>

              {user.role === 'dj' && (
                <div className="queue-tabs">
                  <button className={`qtab ${qTab === 'dj' ? 'active' : ''}`} onClick={() => setQTab('dj')}>
                    🎧 Playlist ({djQueue.length})
                  </button>
                  <button className={`qtab ${qTab === 'requests' ? 'active' : ''}`} onClick={() => setQTab('requests')}>
                    🎵 คำขอ {userQueue.length > 0 && <span className="qtab-badge">{userQueue.length}</span>}
                  </button>
                </div>
              )}

              {/* DJ Playlist Tab */}
              {(user.role !== 'dj' || qTab === 'dj') && (
                <div className="queue compact">
                  {user.role === 'dj' && (
                    <form className="dj-add-form" onSubmit={submitDjSong}>
                      <input
                        placeholder="+ เพิ่มเพลงใน Playlist..."
                        value={djSearchVal}
                        onChange={e => setDjSearchVal(e.target.value)}
                      />
                      <button type="submit"><i className="fas fa-plus"></i></button>
                    </form>
                  )}
                  {djQueue.length === 0 && user.role === 'dj' && (
                    <div style={{ padding: '10px', color: 'var(--ink-mute)', fontSize: 12, textAlign: 'center' }}>
                      ยังไม่มีเพลงใน Playlist — เพิ่มเพลงด้านบน
                    </div>
                  )}
                  {(user.role === 'dj' ? djQueue : queue).map((q, i) => (
                    <div
                      key={q.id}
                      className={`queue-row ${dragOverIdx === i && dragIdx !== i ? 'drag-over' : ''}`}
                      draggable={user.role === 'dj' && q.type === 'dj'}
                      onDragStart={() => { setDragIdx(i); setDragOverIdx(i); }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
                      onDragLeave={() => setDragOverIdx(null)}
                      onDrop={() => handleDrop(i)}
                      style={{ opacity: dragIdx === i ? 0.45 : 1, cursor: user.role === 'dj' && q.type === 'dj' ? 'grab' : 'default' }}
                    >
                      {user.role === 'dj' && q.type === 'dj' && (
                        <div className="drag-handle" title="ลากเพื่อเรียงลำดับ">⠿</div>
                      )}
                      <div className="pos">{q.status === 'playing' ? '▶' : String(i + 1).padStart(2, '0')}</div>
                      <div className="info">
                        <div className="t">{q.title}</div>
                        <div className="a">{q.artist}{q.artist && q.requester ? ' · ' : ''}{q.requester ? `@${q.requester}` : ''}</div>
                      </div>
                      {user.role === 'dj' ? (
                        <div className="row-actions">
                          {q.youtube_url && (
                            <a className="btn-mini" href={q.youtube_url} target="_blank" rel="noreferrer">YT</a>
                          )}
                          <button className="btn-mini solid" onClick={() => playQueueItem(q)} disabled={!q.youtube_id}>▶</button>
                          <button className="btn-mini danger" onClick={() => removeQueueItem(q.id)} title="เอาเพลงออก">
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ) : (
                        <button className={`vote ${q.voted ? 'up' : ''}`} onClick={() => vote(q.id)}>
                          <i className="fas fa-chevron-up"></i>
                          <span>{q.votes}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* User Requests Tab (DJ only) */}
              {user.role === 'dj' && qTab === 'requests' && (
                <div className="queue compact">
                  {userQueue.length === 0 && (
                    <div style={{ padding: '10px', color: 'var(--ink-mute)', fontSize: 12, textAlign: 'center' }}>
                      ยังไม่มีคำขอเพลง
                    </div>
                  )}
                  {userQueue.map((q, i) => (
                    <div key={q.id} className="queue-row">
                      <div className="pos">{String(i + 1).padStart(2, '0')}</div>
                      <div className="info">
                        <div className="t">{q.title}</div>
                        <div className="a">{q.artist}{q.artist && q.requester ? ' · ' : ''}{q.requester ? `@${q.requester}` : ''}</div>
                      </div>
                      <div className="row-actions">
                        <span style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 700 }}>↑{q.votes}</span>
                        {q.youtube_url && (
                          <a className="btn-mini" href={q.youtube_url} target="_blank" rel="noreferrer">YT</a>
                        )}
                        <button className="btn-mini solid" onClick={() => playQueueItem(q)} disabled={!q.youtube_id}>▶</button>
                        <button className="btn-mini danger" onClick={() => removeQueueItem(q.id)} title="เอาเพลงออก">
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                <div style={{ padding: '14px 10px', color: 'var(--ink-mute)', fontSize: 13 }}>
                  ยังไม่มีโฆษณาที่เปิดใช้งานอยู่
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
  const { useState, useEffect, useLayoutEffect, useRef, useCallback } = React;
  const [text, setText] = useState('');
  const [pendingMedia, setPendingMedia] = useState(null);
  const [replyTo, setReplyTo] = useState(null); // { id, name, text }
  const [newCount, setNewCount] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem('chatSoundOff') !== '1'; } catch { return true; }
  });
  const bodyRef = useRef(null);
  const prevLenRef = useRef(0);  // scroll tracking
  const soundLenRef = useRef(0); // separate counter for sound (avoid sharing state with scroll)
  const soundOnRef = useRef(soundOn);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const playDing = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start(); osc.stop(ctx.currentTime + 0.22);
    } catch {}
  }, []);

  const toggleSound = () => {
    setSoundOn(v => {
      const next = !v;
      try { localStorage.setItem('chatSoundOff', next ? '0' : '1'); } catch {}
      return next;
    });
  };

  // track scroll position
  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAtBottom(isBottom);
    if (isBottom) setNewCount(0);
  };

  // useLayoutEffect: runs synchronously after DOM update, before browser paint
  // This guarantees scrollHeight is correct and the user never sees the unscrolled state
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const added = messages.length - prevLenRef.current;
    const wasEmpty = prevLenRef.current === 0;
    prevLenRef.current = messages.length;
    if (added <= 0) return;
    if (atBottom || wasEmpty) {
      el.scrollTop = el.scrollHeight;
      setNewCount(0);
    } else {
      setNewCount(n => n + added);
    }
  }, [messages]);

  // Sound notification (useEffect is fine here — timing doesn't matter)
  useEffect(() => {
    const prevLen = soundLenRef.current;
    soundLenRef.current = messages.length;
    if (prevLen === 0 || !soundOnRef.current) return; // skip initial load
    const latest = messages[messages.length - 1];
    if (latest && !latest.system && latest.name !== user.name) playDing();
  }, [messages]);

  const scrollToBottom = () => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    setNewCount(0);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim() && !pendingMedia) return;
    onSend({ message: text.trim(), media: pendingMedia, replyTo });
    setText('');
    setPendingMedia(null);
    setReplyTo(null);
  };

  return (
    <>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Sound toggle */}
        <button
          className={`chat-sound-btn ${soundOn ? 'on' : 'off'}`}
          onClick={toggleSound}
          title={soundOn ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}
        >
          <i className={`fas fa-${soundOn ? 'bell' : 'bell-slash'}`}></i>
        </button>

        <div className="chat-body" ref={bodyRef} onScroll={onScroll}>
          {messages.map((m, i) => (
            m.system ? (
              <div key={i} className="msg system">
                <div className="body"><div className="text">{m.text}</div></div>
              </div>
            ) : (
              <div key={m.id ? `msg-${m.id}` : `msg-${i}`} className={`msg msg-role-${m.role || 'guest'}`}>
                <div className={`av ${m.role === 'vip' ? 'vip-frame' : ''}`}>
                  {m.avatar_url
                    ? <img src={m.avatar_url} alt="" />
                    : <img src={AVATAR(m.avatar_seed || m.name)} alt="" />
                  }
                </div>
                <div className="body">
                  <div className="head-line">
                    <span className="role-badge" title={liveRoleMeta(m.role).label}>{liveRoleMeta(m.role).emoji}</span>
                    <span
                      className={`name ${m.dj ? 'dj' : ''}`}
                      style={m.name_color ? { color: m.name_color } : undefined}
                    >{m.name}</span>
                    <span className="time">{m.time}</span>
                    <button
                      className="msg-reply-btn"
                      onClick={() => setReplyTo({ id: m.id, name: m.name, text: m.text || '' })}
                      title="ตอบกลับ"
                    >
                      <i className="fas fa-reply"></i>
                    </button>
                  </div>
                  {m.reply_to_id > 0 && m.reply_to_name && (
                    <div className="msg-reply-quote">
                      <span className="reply-quote-name">@{m.reply_to_name}</span>
                      <span className="reply-quote-text">{m.reply_to_text}</span>
                    </div>
                  )}
                  <div
                    className="text"
                    style={m.chat_color ? { background: m.chat_color + '22', borderLeft: `2px solid ${m.chat_color}`, paddingLeft: 6, borderRadius: 4 } : undefined}
                  >{m.text}</div>
                  <ChatMessageMedia mediaUrl={m.media_url} mediaType={m.media_type} />
                </div>
              </div>
            )
          ))}
        </div>

        {newCount > 0 && !atBottom && (
          <button className="new-msg-indicator" onClick={scrollToBottom}>
            <i className="fas fa-arrow-down"></i> {newCount} ข้อความใหม่
          </button>
        )}
      </div>

      {replyTo && (
        <div className="reply-preview-strip">
          <i className="fas fa-reply" style={{ color: 'var(--orange)', fontSize: 11 }}></i>
          <span className="reply-strip-name">@{replyTo.name}</span>
          <span className="reply-strip-text">{(replyTo.text || '').slice(0, 60)}{replyTo.text?.length > 60 ? '…' : ''}</span>
          <button className="reply-strip-close" onClick={() => setReplyTo(null)}>
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      <ChatComposer
        value={text}
        onChange={setText}
        onSubmit={submit}
        placeholder={replyTo ? `ตอบ @${replyTo.name}...` : 'Message the room...'}
        maxLength={300}
        pendingMedia={pendingMedia}
        onPickMedia={setPendingMedia}
        onClearMedia={() => setPendingMedia(null)}
        userRole={user.role}
      />
    </>
  );
}

// Color picker for VIP / Member
function ColorPickerPanel({ user, toast }) {
  const { useState } = React;
  const MEMBER_PAL = ['', '#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9f1c','#ffffff'];
  const VIP_PAL    = [...MEMBER_PAL,'#ff3cac','#00d4ff','#02c39a','#f77f00','#e040fb','#00b4d8','#f72585','#90e0ef'];
  const level = liveRoleLevel(user.role);
  if (level < 1) return null;
  const palette = level >= 2 ? VIP_PAL : MEMBER_PAL;
  const [nameColor, setNameColor] = useState(user.name_color || '');
  const [chatColor, setChatColor] = useState(user.chat_color || '');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/me/colors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name_color: nameColor, chat_color: chatColor }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'บันทึกไม่สำเร็จ'); return; }
      user.name_color = nameColor;
      user.chat_color = chatColor;
      toast('บันทึกสีสำเร็จ ✓', 'success');
      setOpen(false);
    } catch { toast('บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  return (
    <div className="color-picker-wrap">
      <button className="btn-mini" onClick={() => setOpen(v => !v)} title="ตั้งค่าสีชื่อ / แชท">
        🎨 ตั้งค่าสี
      </button>
      {open && (
        <div className="color-picker-panel">
          <div className="cp-row">
            <span className="cp-label">สีชื่อ</span>
            <div className="cp-swatches">
              {palette.map(c => (
                <button
                  key={c || 'none'}
                  className={`cp-swatch ${nameColor === c ? 'active' : ''}`}
                  style={{ background: c || 'transparent', border: c ? undefined : '1px dashed var(--ink-3)' }}
                  onClick={() => setNameColor(c)}
                  title={c || 'ค่าเริ่มต้น'}
                />
              ))}
            </div>
            <span className="cp-preview" style={{ color: nameColor || 'var(--ink)' }}>
              {user.name}
            </span>
          </div>
          <div className="cp-row">
            <span className="cp-label">สีแชท</span>
            <div className="cp-swatches">
              {palette.map(c => (
                <button
                  key={c || 'none'}
                  className={`cp-swatch ${chatColor === c ? 'active' : ''}`}
                  style={{ background: c || 'transparent', border: c ? undefined : '1px dashed var(--ink-3)' }}
                  onClick={() => setChatColor(c)}
                  title={c || 'ค่าเริ่มต้น'}
                />
              ))}
            </div>
          </div>
          <button className="btn-primary orange" style={{ marginTop: 8, width: '100%' }} onClick={save} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกสี'}
          </button>
        </div>
      )}
    </div>
  );
}

window.LivePage = LivePage;
