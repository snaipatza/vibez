// Explore - real station overview
function ExplorePage({ listeners, queueCount, nowPlaying, onJoin, chatOpen, setChatOpen }) {
  const isLive = !!nowPlaying?.youtube_id;

  return (
    <>
      <TopBar
        crumb="DISCOVER / STATION"
        title="Explore"
        meta="สถานะจริงของสถานีและห้องถ่ายทอดสด"
        listeners={listeners}
        onToggleChat={() => setChatOpen(v => !v)}
        chatOpen={chatOpen}
      />

      <div className="content no-chat">
        <div className="stage">
          <div className="explore-hero">
            <div>
              <div className="pre">- Chat Society Radio</div>
              <h1>สถานีถ่ายทอดสด<br /><span className="orange">พร้อมใช้งานจริง</span></h1>
              <p className="lede">
                หน้านี้ดึงสถานะจากระบบจริง: เพลงที่กำลังเล่น, จำนวนผู้ฟังออนไลน์ และคิวเพลงถัดไป
              </p>
            </div>
            <div className="explore-stats">
              <div className="stat-card">
                <div className="label">Live Status</div>
                <div className="v">{isLive ? 'ON AIR' : 'OFFLINE'}</div>
                <div className="delta">{isLive ? 'มีการถ่ายทอดสดอยู่ตอนนี้' : 'รอ DJ เริ่มรายการ'}</div>
              </div>
              <div className="stat-card">
                <div className="label">Listeners</div>
                <div className="v">{listeners}</div>
                <div className="delta">ออนไลน์ล่าสุดจากระบบจริง</div>
              </div>
              <div className="stat-card">
                <div className="label">Queue</div>
                <div className="v">{queueCount}</div>
                <div className="delta">คำขอเพลงที่รออยู่</div>
              </div>
            </div>
          </div>

          <div className="section-head">
            <div>
              <div className="pre">- Live Room</div>
              <h2>Main Stage</h2>
            </div>
          </div>

          <div className="rooms-grid">
            <div className="room-card feat" onClick={onJoin}>
              <div className="top">
                <span>#main-stage</span>
                {isLive
                  ? <span className="live-mini"><span className="dot"></span> LIVE</span>
                  : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, opacity: 0.6 }}>OFFLINE</span>
                }
              </div>
              <h3>{nowPlaying?.title || 'Chat Society Radio'}</h3>
              <div className="room-sub">
                {(nowPlaying?.dj_username || 'Chat Society Radio')} / {nowPlaying?.artist || 'Live Station'}
              </div>
              <div className="now-playing-mini">
                {isLive && <span className="eqm"><span /><span /><span /></span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {isLive ? 'กำลังออกอากาศ' : 'ยังไม่มีรายการสดในตอนนี้'}
                </span>
              </div>
              <div className="meta-row">
                <span>{listeners} listeners</span>
                <span>{queueCount} queue</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.ExplorePage = ExplorePage;
