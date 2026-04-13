const API_URL = 'https://wc2026-proxy.baldynapperrwe.workers.dev'; 

let globalMatches = [];
let savedTeam = localStorage.getItem('myTeam') || 'ALL';
let refreshInterval = parseInt(localStorage.getItem('refreshRate')) || 60000;
let fetchTimeout;
let previousScores = {}; 
let predictions = JSON.parse(localStorage.getItem('wc_predictions')) || {};

// --- SENSORY UI ENGINE (Epic 2) ---
function triggerHaptic(type = 'light') {
    if (!navigator.vibrate) return;
    if (type === 'light') navigator.vibrate(50);
    if (type === 'success') navigator.vibrate([50, 50, 50]);
    if (type === 'goal') navigator.vibrate([200, 100, 200, 100, 500]);
}

function playGoalSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const playTone = (freq, time, dur) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + time);
            gain.gain.setValueAtTime(0.1, ctx.currentTime + time);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime + time);
            osc.stop(ctx.currentTime + time + dur);
        };
        // A simple stadium alert beep-beep!
        playTone(659.25, 0, 0.15); // E5
        playTone(880.00, 0.2, 0.4); // A5
    } catch(e) { console.log("Audio not supported"); }
}

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
window.setThemeMode = (isDark) => { triggerHaptic(); applyTheme(isDark); localStorage.setItem('WC_Theme', isDark); };

// --- DATA ENGINE ---
async function fetchAllData() {
    clearTimeout(fetchTimeout);
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
        
        checkGoalAlerts(globalMatches);
        evalPredictions(); // Grade the game!

        renderMatches();
        renderPredictor();
        renderStandings(gD.standings || []);
        renderBracket(); // Epic 4
        renderScorers(sD.scorers || []);
        populateTeamSelector();

        indicator.className = "w-3 h-3 rounded-full bg-emerald-500 shadow-lg";
    } catch (e) {
        indicator.className = "w-3 h-3 rounded-full bg-red-500 shadow-lg";
    }
    
    fetchTimeout = setTimeout(fetchAllData, refreshInterval);
}

// --- GOAL ALERT LOGIC (Sensory Update) ---
function checkGoalAlerts(matches) {
    matches.forEach(match => {
        if (match.status === 'IN_PLAY') {
            const currentH = match.score?.fullTime?.home ?? 0;
            const currentA = match.score?.fullTime?.away ?? 0;
            const prev = previousScores[match.id];

            if (prev && (currentH > prev.home || currentA > prev.away)) {
                triggerHaptic('goal');
                playGoalSound();
                
                if (("Notification" in window) && Notification.permission === "granted") {
                    if (savedTeam === 'ALL' || match.homeTeam?.name === savedTeam || match.awayTeam?.name === savedTeam) {
                        const team = currentH > prev.home ? match.homeTeam : match.awayTeam;
                        new Notification(`⚽ GOAL ${team.tla}!`, {
                            body: `${match.homeTeam.tla} ${currentH} - ${currentA} ${match.awayTeam.tla}`,
                            icon: team.crest || 'https://cdn-icons-png.flaticon.com/512/53/53283.png'
                        });
                    }
                }
            }
            previousScores[match.id] = { home: currentH, away: currentA };
        }
    });
}

// --- PREDICTOR ENGINE (Epic 1) ---
function savePrediction(matchId, homeTeam, awayTeam) {
    triggerHaptic('success');
    const hScore = document.getElementById(`pred-h-${matchId}`).value;
    const aScore = document.getElementById(`pred-a-${matchId}`).value;
    
    if(hScore === "" || aScore === "") return alert("Enter both scores!");

    predictions[matchId] = {
        h: parseInt(hScore),
        a: parseInt(aScore),
        hName: homeTeam,
        aName: awayTeam,
        points: null // To be graded later
    };
    localStorage.setItem('wc_predictions', JSON.stringify(predictions));
    
    // Quick UI feedback
    const btn = document.getElementById(`btn-save-${matchId}`);
    btn.innerHTML = "Saved! ✔️";
    btn.classList.replace('text-blue-500', 'text-emerald-500');
    setTimeout(() => evalPredictions(), 500); // Regrade immediately
}

