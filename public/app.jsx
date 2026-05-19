// IIMVU Society Radio - main app shell
const { useState, useEffect, useRef } = React;

let appYoutubeApiPromise = null;

function ensureAppYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (appYoutubeApiPromise) return appYoutubeApiPromise;

  appYoutubeApiPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(script);
    }

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
  });

  return appYoutubeApiPromise;
}

const DEFAULT_ROOM_ID = 'main-stage';

function App() {
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState('live');
  const [chatOpen, setChatOpen] = useState(true);
  const [floats, setFloats] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [listeners, setListeners] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [offlineUsers, setOfflineUsers] = useState([]);
  const [queueCount, setQueueCount] = useState(0);
  const [dmUnread, setDmUnread] = useState(0);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [dmTarget, setDmTarget] = useState(null);
  const [rooms, setRooms] = useState([{ id: DEFAULT_ROOM_ID, name: 'main-stage', skin: 'pink', is_default: 1 }]);
  const [activeRoom, setActiveRoom] = useState(DEFAULT_ROOM_ID);
  const [playerPlaying, setPlayerPlaying] = useState(false);
  const [playerProgress, setPlayerProgress] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [playerVolume, setPlayerVolume] = useState(() => {
    const stored = Number(window.localStorage.getItem('imvu-radio-volume'));
    return Number.isFinite(stored) ? Math.min(100, Math.max(0, stored)) : 75;
  });
  const [playerMuted, setPlayerMuted] = useState(() => window.localStorage.getItem('imvu-radio-muted') === '1');
  const [micActive, setMicActive] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('vibez-theme') || 'light'; } catch { return 'light'; }
  });
  // Apply data-theme on <html> so ALL CSS variables + body inherit dark mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(v => {
    const next = v === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('vibez-theme', next); } catch {}
    return next;
  });
  const ytMountRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const loadedYoutubeIdRef = useRef('');
  const progressTimerRef = useRef(null);

  useEffect(() => {
    const syncMe = (isFirst = false) =>
      fetch('/api/me')
        .then(r => r.json())
        .then(data => {
          if (data.loggedIn) {
            setUser(prev => {
              const next = {
                id: data.userId,
                name: data.username,
                role: data.role,
                avatar_seed: data.avatar_seed,
                avatar_url: data.avatar_url,
                name_color: data.name_color || '',
                chat_color: data.chat_color || '',
                display_name: data.display_name || '',
                vip_expires_at: data.vip_expires_at || 0,
                can_admin: data.can_admin || false,
                phone: data.phone || '',
                phone_masked: data.phone_masked || '',
                coins: data.coins || 0,
                checkin_streak: data.checkin_streak || 0,
                total_listen_seconds: data.total_listen_seconds || 0,
                level: data.level || 1,
                level_progress: data.level_progress || 0,
                level_label: data.level_label || '',
                hours_listened: data.hours_listened || 0,
                badges: data.badges || [],
                unlocks: data.unlocks || [],
                notifications: data.notifications || [],
                unread_notifications: data.unread_notifications || 0,
                followed_djs: data.followed_djs || [],
              };
              if (prev && prev.role !== data.role) {
                toast(`ยศของคุณถูกเปลี่ยนเป็น ${data.role.toUpperCase()}`, 'success');
              }
              return next;
            });
          } else if (!isFirst) {
            setUser(null);
          }
          if (isFirst) setLoaded(true);
        })
        .catch(() => { if (isFirst) setLoaded(true); });

    syncMe(true);
    const id = setInterval(() => syncMe(false), 30000);

    const syncDmUnread = () =>
      fetch('/api/dm/inbox').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setDmUnread(data.reduce((s, c) => s + (c.unread || 0), 0));
      }).catch(() => {});
    syncDmUnread();
    const dmId = setInterval(syncDmUnread, 15000);

    return () => { clearInterval(id); clearInterval(dmId); };
  }, []);

  useEffect(() => {
    const loadStation = async () => {
      try {
        const [npRes, onlineRes] = await Promise.all([
          fetch('/api/now-playing').then(r => r.json()),
          fetch('/api/online').then(r => r.json()),
        ]);
        setNowPlaying(npRes?.youtube_id ? npRes : null);
        setPlayerPlaying(!!npRes?.is_playing);
        if (onlineRes?.online != null) setListeners(onlineRes.online);
        if (Array.isArray(onlineRes?.users)) setOnlineUsers(onlineRes.users);
        if (Array.isArray(onlineRes?.recently_offline)) setOfflineUsers(onlineRes.recently_offline);
      } catch {}
    };

    loadStation();
    const id = setInterval(loadStation, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    const tick = () =>
      fetch('/api/ping', { method: 'POST' })
        .then(r => r.json())
        .then(d => { if (d.online != null) setListeners(d.online); })
        .catch(() => {});
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [user]);

  useEffect(() => {
    const load = () => fetch('/api/rooms').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setRooms(data);
    }).catch(() => {});
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const handleCreateRoom = async (name, skin) => {
    const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, skin }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ไม่สามารถสร้างห้องได้');
    const newRooms = await fetch('/api/rooms').then(r => r.json());
    if (Array.isArray(newRooms)) setRooms(newRooms);
    setActiveRoom(data.id);
    setPage('live');
    return data;
  };

  const handleDeleteRoom = async (id) => {
    const res = await fetch(`/api/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ลบห้องไม่ได้');
    if (activeRoom === id) setActiveRoom(DEFAULT_ROOM_ID);
    const newRooms = await fetch('/api/rooms').then(r => r.json());
    if (Array.isArray(newRooms)) setRooms(newRooms);
  };

  useEffect(() => {
    window.localStorage.setItem('imvu-radio-volume', String(playerVolume));
  }, [playerVolume]);

  useEffect(() => {
    window.localStorage.setItem('imvu-radio-muted', playerMuted ? '1' : '0');
  }, [playerMuted]);

  useEffect(() => {
    if (!nowPlaying?.youtube_id) {
      loadedYoutubeIdRef.current = '';
      setPlayerProgress(0);
      setPlayerDuration(0);
      setPlayerPlaying(false);
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
      return;
    }
    if (loadedYoutubeIdRef.current === nowPlaying.youtube_id && ytPlayerRef.current) {
      try {
        if (nowPlaying.is_playing) ytPlayerRef.current?.playVideo?.();
        else ytPlayerRef.current?.pauseVideo?.();
      } catch {}
      setPlayerPlaying(!!nowPlaying.is_playing);
      return;
    }

    let cancelled = false;
    loadedYoutubeIdRef.current = nowPlaying.youtube_id;

    const mountPlayer = async () => {
      const YT = await ensureAppYouTubeApi();
      if (cancelled || !ytMountRef.current) return;

      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }

      ytPlayerRef.current = new YT.Player(ytMountRef.current, {
        videoId: nowPlaying.youtube_id,
        width: '1',
        height: '1',
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          start: Math.max(0, Math.floor(nowPlaying.elapsed_seconds || 0)),
        },
        events: {
          onReady: (e) => {
            try {
              e.target.setVolume(playerVolume);
              if (playerMuted || playerVolume === 0) e.target.mute();
              else e.target.unMute();
              if (nowPlaying.is_playing === false) e.target.pauseVideo();
              else e.target.playVideo();
              setPlayerDuration(e.target.getDuration?.() || nowPlaying.duration || 0);
            } catch {}
          },
          onStateChange: (e) => {
            if (!window.YT) return;
            const state = e.data;
            setPlayerPlaying(state === window.YT.PlayerState.PLAYING || state === window.YT.PlayerState.BUFFERING);
            if (state === window.YT.PlayerState.ENDED && user?.role === 'dj') {
              fetch('/api/queue/play-next', { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                  if (data.next) setNowPlaying({ ...data.next, is_playing: true, elapsed_seconds: 0 });
                  else setNowPlaying(null);
                })
                .catch(() => {});
            }
          },
        },
      });
    };

    mountPlayer();
    return () => { cancelled = true; };
  }, [nowPlaying?.youtube_id, nowPlaying?.is_playing, user?.id]);

  useEffect(() => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      const player = ytPlayerRef.current;
      if (!player || !nowPlaying?.youtube_id) return;
      try {
        const current = player.getCurrentTime?.() || 0;
        const duration = player.getDuration?.() || nowPlaying.duration || 0;
        if (duration > 0) {
          setPlayerDuration(duration);
          setPlayerProgress(Math.min(100, (current / duration) * 100));
        }
      } catch {}
    }, 500);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [nowPlaying?.youtube_id, nowPlaying?.duration]);

  useEffect(() => {
    const player = ytPlayerRef.current;
    if (!player) return;
    try {
      const vol = micActive && !playerMuted && playerVolume > 0
        ? Math.max(5, Math.round(playerVolume * 0.3))
        : playerVolume;
      player.setVolume(vol);
      if (playerMuted || playerVolume === 0) player.mute();
      else player.unMute();
    } catch {}
  }, [playerVolume, playerMuted, micActive]);

  const toast = (msg, kind = '') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2400);
  };

  const sendReaction = (emoji) => {
    const id = Date.now() + Math.random();
    setFloats(f => [...f, { id, emoji, x: 8 + Math.random() * 40, dur: 2.4 + Math.random() * 1.6 }]);
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 4000);
  };

  const handleLogin = (u) => {
    setUser({
      ...u,
      name_color: u.name_color || '',
      chat_color: u.chat_color || '',
      display_name: u.display_name || '',
      vip_expires_at: u.vip_expires_at || 0,
      phone: u.phone || '',
      phone_masked: u.phone_masked || '',
      coins: u.coins || 0,
      checkin_streak: u.checkin_streak || 0,
      total_listen_seconds: u.total_listen_seconds || 0,
      level: u.level || 1,
      level_progress: u.level_progress || 0,
      level_label: u.level_label || '',
      hours_listened: u.hours_listened || 0,
      badges: u.badges || [],
      unlocks: u.unlocks || [],
      notifications: u.notifications || [],
      unread_notifications: u.unread_notifications || 0,
      followed_djs: u.followed_djs || [],
    });
    toast(`ยินดีต้อนรับ @${u.name}`, 'success');
  };

  const handleLogout = () => {
    fetch('/api/logout', { method: 'POST' }).finally(() => {
      setUser(null);
      setPage('live');
      setDmTarget(null);
    });
  };

  const handleAvatarSave = async (base64) => {
    if (!user) return;
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_seed: user.avatar_seed || user.name, display_name: user.display_name || '', avatar_image: base64 }),
      });
      const data = await res.json();
      if (res.ok) setUser(prev => ({ ...prev, avatar_url: data.avatar_url }));
    } catch {}
  };

  const openDirectMessage = (username) => {
    if (!username) return;
    const lvl = { guest: 0, user: 1, member: 1, vip: 2, dj: 3, admin: 4 }[user?.role] || 0;
    if (lvl < 2) { toast('เฉพาะ VIP ขึ้นไปเท่านั้นที่ใช้ Messenger ได้', ''); return; }
    const target = onlineUsers.find((person) => person.username === username);
    setDmTarget(target || { username });
    setPage('dm');
  };

  const canManagePlayback = user?.role === 'dj';

  const toggleStationPlayback = async () => {
    if (!canManagePlayback || !nowPlaying?.youtube_id) return;
    const nextPlaying = !playerPlaying;
    try {
      const res = await fetch('/api/now-playing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_playing: nextPlaying }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'ควบคุมเพลงไม่สำเร็จ');
        return;
      }
      setNowPlaying((prev) => (prev ? { ...prev, is_playing: nextPlaying } : prev));
      setPlayerPlaying(nextPlaying);
      try {
        if (nextPlaying) ytPlayerRef.current?.playVideo?.();
        else ytPlayerRef.current?.pauseVideo?.();
      } catch {}
    } catch {
      toast('ควบคุมเพลงไม่สำเร็จ');
    }
  };

  const seekStationPlayback = (ratio) => {
    if (!canManagePlayback || !nowPlaying?.youtube_id) return;
    const player = ytPlayerRef.current;
    if (!player || !playerDuration) return;
    try {
      player.seekTo(ratio * playerDuration, true);
      setPlayerProgress(ratio * 100);
    } catch {}
  };

  if (!loaded) return null;

  if (!user) {
    return (
      <>
        <LoginPage onLogin={handleLogin} />
        <Toasts items={toasts} />
      </>
    );
  }

  const sidebarNowPlaying = nowPlaying
    ? {
        dj: nowPlaying.dj_username || 'IIMVU Society Radio',
        track: nowPlaying.title || 'On Air',
        progress: Math.min(100, Math.round(((nowPlaying.elapsed_seconds || 0) / Math.max(nowPlaying.duration || 240, 1)) * 100)),
        djSeed: nowPlaying.dj_avatar_seed || 'imvu-society-radio',
        djAvatarUrl: nowPlaying.dj_avatar_url || '',
      }
    : {
        dj: 'IIMVU Society Radio',
        track: 'Waiting for DJ',
        progress: 0,
        djSeed: 'imvu-society-radio',
        djAvatarUrl: '',
      };

  return (
    <div className="app" data-skin="pink" data-theme={theme}>
      <Sidebar
        page={page}
        onNav={setPage}
        user={user}
        queueCount={queueCount}
        dmUnread={dmUnread}
        onAvatarSave={handleAvatarSave}
        rooms={rooms.map(r => r.id === DEFAULT_ROOM_ID ? { ...r, listeners } : r)}
        activeRoom={activeRoom}
        onRoomClick={(id) => { setActiveRoom(id); setPage('live'); }}
        onCreateRoom={handleCreateRoom}
        onDeleteRoom={handleDeleteRoom}
        nowPlaying={sidebarNowPlaying}
        onlineUsers={onlineUsers}
        offlineUsers={offlineUsers}
        onOpenDM={openDirectMessage}
        onLogout={handleLogout}
        onOpenProfile={() => setPage('profile')}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="main">
        <PromoBanner user={user} onSignup={() => setPage('profile')} />
        {page === 'live' && (
          <LivePage
            user={user}
            chatOpen={chatOpen}
            setChatOpen={setChatOpen}
            listeners={listeners}
            setListeners={setListeners}
            setQueueCount={setQueueCount}
            setStationNowPlaying={setNowPlaying}
            stationNowPlaying={nowPlaying}
            toast={toast}
            floats={floats}
            sendReaction={sendReaction}
            playerPlaying={playerPlaying}
            playerProgress={playerProgress}
            playerDuration={playerDuration}
            playerVolume={playerVolume}
            playerMuted={playerMuted}
            canManagePlayback={canManagePlayback}
            onTogglePlayback={toggleStationPlayback}
            onSeekPlayback={seekStationPlayback}
            onToggleMute={() => setPlayerMuted((v) => !v)}
            onSetVolume={(next) => {
              setPlayerVolume(next);
              if (next > 0) setPlayerMuted(false);
            }}
            onMicLive={setMicActive}
            activeRoom={activeRoom}
          />
        )}
        {page === 'explore' && (
          <ExplorePage
            listeners={listeners}
            queueCount={queueCount}
            nowPlaying={nowPlaying}
            chatOpen={chatOpen}
            setChatOpen={setChatOpen}
            onJoin={() => {
              setPage('live');
              toast('เข้าสู่ห้องถ่ายทอดสดแล้ว', 'success');
            }}
          />
        )}
        {page === 'admin' && (user.role === 'admin' || user.can_admin) && (
          <AdminPage
            user={user}
            listeners={listeners}
            chatOpen={chatOpen}
            setChatOpen={setChatOpen}
            toast={toast}
          />
        )}
        {page === 'dm' && ['vip','dj','admin'].includes(user.role) && (
          <DMPage
            user={user}
            listeners={listeners}
            chatOpen={chatOpen}
            setChatOpen={setChatOpen}
            toast={toast}
            initialTarget={dmTarget}
          />
        )}
        {page === 'profile' && (
          <ProfilePage
            user={user}
            onUpdate={(updated) => setUser(u => ({ ...u, ...updated }))}
            toast={toast}
          />
        )}
        {page === 'rules' && <RulesPage />}
      </main>

      <Toasts items={toasts} />
      <div
        ref={ytMountRef}
        aria-hidden="true"
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden', left: -9999, top: -9999 }}
      ></div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
