// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initEqualizer();
    initChat();
    initPlayer();
    initEventListeners();
    simulateLiveChat();
});

// ========== PARTICLES ==========
function initParticles() {
    const container = document.getElementById('particles');
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDuration = (8 + Math.random() * 15) + 's';
        particle.style.animationDelay = Math.random() * 10 + 's';
        particle.style.width = (1 + Math.random() * 3) + 'px';
        particle.style.height = particle.style.width;
        const colors = [
            'rgba(124, 58, 237, 0.4)',
            'rgba(236, 72, 153, 0.3)',
            'rgba(6, 182, 212, 0.3)'
        ];
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        container.appendChild(particle);
    }
}

// ========== EQUALIZER ==========
function initEqualizer() {
    const eq = document.getElementById('equalizer');
    for (let i = 0; i < 20; i++) {
        const bar = document.createElement('div');
        bar.classList.add('eq-bar');
        const minH = 8 + Math.random() * 15;
        const maxH = 30 + Math.random() * 70;
        bar.style.setProperty('--min-h', minH + 'px');
        bar.style.setProperty('--max-h', maxH + 'px');
        bar.style.animationDuration = (0.3 + Math.random() * 0.6) + 's';
        bar.style.animationDelay = Math.random() * 0.5 + 's';
        eq.appendChild(bar);
    }
}

// ========== PLAYER STATE ==========
let isPlaying = true;
let progress = 60;
let volume = 75;

const tracks = [
    { title: 'Midnight Groove', artist: 'DJ VIBEZ ft. Luna', duration: '4:12' },
    { title: 'Neon Dreams', artist: 'DJ VIBEZ x Synthwave', duration: '3:45' },
    { title: 'Bass Culture', artist: 'DJ VIBEZ ft. MC Flow', duration: '5:01' },
    { title: 'Electric Sunset', artist: 'DJ VIBEZ', duration: '3:58' },
    { title: 'Deep Into The Night', artist: 'DJ VIBEZ ft. Aurora', duration: '4:33' }
];
let currentTrack = 0;

function initPlayer() {
    updateTrackDisplay();
    simulateProgress();
}

function updateTrackDisplay() {
    document.getElementById('trackTitle').textContent = tracks[currentTrack].title;
    document.getElementById('trackArtist').textContent = tracks[currentTrack].artist;
    document.getElementById('totalTime').textContent = tracks[currentTrack].duration;
}

function simulateProgress() {
    setInterval(() => {
        if (!isPlaying) return;
        progress += 0.15;
        if (progress >= 100) {
            progress = 0;
            nextTrack();
        }
        document.getElementById('progressFill').style.width = progress + '%';

        const totalParts = tracks[currentTrack].duration.split(':');
        const totalSec = parseInt(totalParts[0]) * 60 + parseInt(totalParts[1]);
        const currentSec = Math.floor(totalSec * (progress / 100));
        const mins = Math.floor(currentSec / 60);
        const secs = currentSec % 60;
        document.getElementById('currentTime').textContent =
            mins + ':' + secs.toString().padStart(2, '0');
    }, 300);
}

function togglePlay() {
    isPlaying = !isPlaying;
    const btn = document.getElementById('playBtn');
    const vinyl = document.getElementById('vinyl');
    const eqBars = document.querySelectorAll('.eq-bar');

    if (isPlaying) {
        btn.innerHTML = '<i class="fas fa-pause"></i>';
        vinyl.classList.remove('paused');
        eqBars.forEach(b => b.classList.remove('paused'));
    } else {
        btn.innerHTML = '<i class="fas fa-play"></i>';
        vinyl.classList.add('paused');
        eqBars.forEach(b => b.classList.add('paused'));
    }
}

function nextTrack() {
    currentTrack = (currentTrack + 1) % tracks.length;
    progress = 0;
    updateTrackDisplay();
    showToast('info', `กำลังเล่น: ${tracks[currentTrack].title}`);
}

function prevTrack() {
    currentTrack = (currentTrack - 1 + tracks.length) % tracks.length;
    progress = 0;
    updateTrackDisplay();
    showToast('info', `กำลังเล่น: ${tracks[currentTrack].title}`);
}

