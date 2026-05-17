// Explore — discover rooms
const ROOMS_DATA = [
  {
    id: 'main-stage',
    name: 'main-stage',
    dj: 'IMVU Radio',
    title: 'Main Stage',
    now: 'Live Now',
    listeners: 0,
    tag: 'Live',
    feat: true,
    live: true,
  },
  {
    id: 'chill-lounge',
    name: 'chill-lounge',
    dj: 'Chill Vibes',
    title: 'Chill Lounge',
    now: 'Coming Soon',
    listeners: 0,
    tag: 'Lo-fi',
    live: false,
  },
  {
    id: 'bass-cave',
    name: 'bass-cave',
    dj: 'Bass Drop',
    title: 'Bass Cave',
    now: 'Coming Soon',
    listeners: 0,
    tag: 'D&B',
    live: false,
  },
  {
    id: 'throwback',
    name: 'throwback',
    dj: 'Retro Mix',
    title: 'Throwback',
    now: 'Coming Soon',
    listeners: 0,
    tag: 'Retro',
    live: false,
  },
];

function ExplorePage({ listeners, onJoin, chatOpen, setChatOpen }) {
  return (
    <>
      <TopBar
        crumb="DISCOVER ⁄ ALL ROOMS"
        title="Explore"
        meta="ห้องไลฟ์ทั้งหมด"
        listeners={listeners}
        onToggleChat={() => setChatOpen(v => !v)}
        chatOpen={chatOpen}
      />

      <div className="content no-chat">
        <div className="stage">
          <div className="explore-hero">
            <div>
              <div className="pre">— IMVU Society Radio</div>
              <h1>ห้องทั้งหมด<br /><span className="orange">ที่มีอยู่</span></h1>
              <p className="lede">เลือกห้องที่ใช่กับ vibe ของคุณ — กดเข้าได้ทันที</p>
            </div>
            <div className="explore-stats">
              <div className="stat-card">
                <div className="label">Active Listeners</div>
                <div className="v">{listeners}</div>
                <div className="delta">● LIVE NOW</div>
              </div>
              <div className="stat-card">
                <div className="label">Total Rooms</div>
                <div className="v">{ROOMS_DATA.length}</div>
                <div className="delta">1 กำลัง live</div>
              </div>
            </div>
          </div>

          <div className="section-head">
            <div>
              <div className="pre">— Rooms</div>
              <h2>ห้องทั้งหมด</h2>
            </div>
          </div>

          <div className="rooms-grid">
            {ROOMS_DATA.map(r => (
              <div
                key={r.id}
                className={`room-card ${r.feat ? 'feat' : ''}`}
                onClick={() => r.live && onJoin(r.id)}
                style={!r.live ? { opacity: 0.6, cursor: 'default' } : {}}
              >
                <div className="top">
                  <span>#{r.name}</span>
                  {r.live
                    ? <span className="live-mini"><span className="dot"></span> LIVE</span>
                    : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, opacity: 0.5 }}>SOON</span>
                  }
                </div>
                <h3>{r.title}</h3>
                <div className="room-sub">{r.dj} · {r.tag}</div>
                <div className="now-playing-mini">
                  {r.live && <span className="eqm"><span /><span /><span /></span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {r.now}
                  </span>
                </div>
                <div className="meta-row">
                  <span>{r.id === 'main-stage' ? `${listeners} listeners` : r.listeners + ' listeners'}</span>
                  {r.live && <span>→ JOIN</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

window.ExplorePage = ExplorePage;
