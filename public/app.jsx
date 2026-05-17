// IMVU Society Radio — main app shell
const { useState, useEffect } = React;

const SKIN_BY_ROOM = {
  'main-stage': 'pink',
  'chill-lounge': 'peach',
  'bass-cave': 'indigo',
  'throwback': 'ocher',
};

const ROOMS = [
  { id: 'main-stage', name: 'main-stage', listeners: 0, skin: 'pink' },
  { id: 'chill-lounge', name: 'chill-lounge', listeners: 0, skin: 'peach' },
  { id: 'bass-cave', name: 'bass-cave', listeners: 0, skin: 'indigo' },
  { id: 'throwback', name: 'throwback', listeners: 0, skin: 'ocher' },
];

function App() {
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState('live');
  const [chatOpen, setChatOpen] = useState(true);
  const [activeRoom, setActiveRoom] = useState('main-stage');
  const [floats, setFloats] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [listeners, setListeners] = useState(0);
  const [queueCount, setQueueCount] = useState(0);

  // Check login on load
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(data => {
        if (data.loggedIn) {
          setUser({ name: data.username, role: data.role, avatar_seed: data.avatar_seed, avatar_url: data.avatar_url });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Ping every 30s to keep session alive and get online count
  useEffect(() => {
    if (!user) return;
    const tick = () =>
      fetch('/api/ping', { method: 'POST' })
        .then(r => r.json())
        .then(d => { if (d.online) setListeners(d.online); })
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

  if (!user) return (
    <>
      <LoginPage onLogin={handleLogin} />
      <Toasts items={toasts} />
    </>
  );

  return (
    <div className="app" data-skin={SKIN_BY_ROOM[activeRoom] || 'pink'}>
      <Sidebar
        page={page}
        onNav={setPage}
        user={user}
        queueCount={queueCount}
        rooms={ROOMS.map(r => ({ ...r, listeners: r.id === 'main-stage' ? listeners : r.listeners }))}
        activeRoom={activeRoom}
        onRoomClick={(id) => { setActiveRoom(id); setPage('live'); }}
        nowPlaying={{ dj: 'IMVU Radio', track: 'IMVU Society Radio', progress: 0, djSeed: 'IMVURADIO' }}
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
            toast={toast}
            floats={floats}
            sendReaction={sendReaction}
          />
        )}
        {page === 'explore' && (
          <ExplorePage
            listeners={listeners}
            chatOpen={chatOpen}
            setChatOpen={setChatOpen}
            onJoin={(id) => { setActiveRoom(id); setPage('live'); toast(`เข้าห้อง #${id} แล้ว`, 'success'); }}
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