// ========== EVENT LISTENERS ==========
function initEventListeners() {
    document.getElementById('playBtn').addEventListener('click', togglePlay);
    document.getElementById('nextBtn').addEventListener('click', nextTrack);
    document.getElementById('prevBtn').addEventListener('click', prevTrack);

    document.getElementById('shuffleBtn').addEventListener('click', function() {
        this.classList.toggle('active');
        showToast('info', this.classList.contains('active') ? 'Shuffle เปิด' : 'Shuffle ปิด');
    });

    document.getElementById('repeatBtn').addEventListener('click', function() {
        this.classList.toggle('active');
        showToast('info', this.classList.contains('active') ? 'Repeat เปิด' : 'Repeat ปิด');
    });

    // Chat toggle
    const chatPanel = document.getElementById('chatPanel');
    document.getElementById('toggleChat').addEventListener('click', () => {
        chatPanel.classList.toggle('hidden');
        chatPanel.classList.toggle('visible');
    });
    document.getElementById('closeChatBtn').addEventListener('click', () => {
        chatPanel.classList.add('hidden');
        chatPanel.classList.remove('visible');
    });

    // Emoji picker
    const emojiPicker = document.getElementById('emojiPicker');
    document.getElementById('emojiBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle('active');
    });
    document.addEventListener('click', () => {
        emojiPicker.classList.remove('active');
    });

    // Chat send
    const chatInput = document.getElementById('chatInput');
    document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });

    // Song request
    const songSearch = document.getElementById('songSearch');
    songSearch.addEventListener('input', handleSongSearch);
    document.getElementById('sendRequestBtn').addEventListener('click', submitSongRequest);
    songSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitSongRequest();
    });

    // Mobile menu
    const sidebar = document.querySelector('.sidebar');
    let overlay = document.createElement('div');
    overlay.classList.add('sidebar-overlay');
    document.body.appendChild(overlay);

    document.getElementById('mobileMenuBtn').addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    });
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });

    // Nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
        });
    });

    // Channel items
    document.querySelectorAll('.channel-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active'));
            item.classList.add('active');
            const name = item.querySelector('span:not(.user-count)').textContent;
            document.querySelector('.channel-name').textContent = name;
        });
    });

    // Progress bar click
    document.querySelector('.progress-bar').addEventListener('click', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        progress = ((e.clientX - rect.left) / rect.width) * 100;
        document.getElementById('progressFill').style.width = progress + '%';
    });

    // Volume slider
    document.querySelector('.volume-slider').addEventListener('click', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        volume = ((e.clientX - rect.left) / rect.width) * 100;
        volume = Math.max(0, Math.min(100, volume));
        document.getElementById('volumeFill').style.width = volume + '%';
        updateVolumeIcon();
    });

    document.getElementById('volumeIcon').addEventListener('click', () => {
        if (volume > 0) {
            volume = 0;
        } else {
            volume = 75;
        }
        document.getElementById('volumeFill').style.width = volume + '%';
        updateVolumeIcon();
    });
}

function updateVolumeIcon() {
    const icon = document.getElementById('volumeIcon');
    if (volume === 0) {
        icon.className = 'fas fa-volume-mute';
    } else if (volume < 50) {
        icon.className = 'fas fa-volume-down';
    } else {
        icon.className = 'fas fa-volume-up';
    }
}

// ========== CHAT ==========
const chatUsers = [
    { name: 'DJ VIBEZ', role: 'dj', badge: 'DJ', avatar: 'dj1' },
    { name: 'ModKung', role: 'mod', badge: 'MOD', avatar: 'mod1' },
    { name: 'NightOwl', role: 'vip', badge: 'VIP', avatar: 'user5' },
    { name: 'MusicLover', role: '', badge: '', avatar: 'user2' },
    { name: 'BeatDropper', role: '', badge: '', avatar: 'user3' },
    { name: 'VibeChaser', role: '', badge: '', avatar: 'user4' },
    { name: 'BassBoosted', role: '', badge: '', avatar: 'user6' },
    { name: 'TechnoKid', role: '', badge: '', avatar: 'user7' },
    { name: 'PlurLife', role: '', badge: '', avatar: 'user8' },
    { name: 'DeepHouse', role: 'vip', badge: 'VIP', avatar: 'user9' },
];

const chatMessages = [
    'เพลงนี้มันส์มากกก 🔥',
    'เปิดเพลงดีย์จัง ❤️',
    'ขอเพลงหน่อยครับ',
    '💜💜💜',
    'bass หนักมาก',
    'ใครขอเพลง Blinding Lights 🙌',
    'เพิ่งเข้ามา สวัสดีครับทุกคน!',
    'DJ ปั่นสุดๆ 🎧',
    'ยังไม่นอนกัน! 🌙',
    'เพลงนี้คือใช่เลย ✨',
    'drop มาเลยพี่! ⚡',
    'ขอ remix หน่อย',
    'สุดยอดจริงๆ',
    'เที่ยงคืนแล้ว ยังฟังอยู่ 😂',
    'VIBEZ ที่สุด!!',
    'คิดถึง live เมื่อวาน',
    'วันนี้เพลงเด็ดทุกเพลงเลย',
    'เปิด EDM หน่อยครับ 🎵',
    'GG เลยพี่',
];

