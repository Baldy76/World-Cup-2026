const API_URL = 'https://wc2026-proxy.baldynapperrwe.workers.dev/'; 

const TEAM_COLORS = {
    'England': '#ef4444', 'Mexico': '#16a34a', 'USA': '#2563eb', 'Canada': '#dc2626',
    'Brazil': '#eab308', 'Argentina': '#7dd3fc', 'France': '#1d4ed8', 'Germany': '#ffffff'
};

let globalMatches = [];
let savedTeam = localStorage.getItem('myTeam') || 'ALL';

// --- THEME ENGINE ---
function updateTheme(teamName) {
    const color = TEAM_COLORS[teamName] || '#10b981';
    document.documentElement.style.setProperty('--primary-hex', color);
}

// --- INIT ---
document.getElementById('my-team-selector').addEventListener('change', (e) => {
    savedTeam = e.target.value;
    localStorage.setItem('myTeam', savedTeam);
    updateTheme(savedTeam);
    renderMatches();
});
updateTheme(savedTeam);

// --- FETCH & DATA PIPELINE (Standard fetch code optimized) ---
async function fetchAllData() {
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
        populateTeamSelector();
        renderMatches();
        renderStandings(gD.standings || []);
        renderScorers(sD.scorers || []);
        startCountdown();
        document.getElementById('status-message').classList.add('hidden');
        setTimeout(fetchAllData, 30000); // More aggressive updates for live feel
    } catch (e) { console.error(e); setTimeout(fetchAllData, 60000); }
}

// --- RENDER MATCHES (Glass Cards & Momentum) ---
function renderMatches() {
    const container = document.getElementById('tab-matches');
    container.innerHTML = '';

    const list = savedTeam === 'ALL' ? globalMatches : globalMatches.filter(m => m.homeTeam?.name === savedTeam || m.awayTeam?.name === savedTeam);

    list.forEach((m, i) => {
        const isLive = m.status === 'IN_PLAY';
        const scoreH = m.score?.fullTime?.home ?? 0;
        const scoreA = m.score?.fullTime?.away ?? 0;

        // Visual Momentum Mockup (calculated based on score/events)
        const total = (scoreH + scoreA) || 1;
        const widthH = Math.max(20, Math.min(80, (scoreH / total) * 100));

        const card = `
            <div onclick="toggleDetails(${i})" class="glass rounded-2xl p-5 shadow-2xl border-t border-white/10 relative overflow-hidden transition active:scale-95">
                ${isLive ? '<div class="absolute top-0 left-0 w-full h-1 primary-bg animate-pulse"></div>' : ''}
                
                <div class="flex justify-between items-center mb-4">
                    <div class="flex flex-col items-center w-1/3">
                        <img src="${m.homeTeam?.crest}" class="w-10 h-10 object-contain mb-2 drop-shadow-md">
                        <span class="text-[10px] font-black uppercase tracking-tighter">${m.homeTeam?.tla || 'TBD'}</span>
                    </div>
                    
                    <div class="flex flex-col items-center w-1/3">
                        <div class="text-3xl font-black italic tracking-tighter">${scoreH} - ${scoreA}</div>
                        <div class="text-[10px] font-bold ${isLive ? 'text-red-500 animate-pulse' : 'text-slate-500'} uppercase">
                            ${isLive ? 'LIVE '+m.minute+"'" : m.status}
                        </div>
                    </div>

                    <div class="flex flex-col items-center w-1/3">
                        <img src="${m.awayTeam?.crest}" class="w-10 h-10 object-contain mb-2 drop-shadow-md">
                        <span class="text-[10px] font-black uppercase tracking-tighter">${m.awayTeam?.tla || 'TBD'}</span>
                    </div>
                </div>

                <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden flex">
                    <div class="primary-bg transition-all duration-1000" style="width: ${widthH}%"></div>
                    <div class="bg-slate-600 w-full"></div>
                </div>

                <div id="details-${i}" class="hidden mt-4 pt-4 border-t border-white/5 space-y-2">
                    ${(m.goals || []).map(g => `<div class="text-[10px] flex justify-between"><span>⚽ ${g.scorer.name}</span> <span class="opacity-50">${g.minute}'</span></div>`).join('')}
                    <div class="text-[9px] uppercase font-bold opacity-30 text-center mt-2">${m.venue || 'Stadium TBD'}</div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', card);
    });
}

// ... (Rest of logic: Standings, Scorers, Countdown, switchTab - same as V4 but applying the .glass classes) ...
function toggleDetails(i) { document.getElementById(`details-${i}`).classList.toggle('hidden'); }

function switchTab(t) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    ['matches', 'groups', 'stats'].forEach(id => {
        const btn = document.getElementById(`btn-${id}`);
        btn.classList.remove('primary-text');
        btn.classList.add('text-slate-500');
    });
    document.getElementById(`btn-${t}`).classList.remove('text-slate-500');
    document.getElementById(`btn-${t}`).classList.add('primary-text');
}

function startCountdown() {
    const next = globalMatches.find(m => m.status === 'TIMED');
    if(!next) return;
    const diff = new Date(next.utcDate) - new Date();
    if(diff < 0) return;
    const h = Math.floor(diff/3600000);
    const m = Math.floor((diff%3600000)/60000);
    document.getElementById('countdown-banner').classList.remove('hidden');
    document.getElementById('countdown-timer').innerText = `${next.homeTeam.name} vs ${next.awayTeam.name} | ${h}H ${m}M`;
}

function populateTeamSelector() {
    const s = document.getElementById('my-team-selector');
    const teams = [...new Set(globalMatches.map(m => [m.homeTeam.name, m.awayTeam.name]).flat())].filter(Boolean).sort();
    s.innerHTML = '<option value="ALL">Global View</option>' + teams.map(t => `<option value="${t}">${t}</option>`).join('');
    s.value = savedTeam;
}

fetchAllData();