function evalPredictions() {
    let totalPoints = 0;
    
    for (let id in predictions) {
        const match = globalMatches.find(m => m.id == id);
        if (match && match.status === 'FINISHED') {
            const actualH = match.score?.fullTime?.home;
            const actualA = match.score?.fullTime?.away;
            const predH = predictions[id].h;
            const predA = predictions[id].a;

            let pts = 0;
            if (actualH === predH && actualA === predA) pts = 3; // Exact
            else {
                // Correct outcome (Win/Loss/Draw)
                const actualDiff = actualH - actualA;
                const predDiff = predH - predA;
                if ((actualDiff > 0 && predDiff > 0) || (actualDiff < 0 && predDiff < 0) || (actualDiff === 0 && predDiff === 0)) {
                    pts = 1;
                }
            }
            predictions[id].points = pts;
        }
        if (predictions[id].points !== null) totalPoints += predictions[id].points;
    }
    
    localStorage.setItem('wc_predictions', JSON.stringify(predictions));
    const ptEl = document.getElementById('predict-points');
    if(ptEl) ptEl.innerText = totalPoints;
}

function renderPredictor() {
    const container = document.getElementById('predict-container');
    container.innerHTML = '';

    const upcoming = globalMatches.filter(m => m.status === 'TIMED' || m.status === 'SCHEDULED').slice(0, 5); // Show next 5 games
    
    if (upcoming.length === 0) {
        container.innerHTML = `<div class="glass p-5 rounded-2xl text-center opacity-40 font-bold text-xs uppercase">No upcoming matches to predict.</div>`;
    }

    upcoming.forEach(m => {
        const pred = predictions[m.id];
        const hVal = pred ? pred.h : '';
        const aVal = pred ? pred.a : '';

        container.insertAdjacentHTML('beforeend', `
            <div class="glass p-4 rounded-2xl shadow-md border border-black/5">
                <div class="text-[10px] uppercase font-bold opacity-40 mb-2 tracking-widest text-center">${new Date(m.utcDate).toLocaleString([], {weekday:'short', hour:'2-digit', minute:'2-digit'})}</div>
                <div class="flex items-center justify-between">
                    <div class="flex flex-col items-center w-1/3">
                        <img src="${m.homeTeam?.crest}" class="w-6 h-6 mb-1 object-contain">
                        <span class="text-[10px] font-black uppercase truncate">${m.homeTeam?.tla || 'TBD'}</span>
                    </div>
                    <div class="flex space-x-2 items-center w-1/3 justify-center">
                        <input id="pred-h-${m.id}" type="number" min="0" max="15" value="${hVal}" class="w-10 h-10 bg-black/5 text-center font-black rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                        <span class="opacity-30 font-black">-</span>
                        <input id="pred-a-${m.id}" type="number" min="0" max="15" value="${aVal}" class="w-10 h-10 bg-black/5 text-center font-black rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                    </div>
                    <div class="flex flex-col items-center w-1/3">
                        <img src="${m.awayTeam?.crest}" class="w-6 h-6 mb-1 object-contain">
                        <span class="text-[10px] font-black uppercase truncate">${m.awayTeam?.tla || 'TBD'}</span>
                    </div>
                </div>
                <button id="btn-save-${m.id}" onclick="savePrediction(${m.id}, '${m.homeTeam?.tla}', '${m.awayTeam?.tla}')" class="w-full mt-4 py-2 bg-blue-500/10 text-blue-500 font-black text-[10px] uppercase tracking-widest rounded-xl active:scale-95 transition">
                    ${pred ? 'Update Prediction' : 'Save Prediction'}
                </button>
            </div>
        `);
    });

    // Render Past Results inside Predictor tab
    const past = Object.keys(predictions).filter(id => predictions[id].points !== null);
    if(past.length > 0) {
        container.insertAdjacentHTML('beforeend', `<h3 class="font-black text-sm uppercase opacity-50 mb-2 mt-6 px-2">History</h3>`);
        past.forEach(id => {
            const p = predictions[id];
            const color = p.points === 3 ? 'emerald' : p.points === 1 ? 'blue' : 'slate';
            container.insertAdjacentHTML('beforeend', `
                <div class="flex justify-between items-center glass p-3 rounded-xl mb-2 border-l-4 border-${color}-500">
                    <span class="text-xs font-bold w-1/2 truncate">${p.hName} ${p.h}-${p.a} ${p.aName}</span>
                    <span class="text-[10px] font-black text-${color}-500 uppercase tracking-widest">+${p.points} Pts</span>
                </div>
            `);
        });
    }
}