const djMessages = [
    'ขอบคุณทุกคนที่มาฟังนะครับ! 💜',
    'เพลงต่อไปหนักกว่านี้อีก! 🔥',
    'ใครอยากขอเพลง กดขอได้เลยนะ',
    'สาย bass เตรียมตัว...',
    'ปิด live ตี 3 นะครับ!',
    'วันนี้มีเพลงใหม่มาเปิดให้ฟัง!',
];

function initChat() {
    const container = document.getElementById('chatMessages');

    addSystemMessage('ยินดีต้อนรับสู่ Live Stream ของ DJ VIBEZ! 🎧');

    const initialMsgs = [
        { user: chatUsers[0], text: 'สวัสดีครับทุกคน! วันนี้พร้อมกันรึยัง? 🎉' },
        { user: chatUsers[3], text: 'พร้อมมมม! 🔥' },
        { user: chatUsers[2], text: 'รอมานานแล้วครับ ❤️' },
        { user: chatUsers[5], text: 'เย้ เริ่มแล้ว!' },
        { user: chatUsers[1], text: 'ทุกคนอย่าลืมกดขอเพลงนะครับ 🎵' },
        { user: chatUsers[4], text: 'bass ต้องหนักๆ นะพี่ 🙌' },
        { user: chatUsers[7], text: 'มาจากเชียงใหม่ครับ 👋' },
        { user: chatUsers[0], text: 'เพลงแรกมาแล้วนะ! Let\'s go! ⚡' },
    ];

    initialMsgs.forEach(msg => {
        addChatMessage(msg.user, msg.text, false);
    });

    scrollChat();
}

function addChatMessage(user, text, animate = true) {
    const container = document.getElementById('chatMessages');
    const msg = document.createElement('div');
    msg.classList.add('chat-msg');
    if (!animate) msg.style.animation = 'none';

    const now = new Date();
    const time = now.getHours().toString().padStart(2, '0') + ':' +
                 now.getMinutes().toString().padStart(2, '0');

    let badgeHTML = '';
    if (user.badge) {
        const badgeClass = user.role === 'dj' ? 'badge-dj' :
                          user.role === 'mod' ? 'badge-mod' : 'badge-vip';
        badgeHTML = `<span class="chat-msg-badge ${badgeClass}">${user.badge}</span>`;
    }

    msg.innerHTML = `
        <div class="chat-msg-header">
            <img class="chat-msg-avatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=${user.avatar}" alt="">
            <span class="chat-msg-name ${user.role}">${user.name}</span>
            ${badgeHTML}
            <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-msg-text">${escapeHtml(text)}</div>
    `;

    container.appendChild(msg);
    scrollChat();
}

function addSystemMessage(text) {
    const container = document.getElementById('chatMessages');
    const msg = document.createElement('div');
    msg.classList.add('system-msg');
    msg.innerHTML = `<i class="fas fa-info-circle"></i> ${text}`;
    container.appendChild(msg);
}

function scrollChat() {
    const container = document.getElementById('chatMessages');
    container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    const myUser = { name: 'DJ_Listener', role: '', badge: '', avatar: 'user1' };
    addChatMessage(myUser, text);
    input.value = '';
    document.getElementById('emojiPicker').classList.remove('active');
}

