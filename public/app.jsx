// IMVU Society Radio - main app shell
const { useState, useEffect } = React;

const STATION_ROOM = { id: 'main-stage', name: 'main-stage', listeners: 0, skin: 'pink' };

function App() {
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState('live');
  const [chatOpen, setChatOpen] = useState(true);
  const [floats, setFloats] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [listeners, setListeners] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [nowPlaying, setNowPlaying] = useState(null);

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(data => {
        if (data.loggedIn) {
          setUser({
            id: data.userId,
            name: data.username,
            role: data.role,
            avatar_seed: data.avatar_seed,
            avatar_url: data.avatar_url,
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    const loadStation = async () => {
      try {
        const [npRes, onlineRes] = await Promise.all([
          fetch('/api/now-playing').then(r => r.json()),
          fetch('/api/online').then(r => r.json()),
        ]);
        setNowPlaying(npRes?.youtube_id ? npRes : null);
        if (onlineRes?.online != null) setListeners(onlineRes.online);
      } catch {}
    };

    loadStation();
    const id = setInterval(loadStation, 10000);
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
    setUser(u);
    toast(`ยินดีต้อนรับ @${u.name}`, 'success');
  };

  const handleLogout = () => {
    fetch('/api/logout', { method: 'POST' }).finally(() => {
      setUser(null);
      setPage('live');
    });
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
        dj: nowPlaying.dj_username || 'IMVU Society Radio',
        track: nowPlaying.title || 'On Air',
        progress: Math.min(100, Math.round(((nowPlaying.elapsed_seconds || 0) / Math.max(nowPlaying.duration || 240, 1)) * 100)),
        djSeed: nowPlaying.dj_avatar_seed || 'imvu-society-radio',
        djAvatarUrl: nowPlaying.dj_avatar_url || '',
      }
    : {
        dj: 'IMVU Society Radio',
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
        onLogout={handleLogout}
      />

      <main className="main">
        {page === 'live' && (
          <LivePage
            user={user}
            chatOpen={chatOpen}
            setChatOpen={setChatOpen}
            listeners={listeners}
            setListeners={setListeners}
            setQueueCount={setQueueCount}
            setStationNowPlaying={setNowPlaying}
            toast={toast}
            floats={floats}
            sendReaction={sendReaction}
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
      </main>

      <Toasts items={toasts} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
