// ── STATE ──────────────────────────────────────────────────────────────
let ttsEnabled = false;
let currentUser = null;
let lastMessageId = 0;
let isPlaying = true;
let progress = 0;
let volume = 75;
let currentTrack = 0;
let ytData = null;

// YouTube state
let ytPlayer = null;
let ytPlayerReady = false;
let ytApiReady = false;
let ytProgressInterval = null;
let currentYtId = null;
let syncInProgress = false;
let ytApiReadyWaiters = [];
let pendingYtPlayback = null;
let queueIsFull = false;
let pendingAvatarImage = null;

function avatarUrl(seed, imageUrl = '') {
    if (imageUrl) return imageUrl;
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || 'guest')}`;
}

const fakeTracks = [
    { title: 'Midnight Groove', artist: 'IIMVU Society Radio ft. Luna',    duration: '4:12', seed: 'album1' },
    { title: 'Neon Dreams',     artist: 'IIMVU Society Radio x Synthwave', duration: '3:45', seed: 'album2' },
    { title: 'Bass Culture',    artist: 'IIMVU Society Radio ft. MC Flow', duration: '5:01', seed: 'album3' },
    { title: 'Electric Sunset', artist: 'IIMVU Society Radio',             duration: '3:58', seed: 'album4' },
    { title: 'Deep Into Night', artist: 'IIMVU Society Radio ft. Aurora',  duration: '4:33', seed: 'album5' },
];

// ── YOUTUBE IFRAME API CALLBACK ────────────────────────────────────────
function isYouTubeApiReady() {
    return !!(window.YT && window.YT.Player);
}

function markYouTubeApiReady() {
    ytApiReady = true;
    ytApiReadyWaiters.splice(0).forEach(resolve => resolve());
}

function onYouTubeIframeAPIReady() {
    markYouTubeApiReady();
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

function ensureYouTubeApiScript() {
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
}

function waitForYouTubeApi() {
    if (ytApiReady || isYouTubeApiReady()) {
        markYouTubeApiReady();
        return Promise.resolve(true);
    }
    ensureYouTubeApiScript();
    return new Promise(resolve => {
        const poll = setInterval(() => {
            if (!isYouTubeApiReady()) return;
            clearInterval(poll);
            clearTimeout(timer);
            markYouTubeApiReady();
            resolve(true);
        }, 100);
        const timer = setTimeout(() => {
            clearInterval(poll);
            resolve(false);
        }, 8000);
        ytApiReadyWaiters.push(() => {
            clearInterval(poll);
            clearTimeout(timer);
            resolve(true);
        });
    });
}

// ── BOOT ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const me = await api('/api/me');
    if (!me.loggedIn) { window.location.href = '/login.html'; return; }
    currentUser = me;

    setupUserUI();
    initTTS();
    initParticles();

    initFakePlayer();
    initEventListeners();
    await loadQueue();
    await loadMessages();
    renderAds([]);
    startPolling();
});

// ── USER UI ────────────────────────────────────────────────────────────
function setupUserUI() {
    document.getElementById('sidebarUsername').textContent = currentUser.username;
    document.getElementById('userAvatarImg').src = avatarUrl(currentUser.avatar_seed || currentUser.username, currentUser.avatar_url);

    const roleLabels = { dj: '🎧 VJ', mod: '🛡️ Moderator', admin: '🛡 Admin', vip: '💎 VIP', user: '👤 Member', guest: '🌍 Guest' };
    const roleEl = document.getElementById('sidebarRole');
    roleEl.textContent = roleLabels[currentUser.role] || 'Online';
    if (currentUser.role === 'dj') {
        roleEl.style.color = 'var(--accent-cyan)';
        // Show DJ stop button
        const stopBtn = document.getElementById('ytStopBtn');
        if (stopBtn) stopBtn.style.display = 'flex';
    }

    // Show TTS button for vip/dj/admin
    if (['vip', 'dj', 'admin'].includes(currentUser.role)) {
        const ttsBtn = document.getElementById('ttsToggleBtn');
        if (ttsBtn) ttsBtn.style.display = 'flex';
    }

    // Show admin link in sidebar for admin
    if (currentUser.role === 'admin') {
        const nav = document.querySelector('.sidebar-nav');
        const adminLink = document.createElement('a');
        adminLink.href = '/admin.html';
        adminLink.className = 'nav-item';
        adminLink.innerHTML = '<i class="fas fa-shield-alt"></i><span>Admin</span>';
        nav.appendChild(adminLink);
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await api('/api/logout', 'POST');
        window.location.href = '/login.html';
    });

    initProfileSettings();
}

function initProfileSettings() {
    const modal = document.getElementById('profileModal');
    const input = document.getElementById('avatarSeedInput');
    const fileInput = document.getElementById('avatarFileInput');
    const preview = document.getElementById('profilePreview');
    const openBtn = document.getElementById('profileBtn');
    const closeButtons = [
        document.getElementById('closeProfileModal'),
        document.getElementById('cancelProfileBtn')
    ];

    const setPreview = () => {
        preview.src = pendingAvatarImage || avatarUrl(input.value.trim() || currentUser.username, currentUser.avatar_url);
    };
    const openModal = () => {
        pendingAvatarImage = null;
        input.value = currentUser.avatar_seed || currentUser.username;
        fileInput.value = '';
        setPreview();
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        input.focus();
    };
    const closeModal = () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    };

    openBtn.addEventListener('click', openModal);
    closeButtons.forEach(btn => btn.addEventListener('click', closeModal));
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    input.addEventListener('input', setPreview);
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) { pendingAvatarImage = null; setPreview(); return; }
        if (!file.type.startsWith('image/')) {
            showToast('error', 'กรุณาเลือกไฟล์รูปภาพ');
            fileInput.value = '';
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            showToast('error', 'รูปโปรไฟล์ต้องไม่เกิน 2MB');
            fileInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            pendingAvatarImage = reader.result;
            preview.src = pendingAvatarImage;
        };
        reader.readAsDataURL(file);
    });
    document.getElementById('randomAvatarBtn').addEventListener('click', () => {
        pendingAvatarImage = null;
        fileInput.value = '';
        input.value = `${currentUser.username}-${Math.random().toString(36).slice(2, 8)}`;
        setPreview();
    });
    document.getElementById('saveProfileBtn').addEventListener('click', saveProfileSettings);
}

async function saveProfileSettings() {
    const input = document.getElementById('avatarSeedInput');
    const avatarSeed = input.value.trim();
    const data = await api('/api/me', 'PATCH', { avatar_seed: avatarSeed, avatar_image: pendingAvatarImage });
    if (data.error) { showToast('error', data.error); return; }

    currentUser.avatar_seed = data.avatar_seed;
    currentUser.avatar_url = data.avatar_url;
    pendingAvatarImage = null;
    document.getElementById('userAvatarImg').src = avatarUrl(currentUser.avatar_seed, currentUser.avatar_url);
    document.getElementById('profileModal').classList.remove('active');
    showToast('success', 'บันทึกโปรไฟล์แล้ว');
    await fetchOnlineUsers();
}

// ── TTS ────────────────────────────────────────────────────────────────
function initTTS() {
    const btn = document.getElementById('ttsToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        ttsEnabled = !ttsEnabled;
        btn.classList.toggle('active', ttsEnabled);
        btn.title = ttsEnabled ? 'TTS เปิดอยู่ — คลิกปิด' : 'คลิกเปิด TTS';
        showToast(ttsEnabled ? 'success' : 'info', ttsEnabled ? '🔊 TTS เปิดแล้ว' : '🔇 TTS ปิดแล้ว');
    });
}

function speakText(text) {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'th-TH';
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
}

// ── API HELPER ─────────────────────────────────────────────────────────
async function api(url, method = 'GET', body = null) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    try {
        const res = await fetch(url, opts);
        return await res.json();
    } catch { return {}; }
}

// ── PARTICLES ──────────────────────────────────────────────────────────
function initParticles() {
    const container = document.getElementById('particles');
    for (let i = 0; i < 25; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const colors = ['rgba(255,123,107,.4)', 'rgba(255,179,71,.3)', 'rgba(255,100,80,.3)'];
        p.style.cssText = `
            left:${Math.random()*100}%;
            animation-duration:${8+Math.random()*15}s;
            animation-delay:${Math.random()*10}s;
            width:${1+Math.random()*3}px;height:${1+Math.random()*3}px;
            background:${colors[Math.floor(Math.random()*3)]};`;
        container.appendChild(p);
    }
}


// ── IDLE PLAYER (when no YouTube) ──────────────────────────────────────
function initFakePlayer() {
    setIdleUI(); // แสดง waiting state แทน fake tracks
}

function updateFakeTrackDisplay() {
    setIdleUI();
}

function setIdleUI() {
    document.getElementById('trackTitle').textContent = 'VJ ไม่อยู่ในขณะนี้';
    document.getElementById('trackArtist').textContent = 'รอ VJ เปิดเพลงสักครู่...';
    document.getElementById('totalTime').textContent = '0:00';
    document.getElementById('currentTime').textContent = '0:00';
    document.getElementById('nowPlayingBadge').style.display = 'none';
    document.getElementById('waitingBadge').style.display = 'inline-flex';
    updateProgressBar(0);
    const djOnAir = document.getElementById('djOnAir');
    if (djOnAir) djOnAir.style.display = 'none';
}

function setNowPlayingUI(title, artist) {
    document.getElementById('trackTitle').textContent = title;
    document.getElementById('trackArtist').textContent = artist;
    document.getElementById('nowPlayingBadge').style.display = 'inline-flex';
    document.getElementById('waitingBadge').style.display = 'none';
}

// ── YOUTUBE PLAYER CONTROL ─────────────────────────────────────────────

function showAudioUnlock(videoId, startSeconds) {
    pendingYtPlayback = { videoId, startSeconds };
    const visual = document.querySelector('.player-visual');
    if (!visual || visual.querySelector('.yt-audio-unlock')) return;

    const overlay = document.createElement('button');
    overlay.type = 'button';
    overlay.className = 'yt-audio-unlock';
    overlay.innerHTML = '<i class="fas fa-volume-up"></i><span>กดเพื่อฟังเพลง</span>';
    overlay.addEventListener('click', () => {
        const pending = pendingYtPlayback || { videoId, startSeconds };
        pendingYtPlayback = null;
        overlay.remove();
        createYTPlayer(pending.videoId, pending.startSeconds, { fromGesture: true });
    });
    visual.appendChild(overlay);
}

function hideAudioUnlock() {
    pendingYtPlayback = null;
    const overlay = document.querySelector('.yt-audio-unlock');
    if (overlay) overlay.remove();
}

async function createYTPlayer(videoId, startSeconds, options = {}) {
    stopProgressUpdate();
    // ทำลาย player เก่า
    if (ytPlayer) {
        try { ytPlayer.destroy(); } catch(e) {}
        ytPlayer = null;
        ytPlayerReady = false;
    }
    // restore target div (player.destroy() ลบ iframe ออก)
    const wrapper = document.querySelector('.yt-frame-wrapper');
    wrapper.innerHTML = '<div id="youtube-player"></div>';

    if (!ytApiReady) await waitForYouTubeApi();
    if (!ytApiReady) {
        showAudioUnlock(videoId, startSeconds);
        showToast('error', 'YouTube API ยังโหลดไม่เสร็จ ลองใหม่อีกครั้ง');
        return;
    }

    // new YT.Player ถูกเรียกภายใน user-gesture context → autoplay ผ่าน
    ytPlayer = new YT.Player('youtube-player', {
        videoId,
        playerVars: {
            autoplay: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            start: Math.floor(startSeconds || 0)
        },
        events: {
            onReady: (e) => {
                ytPlayerReady = true;
                ytPlayer = e.target;
                const iframe = ytPlayer.getIframe();
                if (iframe) {
                    iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:10px;display:block;';
                    iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
                }
                ytPlayer.setVolume(volume);
                if (options.fromGesture) {
                    try { ytPlayer.unMute(); } catch(e) {}
                    try { ytPlayer.playVideo(); } catch(e) {}
                }
                startProgressUpdate();
                setTimeout(() => {
                    if (!ytPlayerReady || !ytPlayer || currentYtId !== videoId) return;
                    try {
                        const state = ytPlayer.getPlayerState();
                        if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
                            showAudioUnlock(videoId, ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : startSeconds);
                        }
                    } catch(e) {}
                }, 1500);
            },
            onStateChange: (e) => {
                if (e.data === YT.PlayerState.PLAYING) { hideAudioUnlock(); setPlayingUI(true); }
                if (e.data === YT.PlayerState.PAUSED) setPlayingUI(false);
            },
            onAutoplayBlocked: () => {
                setPlayingUI(false);
                showAudioUnlock(videoId, startSeconds);
            }
        }
    });
}

function startProgressUpdate() {
    stopProgressUpdate();
    ytProgressInterval = setInterval(() => {
        if (!ytPlayerReady || !ytPlayer) return;
        try {
            const cur = ytPlayer.getCurrentTime() || 0;
            const dur = ytPlayer.getDuration() || 0;
            document.getElementById('currentTime').textContent = formatTime(cur);
            if (dur > 0) {
                document.getElementById('totalTime').textContent = formatTime(dur);
                updateProgressBar((cur / dur) * 100);
            }
        } catch(e) {}
    }, 500);
}

function stopProgressUpdate() {
    if (ytProgressInterval) { clearInterval(ytProgressInterval); ytProgressInterval = null; }
}

function showYouTubePlayer() {
    document.getElementById('ytEmbedArea').classList.add('active');
}

function showVinyl() {
    document.getElementById('ytEmbedArea').classList.remove('active');
    stopProgressUpdate();
    if (ytPlayer) {
        try { ytPlayer.destroy(); } catch(e) {}
        ytPlayer = null;
    }
    ytPlayerReady = false;
    const wrapper = document.querySelector('.yt-frame-wrapper');
    if (wrapper) wrapper.innerHTML = '<div id="youtube-player"></div>';
    currentYtId = null;
    const djOnAir = document.getElementById('djOnAir');
    if (djOnAir) djOnAir.style.display = 'none';
}

function setPlayingUI(playing) {
    isPlaying = playing;
    document.getElementById('playBtn').innerHTML = `<i class="fas fa-${playing ? 'pause' : 'play'}"></i>`;
}

// ── NOW PLAYING SYNC (สำหรับ listener) ────────────────────────────────
async function pollNowPlaying() {
    if (syncInProgress) return;
    syncInProgress = true;
    try {
        const data = await api('/api/now-playing');
        if (!data || data.error) return;

        if (!data.youtube_id) {
            if (currentYtId) { showVinyl(); updateFakeTrackDisplay(); }
            return;
        }

        // เพลงใหม่ detect
        if (data.youtube_id !== currentYtId) {
            currentYtId = data.youtube_id;
            showYouTubePlayer();
            setNowPlayingUI(data.title || 'Unknown', data.artist || '');

            // Listener: สร้าง player เริ่มที่ elapsed position
            if (currentUser?.role !== 'dj') {
                createYTPlayer(data.youtube_id, data.elapsed_seconds || 0);
            }
            setPlayingUI(!!data.is_playing);
            await loadQueue();

            // Update DJ on-air display
            if (data.dj_username) {
                const djOnAir = document.getElementById('djOnAir');
                const djAvatar = document.getElementById('djOnAirAvatar');
                const djName = document.getElementById('djOnAirName');
                if (djOnAir && djAvatar && djName) {
                    djAvatar.src = avatarUrl(data.dj_avatar_seed || data.dj_username, data.dj_avatar_url);
                    djName.textContent = data.dj_username;
                    djOnAir.style.display = 'flex';
                }
            }
        }

        // update progress จาก elapsed
        if (data.elapsed_seconds) {
            document.getElementById('currentTime').textContent = formatTime(data.elapsed_seconds);
        }
    } finally {
        syncInProgress = false;
    }
}

// ── DJ CONTROLS ────────────────────────────────────────────────────────
// อ่าน data-* จากปุ่ม แล้ว inject iframe ทันที (sync = autoplay ผ่าน)
function djPlayFromBtn(btn) {
    const youtubeId = btn.dataset.ytid;
    const title     = btn.dataset.title;
    const artist    = btn.dataset.artist;

    // ทำ synchronous ทั้งหมดก่อน (ยังอยู่ใน user gesture context)
    currentYtId = youtubeId;
    showYouTubePlayer();
    createYTPlayer(youtubeId, 0); // เรียกใน gesture → autoplay ผ่าน
    setNowPlayingUI(title, artist);
    setPlayingUI(true);

    // async ทีหลัง (บันทึก DB + refresh queue)
    djPlayFromQueue(btn.dataset.qid, youtubeId, title, artist, btn.dataset.thumb, btn.dataset.url);
}

async function djPlayFromQueue(queueId, youtubeId, title, artist, thumbnail, youtubeUrl) {
    const data = await api('/api/now-playing', 'POST', {
        queue_id: queueId, youtube_id: youtubeId,
        title, artist, thumbnail, youtube_url: youtubeUrl
    });
    if (data.error) { showToast('error', data.error); return; }
    showToast('success', `▶️ กำลังเล่น: ${title}`);
    await loadQueue();
}

async function djStopPlaying() {
    await api('/api/now-playing', 'DELETE');
    showVinyl();
    updateFakeTrackDisplay();
    await loadQueue();
    showToast('info', '⏹️ หยุดเล่นแล้ว');
}

// ── PLAYER CONTROLS ────────────────────────────────────────────────────
function togglePlay() {
    if (currentYtId && !ytPlayerReady) {
        const startSeconds = pendingYtPlayback?.startSeconds || 0;
        createYTPlayer(currentYtId, startSeconds, { fromGesture: true });
        return;
    }
    if (currentYtId && ytPlayerReady) {
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            ytPlayer.pauseVideo();
        } else {
            hideAudioUnlock();
            try { ytPlayer.unMute(); } catch(e) {}
            ytPlayer.playVideo();
        }
    } else if (!currentYtId) {
        isPlaying = !isPlaying;
        setPlayingUI(isPlaying);
    }
}

function nextTrack() {
    if (currentYtId) return; // YouTube: DJ controls next via queue
    currentTrack = (currentTrack + 1) % fakeTracks.length;
    progress = 0;
    updateFakeTrackDisplay();
}

function prevTrack() {
    if (currentYtId) return;
    currentTrack = (currentTrack - 1 + fakeTracks.length) % fakeTracks.length;
    progress = 0;
    updateFakeTrackDisplay();
}

function setVolume(v) {
    volume = Math.max(0, Math.min(100, v));
    document.getElementById('volumeFill').style.width = volume + '%';
    document.getElementById('volumeValue').textContent = Math.round(volume);
    updateVolumeIcon();
    if (ytPlayerReady && ytPlayer.setVolume) ytPlayer.setVolume(volume);
}

function updateVolumeIcon() {
    const icon = document.getElementById('volumeIcon');
    icon.className = volume === 0 ? 'fas fa-volume-mute' : volume < 50 ? 'fas fa-volume-down' : 'fas fa-volume-up';
}

function updateProgressBar(pct) {
    document.getElementById('progressFill').style.width = pct + '%';
}

// ── EVENTS ─────────────────────────────────────────────────────────────
function initEventListeners() {
    document.getElementById('playBtn').addEventListener('click', togglePlay);
    document.getElementById('nextBtn').addEventListener('click', nextTrack);
    document.getElementById('prevBtn').addEventListener('click', prevTrack);
    document.getElementById('shuffleBtn').addEventListener('click', function() {
        this.classList.toggle('active');
        showToast('info', this.classList.contains('active') ? 'Shuffle เปิด' : 'Shuffle ปิด');
    });
    document.getElementById('repeatBtn').addEventListener('click', function() { this.classList.toggle('active'); });

    // Progress bar click (only for fake player / DJ seek)
    document.getElementById('progressBar').addEventListener('click', e => {
        if (currentYtId) {
            if (currentUser?.role !== 'dj' || !ytPlayerReady) return;
            const r = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - r.left) / r.width;
            const dur = ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
            if (dur > 0) ytPlayer.seekTo(dur * pct, true);
        } else {
            const r = e.currentTarget.getBoundingClientRect();
            progress = ((e.clientX - r.left) / r.width) * 100;
            updateProgressBar(progress);
        }
    });

    // Volume
    document.getElementById('volumeSlider').addEventListener('click', e => {
        const r = e.currentTarget.getBoundingClientRect();
        setVolume(((e.clientX - r.left) / r.width) * 100);
    });
    document.getElementById('volumeIcon').addEventListener('click', () => {
        setVolume(volume > 0 ? 0 : 75);
    });

    // DJ stop button
    const stopBtn = document.getElementById('ytStopBtn');
    if (stopBtn) stopBtn.addEventListener('click', djStopPlaying);

    const adModal = document.getElementById('adModal');
    const closeAdBtn = document.getElementById('closeAdModal');
    if (closeAdBtn) closeAdBtn.addEventListener('click', closeAdModal);
    if (adModal) adModal.addEventListener('click', e => { if (e.target === adModal) closeAdModal(); });

    // DM
    const dmBtn = document.getElementById('dmBtn');
    const dmModal = document.getElementById('dmModal');
    const closeDmModal = document.getElementById('closeDmModal');
    if (dmBtn) dmBtn.addEventListener('click', openDmModal);
    if (closeDmModal) closeDmModal.addEventListener('click', closeDmModalFn);
    if (dmModal) dmModal.addEventListener('click', e => { if (e.target === dmModal) closeDmModalFn(); });
    document.getElementById('dmSendBtn')?.addEventListener('click', sendDm);
    document.getElementById('dmInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendDm(); });
    document.getElementById('dmUserSearch')?.addEventListener('input', e => filterDmUsers(e.target.value));

    // Chat toggle
    const toggleChatBtn = document.getElementById('toggleChat');
    const closeChatBtn = document.getElementById('closeChatBtn');
    if (toggleChatBtn) {
        toggleChatBtn.addEventListener('click', () => {
            const panel = document.getElementById('chatPanel');
            if (!panel || !panel.classList.contains('chat-col')) return;
            panel.classList.toggle('hidden');
            panel.classList.toggle('visible');
        });
    }
    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            const panel = document.getElementById('chatPanel');
            if (!panel || !panel.classList.contains('chat-col')) return;
            panel.classList.add('hidden');
            panel.classList.remove('visible');
        });
    }

    // Emoji picker
    document.getElementById('emojiBtn').addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('emojiPicker').classList.toggle('active');
    });
    document.addEventListener('click', () => {
        document.getElementById('emojiPicker').classList.remove('active');
        document.getElementById('searchResults').classList.remove('active');
    });

    // Chat send
    document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
    document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

    // Song search
    document.getElementById('songSearch').addEventListener('input', handleSongSearch);
    document.getElementById('sendRequestBtn').addEventListener('click', submitSongRequest);
    document.getElementById('songSearch').addEventListener('keydown', e => { if (e.key === 'Enter') submitSongRequest(); });

    // YouTube fetch
    document.getElementById('ytFetchBtn').addEventListener('click', fetchYoutube);
    document.getElementById('ytUrl').addEventListener('keydown', e => { if (e.key === 'Enter') fetchYoutube(); });
    document.getElementById('ytSubmitBtn').addEventListener('click', submitSongRequest);
    document.getElementById('ytClear').addEventListener('click', clearYoutube);

    // Mobile sidebar
    document.getElementById('mobileMenuBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('active');
    });

    document.querySelectorAll('.channel-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

// ── YOUTUBE FETCH ──────────────────────────────────────────────────────
function extractYouTubeId(url) {
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
}

async function fetchYoutube() {
    const url = document.getElementById('ytUrl').value.trim();
    if (!url) return;
    const videoId = extractYouTubeId(url);
    if (!videoId) { showToast('error', 'ลิงก์ YouTube ไม่ถูกต้อง'); return; }

    const btn = document.getElementById('ytFetchBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังดึง...';
    btn.disabled = true;

    try {
        const oEmbed = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        ).then(r => r.json());

        ytData = {
            title: oEmbed.title,
            artist: oEmbed.author_name,
            youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
            youtube_id: videoId,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
        };

        document.getElementById('ytThumb').src = ytData.thumbnail;
        document.getElementById('ytTitle').textContent = ytData.title;
        document.getElementById('ytLink').href = ytData.youtube_url;
        document.getElementById('ytPreview').style.display = 'flex';
        document.getElementById('ytUrl').value = '';
        showToast('success', 'ดึงข้อมูลสำเร็จ!');
    } catch {
        showToast('error', 'ไม่สามารถดึงข้อมูลได้ ลองใหม่อีกครั้ง');
    } finally {
        btn.innerHTML = '<i class="fas fa-search"></i> ดึงข้อมูล';
        btn.disabled = false;
    }
}

function clearYoutube() {
    ytData = null;
    document.getElementById('ytPreview').style.display = 'none';
    document.getElementById('ytUrl').value = '';
}

// ── SONG SEARCH ────────────────────────────────────────────────────────
const songDatabase = [
    { title: 'Blinding Lights', artist: 'The Weeknd' },
    { title: 'Levitating', artist: 'Dua Lipa' },
    { title: 'As It Was', artist: 'Harry Styles' },
    { title: 'Stay', artist: 'The Kid LAROI, Justin Bieber' },
    { title: 'Heat Waves', artist: 'Glass Animals' },
    { title: 'Bad Guy', artist: 'Billie Eilish' },
    { title: 'Save Your Tears', artist: 'The Weeknd' },
    { title: 'Good 4 U', artist: 'Olivia Rodrigo' },
    { title: 'Butter', artist: 'BTS' },
    { title: 'Dynamite', artist: 'BTS' },
    { title: 'Easy On Me', artist: 'Adele' },
    { title: 'Positions', artist: 'Ariana Grande' },
    { title: 'Industry Baby', artist: 'Lil Nas X' },
    { title: 'Shivers', artist: 'Ed Sheeran' },
];

function handleSongSearch() {
    const q = document.getElementById('songSearch').value.trim().toLowerCase();
    const results = document.getElementById('searchResults');
    if (q.length < 2) { results.classList.remove('active'); return; }
    const matched = songDatabase.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)).slice(0, 5);
    if (!matched.length) { results.classList.remove('active'); return; }
    results.innerHTML = matched.map(s => `
        <div class="search-result-item" onclick="selectSong(${JSON.stringify(s.title)}, ${JSON.stringify(s.artist)})">
            <div class="result-icon"><i class="fas fa-music"></i></div>
            <div class="result-info">
                <span class="result-title">${escHtml(s.title)}</span>
                <span class="result-artist">${escHtml(s.artist)}</span>
            </div>
        </div>`).join('');
    results.classList.add('active');
}

function selectSong(title, artist) {
    document.getElementById('songSearch').value = `${title} – ${artist}`;
    document.getElementById('searchResults').classList.remove('active');
}

async function submitSongRequest() {
    if (queueIsFull) {
        showToast('warning', 'คิวเพลงเต็มแล้ว จำกัดสูงสุด 20 เพลง');
        return;
    }
    const payload = ytData || (() => {
        const raw = document.getElementById('songSearch').value.trim();
        if (!raw) return null;
        const parts = raw.split(/\s*[-–]\s*/);
        return { title: parts[0], artist: parts[1] || '' };
    })();
    if (!payload) return;

    const data = await api('/api/queue', 'POST', payload);
    if (data.error) { showToast('error', data.error); return; }
    showToast('success', `ขอเพลง "${payload.title}" สำเร็จ! 🎵`);
    document.getElementById('songSearch').value = '';
    clearYoutube();
    await loadQueue();
}

// ── QUEUE ──────────────────────────────────────────────────────────────
async function loadQueue() {
    const queue = await api('/api/queue');
    renderQueue(Array.isArray(queue) ? queue : []);
}

function renderQueue(queue) {
    const list = document.getElementById('queueList');
    document.getElementById('queueBadge').textContent = queue.length;
    document.getElementById('queueCountLabel').textContent = `${queue.length}/20 เพลง`;
    const queueFull = queue.length >= 20;
    queueIsFull = queueFull;
    ['sendRequestBtn', 'ytSubmitBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = queueFull;
        btn.title = queueFull ? 'คิวเพลงเต็มแล้ว' : '';
    });

    if (!queue.length) {
        list.innerHTML = `<div class="queue-empty"><i class="fas fa-music"></i><span>ยังไม่มีเพลงในคิว — ขอเพลงได้เลย!</span></div>`;
        return;
    }

    const isDJ = currentUser?.role === 'dj';

    list.innerHTML = queue.map((item, i) => {
        const isYT = !!item.youtube_id;
        const isNowPlaying = item.status === 'playing';

        const thumb = isYT
            ? `<img class="queue-thumb" src="${escHtml(item.thumbnail)}" alt="">`
            : '';

        const ytLink = isYT
            ? `<a class="queue-yt-link" href="${escHtml(item.youtube_url)}" target="_blank" rel="noopener"><i class="fab fa-youtube"></i> YouTube</a>`
            : '';

        const nowPlayingTag = isNowPlaying
            ? `<span style="font-size:10px;color:#ef4444;font-weight:700;display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:6px;height:6px;background:#ef4444;border-radius:50%;animation:pulse 1.5s infinite"></span>กำลังเล่น</span>`
            : '';

        // DJ buttons — ใช้ data-* เพื่อหลีกเลี่ยง quote escaping ใน onclick
        let djBtns = '';
        if (isDJ) {
            if (isYT && !isNowPlaying) {
                djBtns = `<div class="queue-dj-actions">
                    <button class="dj-action-btn dj-play-btn" title="เล่นเพลงนี้เลย"
                        data-qid="${item.id}"
                        data-ytid="${escHtml(item.youtube_id)}"
                        data-title="${escHtml(item.title)}"
                        data-artist="${escHtml(item.artist)}"
                        data-thumb="${escHtml(item.thumbnail)}"
                        data-url="${escHtml(item.youtube_url)}"
                        onclick="djPlayFromBtn(this)">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="dj-action-btn dj-skip-btn" title="ข้าม" onclick="djSetStatus(${item.id},'skipped')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`;
            } else if (isNowPlaying) {
                djBtns = `<div class="queue-dj-actions">
                    <button class="dj-action-btn dj-skip-btn" title="ข้ามเพลงนี้" onclick="djStopPlaying()">
                        <i class="fas fa-forward"></i>
                    </button>
                </div>`;
            } else {
                djBtns = `<div class="queue-dj-actions">
                    <button class="dj-action-btn dj-skip-btn" title="ข้าม" onclick="djSetStatus(${item.id},'skipped')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`;
            }
        }

        return `
        <div class="queue-item ${isNowPlaying ? 'now-playing' : ''}" id="qi-${item.id}">
            <span class="queue-pos">${isNowPlaying ? '<i class="fas fa-volume-up" style="font-size:10px"></i>' : i+1}</span>
            ${thumb}
            <div class="queue-info">
                <span class="queue-title">${escHtml(item.title)}</span>
                <span class="queue-artist">${escHtml(item.artist)}</span>
                ${ytLink}
                ${nowPlayingTag}
            </div>
            <div class="queue-requester">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(item.requested_by)}" alt="">
                <span>@${escHtml(item.requested_by)}</span>
            </div>
            <div class="queue-votes">
                <button class="vote-btn ${item.userVoted ? 'upvoted' : ''}" onclick="voteQueue(${item.id}, this)">
                    <i class="fas fa-chevron-up"></i>
                </button>
                <span class="vote-count" id="vc-${item.id}">${item.votes}</span>
            </div>
            ${djBtns}
        </div>`;
    }).join('');
}

