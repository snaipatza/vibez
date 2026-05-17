// Mic / Voice Panel — DJ streams via MediaRecorder→Socket.IO→HTTP chunked stream
// Listeners use <audio src="/api/mic-stream"> — browser handles buffering/decoding
const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function getSupportedMime() {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  for (const t of MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'audio/webm';
}

function useMic(user, socket, onMicLive) {
  const { useState, useEffect, useRef, useCallback } = React;
  const [micState, setMicState] = useState({ isLive: false, djSocketId: null, djUsername: null, requests: [], speakers: [] });
  const [djMicOn, setDjMicOn] = useState(false);
  const [hasRaised, setHasRaised] = useState(false);
  const [micError, setMicError] = useState('');
  const [needsClick, setNeedsClick] = useState(false);

  const localStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioRef = useRef(null);
  const isLiveRef = useRef(false);

  const isDJ = user.role === 'dj' || user.role === 'admin';

  const stopListening = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      try { audioRef.current.src = ''; } catch {}
      audioRef.current = null;
    }
    setNeedsClick(false);
  }, []);

  const startListening = useCallback(() => {
    stopListening();
    const audio = new Audio('/api/mic-stream?t=' + Date.now());
    audioRef.current = audio;
    audio.onerror = () => {
      if (!isLiveRef.current) return;
      setTimeout(() => {
        if (!isLiveRef.current || audioRef.current !== audio) return;
        const retry = new Audio('/api/mic-stream?t=' + Date.now());
        audioRef.current = retry;
        retry.onerror = () => setMicError('ไม่สามารถเชื่อมต่อเสียงได้');
        retry.play().catch(() => setNeedsClick(true));
      }, 1200);
    };
    audio.play().catch(() => setNeedsClick(true));
  }, [stopListening]);

  const clickToListen = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play()
        .then(() => setNeedsClick(false))
        .catch(() => setMicError('ไม่สามารถเล่นเสียงได้'));
    } else {
      startListening();
    }
  }, [startListening]);

  useEffect(() => {
    if (!socket) return;

    socket.on('mic:status', (state) => {
      const wasLive = isLiveRef.current;
      isLiveRef.current = state.isLive;
      setMicState(state);

      if (!state.isLive) {
        setDjMicOn(false);
        setHasRaised(false);
        if (!isDJ) stopListening();
      } else if (state.isLive && !isDJ && !wasLive) {
        startListening();
      }
      onMicLive?.(state.isLive);
    });

    socket.on('mic:approved', () => setHasRaised(false));
    socket.on('mic:rejected', () => setHasRaised(false));
    socket.on('mic:removed', () => {});

    return () => {
      socket.off('mic:status');
      socket.off('mic:approved');
      socket.off('mic:rejected');
      socket.off('mic:removed');
      if (!isDJ) stopListening();
    };
  }, [socket, isDJ, startListening, stopListening]);

  const startDJMic = async () => {
    try {
      setMicError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const mime = getSupportedMime();
      let isFirst = true;

      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return;
        try {
          const buf = await e.data.arrayBuffer();
          if (isFirst) {
            socket.emit('mic:audio_header', { header: buf, mime });
            isFirst = false;
          } else {
            socket.emit('mic:audio_chunk', buf);
          }
        } catch {}
      };

      recorder.start(100); // 100ms chunks for low latency
      setDjMicOn(true);
      socket.emit('mic:start');
    } catch {
      setMicError('ไม่สามารถเปิดไมค์ได้ — ตรวจสอบการอนุญาตไมค์ในเบราว์เซอร์');
    }
  };

  const stopDJMic = () => {
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch {}
      mediaRecorderRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setDjMicOn(false);
    socket.emit('mic:stop');
  };

  const raiseHand = () => { setHasRaised(true); socket.emit('hand:raise'); };
  const lowerHand = () => { setHasRaised(false); socket.emit('hand:lower'); };
  const approveRequest = (socketId) => socket.emit('hand:approve', { socketId });
  const rejectRequest = (socketId) => socket.emit('hand:reject', { socketId });
  const removeSpeaker = (socketId) => socket.emit('hand:remove', { socketId });

  return {
    micState, djMicOn, hasRaised, micError, needsClick, isDJ,
    startDJMic, stopDJMic, raiseHand, lowerHand,
    approveRequest, rejectRequest, removeSpeaker, clickToListen,
  };
}

