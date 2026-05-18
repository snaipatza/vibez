// Mic / Voice Panel — DJ streams via MediaRecorder→Socket.IO→MediaSource API (real-time)
// Fallback: HTTP chunked stream for browsers without MediaSource support
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
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const audioQueueRef = useRef([]);
  const micMimeRef = useRef('audio/webm;codecs=opus');
  const isLiveRef = useRef(false);
  const isListeningRef = useRef(false);

  const isDJ = user.role === 'dj' || user.role === 'admin';

  // ── Cleanup ────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      try { audioRef.current.src = ''; } catch {}
      audioRef.current = null;
    }
    if (mediaSourceRef.current) {
      try {
        if (mediaSourceRef.current.readyState === 'open') mediaSourceRef.current.endOfStream();
      } catch {}
      mediaSourceRef.current = null;
    }
    sourceBufferRef.current = null;
    audioQueueRef.current = [];
    setNeedsClick(false);
  }, []);

  // ── MSE-based real-time listener ────────────────────────────────────────
  const setupMSEAudio = useCallback((headerData, mime) => {
    if (!isListeningRef.current) return;

    // Teardown any previous audio element (keep isListeningRef true)
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      try { audioRef.current.src = ''; } catch {}
      audioRef.current = null;
    }
    if (mediaSourceRef.current) {
      try {
        if (mediaSourceRef.current.readyState === 'open') mediaSourceRef.current.endOfStream();
      } catch {}
      mediaSourceRef.current = null;
    }
    sourceBufferRef.current = null;
    audioQueueRef.current = [];

    if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(mime)) {
      // Fallback to HTTP stream
      const audio = new Audio('/api/mic-stream?t=' + Date.now());
      audioRef.current = audio;
      audio.onerror = () => {
        if (!isLiveRef.current || !isListeningRef.current) return;
        setTimeout(() => {
          if (!isLiveRef.current || !isListeningRef.current) return;
          const retry = new Audio('/api/mic-stream?t=' + Date.now());
          audioRef.current = retry;
          retry.play().catch(() => setNeedsClick(true));
        }, 1200);
      };
      audio.play().catch(() => setNeedsClick(true));
      return;
    }

    const ms = new MediaSource();
    mediaSourceRef.current = ms;
    const audio = new Audio();
    audio.src = URL.createObjectURL(ms);
    audioRef.current = audio;

    // Queue the header as first chunk
    audioQueueRef.current = [new Uint8Array(headerData)];

    ms.addEventListener('sourceopen', () => {
      if (!isListeningRef.current || mediaSourceRef.current !== ms) return;
      let sb;
      try {
        sb = ms.addSourceBuffer(mime);
      } catch {
        // MSE codec mismatch — fall back gracefully
        return;
      }
      sourceBufferRef.current = sb;

      const flush = () => {
        if (!sourceBufferRef.current || sb.updating || audioQueueRef.current.length === 0) return;
        try {
          sb.appendBuffer(audioQueueRef.current.shift());
        } catch {
          audioQueueRef.current = [];
        }
      };

      sb.addEventListener('updateend', () => {
        // Keep buffer small: remove data older than 4 seconds to stay near live edge
        if (!sb.updating && sb.buffered.length > 0) {
          const bufEnd = sb.buffered.end(sb.buffered.length - 1);
          const bufStart = sb.buffered.start(0);
          if (bufEnd - bufStart > 5) {
            try { sb.remove(bufStart, bufEnd - 3); } catch {}
            return;
          }
        }
        flush();
      });

      flush();
    }, { once: true });

    audio.play().catch(() => setNeedsClick(true));

    // Live-edge keeper: every 500ms nudge currentTime to within 300ms of live edge
    const edgeKeeper = setInterval(() => {
      const a = audioRef.current;
      if (!a || !isListeningRef.current) { clearInterval(edgeKeeper); return; }
      try {
        if (a.buffered.length > 0) {
          const live = a.buffered.end(a.buffered.length - 1);
          if (live - a.currentTime > 0.8) a.currentTime = live - 0.1;
        }
      } catch {}
    }, 500);
  }, []);

  // ── Start listening ─────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    stopListening();
    isListeningRef.current = true;
    // Request stored header from server (for late joiners)
    // If DJ just started, header will arrive via mic:audio_header event
    if (socket) socket.emit('mic:request_header');
  }, [stopListening, socket]);

  const clickToListen = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play()
        .then(() => setNeedsClick(false))
        .catch(() => setMicError('ไม่สามารถเล่นเสียงได้'));
    } else {
      startListening();
    }
  }, [startListening]);

  // ── Socket event handlers ───────────────────────────────────────────────
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

    // Receive audio header — triggers MSE setup
    socket.on('mic:audio_header', ({ header, mime }) => {
      if (isDJ) return;
      micMimeRef.current = mime || 'audio/webm;codecs=opus';
      if (isListeningRef.current) {
        setupMSEAudio(header, micMimeRef.current);
      }
    });

    // Receive audio chunk — append to MSE buffer
    socket.on('mic:audio_chunk', (chunk) => {
      if (isDJ) return;
      if (!isListeningRef.current || !sourceBufferRef.current) return;
      const sb = sourceBufferRef.current;
      const data = new Uint8Array(chunk);
      if (!sb.updating) {
        try { sb.appendBuffer(data); } catch { audioQueueRef.current = []; }
      } else {
        audioQueueRef.current.push(data);
        // Prevent unbounded queue growth (drop oldest if > 20 chunks)
        if (audioQueueRef.current.length > 20) audioQueueRef.current.shift();
      }
    });

    socket.on('mic:approved', () => setHasRaised(false));
    socket.on('mic:rejected', () => setHasRaised(false));
    socket.on('mic:removed', () => {});

    return () => {
      socket.off('mic:status');
      socket.off('mic:audio_header');
      socket.off('mic:audio_chunk');
      socket.off('mic:approved');
      socket.off('mic:rejected');
      socket.off('mic:removed');
      if (!isDJ) stopListening();
    };
  }, [socket, isDJ, startListening, stopListening, setupMSEAudio]);

  // ── DJ controls ─────────────────────────────────────────────────────────
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