async function voteQueue(id, btn) {
    const data = await api(`/api/queue/${id}/vote`, 'POST');
    if (data.error) { showToast('error', data.error); return; }
    btn.classList.toggle('upvoted', data.voted);
    document.getElementById(`vc-${id}`).textContent = data.votes;
    await loadQueue();
}

async function djSetStatus(id, status) {
    const data = await api(`/api/queue/${id}`, 'PATCH', { status });
    if (data.error) { showToast('error', data.error); return; }
    showToast('success', status === 'played' ? '✅ เล่นเพลงแล้ว' : '⏭️ ข้ามเพลงแล้ว');
    await loadQueue();
}

// ── CHAT ───────────────────────────────────────────────────────────────
async function loadMessages() {
    const messages = await api(`/api/messages?after=0`);
    if (!Array.isArray(messages)) return;
    document.getElementById('chatMessages').innerHTML = '';
    messages.forEach(m => renderMessage(m, false));
    if (messages.length) lastMessageId = messages[messages.length - 1].id;
    scrollChat();
}

async function pollMessages() {
    const messages = await api(`/api/messages?after=${lastMessageId}`);
    if (!Array.isArray(messages) || !messages.length) return;
    messages.forEach(m => renderMessage(m, true));
    lastMessageId = messages[messages.length - 1].id;
    const c = document.getElementById('chatMessages');
    while (c.children.length > 150) c.removeChild(c.firstChild);
}

