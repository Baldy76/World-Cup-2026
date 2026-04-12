const API_URL = 'https://wc2026-proxy.baldynapperrwe.workers.dev'; // Removed trailing slash for cleaner param appending

let globalMatches = [];
let savedTeam = localStorage.getItem('myTeam') || 'ALL';
let refreshInterval = parseInt(localStorage.getItem('refreshRate')) || 60000;

// --- THEME ENGINE ---
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

// --- IMPROVED DATA ENGINE ---
async function fetchAllData() {
    const indicator = document.getElementById('api-indicator');
    try {
        // We fetch with explicit endpoint params
        const [mR, gR, sR] = await Promise.all([
            fetch(`${API_URL}?endpoint=matches`),
            fetch(`${API_URL}?endpoint=standings`),
            fetch(`${API_URL}?endpoint=scorers`)
        ]);

        const mD = await mR.json();
        const gD = await gR.json();
        const sD = await sR.json();

        console.log("Matches:", mD); // Log to console for debugging
        console.log("Groups:", gD);

        globalMatches = mD.matches || [];
        
        renderMatches();
        renderStandings(gD.standings || []);
        renderScorers(sD.scorers || []);

        indicator.className = "w-3 h-3 rounded-full bg-emerald-500 shadow-lg";
        populateTeamSelector();
    } catch (e) {
        indicator.className = "w-3 h-3 rounded-full bg-red-500 shadow-lg";
        console.error("Fetch Error:", e);
    }
    setTimeout(fetchAllData, refreshInterval);
}

// --- RENDERING LOGIC ---

function renderMatches() {
    const container = document.getElementById('tab-matches');
    const list = savedTeam === 'ALL' ? globalMatches : globalMatches.filter(m => m.homeTeam?.name === savedTeam || m.awayTeam?.name === savedTeam);
    
    if (list.length === 0) {
        container.innerHTML = `<div class="text-center py-20 opacity-40 font-bold">No matches scheduled for ${savedTeam === 'ALL' ? 'the tournament' : savedTeam} yet.</div>`;
        return;
    }

    container.innerHTML = list.map((m, i) => {
        const isLive = m.status === 'IN_PLAY';
        return `
            <div onclick="toggleDetails(${i})" class="glass p-5 rounded-2xl shadow-md border-l-4 ${isLive ? 'border-red-500' : 'border-emerald-500'} active:scale-95 transition mb-4">
                <div class="flex justify-between text-[10px] font-bold opacity-40 mb-3 uppercase tracking-widest">
                    <span>${new Date(m.utcDate).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    <span class="${isLive ? 'text-red-500 animate-pulse' : ''}">${isLive ? 'LIVE' : m.status}</span>
                </div>
                <div class="flex justify-between items-center text-lg font-black italic tracking-tighter">
                    <div class="flex-1 flex items-center justify-end truncate pr-2">${m.homeTeam?.tla || m.homeTeam?.name || 'TBD'} <img src="${m.homeTeam?.crest}" class="w-5 h-5 ml-2 object-contain"></div>
                    <div class="px-3 py-1 bg-black/5 rounded-lg">${m.score?.fullTime?.home ?? 0} - ${m.score?.fullTime?.away ?? 0}</div>
                    <div class="flex-1 flex items-center justify-start truncate pl-2"><img src="${m.awayTeam?.crest}" class="w-5 h-5 mr-2 object-contain"> ${m.awayTeam?.tla || m.awayTeam?.name || 'TBD'}</div>
                </div>
                <div id="details-${i}" class="hidden mt-4 pt-4 border-t border-black/5 text-[10px] text-center opacity-60">
                    ${m.venue || 'Stadium TBD'} | ${m.group || m.stage || 'World Cup 2026'}
                </div>
            </div>
        `;
    }).join('');
}

function renderStandings(standings) {
    const container = document.getElementById('tab-groups');
    if (standings.length === 0) {
        container.innerHTML = `<div class="text-center py-20 opacity-40 font-bold uppercase tracking-widest text-xs">Standings will appear here<br>once the tournament begins.</div>`;
        return;
    }
    
    container.innerHTML = standings.filter(g => g.type === 'TOTAL').map(group => `
        <div class="glass p-5 rounded-2xl shadow-md mb-6">
            <h3 class="font-black primary-text mb-4 border-b border-black/5 pb-2 text-sm uppercase">${group.group}</h3>
            <div class="space-y-3">
                ${group.table.map(team => `
                    <div class="flex justify-between items-center text-xs">
                        <div class="flex items-center gap-2">
                            <span class="opacity-40 w-4">${team.position}</span>
                            <img src="${team.team.crest}" class="w-4 h-4 object-contain">
                            <span class="font-bold">${team.team.tla || team.team.name}</span>
                        </div>
                        <div class="flex gap-4 font-mono opacity-80">
                            <span>${team.playedGames}P</span>
                            <span class="font-bold primary-text">${team.points}pts</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function renderScorers(scorers) {
    const container = document.getElementById('tab-stats');
    if (!scorers || scorers.length === 0) {
        container.innerHTML = `<h2 class="text-xl font-black primary-text mb-4 text-center">GOLDEN BOOT</h2><div class="glass p-5 rounded-2xl text-center opacity-40 text-xs font-bold uppercase py-10">No goals recorded yet.</div>`;
        return;
    }
    
    container.innerHTML = `<h2 class="text-xl font-black primary-text mb-4 text-center">GOLDEN BOOT</h2>
    <div class="glass p-5 rounded-2xl shadow-md">
        ${scorers.map((s, i) => `
            <div class="flex justify-between items-center py-3 border-b border-black/5 last:border-0">
                <div class="flex items-center gap-3">
                    <span class="opacity-30 text-xs">${i+1}</span>
                    <span class="font-bold text-sm">${s.player.name}</span>
                    <img src="${s.team.crest}" class="w-4 h-4 object-contain">
                </div>
                <span class="font-black primary-text">${s.goals} ⚽</span>
            </div>
        `).join('')}
    </div>`;
}

// --- SYSTEM HELPERS ---
window.nukeCache = () => {
    if(confirm("Clear all data and reset app?")) {
        localStorage.clear();
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
        window.location.reload();
    }
};

function switchTab(t) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    ['matches', 'groups', 'stats', 'settings'].forEach(id => {
        const btn = document.getElementById(`btn-${id}`);
        btn.classList.toggle('primary-text', id === t);
        btn.classList.toggle('opacity-40', id !== t);
    });
}

function toggleDetails(i) { 
    const el = document.getElementById(`details-${i}`);
    if(el) el.classList.toggle('hidden'); 
}

function populateTeamSelector() {
    const s = document.getElementById('my-team-selector');
    const teams = [...new Set(globalMatches.map(m => [m.homeTeam?.name, m.awayTeam?.name]).flat())].filter(Boolean).sort();
    const current = s.value;
    s.innerHTML = '<option value="ALL">Global View</option>' + teams.map(t => `<option value="${t}">${t}</option>`).join('');
    s.value = current;
}

// Kickoff
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('WC_Theme') === 'true';
    applyTheme(saved);
    fetchAllData();
});
