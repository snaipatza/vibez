// VIBEZ — extra features: beat waves, tip jar, confetti, poll, mood

// Beat-reactive rings around DJ portrait
function BeatWaves() {
  return (
    <div className="beat-waves">
      <span />
      <span />
      <span />
    </div>
  );
}

// Flying hearts — triggered by tip jar
function FlyingHearts({ items }) {
  return (
    <>
      {items.map(h => (
        <div
          key={h.id}
          className="flying-heart"
          style={{
            left: h.x,
            top: h.y,
            '--dx': `${h.dx}px`,
            '--dy': `${h.dy}px`,
          }}
        >
          {h.emoji}
        </div>
      ))}
    </>
  );
}

// Confetti burst
function ConfettiLayer({ active }) {
  if (!active) return null;
  const pieces = Array.from({ length: 40 }, (_, i) => i);
  return (
    <div className="confetti-layer">
      {pieces.map(i => {
        const colors = ['var(--orange)', 'var(--orange-deep)', 'var(--orange-soft)', 'var(--ink)'];
        return (
          <div
            key={i}
            className="confetti-piece"
            style={{
              left: `${Math.random() * 100}%`,
              background: colors[i % colors.length],
              width: `${6 + Math.random() * 6}px`,
              height: `${10 + Math.random() * 8}px`,
              animationDelay: `${Math.random() * 0.6}s`,
              animationDuration: `${2.2 + Math.random() * 1.2}s`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}

// Hype meter top of player
function HypeMeter({ value }) {
  const pct = Math.round(Math.min(100, value));
  return (
    <div className="hype-meter">
      <span className="hype-label">HYPE</span>
      <div className="hype-bar">
        <div className="hype-fill" style={{ width: `${pct}%` }}></div>
      </div>
      <span className="hype-val">{pct}%</span>
    </div>
  );
}

// Tip jar button
function TipJar({ count, onTip, btnRef }) {
  return (
    <button className="tip-jar" onClick={onTip} ref={btnRef} title="ส่งหัวใจให้ DJ">
      <span className="heart"><i className="fas fa-heart"></i></span>
      <span>ส่งหัวใจ</span>
      <span style={{ color: 'var(--orange)' }}>·</span>
      <span>{count.toLocaleString()}</span>
    </button>
  );
}

// Live poll
function LivePoll({ poll, onVote }) {
  if (!poll) return null;
  const total = poll.options.reduce((s, o) => s + o.votes, 0) || 1;
  return (
    <div className="live-poll">
      <div className="poll-head">
        <span className="poll-tag">POLL</span>
        <span className="poll-q">{poll.question}</span>
      </div>
      <div className="poll-options">
        {poll.options.map((opt, i) => {
          const pct = Math.round((opt.votes / total) * 100);
          return (
            <div
              key={i}
              className={`poll-opt ${poll.voted === i ? 'voted' : ''}`}
              onClick={() => onVote(i)}
            >
              <div className="poll-fill" style={{ width: `${pct}%` }}></div>
              <span>{opt.label}</span>
              <span className="pct">{pct}%</span>
            </div>
          );
        })}
      </div>
      <div className="poll-foot">
        <span>{total} โหวต · เริ่ม {poll.startedAgo}</span>
        <span>ปิดใน {poll.timeLeft}</span>
      </div>
    </div>
  );
}

// Mood picker
const MOODS = [
  { id: 'chill', label: 'CHILL', emoji: '🌙' },
  { id: 'hype', label: 'HYPE', emoji: '🔥' },
  { id: 'deep', label: 'DEEP', emoji: '🌌' },
  { id: 'sad', label: 'SAD', emoji: '💧' },
];

function MoodPicker({ mood, onPick }) {
  return (
    <div className="mood-picker">
      {MOODS.map(m => (
        <button
          key={m.id}
          className={`mood-opt ${mood === m.id ? 'active' : ''}`}
          onClick={() => onPick(m.id)}
        >
          <span className="emoji">{m.emoji}</span>
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

function MoodSticker({ mood }) {
  const m = MOODS.find(x => x.id === mood);
  if (!m) return null;
  return (
    <div className="dj-mood-sticker">
      <span className="emoji">{m.emoji}</span>
      <span>{m.label}</span>
    </div>
  );
}

// Streak badge
function StreakBadge({ days }) {
  if (!days || days < 2) return null;
  return (
    <span className="streak-badge" title={`${days}-day streak`}>
      🔥 {days}d
    </span>
  );
}

Object.assign(window, {
  BeatWaves, FlyingHearts, ConfettiLayer, HypeMeter, TipJar,
  LivePoll, MoodPicker, MoodSticker, StreakBadge, MOODS,
});