function MicPanel({ user, socket, onMicLive }) {
  const mic = useMic(user, socket, onMicLive);
  const { micState, djMicOn, hasRaised, micError, needsClick, isDJ } = mic;

  if (!socket) return null;

  return (
    <div className="mic-panel">
      <div className="mic-panel-head">
        <div>
          <div className="pre">— Voice</div>
          <h3>ไมค์ &amp; เวที</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {micState.isLive && (
            <span className="mic-live-badge">
              <span className="dot"></span> ON AIR
            </span>
          )}
        </div>
      </div>

      {isDJ && (
        <div className="mic-dj-controls">
          {!djMicOn ? (
            <button className="mic-open-btn" onClick={mic.startDJMic}>
              <i className="fas fa-microphone"></i>
              <span>เปิดไมค์</span>
            </button>
          ) : (
            <button className="mic-open-btn active" onClick={mic.stopDJMic}>
              <span className="mic-pulse"></span>
              <i className="fas fa-microphone"></i>
              <span>กำลังออกอากาศ — กดเพื่อปิด</span>
            </button>
          )}
        </div>
      )}

      {!isDJ && micState.isLive && needsClick && (
        <button className="mic-listen-btn" onClick={mic.clickToListen}>
          <i className="fas fa-volume-up"></i>
          <span>กดเพื่อฟังเสียง DJ</span>
        </button>
      )}

      {!isDJ && (
        <div className="mic-user-controls">
          {micState.isLive ? (
            hasRaised ? (
              <button className="mic-hand-btn raised" onClick={mic.lowerHand}>
                <i className="fas fa-hand-paper"></i>
                <span>กำลังขอพูด... (กดยกเลิก)</span>
              </button>
            ) : (
              <button className="mic-hand-btn" onClick={mic.raiseHand}>
                <i className="fas fa-hand-paper"></i>
                <span>ขอพูด</span>
              </button>
            )
          ) : (
            <div className="mic-offline-hint">
              <i className="fas fa-microphone-slash"></i>
              <span>รอ DJ เปิดไมค์</span>
            </div>
          )}
        </div>
      )}

      {micError && (
        <div style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-mono)', padding: '8px 0' }}>
          {micError}
        </div>
      )}

      {(micState.speakers.length > 0 || micState.isLive) && (
        <div className="mic-stage">
          <div className="mic-stage-label">กำลังพูดอยู่</div>
          <div className="mic-stage-row">
            {micState.isLive && (
              <div className="mic-avatar-bubble active" title={`DJ: ${micState.djUsername}`}>
                <img src={AVATAR(micState.djUsername || 'DJ')} alt="" />
                <span className="mic-avatar-name">{micState.djUsername}</span>
                <span className="mic-on-dot"></span>
              </div>
            )}
            {micState.speakers.map(s => (
              <div key={s.socketId} className="mic-avatar-bubble active" title={s.username}>
                {s.avatar_url
                  ? <img src={s.avatar_url} alt="" />
                  : <img src={AVATAR(s.avatar_seed || s.username)} alt="" />
                }
                <span className="mic-avatar-name">{s.username}</span>
                <span className="mic-on-dot"></span>
                {isDJ && (
                  <button className="mic-remove-btn" onClick={() => mic.removeSpeaker(s.socketId)}>
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isDJ && micState.requests.length > 0 && (
        <div className="mic-requests">
          <div className="mic-stage-label">ขอพูด ({micState.requests.length})</div>
          <div className="mic-request-list">
            {micState.requests.map(r => (
              <div key={r.socketId} className="mic-request-row">
                <div className="mic-req-avatar">
                  {r.avatar_url
                    ? <img src={r.avatar_url} alt="" />
                    : <img src={AVATAR(r.avatar_seed || r.username)} alt="" />
                  }
                  <span className="hand-icon">✋</span>
                </div>
                <span className="mic-req-name">{r.username}</span>
                <button className="mic-approve-btn" onClick={() => mic.approveRequest(r.socketId)}>อนุมัติ</button>
                <button className="mic-reject-btn" onClick={() => mic.rejectRequest(r.socketId)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isDJ && micState.requests.length > 0 && (
        <div className="mic-requests-mini">
          <div className="mic-stage-label">กำลังขอพูด</div>
          <div className="mic-stage-row">
            {micState.requests.map(r => (
              <div key={r.socketId} className="mic-avatar-bubble" title={`${r.username} ขอพูด`}>
                {r.avatar_url
                  ? <img src={r.avatar_url} alt="" />
                  : <img src={AVATAR(r.avatar_seed || r.username)} alt="" />
                }
                <span className="mic-avatar-name">{r.username}</span>
                <span style={{ position: 'absolute', top: -4, right: -4, fontSize: 12 }}>✋</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

window.MicPanel = MicPanel;
window.useMic = useMic;
