const API_URL = 'https://wc2026-proxy.baldynapperrwe.workers.dev'; 

const UK_TV_GUIDE = {
    "Mexico-South Africa": "ITV", "USA-Paraguay": "BBC", "England-Croatia": "ITV",
    "England-Ghana": "BBC", "Panama-England": "ITV", "Scotland-Haiti": "BBC",
    "Scotland-Morocco": "ITV", "Scotland-Brazil": "BBC"
};

let globalMatches = [];
let savedTeam = localStorage.getItem('myTeam') || 'ALL';
let refreshInterval = parseInt(localStorage.getItem('refreshRate')) || 60000;
let fetchTimeout;
let previousScores = {}; 
let predictions = JSON.parse(localStorage.getItem('wc_predictions')) || {};
let myUsername = localStorage.getItem('wc_username') || '';
let myLeagueId = localStorage.getItem('wc_leagueId') || '';
let currentTotalPoints = 0;
let currentExactPicks = 0; // V10 Sniper tracking

// --- SENSORY & VISUAL ENGINE (V10) ---
function triggerHaptic(type = 'light') {
    if (!navigator.vibrate) return;
    const patterns = { light: 50, success: [50, 50, 50], goal: [200, 100, 200, 100, 500], heavy: 150 };
    navigator.vibrate(patterns[type] || 50);
}

function playGoalSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const playTone = (freq, t, d) => {
            const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'square';
            o.frequency.setValueAtTime(freq, ctx.currentTime+t); g.gain.setValueAtTime(0.1, ctx.currentTime+t);
            o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+d);
        };
        playTone(659.25, 0, 0.15); playTone(880.00, 0.2, 0.4); 
    } catch(e) {}
}

function fireConfetti() {
    if(window.confetti) {
        triggerHaptic('success');
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, zIndex: 9999, colors: ['#10b981', '#3b82f6', '#ffffff'] });
    }
}

// Pseudo-Random Win Probability Generator (Keeps it consistent based on team names)
function getWinProb(h, a) {
    if(!h || !a) return { h: 33, d: 34, a: 33 };
    const hash = (h.length * a.length + h.charCodeAt(0) + a.charCodeAt(0)) % 100;
    const homeProb = 20 + (hash % 40); 
    const awayProb = 20 + ((hash * 3) % 40); 
    return { h: homeProb, d: 100 - homeProb - awayProb, a: awayProb };
}

// --- DATA ENGINE ---
async function fetchAllData() {
    clearTimeout(fetchTimeout);
    const indicator = document.getElementById('api-indicator');
    try {
        const [mR, gR, sR] = await Promise.all([
            fetch(`${API_URL}?endpoint=matches`), fetch(`${API_URL}?endpoint=standings`), fetch(`${API_URL}?endpoint=scorers`)
        ]);
        const mD = await mR.json(); const gD = await gR.json(); const sD = await sR.json();
        globalMatches = mD.matches || [];
        
        checkGoalAlerts(globalMatches);
        evalPredictions(); 
        if(myLeagueId) fetchLeagueTable();

        renderMatches();
        renderPredictor();
        renderStandings(gD.standings || []);
        renderBracket(); 
        renderScorers(sD.scorers || []);
        populateTeamSelector();
        indicator.className = "w-3 h-3 rounded-full bg-emerald-500 shadow-lg";
    } catch (e) { indicator.className = "w-3 h-3 rounded-full bg-red-500 shadow-lg"; }
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
                
                // V10 Confetti Trigger: If your selected team scores!
                const scoringTeam = currentH > prev.home ? match.homeTeam : match.awayTeam;
                if (savedTeam !== 'ALL' && scoringTeam.name === savedTeam) {
                    fireConfetti();
                }

                if (("Notification" in window) && Notification.permission === "granted") {
                    if (savedTeam === 'ALL' || match.homeTeam?.name === savedTeam || match.awayTeam?.name === savedTeam) {
                        new Notification(`⚽ GOAL ${scoringTeam.tla}!`, {
                            body: `${match.homeTeam.tla} ${currentH} - ${currentA} ${match.awayTeam.tla}`,
                            icon: scoringTeam.crest || ''
                        });
                    }
                }
            }
            previousScores[match.id] = { home: currentH, away: currentA };
        }
    });
}

