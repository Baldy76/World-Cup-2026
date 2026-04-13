const API_URL = 'https://wc2026-proxy.baldynapperrwe.workers.dev'; 

let globalMatches = [];
let savedTeam = localStorage.getItem('myTeam') || 'ALL';
let refreshInterval = parseInt(localStorage.getItem('refreshRate')) || 60000;
let fetchTimeout;
let previousScores = {}; 

// MULTIPLAYER STATE
let predictions = JSON.parse(localStorage.getItem('wc_predictions')) || {};
let myUsername = localStorage.getItem('wc_username') || '';
let myLeagueId = localStorage.getItem('wc_leagueId') || '';
let currentTotalPoints = 0;

// --- SENSORY UI ---
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
        playTone(659.25, 0, 0.15); playTone(880.00, 0.2, 0.4); 
    } catch(e) { console.log("Audio not supported"); }
}

// --- THEME ENGINE ---
function applyTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    const meta = document.getElementById('theme-meta'); 
    if(meta) meta.content = isDark ? "#000000" : "#f2f2f7";
    const btnL = document.getElementById('btnLight'), btnD = document.getElementById('btnDark');
    if (btnL && btnD) { btnL.classList.toggle('active', !isDark); btnD.classList.toggle('active', isDark); }
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
        evalPredictions(); 
        if(myLeagueId) fetchLeagueTable();

        renderMatches();
        renderPredictor();
        renderLeagueUI();
        renderStandings(gD.standings || []);
        renderBracket(); 
        renderScorers(sD.scorers || []);
        populateTeamSelector();

        indicator.className = "w-3 h-3 rounded-full bg-emerald-500 shadow-lg";
    } catch (e) {
        indicator.className = "w-3 h-3 rounded-full bg-red-500 shadow-lg";
    }
    
    fetchTimeout = setTimeout(fetchAllData, refreshInterval);
}