function insertEmoji(emoji) {
    const input = document.getElementById('chatInput');
    input.value += emoji;
    input.focus();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== SIMULATE LIVE CHAT ==========
function simulateLiveChat() {
    setInterval(() => {
        const userIdx = 1 + Math.floor(Math.random() * (chatUsers.length - 1));
        const user = chatUsers[userIdx];

        let text;
        if (user.role === 'dj') {
            text = djMessages[Math.floor(Math.random() * djMessages.length)];
        } else {
            text = chatMessages[Math.floor(Math.random() * chatMessages.length)];
        }

        addChatMessage(user, text);

        const container = document.getElementById('chatMessages');
        while (container.children.length > 100) {
            container.removeChild(container.firstChild);
        }
    }, 2000 + Math.random() * 4000);
}

// ========== SONG SEARCH ==========
const songDatabase = [
    { title: 'Blinding Lights', artist: 'The Weeknd' },
    { title: 'Levitating', artist: 'Dua Lipa' },
    { title: 'As It Was', artist: 'Harry Styles' },
    { title: 'Stay', artist: 'The Kid LAROI, Justin Bieber' },
    { title: 'Heat Waves', artist: 'Glass Animals' },
    { title: 'Bad Guy', artist: 'Billie Eilish' },
    { title: 'Watermelon Sugar', artist: 'Harry Styles' },
    { title: 'Save Your Tears', artist: 'The Weeknd' },
    { title: 'Peaches', artist: 'Justin Bieber' },
    { title: 'Montero', artist: 'Lil Nas X' },
    { title: 'Kiss Me More', artist: 'Doja Cat ft. SZA' },
    { title: 'Good 4 U', artist: 'Olivia Rodrigo' },
    { title: 'Industry Baby', artist: 'Lil Nas X' },
    { title: 'Butter', artist: 'BTS' },
    { title: 'Dynamite', artist: 'BTS' },
    { title: 'Shivers', artist: 'Ed Sheeran' },
    { title: 'Easy On Me', artist: 'Adele' },
    { title: 'drivers license', artist: 'Olivia Rodrigo' },
    { title: 'deja vu', artist: 'Olivia Rodrigo' },
    { title: 'Positions', artist: 'Ariana Grande' },
];

function handleSongSearch() {
    const query = document.getElementById('songSearch').value.trim().toLowerCase();
    const results = document.getElementById('searchResults');

    if (query.length < 2) {
        results.classList.remove('active');
        return;
    }

    const matched = songDatabase.filter(s =>
        s.title.toLowerCase().includes(query) ||
        s.artist.toLowerCase().includes(query)
    ).slice(0, 5);

    if (matched.length === 0) {
        results.classList.remove('active');
        return;
    }

    results.innerHTML = matched.map(s => `
        <div class="search-result-item" onclick="selectSong('${s.title}', '${s.artist}')">
            <div class="result-icon"><i class="fas fa-music"></i></div>
            <div class="result-info">
                <div class="result-title">${s.title}</div>
                <div class="result-artist">${s.artist}</div>
            </div>
        </div>
    `).join('');

    results.classList.add('active');
}

function selectSong(title, artist) {
    document.getElementById('songSearch').value = `${title} - ${artist}`;
    document.getElementById('searchResults').classList.remove('active');
}

function submitSongRequest() {
    const input = document.getElementById('songSearch');
    const value = input.value.trim();
    if (!value) return;

    const queueList = document.getElementById('queueList');
    const count = queueList.children.length + 1;

    let title = value;
    let artist = 'Unknown';
    if (value.includes(' - ')) {
        const parts = value.split(' - ');
        title = parts[0];
        artist = parts[1];
    }

    const item = document.createElement('div');
    item.classList.add('queue-item');
    item.setAttribute('data-votes', '0');
    item.innerHTML = `
        <span class="queue-pos">${count}</span>
        <div class="queue-info">
            <span class="queue-title">${escapeHtml(title)}</span>
            <span class="queue-artist">${escapeHtml(artist)}</span>
        </div>
        <div class="queue-requester">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=user1" alt="">
            <span>@DJ_Listener</span>
        </div>
        <div class="queue-votes">
            <button class="vote-btn" onclick="voteQueue(this, 1)">
                <i class="fas fa-chevron-up"></i>
            </button>
            <span class="vote-count">0</span>
        </div>
    `;

    queueList.appendChild(item);
    input.value = '';
    document.getElementById('searchResults').classList.remove('active');

    document.getElementById('queueCount').textContent = queueList.children.length;

    showToast('success', `ขอเพลง "${title}" สำเร็จ!`);
    addSystemMessage(`🎵 DJ_Listener ขอเพลง "${escapeHtml(title)}"`);
}

// ========== VOTING ==========
function voteQueue(btn, value) {
    const item = btn.closest('.queue-item');
    const countEl = item.querySelector('.vote-count');
    const isUpvoted = btn.classList.contains('upvoted');

    if (isUpvoted) {
        btn.classList.remove('upvoted');
        countEl.textContent = parseInt(countEl.textContent) - 1;
    } else {
        btn.classList.add('upvoted');
        countEl.textContent = parseInt(countEl.textContent) + 1;
    }

    item.setAttribute('data-votes', countEl.textContent);
    sortQueue();
}

function sortQueue() {
    const list = document.getElementById('queueList');
    const items = Array.from(list.children);

    items.sort((a, b) =>
        parseInt(b.getAttribute('data-votes')) - parseInt(a.getAttribute('data-votes'))
    );

    items.forEach((item, i) => {
        item.querySelector('.queue-pos').textContent = i + 1;
        list.appendChild(item);
    });
}

// ========== REACTIONS ==========
function sendReaction(emoji) {
    const container = document.getElementById('floatingReactions');
    const el = document.createElement('div');
    el.classList.add('floating-emoji');
    el.textContent = emoji;
    el.style.left = (Math.random() * 60 - 30) + 'px';
    container.appendChild(el);

    setTimeout(() => el.remove(), 2000);

    const btn = document.querySelector(`.reaction-btn[data-emoji="${emoji}"]`);
    if (btn) {
        const countEl = btn.querySelector('.reaction-count');
        countEl.textContent = parseInt(countEl.textContent) + 1;
    }
}

// ========== TOAST ==========
function showToast(type, message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.classList.add('toast', type);

    const icons = {
        success: 'fa-check-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-circle'
    };

    toast.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