// --- PREDICTOR & SCORING ---
function evalPredictions() {
    let ptsCounter = 0; let exactsCounter = 0; let changed = false;
    const groupTracker = {};
    globalMatches.forEach(m => { if (m.stage === 'GROUP_STAGE' && m.group) { if (!groupTracker[m.group]) groupTracker[m.group] = []; groupTracker[m.group].push(m); } });

    for (let id in predictions) {
        const match = globalMatches.find(m => m.id == id);
        if (match && match.status === 'FINISHED') {
            const aH = match.score.fullTime.home; const aA = match.score.fullTime.away;
            const pH = predictions[id].h; const pA = predictions[id].a;
            const prevBase = predictions[id].basePoints;
            let base = 0;
            
            if (aH === pH && aA === pA) base = 5;
            else if ((aH-aA > 0 && pH-pA > 0) || (aH-aA < 0 && pH-pA < 0) || (aH-aA === 0 && pH-pA === 0)) base = 2;
            
            if (predictions[id].basePoints !== base) { 
                predictions[id].basePoints = base; changed = true; 
                // V10 Confetti Trigger: You got a perfect 5 point prediction!
                if (base === 5) setTimeout(fireConfetti, 800); 
            }
        }
    }

    for (let id in predictions) {
        const match = globalMatches.find(m => m.id == id);
        let final = predictions[id].basePoints;
        if (final === 5) exactsCounter++; // Track exacts for Sniper Badge

        if (final !== null && match && match.stage === 'GROUP_STAGE' && match.group) {
            const gM = groupTracker[match.group];
            if (gM && gM.every(m => m.status === 'FINISHED' && predictions[m.id] && predictions[m.id].basePoints === 5)) final *= 2; 
        }
        if (predictions[id].points !== final) { predictions[id].points = final; changed = true; }
        if (predictions[id].points) ptsCounter += predictions[id].points;
    }
    
    localStorage.setItem('wc_predictions', JSON.stringify(predictions));
    
    if (ptsCounter !== currentTotalPoints || exactsCounter !== currentExactPicks || changed) {
        currentTotalPoints = ptsCounter;
        currentExactPicks = exactsCounter;
        if(document.getElementById('predict-points')) document.getElementById('predict-points').innerText = currentTotalPoints;
        syncPointsToCloud(); 
    }
}

// --- CLOUDFLARE SYNC & BADGES (V10) ---
async function syncPointsToCloud() {
    if (!myUsername || !myLeagueId) return; 
    try {
        await fetch(`${API_URL}?endpoint=league&leagueId=${myLeagueId}`, {
            method: 'POST',
            body: JSON.stringify({ username: myUsername, points: currentTotalPoints, exacts: currentExactPicks }),
            headers: { 'Content-Type': 'application/json' }
        });
        fetchLeagueTable(); 
    } catch(e) {}
}

async function fetchLeagueTable() {
    if (!myLeagueId) return;
    try {
        const res = await fetch(`${API_URL}?endpoint=league&leagueId=${myLeagueId}`); const data = await res.json();
        const container = document.getElementById('league-rankings');
        if (!data.length) return container.innerHTML = `<div class="p-6 text-center opacity-40 text-[10px] uppercase font-bold">No players found.</div>`;
        
        container.innerHTML = data.map((player, index) => {
            const isMe = player.username === myUsername;
            let medal = index < 3 ? ['🥇','🥈','🥉'][index] : `<span class="opacity-30 text-[10px] w-6 text-center">${index+1}</span>`;
            
            // V10: Sniper & Spoon Badges
            let badges = '';
            if ((player.exacts || 0) >= 3) badges += `<span class="ml-2 text-xs" title="Sniper: 3+ Exact Picks">🎯</span>`;
            if (index === data.length - 1 && data.length > 2) badges += `<span class="ml-1 text-xs" title="Wooden Spoon">🥄</span>`;

            return `
                <div class="flex justify-between items-center p-4 border-b border-black/5 last:border-0 ${isMe ? 'bg-emerald-500/10' : ''}">
                    <div class="flex items-center gap-4">
                        ${medal}
                        <span class="font-black text-sm ${isMe ? 'text-emerald-500' : ''}">${player.username} ${badges}</span>
                    </div>
                    <span class="font-black text-xl font-mono ${isMe ? 'text-emerald-500' : ''}">${player.points}</span>
                </div>
            `;
        }).join('');
    } catch(e) {}
}

