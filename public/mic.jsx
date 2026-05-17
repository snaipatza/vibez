// Mic / Voice Panel — MediaRecorder broadcast via Socket.IO (no WebRTC)
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
  const { useState, useEffect, useRef } = React;
  const [micState, setMicState] = useState({ isLive: false, djSocketId: null, djUsername: null, requests: [], speakers: [] });
  const [djMicOn, setDjMicOn] = useState(false);
  const [hasRaised, setHasRaised] = useState(false);
  const [micError, setMicError] = useState('');

  const localStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  // Listener playback refs
  const audioRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const chunkQueueRef = useRef([]);

  const isDJ = user.role === 'dj' || user.role === 'admin';

  function teardownListenerAudio() {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      try { audioRef.current.src = ''; } catch {}
      audioRef.current = null;
    }
    if (mediaSourceRef.current) {
      try {
        if (mediaSourceRef.current.readyState === 'open') {
          mediaSourceRef.current.endOfStream();
        }
      } catch {}
      mediaSourceRef.current = null;
    }
    sourceBufferRef.current = null;
    chunkQueueRef.current = [];
  }

  function setupListenerAudio(mime, firstChunk) {
    teardownListenerAudio();
    try {
      const ms = new MediaSource();
      mediaSourceRef.current = ms;
      const audio = new Audio();
      audioRef.current = audio;
      audio.src = URL.createObjectURL(ms);

      ms.addEventListener('sourceopen', () => {
        try {
          const sb = ms.addSourceBuffer(mime);
          sourceBufferRef.current = sb;
          sb.mode = 'sequence';

          const flushQueue = () => {
            if (chunkQueueRef.current.length > 0 && !sb.updating) {
              try { sb.appendBuffer(chunkQueueRef.current.shift()); } catch {}
            }
          };
          sb.addEventListener('updateend', flushQueue);

          if (firstChunk) {
            try { sb.appendBuffer(firstChunk); } catch {}
          }
        } catch {
          setMicError('เบราว์เซอร์ไม่รองรับรูปแบบเสียงนี้');
        }
      });

      audio.play().catch(() => {
        setMicError('คลิกที่หน้าเว็บเพื่อรับฟังเสียง');
      });
    } catch {
      setMicError('ไม่สามารถเล่นเสียงได้');
    }
  }

  function appendAudioChunk(buf) {
    const sb = sourceBufferRef.current;
    if (!sb) return;
    if (sb.updating) {
      chunkQueueRef.current.push(buf);
    } else {
      try { sb.appendBuffer(buf); } catch {
        chunkQueueRef.current.push(buf);
      }
    }
  }

  useEffect(() => {
    if (!socket) return;

    socket.on('mic:status', (state) => {
      setMicState(state);
      if (!state.isLive) {
        setDjMicOn(false);
        setHasRaised(false);
        teardownListenerAudio();
      }
      onMicLive?.(state.isLive);
    });

    socket.on('mic:audio_header', ({ header, mime }) => {
      if (isDJ) return;
      try {
        const buf = header instanceof ArrayBuffer ? header : new Uint8Array(header).buffer;
        setupListenerAudio(mime || 'audio/webm;codecs=opus', buf);
      } catch {}
    });

    socket.on('mic:audio_chunk', (chunk) => {
      if (isDJ) return;
      try {
        const buf = chunk instanceof ArrayBuffer ? chunk : new Uint8Array(chunk).buffer;
        appendAudioChunk(buf);
      } catch {}
    });

    socket.on('mic:approved', () => { setHasRaised(false); });
    socket.on('mic:rejected', () => { setHasRaised(false); });
    socket.on('mic:removed', () => {});

    return () => {
      socket.off('mic:status');
      socket.off('mic:audio_header');
      socket.off('mic:audio_chunk');
      socket.off('mic:approved');
      socket.off('mic:rejected');
      socket.off('mic:removed');
      teardownListenerAudio();
    };
  }, [socket, isDJ]);

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

      recorder.start(400);
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
    micState, djMicOn, hasRaised, isApprovedSpeaker: false, micError, isDJ,
    startDJMic, stopDJMic, raiseHand, lowerHand,
    approveRequest, rejectRequest, removeSpeaker,
  };
}

function MicPanel({ user, socket, onMicLive }) {
  const { useState } = React;
  const mic = useMic(user, socket, onMicLive);
  const { micState, djMicOn, hasRaised, micError, isDJ } = mic;

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