// --- KNOCKOUT BRACKET (Epic 4) ---
function renderBracket() {
    const container = document.getElementById('sub-bracket');
    const knockouts = globalMatches.filter(m => m.stage !== 'GROUP_STAGE' && m.stage !== null);
    
    if(knockouts.length === 0) {
        container.innerHTML = `<div class="text-center py-20 opacity-40 font-bold uppercase tracking-widest text-[10px]">Bracket available after Group Stages</div>`;
        return;
    }

    // Group by stage
    const stages = { 'LAST_32':[], 'LAST_16':[], 'QUARTER_FINALS':[], 'SEMI_FINALS':[], 'FINAL':[] };
    knockouts.forEach(m => { if(stages[m.stage]) stages[m.stage].push(m); });

    let html = `<div class="flex space-x-6 px-4">`;
    Object.keys(stages).forEach(stageName => {
        if(stages[stageName].length === 0) return;
        
        html += `<div class="flex flex-col space-y-4 min-w-[160px] justify-around">
            <h4 class="text-center text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">${stageName.replace('_', ' ')}</h4>
        `;
        
        stages[stageName].forEach(m => {
            const isLive = m.status === 'IN_PLAY';
            const hScore = m.score?.fullTime?.home ?? '-';
            const aScore = m.score?.fullTime?.away ?? '-';
            
            html += `
                <div class="glass p-2 rounded-xl text-xs font-bold border-l-2 ${isLive ? 'border-red-500' : 'border-black/10'}">
                    <div class="flex justify-between items-center mb-1">
                        <span class="truncate pr-2">${m.homeTeam?.tla || 'TBD'}</span>
                        <span class="${hScore > aScore ? 'primary-text font-black' : ''}">${hScore}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="truncate pr-2">${m.awayTeam?.tla || 'TBD'}</span>
                        <span class="${aScore > hScore ? 'primary-text font-black' : ''}">${aScore}</span>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
}

// --- STANDARD RENDERERS (Matches, Standings, Scorers) ---
function renderMatches() {
    const container = document.getElementById('tab-matches');
    const list = savedTeam === 'ALL' ? globalMatches : globalMatches.filter(m => m.homeTeam?.name === savedTeam || m.awayTeam?.name === savedTeam);
    
    if (list.length === 0) {
        container.innerHTML = `<div class="text-center py-20 opacity-40 font-bold uppercase text-[10px]">No matches found.</div>`;
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
                    <div class="flex-1 flex items-center justify-end truncate pr-2 text-right">
                        ${m.homeTeam?.tla || m.homeTeam?.name || 'TBD'} <img src="${m.homeTeam?.crest}" class="w-5 h-5 ml-2 object-contain inline">
                    </div>
                    <div class="px-3 py-1 bg-black/5 rounded-lg font-mono">${m.score?.fullTime?.home ?? 0} - ${m.score?.fullTime?.away ?? 0}</div>
                    <div class="flex-1 flex items-center justify-start truncate pl-2 text-left">
                        <img src="${m.awayTeam?.crest}" class="w-5 h-5 mr-2 object-contain inline"> ${m.awayTeam?.tla || m.awayTeam?.name || 'TBD'}
                    </div>
                </div>
                <div id="details-${i}" class="hidden mt-4 pt-4 border-t border-black/5 text-[10px] text-center opacity-60 uppercase font-bold tracking-widest">
                    ${m.venue || 'Stadium TBD'} | ${m.group || m.stage || 'WC 2026'}
                </div>
            </div>
        `;
    }).join('');
}

function renderStandings(standings) {
    const container = document.getElementById('sub-groups');
    if (!standings || standings.length === 0) return container.innerHTML = `<div class="text-center py-20 opacity-40 font-bold uppercase tracking-widest text-[10px]">Standings not available yet.</div>`;
    
    container.innerHTML = standings.filter(g => g.type === 'TOTAL').map(group => `
        <div class="glass p-4 rounded-2xl shadow-md mb-4">
            <h3 class="font-black primary-text mb-3 border-b border-black/5 pb-2 text-xs uppercase">${group.group}</h3>
            <div class="space-y-2">
                ${group.table.map(team => `
                    <div class="flex justify-between items-center text-[10px]">
                        <div class="flex items-center gap-2 w-1/2">
                            <span class="opacity-40 w-3">${team.position}</span>
                            <img src="${team.team.crest}" class="w-4 h-4 object-contain">
                            <span class="font-bold truncate">${team.team.tla || team.team.name}</span>
                        </div>
                        <div class="flex gap-3 font-mono opacity-80 w-1/2 justify-end">
                            <span title="Played">${team.playedGames}P</span>
                            <span title="Goal Diff">${team.goalDifference}GD</span>
                            <span class="font-black text-emerald-500">${team.points}pts</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function renderScorers(scorers) {
    const container = document.getElementById('tab-stats');
    if (!scorers || scorers.length === 0) return container.innerHTML = `<h2 class="text-xl font-black primary-text mb-4 text-center">GOLDEN BOOT</h2><div class="glass p-5 rounded-2xl text-center opacity-40 text-[10px] font-bold uppercase py-10">No goals recorded yet.</div>`;
    
    container.innerHTML = `<h2 class="text-xl font-black primary-text mb-4 text-center">GOLDEN BOOT</h2>
    <div class="glass p-5 rounded-2xl shadow-md">
        ${scorers.map((s, i) => `
            <div class="flex justify-between items-center py-3 border-b border-black/5 last:border-0">
                <div class="flex items-center gap-3">
                    <span class="opacity-30 text-[10px]">${i+1}</span>
                    <span class="font-bold text-xs">${s.player.name}</span>
                    <img src="${s.team.crest}" class="w-4 h-4 object-contain">
                </div>
                <span class="font-black text-emerald-500">${s.goals} ⚽</span>
            </div>
        `).join('')}
    </div>`;
}

// --- NAVIGATION & UTILS ---
window.nukeCache = () => {
    triggerHaptic();
    if(confirm("Clear all data and reset app?")) {
        localStorage.clear();
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
        window.location.reload();
    }
};

function switchTab(t) {
    triggerHaptic('light');
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    ['matches', 'groups', 'predict', 'stats', 'settings'].forEach(id => {
        const btn = document.getElementById(`btn-${id}`);
        btn.classList.toggle('primary-text', id === t);
        btn.classList.toggle('opacity-40', id !== t);
    });
}

window.switchSubTab = (sub) => {
    triggerHaptic('light');
    document.getElementById('sub-groups').classList.toggle('hidden', sub !== 'groups');
    document.getElementById('sub-bracket').classList.toggle('hidden', sub !== 'bracket');
    document.getElementById('btnSubGroups').classList.toggle('active', sub === 'groups');
    document.getElementById('btnSubBracket').classList.toggle('active', sub === 'bracket');
};

function toggleDetails(i) { 
    triggerHaptic('light');
    const el = document.getElementById(`details-${i}`);
    if(el) el.classList.toggle('hidden'); 
}

window.manualSync = async () => {
    triggerHaptic('heavy');
    const btn = document.getElementById('sync-btn');
    const icon = document.getElementById('sync-icon');
    icon.classList.add('animate-spin'); btn.classList.add('opacity-50'); btn.disabled = true;
    await fetchAllData();
    setTimeout(() => { icon.classList.remove('animate-spin'); btn.classList.remove('opacity-50'); btn.disabled = false; }, 800);
};

function populateTeamSelector() {
    const s = document.getElementById('my-team-selector');
    const teams = [...new Set(globalMatches.map(m => [m.homeTeam?.name, m.awayTeam?.name]).flat())].filter(Boolean).sort();
    const current = s.value;
    s.innerHTML = '<option value="ALL">Global View</option>' + teams.map(t => `<option value="${t}">${t}</option>`).join('');
    s.value = current;
    s.onchange = (e) => {
        triggerHaptic();
        savedTeam = e.target.value;
        localStorage.setItem('myTeam', savedTeam);
        renderMatches();
    };
}

document.addEventListener('DOMContentLoaded', () => {
    setupNotificationButton(); // Keep from V7
    const saved = localStorage.getItem('WC_Theme') === 'true';
    applyTheme(saved);
    fetchAllData();
});

// Polyfill from V7 setup
function setupNotificationButton() {
    if (!("Notification" in window) || Notification.permission === "granted" || document.getElementById('notify-btn-container')) return;
    const settingsTab = document.getElementById('tab-settings');
    if(settingsTab) {
        settingsTab.insertAdjacentHTML('afterbegin', `<button id="notify-btn-container" onclick="Notification.requestPermission().then(()=>window.location.reload())" class="w-full py-4 mb-4 bg-blue-500/10 text-blue-500 rounded-xl text-xs font-black uppercase tracking-widest">🔔 Enable Goal Alerts</button>`);
    }
}