function renderMessage(m, animate) {
    const container = document.getElementById('chatMessages');
    if (m.role === 'system') {
        const el = document.createElement('div');
        el.className = 'system-msg';
        el.innerHTML = `<i class="fas fa-info-circle"></i> ${escHtml(m.message)}`;
        if (!animate) el.style.animation = 'none';
        container.appendChild(el);
        scrollChat(); return;
    }
    const el = document.createElement('div');
    el.className = `chat-msg role-${m.role || 'user'}`;
    if (!animate) el.style.animation = 'none';
    const now = new Date(m.created_at || Date.now());
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    const badgeMap = { dj: 'badge-dj 🎧 VJ', mod: 'badge-mod MOD', vip: 'badge-vip 💎 VIP', admin: 'badge-admin 🛡 Admin', guest: 'badge-guest 🌍 Guest' };
    const bClass = badgeMap[m.role] || '';
    const badgeHTML = bClass ? `<span class="chat-msg-badge ${bClass.split(' ')[0]}">${bClass.split(' ')[1]}</span>` : '';
    el.innerHTML = `
        <div class="chat-msg-header">
            <img class="chat-msg-avatar" src="${avatarUrl(m.avatar_seed || m.username, m.avatar_url)}" alt="">
            <span class="chat-msg-name ${m.role}">${escHtml(m.username)}</span>
            ${badgeHTML}
            <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-msg-text">${escHtml(m.message)}</div>`;
    container.appendChild(el);
    scrollChat();

    // TTS for vip/dj/admin messages
    if (['vip', 'dj', 'admin'].includes(m.role)) {
        speakText(`${m.username} พูดว่า: ${m.message}`);
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    document.getElementById('emojiPicker').classList.remove('active');
    const data = await api('/api/messages', 'POST', { message: text });
    if (data.error) showToast('error', data.error);
    else await pollMessages();
}

function scrollChat() {
    const c = document.getElementById('chatMessages');
    c.scrollTop = c.scrollHeight;
}

function insertEmoji(emoji) {
    const input = document.getElementById('chatInput');
    input.value += emoji;
    input.focus();
}

// ── POLLING ────────────────────────────────────────────────────────────
async function pingOnline() {
    const data = await api('/api/ping', 'POST');
    if (data.online !== undefined) {
        updateOnlineCount(data.online);
        await fetchOnlineUsers();
    }
}

function updateOnlineCount(n) {
    const el = document.getElementById('viewerCountText');
    if (el) el.textContent = `${n} กำลังฟังอยู่`;
    const badge = document.getElementById('sidebarOnlineCount');
    if (badge) badge.textContent = n;
}

async function fetchOnlineUsers() {
    const data = await api('/api/online');
    if (!data || !data.users) return;
    updateOnlineCount(data.online);
    renderOnlineUsers(data.users);
}

function renderOnlineUsers(users) {
    const list = document.getElementById('onlineUsersList');
    if (!list) return;
    const roleMap = { admin: ['role-admin-badge','🛡 Admin'], dj: ['role-dj-badge','🎧 VJ'], vip: ['role-vip-badge','💎 VIP'] };
    list.innerHTML = users.map(u => {
        const [badgeClass, badgeText] = roleMap[u.role] || [];
        const badge = badgeClass ? `<span class="online-user-role-badge ${badgeClass}">${badgeText}</span>` : '';
        return `<div class="online-user-item">
            <div class="online-user-avatar-wrap">
                <img src="${avatarUrl(u.avatar_seed || u.username, u.avatar_url)}" alt="">
                <span class="online-dot"></span>
            </div>
            <span class="online-user-name">${escHtml(u.username)}</span>
            ${badge}
        </div>`;
    }).join('');
}

async function fetchAd() {
    const ad = await api('/api/ad');
    const banner = document.getElementById('adBanner');
    if (!banner) return;
    if (!ad) { banner.style.display = 'none'; return; }
    document.getElementById('adTitle').textContent = ad.title;
    document.getElementById('adBody').textContent = ad.body || '';
    const cta = document.getElementById('adCta');
    cta.textContent = ad.cta_text || 'คลิกดู';
    cta.href = ad.cta_url || '#';
    const img = document.getElementById('adImage');
    if (ad.image_url) { img.src = ad.image_url; img.style.display = 'block'; }
    else { img.style.display = 'none'; }
    banner.style.display = 'flex';
}

function openAdModal(ad) {
    const modal = document.getElementById('adModal');
    const image = document.getElementById('adModalImage');
    document.getElementById('adModalTitle').textContent = ad.title || '';
    document.getElementById('adModalBody').textContent = ad.body || '';
    const cta = document.getElementById('adModalCta');
    cta.textContent = ad.cta_text || 'เปิดดูร้านค้า';
    cta.href = ad.cta_url || '#';
    if (ad.image_url) {
        image.src = ad.image_url;
        image.style.display = 'block';
    } else {
        image.style.display = 'none';
    }
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function closeAdModal() {
    const modal = document.getElementById('adModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

const AD_MOCK_SLOTS = [
    { icon: 'fa-bullhorn',   color: '#FF7B6B', label: 'ช่องโฆษณา 1' },
    { icon: 'fa-star',       color: '#FFB347', label: 'ช่องโฆษณา 2' },
    { icon: 'fa-tag',        color: '#a855f7', label: 'ช่องโฆษณา 3' },
    { icon: 'fa-store',      color: '#0891b2', label: 'ช่องโฆษณา 4' },
];

function mockAdSlot(index) {
    const m = AD_MOCK_SLOTS[index] || AD_MOCK_SLOTS[0];
    return `
        <div class="ad-slot ad-slot-mock">
            <div class="ad-slot-mock-icon" style="--mock-color:${m.color}">
                <i class="fas ${m.icon}"></i>
            </div>
            <div class="ad-slot-copy">
                <strong>${m.label}</strong>
                <span>สนใจลงโฆษณา?<br>ติดต่อ <b>VJ</b> เลย!</span>
                <span class="ad-mock-cta">📩 ติดต่อ VJ</span>
            </div>
        </div>`;
}

function renderAds(ads) {
    const section = document.getElementById('adsSection');
    const grid = document.getElementById('adsGrid');
    if (!section || !grid) return;
    section.style.display = 'block';

    if (!Array.isArray(ads) || !ads.length) {
        grid.innerHTML = AD_MOCK_SLOTS.map((_, i) => mockAdSlot(i)).join('');
        return;
    }

    const filled = [...ads];
    while (filled.length < 4) filled.push(null);
    grid.innerHTML = filled.map((ad, index) => {
        if (!ad) return mockAdSlot(index);
        return `
            <button class="ad-slot" type="button" data-ad-id="${ad.id}">
                <span class="ad-slot-badge">AD</span>
                ${ad.image_url ? `<img class="ad-slot-image" src="${escHtml(ad.image_url)}" alt="">` : '<div class="ad-slot-image ad-slot-image-placeholder"><i class="fas fa-store"></i></div>'}
                <div class="ad-slot-copy">
                    <strong>${escHtml(ad.title)}</strong>
                    <span>${escHtml(ad.body || 'คลิกเพื่อดูรายละเอียดร้านค้า')}</span>
                </div>
            </button>`;
    }).join('');
    grid.querySelectorAll('[data-ad-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const ad = ads.find(item => String(item.id) === btn.dataset.adId);
            if (ad) openAdModal(ad);
        });
    });
}

async function fetchAds() {
    const ads = await api('/api/ads');
    renderAds(Array.isArray(ads) ? ads : []);
}

function startPolling() {
    pingOnline();
    fetchAds();
    setInterval(pingOnline,      30000);
    setInterval(fetchAds,        60000);
    setInterval(pollMessages,    2000);
    setInterval(pollNowPlaying,  3000);
    setInterval(loadQueue,       8000);
}

// ── REACTIONS ──────────────────────────────────────────────────────────
function sendReaction(emoji) {
    const container = document.getElementById('floatingReactions');
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    el.style.left = (Math.random() * 60 - 30) + 'px';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
    const btn = document.querySelector(`.reaction-btn[data-emoji="${emoji}"] .reaction-count`);
    if (btn) btn.textContent = parseInt(btn.textContent) + 1;
}

// ── TOAST ──────────────────────────────────────────────────────────────
function showToast(type, msg) {
    const icons = { success: 'fa-check-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle', error: 'fa-times-circle' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${escHtml(msg)}</span>`;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ── UTIL ───────────────────────────────────────────────────────────────
function formatTime(sec) {
    const s = Math.floor(sec);
    return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── DM ─────────────────────────────────────────────────────────────────
let dmCurrentUser = null;
let dmAllUsers = [];

async function openDmModal() {
    const modal = document.getElementById('dmModal');
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    await loadDmUsers();
}

function closeDmModalFn() {
    const modal = document.getElementById('dmModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    dmCurrentUser = null;
}

async function loadDmUsers() {
    const users = await api('/api/users/online');
    dmAllUsers = Array.isArray(users) ? users.filter(u => u.username !== currentUser?.username) : [];
    renderDmUserList(dmAllUsers);
}

function renderDmUserList(users) {
    const list = document.getElementById('dmUserList');
    if (!list) return;
    if (!users.length) {
        list.innerHTML = '<div style="padding:16px;text-align:center;font-size:12px;color:var(--text-muted)">ไม่มีผู้ใช้ออนไลน์</div>';
        return;
    }
    list.innerHTML = users.map(u => `
        <div class="dm-user-item ${dmCurrentUser === u.username ? 'active' : ''}" onclick="selectDmUser('${escHtml(u.username)}','${escHtml(u.avatar||'')}')">
            <img src="${escHtml(u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`)}" alt="">
            <div class="dm-user-item-info">
                <div class="dm-user-item-name">${escHtml(u.username)}</div>
                <div class="dm-user-item-preview">${escHtml(u.role || 'Member')}</div>
            </div>
        </div>
    `).join('');
}

async function selectDmUser(username, avatar) {
    dmCurrentUser = username;
    renderDmUserList(dmAllUsers);
    document.getElementById('dmChatWith').textContent = username;
    document.getElementById('dmInputArea').style.display = 'flex';
    await loadDmMessages();
}

async function loadDmMessages() {
    if (!dmCurrentUser) return;
    const msgs = await api(`/api/dm/${encodeURIComponent(dmCurrentUser)}`);
    const box = document.getElementById('dmMessages');
    if (!box) return;
    if (!Array.isArray(msgs) || !msgs.length) {
        box.innerHTML = '<div class="dm-empty"><i class="fas fa-comments"></i><p>ยังไม่มีข้อความ</p></div>';
        return;
    }
    box.innerHTML = msgs.map(m => {
        const mine = m.from_user === currentUser?.username;
        const av = `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.from_user}`;
        const time = new Date(m.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        return `<div class="dm-msg ${mine ? 'mine' : ''}">
            <img class="dm-msg-avatar" src="${av}" alt="">
            <div>
                <div class="dm-msg-bubble">${escHtml(m.message)}</div>
                <div class="dm-msg-time">${time}</div>
            </div>
        </div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function sendDm() {
    const input = document.getElementById('dmInput');
    const msg = input?.value.trim();
    if (!msg || !dmCurrentUser) return;
    input.value = '';
    await api('/api/dm/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: dmCurrentUser, message: msg }) });
    await loadDmMessages();
}

function filterDmUsers(query) {
    const filtered = query ? dmAllUsers.filter(u => u.username.toLowerCase().includes(query.toLowerCase())) : dmAllUsers;
    renderDmUserList(filtered);
}
