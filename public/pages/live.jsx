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
    // Treat bare SQLite timestamps as UTC (Railway server runs in UTC)
    const str = typeof d === 'string' && !d.includes('Z') && !d.includes('+') ? d + 'Z' : d;
    const t = new Date(str);
    return t.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false });
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
    return { system: true, text: m.message, id: m.id }; // id needed for deduplication
  }
  return {
    name: m.username,
    role: m.role,
    dj: m.role === 'dj',
    text: m.message,
    name_color: m.name_color || '',
    chat_color: m.chat_color || '',
    chat_frame: m.chat_frame || '',
    avatar_frame: m.avatar_frame || '',
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
  const [followedDjs, setFollowedDjs] = useState([]);
  const [shoutoutName, setShoutoutName] = useState('');
  const [collabName, setCollabName] = useState('');
  const [djOptions, setDjOptions] = useState([]);
  const [checkInBusy, setCheckInBusy] = useState(false);

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
  const [chatSoundOn, setChatSoundOn] = useState(() => { try { return localStorage.getItem('chatSoundOff') !== '1'; } catch { return true; } });
  const [typeSoundOn, setTypeSoundOn] = useState(() => { try { return localStorage.getItem('typeSoundOff') !== '1'; } catch { return true; } });
  const toggleChatSound = () => setChatSoundOn(v => { const n = !v; try { localStorage.setItem('chatSoundOff', n ? '0' : '1'); } catch {} return n; });
  const toggleTypeSound = () => setTypeSoundOn(v => { const n = !v; try { localStorage.setItem('typeSoundOff', n ? '0' : '1'); } catch {} return n; });

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

  useEffect(() => {
    fetch('/api/follows').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setFollowedDjs(d.map(x => x.username));
    }).catch(() => {});
    fetch('/api/djs').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setDjOptions(d);
    }).catch(() => {});
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
  const isFollowingCurrentDj = !!djName && followedDjs.includes(djName);
  const shoutoutActive = nowPlaying?.shoutout_text && Number(nowPlaying?.shoutout_until || 0) > Date.now();

  const toggleFollowDj = async () => {
    if (!nowPlaying?.dj_username || !user) return;
    try {
      const method = isFollowingCurrentDj ? 'DELETE' : 'POST';
      const res = await fetch(`/api/follows/${encodeURIComponent(nowPlaying.dj_username)}`, { method });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Follow action failed'); return; }
      setFollowedDjs(prev => isFollowingCurrentDj ? prev.filter((name) => name !== nowPlaying.dj_username) : [...prev, nowPlaying.dj_username]);
      toast(isFollowingCurrentDj ? `Unfollowed @${nowPlaying.dj_username}` : `Following @${nowPlaying.dj_username}`, 'success');
    } catch {
      toast('Follow action failed');
    }
  };

  const fireShoutout = async () => {
    if (!shoutoutName.trim()) return;
    try {
      const res = await fetch('/api/shoutout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_name: shoutoutName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Shoutout failed'); return; }
      setShoutoutName('');
      setStationNowPlaying(prev => prev ? { ...prev, shoutout_text: data.shoutout_text, shoutout_until: data.shoutout_until, shoutout_by: data.shoutout_by } : prev);
      toast('Shoutout sent', 'success');
    } catch {
      toast('Shoutout failed');
    }
  };

  const saveCollab = async () => {
    try {
      const res = await fetch('/api/collab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: collabName }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Collab update failed'); return; }
      if (!collabName) {
        setStationNowPlaying(prev => prev ? { ...prev, collab_dj_username: '', collab_dj_avatar_seed: '', collab_dj_avatar_url: '' } : prev);
      } else {
        setStationNowPlaying(prev => prev ? {
          ...prev,
          collab_dj_username: data.collab.username,
          collab_dj_avatar_seed: data.collab.avatar_seed,
          collab_dj_avatar_url: data.collab.avatar_url,
        } : prev);
      }
      toast(collabName ? 'Collab DJ updated' : 'Collab DJ cleared', 'success');
    } catch {
      toast('Collab update failed');
    }
  };

  const quickCheckIn = async () => {
    setCheckInBusy(true);
    try {
      const res = await fetch('/api/check-in', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Check-in failed'); return; }
      toast(data.already_checked_in ? 'Checked in already today' : `Received ${data.reward} coins`, data.already_checked_in ? '' : 'success');
    } catch {
      toast('Check-in failed');
    } finally {
      setCheckInBusy(false);
    }
  };

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
                <MicStageCompact user={user} socket={socketRef.current} onMicLive={onMicLive} />
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
                  {shoutoutActive && (
                    <div className="shoutout-pop">
                      <span>Shoutout</span>
                      <strong>{nowPlaying.shoutout_text}</strong>
                    </div>
                  )}
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
                  {nowPlaying?.collab_dj_username && (
                    <div className="collab-banner">
                      <i className="fas fa-user-friends"></i>
                      <span>Collab DJ: @{nowPlaying.collab_dj_username}</span>
                    </div>
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

                {/* Mood picker + tip jar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                  <MoodPicker mood={mood} onPick={setMood} />
                  {nowPlaying?.dj_username && user.role !== 'dj' && user.role !== 'admin' && (
                    <button className={`btn-mini solid ${isFollowingCurrentDj ? 'active-frame-btn' : ''}`} onClick={toggleFollowDj}>
                      <i className={`fas fa-${isFollowingCurrentDj ? 'heart' : 'bell'}`}></i>
                      {isFollowingCurrentDj ? 'Following DJ' : 'Follow DJ'}
                    </button>
                  )}
                  <button className="btn-mini solid" onClick={quickCheckIn} disabled={checkInBusy}>
                    <i className="fas fa-coins"></i>
                    {checkInBusy ? 'Checking...' : `Check-in · Lv.${user.level || 1}`}
                  </button>
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
                  {(user.role === 'dj' || user.role === 'admin') && (
                    <div className="live-control-strip">
                      <input value={shoutoutName} onChange={(e) => setShoutoutName(e.target.value)} placeholder="viewer name" />
                      <button className="btn-mini solid" onClick={fireShoutout}>Shoutout</button>
                    </div>
                  )}
                  {(user.role === 'dj' || user.role === 'admin') && (
                    <div className="live-control-strip">
                      <select value={collabName} onChange={(e) => setCollabName(e.target.value)}>
                        <option value="">No collab DJ</option>
                        {djOptions.filter((dj) => dj.username !== user.name).map((dj) => (
                          <option key={dj.username} value={dj.username}>@{dj.username}</option>
                        ))}
                      </select>
                      <button className="btn-mini solid" onClick={saveCollab}>Save collab</button>
                    </div>
                  )}
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
            <div className="section-head chat-section-head">
              <div>
                <div className="pre">— Live Chat</div>
                <h2>แชทห้อง {activeRoom}</h2>
              </div>
              <div className="right" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <ColorPickerPanel user={user} toast={toast} />
                <ChatFramePicker user={user} toast={toast} onFrameChange={frame => setChat(prev => prev.map(m => m.name === user.name ? { ...m, chat_frame: frame } : m))} />
                <AvatarFramePicker user={user} toast={toast} onFrameChange={frame => setChat(prev => prev.map(m => m.name === user.name ? { ...m, avatar_frame: frame } : m))} />
                <button className={`chat-header-btn${chatSoundOn ? ' active' : ''}`} onClick={toggleChatSound} title={chatSoundOn ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}>
                  <i className={`fas fa-${chatSoundOn ? 'bell' : 'bell-slash'}`} />
                </button>
                <button className={`chat-header-btn${typeSoundOn ? ' active' : ''}`} onClick={toggleTypeSound} title={typeSoundOn ? 'ปิดเสียงพิม' : 'เปิดเสียงพิม'}>
                  <i className={`fas fa-keyboard`} />
                </button>
                <span>{listeners} ออนไลน์</span>
                <span style={{ color: 'var(--orange-deep)' }}>● LIVE</span>
              </div>
            </div>

            <div className="chat-card">
              <ChatPanelInline messages={chat} onSend={onSendChat} user={user} soundOn={chatSoundOn} typeSoundOn={typeSoundOn} />
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
function ChatPanelInline({ messages, onSend, user, soundOn = true, typeSoundOn = true }) {
  const { useState, useEffect, useRef, useCallback } = React;
  const [text, setText] = useState('');
  const [pendingMedia, setPendingMedia] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [newCount, setNewCount] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const bodyRef = useRef(null);
  const bottomRef = useRef(null);
  const prevMsgsRef = useRef(messages);
  const soundLenRef = useRef(0);
  const soundOnRef = useRef(soundOn);
  const typeSoundOnRef = useRef(typeSoundOn);
  const atBottomRef = useRef(true);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);
  useEffect(() => { typeSoundOnRef.current = typeSoundOn; }, [typeSoundOn]);

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

  const playTypeSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = 600;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }, []);

  // track scroll position — 150px threshold so minor layout shifts don't break auto-scroll
  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    atBottomRef.current = isBottom;
    setAtBottom(isBottom);
    if (isBottom) setNewCount(0);
  };

  const scrollToBottomNow = useCallback(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight + 9999;
  }, []);

  useEffect(() => {
    const prev = prevMsgsRef.current;
    prevMsgsRef.current = messages;
    if (messages.length === 0) return;
    // Fire on every new messages array (including when length stays 100 after slice)
    const wasEmpty = prev.length === 0;
    const el = bodyRef.current;
    if (!el) return;
    atBottomRef.current = true;
    el.scrollTop = el.scrollHeight + 9999;
    setNewCount(0);
    const delays = wasEmpty ? [50, 150, 400, 900] : [50, 200];
    const timers = delays.map(d => setTimeout(() => {
      const e = bodyRef.current;
      if (e) { atBottomRef.current = true; e.scrollTop = e.scrollHeight + 9999; }
    }, d));
    return () => timers.forEach(clearTimeout);
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
    atBottomRef.current = true;
    scrollToBottomNow();
    setNewCount(0);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim() && !pendingMedia) return;
    if (typeSoundOnRef.current) playTypeSound();
    onSend({ message: text.trim(), media: pendingMedia, replyTo });
    setText('');
    setPendingMedia(null);
    setReplyTo(null);
    atBottomRef.current = true;
    setTimeout(scrollToBottomNow, 50);
  };

  return (
    <>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="chat-body" ref={bodyRef} onScroll={onScroll}>
          {messages.map((m, i) => (
            m.system ? (
              <div key={i} className="msg system">
                <div className="body"><div className="text">{m.text}</div></div>
              </div>
            ) : (
              <div key={m.id ? `msg-${m.id}` : `msg-${i}`} className={`msg msg-role-${m.role || 'guest'}`} data-frame={m.chat_frame || undefined}>
                <div className={`av ${m.avatar_frame ? 'av-frame-custom av-frame-' + m.avatar_frame : (m.role === 'admin' ? 'av-frame-admin' : m.role === 'dj' ? 'av-frame-dj' : m.role === 'vip+' ? 'av-frame-vipplus' : m.role === 'vip' ? 'av-frame-vip' : m.role === 'co-admin' ? 'av-frame-coadmin' : '')}`}>
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
          <div ref={bottomRef} style={{ height: 1, flexShrink: 0 }} />
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

const CHAT_FRAMES = [
  { id: '',            label: 'ปกติ',        preview: 'none' },
  { id: 'glow-orange', label: 'ส้มลุก',       preview: '#ff9f1c' },
  { id: 'glow-pink',   label: 'พิงก์',       preview: '#ff3cac' },
  { id: 'rainbow',     label: 'เรนโบว์',     preview: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f)' },
  { id: 'neon-blue',   label: 'นีออนฟ้า',    preview: '#00d4ff' },
  { id: 'gold',        label: 'ทอง',          preview: '#ffd700' },
  { id: 'purple',      label: 'ม่วง',         preview: '#c77dff' },
  { id: 'green',       label: 'เขียว',        preview: '#6bcb77' },
  { id: 'fire',        label: 'ไฟ',           preview: 'linear-gradient(90deg,#ff9f1c,#ff3c00)' },
  { id: 'ice',         label: 'น้ำแข็ง',      preview: '#90e0ef' },
  { id: 'galaxy',      label: 'กาแล็กซี่',   preview: 'linear-gradient(90deg,#7b2d8b,#00d4ff)' },
  { id: 'red-alert',   label: 'เรดอเลิร์ท',  preview: '#ff0044' },
];

function ChatFramePicker({ user, toast, onFrameChange }) {
  const { useState } = React;
  const level = liveRoleLevel(user.role);
  if (level < 1) return null;
  const [frame, setFrame] = useState(user.chat_frame || '');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async (fid) => {
    setFrame(fid);
    setSaving(true);
    try {
      const res = await fetch('/api/me/colors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name_color: user.name_color || '', chat_color: user.chat_color || '', chat_frame: fid }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'บันทึกไม่สำเร็จ'); return; }
      user.chat_frame = fid;
      onFrameChange?.(fid); // update all existing messages in chat state
      toast('บันทึกกรอบสำเร็จ ✓', 'success');
    } catch { toast('บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); setOpen(false); }
  };

  return (
    <div className="color-picker-wrap" style={{ position: 'relative' }}>
      <button className={`btn-mini${frame ? ' active-frame-btn' : ''}`} onClick={() => setOpen(v => !v)} title="เลือกกรอบแชท">
        🖼 กรอบแชท{frame ? ' ●' : ''}
      </button>
      {open && (
        <div className="frame-picker-panel">
          <div className="frame-picker-grid">
            {CHAT_FRAMES.map(f => (
              <button
                key={f.id}
                className={`frame-picker-item${frame === f.id ? ' selected' : ''} frame-preview-${f.id || 'none'}`}
                onClick={() => save(f.id)}
                title={f.label}
                disabled={saving}
              >
                <span className="frame-preview-box" />
                <span className="frame-picker-label">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const AVATAR_FRAMES = [
  // ── Cool ──
  { id: '',          label: 'ปกติ',      cat: 'cool' },
  { id: 'electric',  label: '⚡ไฟฟ้า',   cat: 'cool' },
  { id: 'fire-av',   label: '🔥ไฟ',      cat: 'cool' },
  { id: 'ice-av',    label: '❄️น้ำแข็ง', cat: 'cool' },
  { id: 'galaxy-av', label: '🌌กาแล็กซี่',cat: 'cool' },
  { id: 'holo',      label: '🌈โฮโล',    cat: 'cool' },
  { id: 'neon-pink', label: '💗นีออน',   cat: 'cool' },
  { id: 'matrix',    label: '💚แมทริกซ์', cat: 'cool' },
  { id: 'gold-cool', label: '✨ทอง',     cat: 'cool' },
  // ── Animal ──
  { id: 'cat',     label: '🐱แมว',    cat: 'animal' },
  { id: 'panda',   label: '🐼แพนด้า', cat: 'animal' },
  { id: 'bunny',   label: '🐰กระต่าย',cat: 'animal' },
  { id: 'frog',    label: '🐸กบ',     cat: 'animal' },
  { id: 'fox',     label: '🦊จิ้งจอก',cat: 'animal' },
  { id: 'bear',    label: '🐻หมี',    cat: 'animal' },
  { id: 'penguin', label: '🐧เพนกวิน',cat: 'animal' },
  { id: 'unicorn', label: '🦄ยูนิคอร์น',cat: 'animal' },
];

function AvatarFramePicker({ user, toast, onFrameChange }) {
  const { useState } = React;
  const level = liveRoleLevel(user.role);
  if (level < 2) return null; // VIP+ only
  const [frame, setFrame] = useState(user.avatar_frame || '');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('cool');

  const save = async (fid) => {
    setFrame(fid);
    setSaving(true);
    try {
      const res = await fetch('/api/me/colors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name_color: user.name_color || '', chat_color: user.chat_color || '', avatar_frame: fid }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'บันทึกไม่สำเร็จ'); return; }
      user.avatar_frame = fid;
      onFrameChange?.(fid);
      toast('บันทึกกรอบโปรไฟล์สำเร็จ ✓', 'success');
    } catch { toast('บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); setOpen(false); }
  };

  const filtered = AVATAR_FRAMES.filter(f => f.id === '' || f.cat === tab);

  return (
    <div className="color-picker-wrap" style={{ position: 'relative' }}>
      <button className={`btn-mini${frame ? ' active-frame-btn' : ''}`} onClick={() => setOpen(v => !v)} title="เลือกกรอบโปรไฟล์">
        🎭 กรอบโปร{frame ? ' ●' : ''}
      </button>
      {open && (
        <div className="frame-picker-panel" style={{ width: 300 }}>
          <div className="av-frame-tabs">
            <button className={tab === 'cool' ? 'active' : ''} onClick={() => setTab('cool')}>✨ เท่ๆ</button>
            <button className={tab === 'animal' ? 'active' : ''} onClick={() => setTab('animal')}>🐾 สัตว์น่ารัก</button>
          </div>
          <div className="frame-picker-grid" style={{ marginTop: 10 }}>
            {filtered.map(f => (
              <button
                key={f.id}
                className={`frame-picker-item${frame === f.id ? ' selected' : ''}`}
                onClick={() => save(f.id)}
                disabled={saving}
                title={f.label}
              >
                <span className={`av-frame-mini ${f.id ? 'av-frame-' + f.id : ''}`}>
                  <img src={`https://api.dicebear.com/7.x/thumbs/svg?seed=${user.name}`} alt="" />
                </span>
                <span className="frame-picker-label">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

window.LivePage = LivePage;