// --- UI ACCORDION ---
window.toggleDateGroup = (dateId) => {
    triggerHaptic('light');
    document.getElementById(`header-${dateId}`).classList.toggle('open');
    document.getElementById(`drawer-${dateId}`).classList.toggle('open');
};

function getTvBadge(h, a) {
    const channel = UK_TV_GUIDE[`${h}-${a}`] || UK_TV_GUIDE[`${a}-${h}`];
    if (!channel) return '';
    const style = channel === "BBC" ? "bg-black text-white" : "bg-blue-900 text-cyan-300 border-cyan-300/30";
    return `<span class="${style} px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest ml-2 border border-white/10 shadow-sm">${channel}</span>`;
}

// --- RENDER MATCHES (V10 - Auto Collapsed + Win Probabilities) ---
function renderMatches() {
    const container = document.getElementById('tab-matches');
    let list = savedTeam === 'ALL' ? globalMatches : globalMatches.filter(m => m.homeTeam?.name === savedTeam || m.awayTeam?.name === savedTeam);
    if (!list.length) return container.innerHTML = `<div class="text-center py-20 opacity-40 font-bold uppercase text-[10px]">No matches found.</div>`;

    list.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    const groups = {};
    list.forEach(m => {
        const dStr = new Date(m.utcDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        if(!groups[dStr]) groups[dStr] = []; groups[dStr].push(m);
    });

    let html = "";
    Object.keys(groups).forEach((date, index) => {
        const matches = groups[date]; const dateId = `date-${index}`;
        
        // V10: Removed 'open' class so they are auto-collapsed
        html += `
            <div class="mb-4">
                <div id="header-${dateId}" onclick="toggleDateGroup('${dateId}')" class="date-header glass flex justify-between items-center px-4 py-3 rounded-2xl shadow-sm border border-black/5">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-black uppercase tracking-widest opacity-60">${date}</span>
                        <span class="text-[8px] font-bold primary-text uppercase">${matches.length} MATCH${matches.length > 1 ? 'ES' : ''}</span>
                    </div>
                    <svg class="w-4 h-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
                
                <div id="drawer-${dateId}" class="match-drawer mt-3 space-y-4 px-1">
                    ${matches.map((m, i) => {
                        const isLive = m.status === 'IN_PLAY';
                        const tStr = new Date(m.utcDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                        const tv = getTvBadge(m.homeTeam?.name, m.awayTeam?.name);
                        const stageDisplay = m.group ? `GROUP ${m.group.split('_')[1]}` : m.stage.replace('_', ' ');
                        const prob = getWinProb(m.homeTeam?.tla, m.awayTeam?.tla); // V10 Probabilities

                        return `
                            <div onclick="toggleDetails(${i})" class="glass p-5 rounded-2xl shadow-md border-l-4 ${isLive ? 'border-red-500' : 'border-emerald-500'} active:scale-95 transition">
                                <div class="flex justify-between items-center mb-3">
                                    <span class="stage-tag">${stageDisplay}</span>
                                    <div class="flex items-center gap-2">${tv}<span class="text-[10px] font-bold opacity-40 uppercase">${tStr}</span></div>
                                </div>
                                <div class="flex justify-between items-center text-lg font-black italic tracking-tighter">
                                    <div class="flex-1 flex items-center justify-end truncate pr-2 text-right">${m.homeTeam?.tla || 'TBD'} <img src="${m.homeTeam?.crest}" class="w-5 h-5 ml-2 object-contain inline"></div>
                                    <div class="px-3 py-1 bg-black/5 rounded-lg font-mono">${m.score.fullTime.home ?? 0} - ${m.score.fullTime.away ?? 0}</div>
                                    <div class="flex-1 flex items-center justify-start truncate pl-2 text-left"><img src="${m.awayTeam?.crest}" class="w-5 h-5 mr-2 object-contain inline"> ${m.awayTeam?.tla || 'TBD'}</div>
                                </div>
                                
                                <div id="details-${i}" class="hidden mt-4 pt-4 border-t border-black/5">
                                    <div class="text-[8px] font-black uppercase tracking-widest opacity-40 text-center mb-1">Win Probability</div>
                                    <div class="w-full h-1.5 flex rounded-full overflow-hidden opacity-80 mb-1">
                                        <div style="width: ${prob.h}%" class="bg-blue-500"></div>
                                        <div style="width: ${prob.d}%" class="bg-slate-400"></div>
                                        <div style="width: ${prob.a}%" class="bg-red-500"></div>
                                    </div>
                                    <div class="flex justify-between text-[7px] font-black uppercase tracking-widest opacity-40 mb-3">
                                        <span>${prob.h}%</span><span>DRAW ${prob.d}%</span><span>${prob.a}%</span>
                                    </div>
                                    <div class="text-[9px] text-center opacity-40 font-bold uppercase tracking-widest">${m.venue || 'Stadium TBD'}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

// --- STANDARD UTILS ---
window.savePrediction = (id, hN, aN) => { triggerHaptic('success'); const h = document.getElementById(`pred-h-${id}`).value; const a = document.getElementById(`pred-a-${id}`).value; if(h===""||a==="") return alert("Enter scores!"); predictions[id] = { h: parseInt(h), a: parseInt(a), hName: hN, aName: aN, basePoints: null, points: null }; localStorage.setItem('wc_predictions', JSON.stringify(predictions)); document.getElementById(`btn-save-${id}`).innerHTML = "Saved! ✔️"; setTimeout(() => evalPredictions(), 500); };
window.joinLeague = () => { triggerHaptic('heavy'); const u = document.getElementById('setup-username').value.trim(); const l = document.getElementById('setup-league-id').value.trim().toLowerCase().replace(/\s+/g, '-'); if(!u || !l) return alert("Enter Name & ID!"); myUsername = u; myLeagueId = l; localStorage.setItem('wc_username', u); localStorage.setItem('wc_leagueId', l); renderLeagueUI(); evalPredictions(); syncPointsToCloud(); };
window.leaveLeague = () => { if(confirm("Leave league?")) { myUsername = ''; myLeagueId = ''; localStorage.removeItem('wc_username'); localStorage.removeItem('wc_leagueId'); renderLeagueUI(); } };
function renderLeagueUI() { const s = document.getElementById('league-setup'); const b = document.getElementById('league-board'); if (myUsername && myLeagueId) { s.classList.add('hidden'); b.classList.remove('hidden'); document.getElementById('display-league-id').innerText = myLeagueId; fetchLeagueTable(); } else { s.classList.remove('hidden'); b.classList.add('hidden'); } }
window.switchPredictTab = (t) => { triggerHaptic('light'); document.getElementById('sub-picks').classList.toggle('hidden', t !== 'picks'); document.getElementById('sub-league').classList.toggle('hidden', t !== 'league'); document.getElementById('btnSubPicks').classList.toggle('active', t === 'picks'); document.getElementById('btnSubLeague').classList.toggle('active', t === 'league'); if(t === 'league') renderLeagueUI(); };

function renderPredictor() {
    const c = document.getElementById('predict-container'); let u = globalMatches.filter(m => m.status === 'TIMED' || m.status === 'SCHEDULED'); u.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)); u = u.slice(0, 10); 
    if (!u.length) return c.innerHTML = `<div class="glass p-5 rounded-2xl text-center opacity-40 font-bold text-xs uppercase">No upcoming matches.</div>`;
    let html = ""; let cD = "";
    u.forEach(m => {
        const dStr = new Date(m.utcDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        if (dStr !== cD) { html += `<div class="text-[9px] font-black uppercase tracking-widest opacity-40 mt-4 mb-2 text-center">${dStr}</div>`; cD = dStr; }
        const p = predictions[m.id];
        html += `<div class="glass p-4 rounded-2xl shadow-md border border-black/5 mb-4"><div class="flex justify-between items-center mb-3"><span class="stage-tag">${m.group?'GROUP '+m.group.split('_')[1]:m.stage.replace('_',' ')}</span><span class="text-[9px] font-bold opacity-30">${new Date(m.utcDate).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div><div class="flex items-center justify-between"><div class="flex flex-col items-center w-1/3"><img src="${m.homeTeam?.crest}" class="w-6 h-6 mb-1 object-contain"><span class="text-[10px] font-black uppercase truncate">${m.homeTeam?.tla || 'TBD'}</span></div><div class="flex space-x-2 items-center w-1/3 justify-center"><input id="pred-h-${m.id}" type="number" min="0" value="${p?p.h:''}" class="w-10 h-10 bg-black/5 text-center font-black rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"><span class="opacity-30 font-black">-</span><input id="pred-a-${m.id}" type="number" min="0" value="${p?p.a:''}" class="w-10 h-10 bg-black/5 text-center font-black rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"></div><div class="flex flex-col items-center w-1/3"><img src="${m.awayTeam?.crest}" class="w-6 h-6 mb-1 object-contain"><span class="text-[10px] font-black uppercase truncate">${m.awayTeam?.tla || 'TBD'}</span></div></div><button id="btn-save-${m.id}" onclick="savePrediction(${m.id}, '${m.homeTeam?.name}', '${m.awayTeam?.name}')" class="w-full mt-4 py-2 bg-blue-500/10 text-blue-500 font-black text-[10px] uppercase rounded-xl">${p ? 'Update Pick' : 'Save Pick'}</button></div>`;
    });
    const past = Object.keys(predictions).filter(id => predictions[id].points !== null).sort((a,b)=>b-a);
    if(past.length) {
        html += `<h3 class="font-black text-sm uppercase opacity-50 mb-2 mt-8 px-2 text-center">Prediction History</h3>`;
        past.forEach(id => {
            const p = predictions[id]; const color = p.points >= 5 ? 'emerald' : p.points >= 2 ? 'blue' : 'slate';
            const bonus = (p.points > p.basePoints) ? `<span class="bg-emerald-500 text-white text-[7px] px-1 rounded ml-1 font-black">DOUBLE</span>` : '';
            html += `<div class="flex justify-between items-center glass p-3 rounded-xl mb-2 border-l-4 border-${color}-500"><span class="text-[10px] font-bold w-1/2 truncate">${p.hName} ${p.h}-${p.a} ${p.aName}</span><span class="text-[9px] font-black text-${color}-500 uppercase">+${p.points} PTS ${bonus}</span></div>`;
        });
    }
    c.innerHTML = html;
}

function renderStandings(s) { const c = document.getElementById('sub-groups'); if (!s || !s.length) return c.innerHTML = `<div class="text-center py-20 opacity-40 font-bold uppercase text-[10px]">No data.</div>`; c.innerHTML = s.filter(g => g.type === 'TOTAL').map(group => `<div class="glass p-4 rounded-2xl shadow-md mb-4"><h3 class="font-black primary-text mb-3 border-b border-black/5 pb-2 text-[10px] uppercase">${group.group.replace('_',' ')}</h3><div class="space-y-2">${group.table.map(team => `<div class="flex justify-between items-center text-[10px]"><div class="flex items-center gap-2 w-1/2"><span class="opacity-40 w-3">${team.position}</span><img src="${team.team.crest}" class="w-4 h-4 object-contain"><span class="font-bold truncate">${team.team.tla}</span></div><div class="flex gap-3 font-mono opacity-80 w-1/2 justify-end"><span>${team.playedGames}P</span><span class="font-black text-emerald-500">${team.points}pts</span></div></div>`).join('')}</div></div>`).join(''); }
function renderScorers(s) { const c = document.getElementById('tab-stats'); if (!s || !s.length) return c.innerHTML = `<h2 class="text-xl font-black primary-text mb-4 text-center">GOLDEN BOOT</h2><div class="glass p-5 rounded-2xl text-center opacity-40 text-[10px] uppercase py-10">No data.</div>`; c.innerHTML = `<h2 class="text-xl font-black primary-text mb-4 text-center">GOLDEN BOOT</h2><div class="glass p-5 rounded-2xl shadow-md">${s.map((player, i) => `<div class="flex justify-between items-center py-3 border-b border-black/5 last:border-0"><div class="flex items-center gap-3"><span class="opacity-30 text-[10px]">${i+1}</span><span class="font-bold text-xs">${player.player.name}</span><img src="${player.team.crest}" class="w-4 h-4 object-contain"></div><span class="font-black text-emerald-500">${player.goals} ⚽</span></div>`).join('')}</div>`; }
function renderBracket() { const c = document.getElementById('sub-bracket'); const k = globalMatches.filter(m => m.stage !== 'GROUP_STAGE' && m.stage !== null); if(!k.length) return c.innerHTML = `<div class="text-center py-20 opacity-40 font-bold uppercase text-[10px]">Bracket available soon.</div>`; const stages = { 'ROUND_OF_32':[], 'ROUND_OF_16':[], 'QUARTER_FINALS':[], 'SEMI_FINALS':[], 'FINAL':[] }; k.forEach(m => { if(stages[m.stage]) stages[m.stage].push(m); }); let html = `<div class="flex space-x-6 px-4">`; Object.keys(stages).forEach(n => { if(!stages[n].length) return; html += `<div class="flex flex-col space-y-4 min-w-[160px] justify-around"><h4 class="text-center text-[9px] font-black uppercase opacity-40 mb-2">${n.replace('_',' ')}</h4>`; stages[n].forEach(m => { const hS = m.score.fullTime.home??'-'; const aS = m.score.fullTime.away??'-'; html += `<div class="glass p-2 rounded-xl text-xs font-bold border-l-2 ${m.status==='IN_PLAY'?'border-red-500':'border-black/10'}"><div class="flex justify-between items-center mb-1"><span class="truncate pr-2">${m.homeTeam?.tla||'TBD'}</span><span class="${hS>aS?'primary-text':''}">${hS}</span></div><div class="flex justify-between items-center"><span class="truncate pr-2">${m.awayTeam?.tla||'TBD'}</span><span class="${aS>hS?'primary-text':''}">${aS}</span></div></div>`; }); html += `</div>`; }); html += `</div>`; c.innerHTML = html; }

window.updatePWA = () => { triggerHaptic('heavy'); document.getElementById('update-icon').classList.add('animate-spin'); if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistration().then(r => { if (r) r.update().then(() => window.location.reload(true)); else window.location.reload(true); }); } else window.location.reload(true); };
window.manualSync = async () => { triggerHaptic('heavy'); const i = document.getElementById('sync-icon'); i.classList.add('animate-spin'); await fetchAllData(); setTimeout(() => i.classList.remove('animate-spin'), 800); };
window.nukeCache = () => { triggerHaptic('heavy'); if(confirm("Reset all data?")) { localStorage.clear(); navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister())); window.location.reload(true); } };
function switchTab(t) { triggerHaptic('light'); document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); document.getElementById(`tab-${t}`).classList.add('active'); ['matches', 'groups', 'predict', 'stats', 'settings'].forEach(id => { const b = document.getElementById(`btn-${id}`); b.classList.toggle('primary-text', id === t); b.classList.toggle('opacity-40', id !== t); }); }
window.switchSubTab = (s) => { triggerHaptic('light'); document.getElementById('sub-groups').classList.toggle('hidden', s !== 'groups'); document.getElementById('sub-bracket').classList.toggle('hidden', s !== 'bracket'); document.getElementById('btnSubGroups').classList.toggle('active', s === 'groups'); document.getElementById('btnSubBracket').classList.toggle('active', s === 'bracket'); };
function toggleDetails(i) { triggerHaptic('light'); const el = document.getElementById(`details-${i}`); if(el) el.classList.toggle('hidden'); }
function populateTeamSelector() { const s = document.getElementById('my-team-selector'); const t = [...new Set(globalMatches.map(m => [m.homeTeam?.name, m.awayTeam?.name]).flat())].filter(Boolean).sort(); const c = s.value; s.innerHTML = '<option value="ALL">Global View</option>' + t.map(name => `<option value="${name}">${name}</option>`).join(''); s.value = c; s.onchange = (e) => { triggerHaptic('light'); savedTeam = e.target.value; localStorage.setItem('myTeam', savedTeam); renderMatches(); }; }
function applyTheme(s) { document.body.classList.toggle('dark-mode', s); const m = document.getElementById('theme-meta'); if(m) m.content = s ? "#000000" : "#f2f2f7"; const bL = document.getElementById('btnLight'), bD = document.getElementById('btnDark'); if (bL && bD) { bL.classList.toggle('active', !s); bD.classList.toggle('active', s); } }
document.addEventListener('DOMContentLoaded', () => { const s = localStorage.getItem('WC_Theme') === 'true'; applyTheme(s); fetchAllData(); });
