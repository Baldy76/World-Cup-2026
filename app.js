const API_URL = 'https://wc2026-proxy.baldynapperrwe.workers.dev/'; 

let globalMatches = [];
let savedTeam = localStorage.getItem('myTeam') || 'ALL';
let refreshInterval = parseInt(localStorage.getItem('refreshRate')) || 60000;

// --- YOUR THEME BRAIN ---
function applyTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    const meta = document.getElementById('theme-meta'); 
    if(meta) meta.content = isDark ? "#000000" : "#f2f2f7";
    const btnL = document.getElementById('btnLight'), btnD = document.getElementById('btnDark');
    if (btnL && btnD) {
        btnL.classList.toggle('active', !isDark); btnD.classList.toggle('active', isDark);
    }
}

window.setThemeMode = (isDark) => { 
    applyTheme(isDark); 
    localStorage.setItem('WC_Theme', isDark); 
};

// --- DATA ENGINE ---
async function fetchAllData() {
    const indicator = document.getElementById('api-indicator');
    try {
        const [mR, gR, sR] = await Promise.all([
            fetch(`${API_URL}?endpoint=matches`),
            fetch(`${API_URL}?endpoint=standings`),
            fetch(`${API_URL}?endpoint=scorers`)
        ]);
        const mD = await mR.json();
        const gD = await gR.json();
        const sD = await sR.json();
        globalMatches = mD.matches || [];
        renderMatches();
        renderStandings(gD.standings || []);
        renderScorers(sD.scorers || []);
        indicator.className = "w-3 h-3 rounded-full bg-emerald-500 shadow-lg";
    } catch (e) {
        indicator.className = "w-3 h-3 rounded-full bg-red-500 shadow-lg";
        console.error(e);
    }
    setTimeout(fetchAllData, refreshInterval);
}

// --- SYSTEM CONTROLS ---
window.nukeCache = () => {
    if(confirm("Clear all data and reset app?")) {
        localStorage.clear();
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
        window.location.reload();
    }
};

document.getElementById('refresh-rate').addEventListener('change', (e) => {
    localStorage.setItem('refreshRate', e.target.value);
    refreshInterval = parseInt(e.target.value);
});

// --- RENDERERS (V5 Style) ---
function renderMatches() {
    const container = document.getElementById('tab-matches');
    container.innerHTML = '';
    const list = savedTeam === 'ALL' ? globalMatches : globalMatches.filter(m => m.homeTeam?.name === savedTeam || m.awayTeam?.name === savedTeam);
    
    list.forEach((m, i) => {
        const isLive = m.status === 'IN_PLAY';
        container.insertAdjacentHTML('beforeend', `
            <div onclick="toggleDetails(${i})" class="glass p-5 rounded-2xl shadow-md border-l-4 ${isLive ? 'border-red-500' : 'border-emerald-500'} active:scale-95 transition">
                <div class="flex justify-between text-[10px] font-bold opacity-40 mb-3 uppercase tracking-widest">
                    <span>${new Date(m.utcDate).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    <span class="${isLive ? 'text-red-500 animate-pulse' : ''}">${isLive ? 'LIVE' : m.status}</span>
                </div>
                <div class="flex justify-between items-center text-lg font-black italic tracking-tighter">
                    <div class="flex-1 flex items-center justify-end truncate pr-2">${m.homeTeam?.tla || 'TBD'} <img src="${m.homeTeam?.crest}" class="w-5 h-5 ml-2 object-contain"></div>
                    <div class="px-3 py-1 bg-black/5 rounded-lg">${m.score?.fullTime?.home ?? 0} - ${m.score?.fullTime?.away ?? 0}</div>
                    <div class="flex-1 flex items-center justify-start truncate pl-2"><img src="${m.awayTeam?.crest}" class="w-5 h-5 mr-2 object-contain"> ${m.awayTeam?.tla || 'TBD'}</div>
                </div>
                <div id="details-${i}" class="hidden mt-4 pt-4 border-t border-black/5 text-[10px] text-center opacity-60">
                    ${m.venue || 'Stadium TBD'} | ${m.group || m.stage}
                </div>
            </div>
        `);
    });
}

function toggleDetails(i) { document.getElementById(`details-${i}`).classList.toggle('hidden'); }

function switchTab(t) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    ['matches', 'groups', 'stats', 'settings'].forEach(id => {
        const btn = document.getElementById(`btn-${id}`);
        btn.classList.toggle('primary-text', id === t);
        btn.classList.toggle('opacity-40', id !== t);
    });
}

// Kickoff
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('WC_Theme') === 'true';
    applyTheme(saved);
    document.getElementById('refresh-rate').value = refreshInterval;
    fetchAllData();
});
