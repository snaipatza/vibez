// Mic / Voice Panel — WebRTC Edition
// DJ: getUserMedia → RTCPeerConnection (one per listener) → WebRTC track
// Listener: RTCPeerConnection ← offer/answer signaling → ontrack → Audio
// Anyone who is NOT the active streamer will listen — regardless of role.

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

function useMic(user, socket, onMicLive) {
  const { useState, useEffect, useRef, useCallback } = React;
  const [micState, setMicState] = useState({ isLive: false, djSocketId: null, djUsername: null, requests: [], speakers: [] });
  const [djMicOn, setDjMicOn] = useState(false);
  const [hasRaised, setHasRaised] = useState(false);
  const [micError, setMicError] = useState('');
  const [needsClick, setNeedsClick] = useState(false);

  const localStreamRef     = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // streamer side: listenerSocketId → RTCPeerConnection
  const peerConnectionRef  = useRef(null);       // listener side: single PC to streamer
  const audioRef           = useRef(null);        // listener audio element
  const isLiveRef          = useRef(false);
  const djSocketIdRef      = useRef(null);        // socket ID of whoever is currently on air

  // Can this user start broadcasting?
  const canBroadcast = user.role === 'dj' || user.role === 'admin';

  // Am I the one currently on air? (computed fresh each render)
  const isActiveStreamer = socket && micState.djSocketId === socket.id;

  // ── Listener: tear down connection ───────────────────────────────────
  const stopListening = useCallback(() => {
    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.close(); } catch {}
      peerConnectionRef.current = null;
    }
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    setNeedsClick(false);
  }, []);

  // ── Streamer: close all peer connections ─────────────────────────────
  const closeDJPeers = useCallback(() => {
    peerConnectionsRef.current.forEach(pc => { try { pc.close(); } catch {} });
    peerConnectionsRef.current.clear();
  }, []);

  // ── Streamer: create RTCPeerConnection for one listener ───────────────
  const createDJPeer = useCallback((listenerSocketId) => {
    const stream = localStreamRef.current;
    if (!stream || !socket) return;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current.set(listenerSocketId, pc);

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('rtc:ice', { targetSocketId: listenerSocketId, candidate });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peerConnectionsRef.current.delete(listenerSocketId);
      }
    };

    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => socket.emit('rtc:offer', { listenerSocketId, offer: pc.localDescription }))
      .catch(() => {});
  }, [socket]);

  // ── Broadcaster controls ─────────────────────────────────────────────
  const startDJMic = async () => {
    try {
      setMicError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setDjMicOn(true);
      socket.emit('mic:start');
    } catch {
      setMicError('ไม่สามารถเปิดไมค์ได้ — ตรวจสอบการอนุญาตไมค์ในเบราว์เซอร์');
    }
  };

  const stopDJMic = () => {
    closeDJPeers();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setDjMicOn(false);
    socket.emit('mic:stop');
  };

  // ── Socket events ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on('mic:status', (state) => {
      const wasLive = isLiveRef.current;
      isLiveRef.current = state.isLive;
      djSocketIdRef.current = state.djSocketId;
      setMicState(state);

      const amIStreamer = socket.id === state.djSocketId;

      if (!state.isLive) {
        setDjMicOn(false);
        setHasRaised(false);
        if (!amIStreamer) stopListening();
        if (amIStreamer) closeDJPeers();
      } else if (state.isLive && !amIStreamer && !wasLive) {
        // Mic just went live and I'm not the streamer → request audio
        socket.emit('rtc:request');
      }
      onMicLive?.(state.isLive);
    });

    // ── Streamer: a listener wants audio ──────────────────────────────
    socket.on('rtc:new-listener', ({ listenerSocketId }) => {
      if (socket.id !== djSocketIdRef.current) return;
      createDJPeer(listenerSocketId);
    });

    // ── Streamer: listener sent answer ────────────────────────────────
    socket.on('rtc:answer', ({ listenerSocketId, answer }) => {
      if (socket.id !== djSocketIdRef.current) return;
      const pc = peerConnectionsRef.current.get(listenerSocketId);
      if (pc) pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {});
    });

    // ── Listener: streamer sent offer ─────────────────────────────────
    socket.on('rtc:offer', ({ djSocketId, offer }) => {
      if (socket.id === djSocketIdRef.current) return; // I'm the streamer, skip
      stopListening();

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('rtc:ice', { targetSocketId: djSocketId, candidate });
      };

      pc.ontrack = (e) => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audioRef.current = audio;
        audio.play().catch(() => setNeedsClick(true));
      };

      pc.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => pc.createAnswer())
        .then(answer => pc.setLocalDescription(answer))
        .then(() => socket.emit('rtc:answer', { djSocketId, answer: pc.localDescription }))
        .catch(() => {});
    });

    // ── Both sides: relay ICE candidates ─────────────────────────────
    socket.on('rtc:ice', ({ fromSocketId, candidate }) => {
      try {
        if (socket.id === djSocketIdRef.current) {
          const pc = peerConnectionsRef.current.get(fromSocketId);
          if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        } else {
          const pc = peerConnectionRef.current;
          if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        }
      } catch {}
    });

    // ── Streamer: listener disconnected → clean up its PC ─────────────
    socket.on('rtc:listener-left', ({ listenerSocketId }) => {
      if (socket.id !== djSocketIdRef.current) return;
      const pc = peerConnectionsRef.current.get(listenerSocketId);
      if (pc) { try { pc.close(); } catch {} peerConnectionsRef.current.delete(listenerSocketId); }
    });

    socket.on('mic:approved', () => setHasRaised(false));
    socket.on('mic:rejected', () => setHasRaised(false));
    socket.on('mic:removed', () => {});

    return () => {
      socket.off('mic:status');
      socket.off('rtc:new-listener');
      socket.off('rtc:answer');
      socket.off('rtc:offer');
      socket.off('rtc:ice');
      socket.off('rtc:listener-left');
      socket.off('mic:approved');
      socket.off('mic:rejected');
      socket.off('mic:removed');
      stopListening();
    };
  }, [socket, stopListening, closeDJPeers, createDJPeer]);

  // ── Listener helpers ─────────────────────────────────────────────────
  const clickToListen = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play()
        .then(() => setNeedsClick(false))
        .catch(() => setMicError('ไม่สามารถเล่นเสียงได้'));
    } else {
      socket.emit('rtc:request');
    }
  }, [socket]);

  const raiseHand      = () => { setHasRaised(true);  socket.emit('hand:raise'); };
  const lowerHand      = () => { setHasRaised(false); socket.emit('hand:lower'); };
  const approveRequest = (sid) => socket.emit('hand:approve', { socketId: sid });
  const rejectRequest  = (sid) => socket.emit('hand:reject',  { socketId: sid });
  const removeSpeaker  = (sid) => socket.emit('hand:remove',  { socketId: sid });

  return {
    micState, djMicOn, hasRaised, micError, needsClick,
    canBroadcast, isActiveStreamer,
    startDJMic, stopDJMic, raiseHand, lowerHand,
    approveRequest, rejectRequest, removeSpeaker, clickToListen,
  };
}

function MicPanel({ user, socket, onMicLive }) {
  const mic = useMic(user, socket, onMicLive);
  const { micState, djMicOn, hasRaised, micError, needsClick, canBroadcast, isActiveStreamer } = mic;

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

      {/* Broadcaster controls — anyone with dj/admin role */}
      {canBroadcast && (
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

      {/* "Click to listen" prompt — shown when browser blocks autoplay */}
      {!isActiveStreamer && micState.isLive && needsClick && (
        <button className="mic-listen-btn" onClick={mic.clickToListen}>
          <i className="fas fa-volume-up"></i>
          <span>กดเพื่อฟังเสียง DJ</span>
        </button>
      )}

      {/* Listener controls — everyone except the active streamer */}
      {!isActiveStreamer && (
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
                {canBroadcast && (
                  <button className="mic-remove-btn" onClick={() => mic.removeSpeaker(s.socketId)}>
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {canBroadcast && micState.requests.length > 0 && (
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

      {!isActiveStreamer && micState.requests.length > 0 && (
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
