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

const STATION_ROOM = { id: 'main-stage', name: 'main-stage', listeners: 0, skin: 'pink' };

function App() {
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState('live');
  const [chatOpen, setChatOpen] = useState(true);
  const [floats, setFloats] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [listeners, setListeners] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [queueCount, setQueueCount] = useState(0);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [dmTarget, setDmTarget] = useState(null);
  const [playerPlaying, setPlayerPlaying] = useState(false);
  const [playerProgress, setPlayerProgress] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [playerVolume, setPlayerVolume] = useState(() => {
    const stored = Number(window.localStorage.getItem('imvu-radio-volume'));
    return Number.isFinite(stored) ? Math.min(100, Math.max(0, stored)) : 75;
  });
  const [playerMuted, setPlayerMuted] = useState(() => window.localStorage.getItem('imvu-radio-muted') === '1');
  const [micActive, setMicActive] = useState(false);
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
    return () => clearInterval(id);
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
    setUser({ ...u, name_color: u.name_color || '', chat_color: u.chat_color || '', display_name: u.display_name || '', vip_expires_at: u.vip_expires_at || 0 });
    toast(`ยินดีต้อนรับ @${u.name}`, 'success');
  };

  const handleLogout = () => {
    fetch('/api/logout', { method: 'POST' }).finally(() => {
      setUser(null);
      setPage('live');
      setDmTarget(null);
    });
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
    <div className="app" data-skin="pink">
      <Sidebar
        page={page}
        onNav={setPage}
        user={user}
        queueCount={queueCount}
        rooms={[{ ...STATION_ROOM, listeners }]}
        activeRoom={STATION_ROOM.id}
        onRoomClick={() => setPage('live')}
        nowPlaying={sidebarNowPlaying}
        onlineUsers={onlineUsers}
        onOpenDM={openDirectMessage}
        onLogout={handleLogout}
        onOpenProfile={() => setPage('profile')}
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
        {page === 'admin' && user.role === 'admin' && (
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
