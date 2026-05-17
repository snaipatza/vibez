// Mic / Voice Panel — WebRTC broadcast + raise hand
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function useMic(user, socket) {
  const { useState, useEffect, useRef } = React;
  const [micState, setMicState] = useState({ isLive: false, djSocketId: null, djUsername: null, requests: [], speakers: [] });
  const [djMicOn, setDjMicOn] = useState(false);
  const [hasRaised, setHasRaised] = useState(false);
  const [isApprovedSpeaker, setIsApprovedSpeaker] = useState(false);
  const [micError, setMicError] = useState('');
  const broadcastPeers = useRef(new Map()); // socketId -> RTCPeerConnection
  const localStreamRef = useRef(null);
  const audioElementsRef = useRef(new Map()); // socketId -> <audio>
  const micStateRef = useRef({ isLive: false, djSocketId: null, djUsername: null, requests: [], speakers: [] });

  const isDJ = user.role === 'dj' || user.role === 'admin';

  function cleanupPeer(socketId) {
    const pc = broadcastPeers.current.get(socketId);
    if (pc) { pc.close(); broadcastPeers.current.delete(socketId); }
    const audio = audioElementsRef.current.get(socketId);
    if (audio) { audio.srcObject = null; audio.remove(); audioElementsRef.current.delete(socketId); }
  }

  function cleanupAll() {
    broadcastPeers.current.forEach((pc, sid) => cleanupPeer(sid));
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
  }

  function requestListenerFeed() {
    if (!socket || isDJ) return;
    socket.emit('listener:ready');
  }

  async function createListenerConnection(listenerSocketId) {
    if (!localStreamRef.current) return;
    const pc = new RTCPeerConnection(ICE_CONFIG);
    broadcastPeers.current.set(listenerSocketId, pc);

    localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('mic:ice_to_listener', { targetSocketId: listenerSocketId, candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (['disconnected','failed','closed'].includes(pc.connectionState)) cleanupPeer(listenerSocketId);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('mic:offer', { targetSocketId: listenerSocketId, offer });
  }

  async function connectToSpeaker(broadcasterSocketId, offer) {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    broadcastPeers.current.set(broadcasterSocketId, pc);

    pc.ontrack = (e) => {
      let audio = audioElementsRef.current.get(broadcasterSocketId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        audioElementsRef.current.set(broadcasterSocketId, audio);
      }
      audio.srcObject = e.streams[0];
      audio.play().catch(() => {
        setMicError('เบราว์เซอร์บล็อกการเล่นเสียงอัตโนมัติ ให้คลิกที่หน้าเว็บอีกครั้ง');
      });
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('mic:ice_from_listener', { targetSocketId: broadcasterSocketId, candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (['disconnected','failed','closed'].includes(pc.connectionState)) cleanupPeer(broadcasterSocketId);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('mic:answer', { targetSocketId: broadcasterSocketId, answer });
  }

  useEffect(() => {
    if (!socket) return;

    socket.on('mic:status', (state) => {
      micStateRef.current = state;
      setMicState(state);
      // If DJ stopped, cleanup
      if (!state.isLive) {
        cleanupAll();
        setDjMicOn(false);
        setIsApprovedSpeaker(false);
        setHasRaised(false);
      } else if (!isDJ) {
        requestListenerFeed();
      }
    });

    // DJ receives: new listener ready for audio
    socket.on('listener:ready', ({ socketId }) => {
      if (localStreamRef.current) createListenerConnection(socketId);
    });

    // Listeners receive: DJ went live → signal ready
    socket.on('mic:dj_live', ({ djSocketId }) => {
      micStateRef.current = { ...micStateRef.current, isLive: true, djSocketId };
      requestListenerFeed();
    });

    // Receive audio offer (from DJ or approved speaker)
    socket.on('mic:offer', async ({ from, offer }) => {
      await connectToSpeaker(from, offer);
    });

    // DJ receives: listener's answer
    socket.on('mic:answer', ({ from, answer }) => {
      const pc = broadcastPeers.current.get(from);
      if (pc) pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    // ICE from listener → DJ
    socket.on('mic:ice_from_listener', ({ from, candidate }) => {
      const pc = broadcastPeers.current.get(from);
      if (pc && candidate) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    });

    // ICE from DJ → listener
    socket.on('mic:ice_to_listener', ({ from, candidate }) => {
      const pc = broadcastPeers.current.get(from);
      if (pc && candidate) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    });

    // User approved to speak
    socket.on('mic:approved', async () => {
      setIsApprovedSpeaker(true);
      setHasRaised(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        // Connect to DJ
        const targetDjSocketId = micStateRef.current.djSocketId || '';
        if (targetDjSocketId) {
          await createListenerConnection(targetDjSocketId);
        }
      } catch (err) {
        setMicError('ไม่สามารถเปิดไมค์ได้');
      }
    });

    socket.on('mic:rejected', () => {
      setHasRaised(false);
    });

    socket.on('mic:removed', () => {
      setIsApprovedSpeaker(false);
      cleanupAll();
    });

    return () => {
      socket.off('mic:status');
      socket.off('listener:ready');
      socket.off('mic:dj_live');
      socket.off('mic:offer');
      socket.off('mic:answer');
      socket.off('mic:ice_from_listener');
      socket.off('mic:ice_to_listener');
      socket.off('mic:approved');
      socket.off('mic:rejected');
      socket.off('mic:removed');
      cleanupAll();
    };
  }, [socket, isDJ]);

  const startDJMic = async () => {
    try {
      setMicError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setDjMicOn(true);
      socket.emit('mic:start');
    } catch (err) {
      setMicError('ไม่สามารถเปิดไมค์ได้ — ตรวจสอบการอนุญาตไมค์ในเบราว์เซอร์');
    }
  };

  const stopDJMic = () => {
    cleanupAll();
    setDjMicOn(false);
    setMicState(s => ({ ...s, isLive: false, requests: [], speakers: [] }));
    socket.emit('mic:stop');
  };

  const raiseHand = () => {
    setHasRaised(true);
    socket.emit('hand:raise');
  };

  const lowerHand = () => {
    setHasRaised(false);
    socket.emit('hand:lower');
  };

  const approveRequest = (socketId) => socket.emit('hand:approve', { socketId });
  const rejectRequest = (socketId) => socket.emit('hand:reject', { socketId });
  const removeSpeaker = (socketId) => socket.emit('hand:remove', { socketId });

  return {
    micState, djMicOn, hasRaised, isApprovedSpeaker, micError, isDJ,
    startDJMic, stopDJMic, raiseHand, lowerHand,
    approveRequest, rejectRequest, removeSpeaker,
  };
}

function MicPanel({ user, socket }) {
  const { useState } = React;
  const mic = useMic(user, socket);
  const { micState, djMicOn, hasRaised, isApprovedSpeaker, micError, isDJ } = mic;

  if (!socket) return null;

  return (
    <div className="mic-panel">
      {/* Header */}
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

      {/* DJ Controls */}
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

      {/* Non-DJ: raise hand button (only when DJ mic is live) */}
      {!isDJ && (
        <div className="mic-user-controls">
          {micState.isLive ? (
            isApprovedSpeaker ? (
              <div className="mic-speaking-indicator">
                <span className="mic-pulse"></span>
                <i className="fas fa-microphone"></i>
                <span>กำลังพูดอยู่</span>
              </div>
            ) : hasRaised ? (
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

      {/* Speakers on stage */}
      {(micState.speakers.length > 0 || micState.isLive) && (
        <div className="mic-stage">
          <div className="mic-stage-label">กำลังพูดอยู่</div>
          <div className="mic-stage-row">
            {/* DJ avatar */}
            {micState.isLive && (
              <div className="mic-avatar-bubble active" title={`DJ: ${micState.djUsername}`}>
                <img src={AVATAR(micState.djUsername || 'DJ')} alt="" />
                <span className="mic-avatar-name">{micState.djUsername}</span>
                <span className="mic-on-dot"></span>
              </div>
            )}
            {/* Approved speakers */}
            {micState.speakers.map(s => (
              <div key={s.socketId} className="mic-avatar-bubble active" title={s.username}>
                {s.avatar_url
                  ? <img src={s.avatar_url} alt="" />
                  : <img src={AVATAR(s.avatar_seed || s.username)} alt="" />
                }
                <span className="mic-avatar-name">{s.username}</span>
                <span className="mic-on-dot"></span>
                {isDJ && (
                  <button className="mic-remove-btn" onClick={() => mic.removeSpeaker(s.socketId)} title="เอาออกจากเวที">
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raise hand queue — only DJ sees this */}
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
                <button className="mic-approve-btn" onClick={() => mic.approveRequest(r.socketId)}>
                  อนุมัติ
                </button>
                <button className="mic-reject-btn" onClick={() => mic.rejectRequest(r.socketId)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Non-DJ: show other requesters as small bubbles */}
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