function checkGoalAlerts(matches) {
    matches.forEach(match => {
        if (match.status === 'IN_PLAY') {
            const currentH = match.score?.fullTime?.home ?? 0;
            const currentA = match.score?.fullTime?.away ?? 0;
            const prev = previousScores[match.id];

            if (prev && (currentH > prev.home || currentA > prev.away)) {
                triggerHaptic('goal'); playGoalSound();
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

// --- NEW 5/2/DOUBLE MULTIPLAYER PREDICTOR ENGINE ---
window.savePrediction = (matchId, homeTeam, awayTeam) => {
    triggerHaptic('success');
    const hScore = document.getElementById(`pred-h-${matchId}`).value;
    const aScore = document.getElementById(`pred-a-${matchId}`).value;
    
    if(hScore === "" || aScore === "") return alert("Enter both scores!");

    predictions[matchId] = { 
        h: parseInt(hScore), 
        a: parseInt(aScore), 
        hName: homeTeam, 
        aName: awayTeam, 
        basePoints: null, 
        points: null 
    };
    localStorage.setItem('wc_predictions', JSON.stringify(predictions));
    
    const btn = document.getElementById(`btn-save-${matchId}`);
    btn.innerHTML = "Saved! ✔️";
    btn.classList.replace('text-blue-500', 'text-emerald-500');
    setTimeout(() => evalPredictions(), 500); 
};

function evalPredictions() {
    let ptsCounter = 0;
    let pointsChanged = false;

    // Build tracking map to know which matches belong to which group
    const groupTracker = {};
    globalMatches.forEach(m => {
        if (m.stage === 'GROUP_STAGE' && m.group) {
            if (!groupTracker[m.group]) groupTracker[m.group] = [];
            groupTracker[m.group].push(m);
        }
    });

    // Step 1: Calculate BASE POINTS (5 for exact, 2 for outcome)
    for (let id in predictions) {
        const match = globalMatches.find(m => m.id == id);
        if (match && match.status === 'FINISHED') {
            const actualH = match.score?.fullTime?.home;
            const actualA = match.score?.fullTime?.away;
            const predH = predictions[id].h;
            const predA = predictions[id].a;

            let pts = 0;
            if (actualH === predH && actualA === predA) {
                pts = 5; // Exact Score
            } else {
                const actualDiff = actualH - actualA;
                const predDiff = predH - predA;
                if ((actualDiff > 0 && predDiff > 0) || (actualDiff < 0 && predDiff < 0) || (actualDiff === 0 && predDiff === 0)) {
                    pts = 2; // Right Result
                }
            }
            
            if (predictions[id].basePoints !== pts) {
                predictions[id].basePoints = pts;
                pointsChanged = true;
            }
        }
    }

    // Step 2: Apply the "Perfect Group" Multiplier
    for (let id in predictions) {
        const match = globalMatches.find(m => m.id == id);
        let finalPts = predictions[id].basePoints;

        if (finalPts !== null && finalPts !== undefined && match && match.stage === 'GROUP_STAGE' && match.group) {
            const groupMatches = groupTracker[match.group];
            if (groupMatches) {
                // Is the entire group finished?
                const allFinished = groupMatches.every(m => m.status === 'FINISHED');
                if (allFinished) {
                    // Did the user get EXACT (5pts) for every match in the group?
                    const perfectSweep = groupMatches.every(m => predictions[m.id] && predictions[m.id].basePoints === 5);
                    
                    if (perfectSweep) {
                        finalPts *= 2; // DOUBLE POINTS!
                    }
                }
            }
        }

        if (predictions[id].points !== finalPts) {
            predictions[id].points = finalPts;
            pointsChanged = true;
        }

        if (predictions[id].points !== null && predictions[id].points !== undefined) {
            ptsCounter += predictions[id].points;
        }
    }
    
    localStorage.setItem('wc_predictions', JSON.stringify(predictions));
    
    if (ptsCounter !== currentTotalPoints || pointsChanged) {
        currentTotalPoints = ptsCounter;
        const ptEl = document.getElementById('predict-points');
        if(ptEl) ptEl.innerText = currentTotalPoints;
        syncPointsToCloud(); 
    }
}

// --- CLOUDFLARE KV SYNC ---
async function syncPointsToCloud() {
    if (!myUsername || !myLeagueId) return; 
    try {
        await fetch(`${API_URL}?endpoint=league&leagueId=${myLeagueId}`, {
            method: 'POST',
            body: JSON.stringify({ username: myUsername, points: currentTotalPoints }),
            headers: { 'Content-Type': 'application/json' }
        });
        fetchLeagueTable(); 
    } catch(e) { console.error("Cloud Sync Failed", e); }
}

async function fetchLeagueTable() {
    if (!myLeagueId) return;
    try {
        const res = await fetch(`${API_URL}?endpoint=league&leagueId=${myLeagueId}`);
        const data = await res.json();
        const container = document.getElementById('league-rankings');
        if (data.length === 0) return container.innerHTML = `<div class="p-6 text-center opacity-40 text-xs font-bold uppercase tracking-widest">You are the first one here!</div>`;

        container.innerHTML = data.map((player, index) => {
            const isMe = player.username === myUsername;
            let medal = `<span class="opacity-30 text-xs font-black w-6 text-center">${index + 1}</span>`;
            if(index === 0) medal = `🥇`; if(index === 1) medal = `🥈`; if(index === 2) medal = `🥉`;

            return `
                <div class="flex justify-between items-center p-4 border-b border-black/5 last:border-0 ${isMe ? 'bg-emerald-500/10' : ''}">
                    <div class="flex items-center gap-4">
                        ${medal}
                        <span class="font-black text-sm ${isMe ? 'text-emerald-500' : ''}">${player.username}</span>
                    </div>
                    <span class="font-black text-xl font-mono ${isMe ? 'text-emerald-500' : ''}">${player.points}</span>
                </div>
            `;
        }).join('');
    } catch(e) { console.error("Could not load league table", e); }
}

window.joinLeague = () => {
    triggerHaptic('heavy');
    const user = document.getElementById('setup-username').value.trim();
    const lId = document.getElementById('setup-league-id').value.trim().toLowerCase().replace(/\s+/g, '-');
    if(!user || !lId) return alert("Enter both a Name and a League ID!");
    
    myUsername = user; myLeagueId = lId;
    localStorage.setItem('wc_username', myUsername);
    localStorage.setItem('wc_leagueId', myLeagueId);
    
    renderLeagueUI();
    evalPredictions(); 
    syncPointsToCloud();
};

window.leaveLeague = () => {
    if(confirm("Leave this league? Your points will remain, but you won't see the leaderboard.")) {
        myUsername = ''; myLeagueId = '';
        localStorage.removeItem('wc_username'); localStorage.removeItem('wc_leagueId');
        renderLeagueUI();
    }
};

function renderLeagueUI() {
    const setupEl = document.getElementById('league-setup');
    const boardEl = document.getElementById('league-board');
    if (myUsername && myLeagueId) {
        setupEl.classList.add('hidden'); boardEl.classList.remove('hidden');
        document.getElementById('display-league-id').innerText = myLeagueId;
        fetchLeagueTable();
    } else {
        setupEl.classList.remove('hidden'); boardEl.classList.add('hidden');
    }
}

// --- UI RENDERING ---
window.switchPredictTab = (tab) => {
    triggerHaptic('light');
    document.getElementById('sub-picks').classList.toggle('hidden', tab !== 'picks');
    document.getElementById('sub-league').classList.toggle('hidden', tab !== 'league');
    document.getElementById('btnSubPicks').classList.toggle('active', tab === 'picks');
    document.getElementById('btnSubLeague').classList.toggle('active', tab === 'league');
    if(tab === 'league') renderLeagueUI();
};

function renderPredictor() {
    const container = document.getElementById('predict-container');
    container.innerHTML = '';
    let upcoming = globalMatches.filter(m => m.status === 'TIMED' || m.status === 'SCHEDULED');
    upcoming.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    upcoming = upcoming.slice(0, 5); 
    
    if (upcoming.length === 0) {
        container.innerHTML = `<div class="glass p-5 rounded-2xl text-center opacity-40 font-bold text-xs uppercase">No upcoming matches.</div>`;
    }

    let currentGroupDate = "";
    let html = "";
    upcoming.forEach(m => {
        const matchDate = new Date(m.utcDate);
        const dateString = matchDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        const timeString = matchDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

        if (dateString !== currentGroupDate) {
            html += `<div class="w-full bg-black/5 rounded-xl py-2 mt-4 mb-3 text-center text-[10px] font-black uppercase tracking-widest opacity-60 backdrop-blur-sm">${dateString}</div>`;
            currentGroupDate = dateString;
        }

        const pred = predictions[m.id];
        const hVal = pred ? pred.h : ''; const aVal = pred ? pred.a : '';

        html += `
            <div class="glass p-4 rounded-2xl shadow-md border border-black/5 mb-4">
                <div class="text-[10px] uppercase font-bold opacity-50 mb-3 tracking-widest text-center">${timeString} • ${m.venue || 'Stadium TBD'}</div>
                <div class="flex items-center justify-between">
                    <div class="flex flex-col items-center w-1/3"><img src="${m.homeTeam?.crest}" class="w-6 h-6 mb-1 object-contain"><span class="text-[10px] font-black uppercase truncate">${m.homeTeam?.tla || 'TBD'}</span></div>
                    <div class="flex space-x-2 items-center w-1/3 justify-center">
                        <input id="pred-h-${m.id}" type="number" min="0" max="15" value="${hVal}" class="w-10 h-10 bg-black/5 text-center font-black rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                        <span class="opacity-30 font-black">-</span>
                        <input id="pred-a-${m.id}" type="number" min="0" max="15" value="${aVal}" class="w-10 h-10 bg-black/5 text-center font-black rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                    </div>
                    <div class="flex flex-col items-center w-1/3"><img src="${m.awayTeam?.crest}" class="w-6 h-6 mb-1 object-contain"><span class="text-[10px] font-black uppercase truncate">${m.awayTeam?.tla || 'TBD'}</span></div>
                </div>
                <button id="btn-save-${m.id}" onclick="savePrediction(${m.id}, '${m.homeTeam?.tla}', '${m.awayTeam?.tla}')" class="w-full mt-4 py-2 bg-blue-500/10 text-blue-500 font-black text-[10px] uppercase tracking-widest rounded-xl active:scale-95 transition">
                    ${pred ? 'Update Prediction' : 'Save Prediction'}
                </button>
            </div>
        `;
    });
    
    container.innerHTML = html;

    // Display History with dynamic colors based on the new 5/2 logic
    const past = Object.keys(predictions).filter(id => predictions[id].points !== null && predictions[id].points !== undefined);
    if(past.length > 0) {
        container.insertAdjacentHTML('beforeend', `<h3 class="font-black text-sm uppercase opacity-50 mb-2 mt-6 px-2">History</h3>`);
        past.forEach(id => {
            const p = predictions[id];
            // Green if 5+ (meaning exact or doubled), Blue if 2+, Grey if 0
            const color = p.points >= 5 ? 'emerald' : p.points >= 2 ? 'blue' : 'slate';
            const bonusTag = (p.points > p.basePoints) ? `<span class="bg-emerald-500 text-white text-[8px] px-1 rounded ml-1">x2</span>` : '';
            
            container.insertAdjacentHTML('beforeend', `
                <div class="flex justify-between items-center glass p-3 rounded-xl mb-2 border-l-4 border-${color}-500">
                    <span class="text-xs font-bold w-1/2 truncate">${p.hName} ${p.h}-${p.a} ${p.aName}</span>
                    <span class="text-[10px] font-black text-${color}-500 uppercase tracking-widest">+${p.points} Pts ${bonusTag}</span>
                </div>
            `);
        });
    }
}

function renderMatches() {
    const container = document.getElementById('tab-matches');
    let list = savedTeam === 'ALL' ? globalMatches : globalMatches.filter(m => m.homeTeam?.name === savedTeam || m.awayTeam?.name === savedTeam);
    if (list.length === 0) return container.innerHTML = `<div class="text-center py-20 opacity-40 font-bold uppercase text-[10px]">No matches found.</div>`;

    list.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    let currentGroupDate = ""; let html = "";

    list.forEach((m, i) => {
        const isLive = m.status === 'IN_PLAY';
        const matchDate = new Date(m.utcDate);
        const dateString = matchDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const timeString = matchDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

        if (dateString !== currentGroupDate) {
            html += `<div class="w-full bg-black/5 rounded-xl py-2 mt-6 mb-3 text-center text-[10px] font-black uppercase tracking-widest opacity-60 backdrop-blur-sm border border-black/5 shadow-sm">${dateString}</div>`;
            currentGroupDate = dateString;
        }

        html += `
            <div onclick="toggleDetails(${i})" class="glass p-5 rounded-2xl shadow-md border-l-4 ${isLive ? 'border-red-500' : 'border-emerald-500'} active:scale-95 transition mb-4">
                <div class="flex justify-between text-[10px] font-bold opacity-50 mb-3 uppercase tracking-widest">
                    <span class="truncate pr-2">${timeString} • ${m.venue || 'Stadium TBD'}</span>
                    <span class="${isLive ? 'text-red-500 animate-pulse font-black' : ''}">${isLive ? 'LIVE' : m.status}</span>
                </div>
                <div class="flex justify-between items-center text-lg font-black italic tracking-tighter">
                    <div class="flex-1 flex items-center justify-end truncate pr-2 text-right">${m.homeTeam?.tla || m.homeTeam?.name || 'TBD'} <img src="${m.homeTeam?.crest}" class="w-5 h-5 ml-2 object-contain inline"></div>
                    <div class="px-3 py-1 bg-black/5 rounded-lg font-mono">${m.score?.fullTime?.home ?? 0} - ${m.score?.fullTime?.away ?? 0}</div>
                    <div class="flex-1 flex items-center justify-start truncate pl-2 text-left"><img src="${m.awayTeam?.crest}" class="w-5 h-5 mr-2 object-contain inline"> ${m.awayTeam?.tla || m.awayTeam?.name || 'TBD'}</div>
                </div>
                <div id="details-${i}" class="hidden mt-4 pt-4 border-t border-black/5 text-[10px] text-center opacity-60 uppercase font-bold tracking-widest">
                    ${m.stage?.replace('_', ' ') || 'World Cup 2026'} ${m.group ? `- ${m.group}` : ''}
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function renderBracket() {
    const container = document.getElementById('sub-bracket');
    const knockouts = globalMatches.filter(m => m.stage !== 'GROUP_STAGE' && m.stage !== null);
    if(knockouts.length === 0) return container.innerHTML = `<div class="text-center py-20 opacity-40 font-bold uppercase tracking-widest text-[10px]">Bracket available after Group Stages</div>`;

    const stages = { 'LAST_32':[], 'LAST_16':[], 'QUARTER_FINALS':[], 'SEMI_FINALS':[], 'FINAL':[] };
    knockouts.forEach(m => { if(stages[m.stage]) stages[m.stage].push(m); });

    let html = `<div class="flex space-x-6 px-4">`;
    Object.keys(stages).forEach(stageName => {
        if(stages[stageName].length === 0) return;
        html += `<div class="flex flex-col space-y-4 min-w-[160px] justify-around"><h4 class="text-center text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">${stageName.replace('_', ' ')}</h4>`;
        stages[stageName].forEach(m => {
            const isLive = m.status === 'IN_PLAY';
            const hScore = m.score?.fullTime?.home ?? '-'; const aScore = m.score?.fullTime?.away ?? '-';
            html += `
                <div class="glass p-2 rounded-xl text-xs font-bold border-l-2 ${isLive ? 'border-red-500' : 'border-black/10'}">
                    <div class="flex justify-between items-center mb-1"><span class="truncate pr-2">${m.homeTeam?.tla || 'TBD'}</span><span class="${hScore > aScore ? 'primary-text font-black' : ''}">${hScore}</span></div>
                    <div class="flex justify-between items-center"><span class="truncate pr-2">${m.awayTeam?.tla || 'TBD'}</span><span class="${aScore > hScore ? 'primary-text font-black' : ''}">${aScore}</span></div>
                </div>
            `;
        });
        html += `</div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
}

function renderStandings(standings) {
    const container = document.getElementById('sub-groups');
    if (!standings || standings.length === 0) return container.innerHTML = `<div class="text-center py-20 opacity-40 font-bold uppercase tracking-widest text-[10px]">Standings not available yet.</div>`;
    container.innerHTML = standings.filter(g => g.type === 'TOTAL').map(group => `
        <div class="glass p-4 rounded-2xl shadow-md mb-4"><h3 class="font-black primary-text mb-3 border-b border-black/5 pb-2 text-xs uppercase">${group.group}</h3>
            <div class="space-y-2">
                ${group.table.map(team => `
                    <div class="flex justify-between items-center text-[10px]"><div class="flex items-center gap-2 w-1/2"><span class="opacity-40 w-3">${team.position}</span><img src="${team.team.crest}" class="w-4 h-4 object-contain"><span class="font-bold truncate">${team.team.tla || team.team.name}</span></div><div class="flex gap-3 font-mono opacity-80 w-1/2 justify-end"><span title="Played">${team.playedGames}P</span><span title="Goal Diff">${team.goalDifference}GD</span><span class="font-black text-emerald-500">${team.points}pts</span></div></div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function renderScorers(scorers) {
    const container = document.getElementById('tab-stats');
    if (!scorers || scorers.length === 0) return container.innerHTML = `<h2 class="text-xl font-black primary-text mb-4 text-center">GOLDEN BOOT</h2><div class="glass p-5 rounded-2xl text-center opacity-40 text-[10px] font-bold uppercase py-10">No goals recorded yet.</div>`;
    container.innerHTML = `<h2 class="text-xl font-black primary-text mb-4 text-center">GOLDEN BOOT</h2><div class="glass p-5 rounded-2xl shadow-md">
        ${scorers.map((s, i) => `
            <div class="flex justify-between items-center py-3 border-b border-black/5 last:border-0"><div class="flex items-center gap-3"><span class="opacity-30 text-[10px]">${i+1}</span><span class="font-bold text-xs">${s.player.name}</span><img src="${s.team.crest}" class="w-4 h-4 object-contain"></div><span class="font-black text-emerald-500">${s.goals} ⚽</span></div>
        `).join('')}
    </div>`;
}

// --- SYSTEM & UTILS ---
window.updatePWA = () => {
    triggerHaptic('heavy');
    const btn = document.getElementById('update-btn'); const icon = document.getElementById('update-icon');
    icon.classList.add('animate-spin'); btn.classList.add('opacity-50'); btn.disabled = true;
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg) { reg.update().then(() => setTimeout(() => window.location.reload(true), 500)); } else window.location.reload(true);
        });
    } else window.location.reload(true);
};

window.manualSync = async () => {
    triggerHaptic('heavy');
    const btn = document.getElementById('sync-btn'); const icon = document.getElementById('sync-icon');
    icon.classList.add('animate-spin'); btn.classList.add('opacity-50'); btn.disabled = true;
    await fetchAllData();
    setTimeout(() => { icon.classList.remove('animate-spin'); btn.classList.remove('opacity-50'); btn.disabled = false; }, 800);
};

window.nukeCache = () => {
    triggerHaptic('heavy');
    if(confirm("Clear all data and reset app?")) {
        localStorage.clear();
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
        window.location.reload(true);
    }
};

function switchTab(t) {
    triggerHaptic('light');
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    ['matches', 'groups', 'predict', 'stats', 'settings'].forEach(id => {
        const btn = document.getElementById(`btn-${id}`);
        btn.classList.toggle('primary-text', id === t); btn.classList.toggle('opacity-40', id !== t);
    });
}

window.switchSubTab = (sub) => {
    triggerHaptic('light');
    document.getElementById('sub-groups').classList.toggle('hidden', sub !== 'groups');
    document.getElementById('sub-bracket').classList.toggle('hidden', sub !== 'bracket');
    document.getElementById('btnSubGroups').classList.toggle('active', sub === 'groups');
    document.getElementById('btnSubBracket').classList.toggle('active', sub === 'bracket');
};

function toggleDetails(i) { triggerHaptic('light'); const el = document.getElementById(`details-${i}`); if(el) el.classList.toggle('hidden'); }

function populateTeamSelector() {
    const s = document.getElementById('my-team-selector');
    const teams = [...new Set(globalMatches.map(m => [m.homeTeam?.name, m.awayTeam?.name]).flat())].filter(Boolean).sort();
    const current = s.value;
    s.innerHTML = '<option value="ALL">Global View</option>' + teams.map(t => `<option value="${t}">${t}</option>`).join('');
    s.value = current;
    s.onchange = (e) => { triggerHaptic('light'); savedTeam = e.target.value; localStorage.setItem('myTeam', savedTeam); renderMatches(); };
}

function setupNotificationButton() {
    if (!("Notification" in window) || Notification.permission === "granted" || document.getElementById('notify-btn-container')) return;
    const settingsTab = document.getElementById('tab-settings');
    if(settingsTab) settingsTab.insertAdjacentHTML('afterbegin', `<button id="notify-btn-container" onclick="Notification.requestPermission().then(()=>window.location.reload())" class="w-full py-4 mb-4 bg-blue-500/10 text-blue-500 rounded-xl text-xs font-black uppercase tracking-widest">🔔 Enable Goal Alerts</button>`);
}

document.addEventListener('DOMContentLoaded', () => {
    setupNotificationButton(); 
    const saved = localStorage.getItem('WC_Theme') === 'true'; applyTheme(saved);
    fetchAllData();
});
