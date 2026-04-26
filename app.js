const CF_API_URL = 'https://wc2026-proxy.baldynapperrwe.workers.dev'; 
const ESPN_MATCHES_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260601-20260731&limit=200';
const ESPN_STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings';

// --- COMPLETE GROUP STAGE UK TV BROADCAST GUIDE ---
const UK_TV_GUIDE = {
    "Mexico-South Africa": "ITV", "South Korea-Play-off D": "ITV", "Canada-Play-off A": "BBC",
    "USA-Paraguay": "BBC", "Qatar-Switzerland": "ITV", "Brazil-Morocco": "BBC",
    "Australia-Play-off C": "ITV", "Scotland-Haiti": "BBC", "Germany-Curacao": "ITV",
    "Netherlands-Japan": "ITV", "Play-off B-Tunisia": "ITV", "Ivory Coast-Ecuador": "BBC",
    "Spain-Cape Verde": "ITV", "Belgium-Egypt": "BBC", "Saudi Arabia-Uruguay": "ITV",
    "Iran-New Zealand": "BBC", "France-Senegal": "BBC", "Play-off 2-Norway": "BBC",
    "Argentina-Algeria": "ITV", "Austria-Jordan": "BBC", "Portugal-Play-off 1": "BBC",
    "England-Croatia": "ITV", "Ghana-Panama": "ITV", "Uzbekistan-Colombia": "BBC", 
    "South Africa-Play-off D": "BBC", "Play-off A-Switzerland": "ITV", "Canada-Qatar": "ITV", 
    "Mexico-South Korea": "BBC", "USA-Australia": "BBC", "Scotland-Morocco": "ITV", 
    "Paraguay-Play-off C": "ITV", "Brazil-Haiti": "ITV", "Netherlands-Play-off B": "BBC", 
    "Germany-Ivory Coast": "ITV", "Japan-Tunisia": "BBC", "Curacao-Ecuador": "BBC", 
    "Spain-Saudi Arabia": "BBC", "Belgium-Iran": "ITV", "Cape Verde-Uruguay": "BBC", 
    "Egypt-New Zealand": "ITV", "Argentina-Austria": "BBC", "France-Play-off 2": "BBC", 
    "Senegal-Norway": "ITV", "Algeria-Jordan": "ITV", "Portugal-Uzbekistan": "ITV", 
    "England-Ghana": "BBC", "Croatia-Panama": "BBC", "Colombia-Play-off 1": "ITV", 
    "Canada-Switzerland": "ITV", "Play-off A-Qatar": "ITV", "Scotland-Brazil": "BBC", 
    "Morocco-Haiti": "BBC", "Mexico-Play-off D": "BBC", "South Africa-South Korea": "BBC", 
    "Germany-Ecuador": "BBC", "Curacao-Ivory Coast": "BBC", "USA-Play-off C": "ITV", 
    "Paraguay-Australia": "ITV", "Japan-Play-off B": "BBC", "Netherlands-Tunisia": "BBC", 
    "France-Norway": "ITV", "Senegal-Play-off 2": "ITV", "Cape Verde-Saudi Arabia": "ITV", 
    "Uruguay-Spain": "ITV", "Egypt-Iran": "BBC", "New Zealand-Belgium": "BBC", 
    "England-Panama": "ITV", "Croatia-Ghana": "ITV", "Algeria-Austria": "BBC", 
    "Argentina-Jordan": "BBC", "Colombia-Portugal": "BBC", "Play-off 1-Uzbekistan": "BBC"
};

let globalMatches = [];
let savedTeam = localStorage.getItem('myTeam') || 'ALL';
let refreshInterval = parseInt(localStorage.getItem('refreshRate')) || 60000;
let fetchTimeout; let previousScores = {}; 
let predictions = JSON.parse(localStorage.getItem('wc_predictions')) || {};
let myUsername = localStorage.getItem('wc_username') || '';
let myLeagueId = localStorage.getItem('wc_leagueId') || '';
let currentTotalPoints = 0; let currentExactPicks = 0;

// --- V12 SENSORY & THEME ENGINE ---
function triggerHaptic(type = 'light') {
    if (!navigator.vibrate) return;
    const p = { light: 30, success: [50, 50, 50], goal: [200, 100, 200, 100, 500], heavy: 100 };
    navigator.vibrate(p[type] || 30);
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
        confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 }, zIndex: 9999, colors: ['#ff0844', '#ffb199', '#f6d365', '#ffffff'] }); 
    } 
}

function applyTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    const m = document.getElementById('theme-meta'); if(m) m.content = isDark ? "#0f172a" : "#ff0844";
    const bL = document.getElementById('btnLight'), bD = document.getElementById('btnDark');
    if (bL && bD) { bL.classList.toggle('active', !isDark); bD.classList.toggle('active', isDark); }
}
window.setThemeMode = (isDark) => { triggerHaptic(); applyTheme(isDark); localStorage.setItem('WC_Theme', isDark); };

function getWinProb(h, a) {
    if(!h || !a) return { h: 33, d: 34, a: 33 };
    const hash = (h.length * a.length + h.charCodeAt(0) + a.charCodeAt(0)) % 100;
    const hP = 20 + (hash % 40); const aP = 20 + ((hash * 3) % 40); 
    return { h: hP, d: 100 - hP - aP, a: aP };
}

// --- DATA ENGINE ---
async function fetchAllData() {
    clearTimeout(fetchTimeout); const ind = document.getElementById('api-indicator');
    try {
        // 1. Fetch ESPN Matches
        const mRes = await fetch(ESPN_MATCHES_URL); const mData = await mRes.json();
        globalMatches = mData.events.map(e => {
            const comp = e.competitions[0];
            const home = comp.competitors.find(c => c.homeAway === 'home') || comp.competitors[0];
            const away = comp.competitors.find(c => c.homeAway === 'away') || comp.competitors[1];
            let status = 'TIMED'; if (e.status.type.state === 'in') status = 'IN_PLAY'; else if (e.status.type.state === 'post') status = 'FINISHED';
            let stage = 'GROUP_STAGE'; let group = ''; const nL = e.name.toLowerCase();
            if (nL.includes('group')) { stage = 'GROUP_STAGE'; const match = nL.match(/group\s+([a-z])/); if(match) group = 'GROUP_' + match[1].toUpperCase(); } 
            else if (nL.includes('16')) stage = 'ROUND_OF_16'; else if (nL.includes('quarter')) stage = 'QUARTER_FINALS'; else if (nL.includes('semi')) stage = 'SEMI_FINALS'; else if (nL.includes('final')) stage = 'FINAL';
            return { id: e.id, utcDate: e.date, status: status, stage: stage, group: group, venue: comp.venue?.fullName || 'Stadium TBD', homeTeam: { name: home.team.displayName, tla: home.team.abbreviation, crest: home.team.logo }, awayTeam: { name: away.team.displayName, tla: away.team.abbreviation, crest: away.team.logo }, score: { fullTime: { home: parseInt(home.score)||0, away: parseInt(away.score)||0 } } };
        });

        // 2. Fetch ESPN Standings
        let parsedStandings = [];
        try {
            const stRes = await fetch(ESPN_STANDINGS_URL); const stData = await stRes.json();
            if(stData.children) {
                parsedStandings = stData.children.map(g => ({ type: 'TOTAL', group: g.name.toUpperCase(), table: g.standings.entries.map((t, i) => ({ position: i + 1, team: { name: t.team.displayName, tla: t.team.abbreviation, crest: t.team.logos?.[0]?.href }, playedGames: t.stats.find(s=>s.name==='gamesPlayed')?.value || 0, goalDifference: t.stats.find(s=>s.name==='pointDifferential')?.value || 0, points: t.stats.find(s=>s.name==='points')?.value || 0 })) }));
            }
        } catch(e) {}

        // 3. Fetch Top Scorers via Cloudflare Proxy (V12.3 Hybrid Fix)
        let parsedScorers = [];
        try {
            const scRes = await fetch(`${CF_API_URL}?endpoint=scorers`);
            const scData = await scRes.json();
            parsedScorers = scData.scorers || [];
        } catch(e) { console.log("Scorers fetch bypassed or failed"); }

        checkGoalAlerts(globalMatches); evalPredictions(); if(myLeagueId) fetchLeagueTable();
        
        renderMatches(); renderPredictor(); renderStandings(parsedStandings); renderBracket(); 
        renderScorers(parsedScorers); // Feed it into the engine!
        populateTeamSelector();

        ind.className = "w-3 h-3 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]";
    } catch (e) { ind.className = "w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"; }
    fetchTimeout = setTimeout(fetchAllData, refreshInterval);
}

function checkGoalAlerts(matches) {
    matches.forEach(match => {
        if (match.status === 'IN_PLAY') {
            const cH = match.score?.fullTime?.home ?? 0; const cA = match.score?.fullTime?.away ?? 0;
            const prev = previousScores[match.id];
            if (prev && (cH > prev.home || cA > prev.away)) {
                triggerHaptic('goal'); playGoalSound();
                const team = cH > prev.home ? match.homeTeam : match.awayTeam;
                if (savedTeam !== 'ALL' && team.name === savedTeam) fireConfetti();
                if (("Notification" in window) && Notification.permission === "granted") {
                    if (savedTeam === 'ALL' || match.homeTeam?.name === savedTeam || match.awayTeam?.name === savedTeam) {
                        new Notification(`⚽ GOAL ${team.tla}!`, { body: `${match.homeTeam.tla} ${cH} - ${cA} ${match.awayTeam.tla}`, icon: team.crest || '' });
                    }
                }
            }
            previousScores[match.id] = { home: cH, away: cA };
        }
    });
}

function evalPredictions() {
    let ptsCounter = 0; let exactsCounter = 0; let changed = false;
    const groupTracker = {}; globalMatches.forEach(m => { if (m.stage === 'GROUP_STAGE' && m.group) { if (!groupTracker[m.group]) groupTracker[m.group] = []; groupTracker[m.group].push(m); } });
    for (let id in predictions) {
        const match = globalMatches.find(m => m.id == id);
        if (match && match.status === 'FINISHED') {
            const aH = match.score.fullTime.home; const aA = match.score.fullTime.away;
            const pH = predictions[id].h; const pA = predictions[id].a;
            let base = 0;
            if (aH === pH && aA === pA) base = 5; else if ((aH-aA > 0 && pH-pA > 0) || (aH-aA < 0 && pH-pA < 0) || (aH-aA === 0 && pH-pA === 0)) base = 2;
            if (predictions[id].basePoints !== base) { predictions[id].basePoints = base; changed = true; if (base === 5) setTimeout(fireConfetti, 800); }
        }
    }
    for (let id in predictions) {
        const match = globalMatches.find(m => m.id == id); let final = predictions[id].basePoints;
        if (final === 5) exactsCounter++; 
        if (final !== null && match && match.stage === 'GROUP_STAGE' && match.group) {
            const gM = groupTracker[match.group];
            if (gM && gM.every(m => m.status === 'FINISHED' && predictions[m.id] && predictions[m.id].basePoints === 5)) final *= 2; 
        }
        if (predictions[id].points !== final) { predictions[id].points = final; changed = true; }
        if (predictions[id].points) ptsCounter += predictions[id].points;
    }
    localStorage.setItem('wc_predictions', JSON.stringify(predictions));
    if (ptsCounter !== currentTotalPoints || exactsCounter !== currentExactPicks || changed) {
        currentTotalPoints = ptsCounter; currentExactPicks = exactsCounter;
        if(document.getElementById('predict-points')) document.getElementById('predict-points').innerText = currentTotalPoints;
        syncPointsToCloud(); 
    }
}

async function syncPointsToCloud() {
    if (!myUsername || !myLeagueId) return; 
    try { await fetch(`${CF_API_URL}?endpoint=league&leagueId=${myLeagueId}`, { method: 'POST', body: JSON.stringify({ username: myUsername, points: currentTotalPoints, exacts: currentExactPicks }), headers: { 'Content-Type': 'application/json' } }); fetchLeagueTable(); } catch(e) {}
}

async function fetchLeagueTable() {
    if (!myLeagueId) return;
    try {
        const res = await fetch(`${CF_API_URL}?endpoint=league&leagueId=${myLeagueId}`); const data = await res.json();
        const container = document.getElementById('league-rankings');
        if (!data.length) return container.innerHTML = `<div class="p-6 text-center opacity-40 text-[10px] uppercase font-black">No party guests yet.</div>`;
        container.innerHTML = data.map((player, index) => {
            const isMe = player.username === myUsername;
            let medal = index < 3 ? ['🥇','🥈','🥉'][index] : `<span class="opacity-40 text-xs font-black w-6 text-center">${index+1}</span>`;
            let badges = '';
            if ((player.exacts || 0) >= 3) badges += `<span class="ml-2 text-base drop-shadow-md" title="Sniper: 3+ Exact Picks">🎯</span>`;
            if (index === data.length - 1 && data.length > 2) badges += `<span class="ml-1 text-base drop-shadow-md" title="Wooden Spoon">🥄</span>`;
            return `<div class="flex justify-between items-center p-5 border-b border-white/10 last:border-0 ${isMe ? 'bg-white/10' : ''}"><div class="flex items-center gap-4">${medal}<span class="font-black text-sm tracking-wide ${isMe ? 'primary-text text-lg' : ''}">${player.username} ${badges}</span></div><span class="font-black text-2xl font-mono ${isMe ? 'primary-text drop-shadow-md' : 'opacity-80'}">${player.points}</span></div>`;
        }).join('');
    } catch(e) {}
}

window.toggleDateGroup = (dateId) => { triggerHaptic('light'); document.getElementById(`header-${dateId}`).classList.toggle('open'); document.getElementById(`drawer-${dateId}`).classList.toggle('open'); };
function getTvBadge(h, a) { const channel = UK_TV_GUIDE[`${h}-${a}`] || UK_TV_GUIDE[`${a}-${h}`]; if (!channel) return ''; const style = channel === "BBC" ? "bg-black text-white" : "bg-blue-900 text-cyan-300 border-cyan-300/30"; return `<span class="${style} px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest ml-2 border border-white/10 shadow-sm">${channel}</span>`; }

function renderMatches() {
    const container = document.getElementById('tab-matches');
    let list = savedTeam === 'ALL' ? globalMatches : globalMatches.filter(m => m.homeTeam?.name === savedTeam || m.awayTeam?.name === savedTeam);
    if (!list.length) return container.innerHTML = `<div class="text-center py-20 opacity-40 font-black uppercase text-[10px] tracking-widest">No matches found.</div>`;

    list.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    const groups = {}; list.forEach(m => { const dStr = new Date(m.utcDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }); if(!groups[dStr]) groups[dStr] = []; groups[dStr].push(m); });

    let html = "";
    Object.keys(groups).forEach((date, index) => {
        const matches = groups[date]; const dateId = `date-${index}`;
        html += `
            <div class="mb-4">
                <div id="header-${dateId}" onclick="toggleDateGroup('${dateId}')" class="date-header glass flex justify-between items-center px-5 py-4 rounded-3xl shadow-sm border border-white/20">
                    <div class="flex flex-col"><span class="text-xs font-black uppercase tracking-widest opacity-80">${date}</span><span class="text-[9px] font-black primary-text uppercase mt-1 tracking-widest">${matches.length} MATCH${matches.length > 1 ? 'ES' : ''}</span></div>
                    <svg class="w-5 h-5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"></path></svg>
                </div>
                <div id="drawer-${dateId}" class="match-drawer mt-3 space-y-4 px-1">
                    ${matches.map((m, i) => {
                        const isLive = m.status === 'IN_PLAY'; const tStr = new Date(m.utcDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); const tv = getTvBadge(m.homeTeam?.name, m.awayTeam?.name); const stageDisplay = m.group ? `GROUP ${m.group.split('_')[1]}` : m.stage.replace('_', ' '); const prob = getWinProb(m.homeTeam?.tla, m.awayTeam?.tla);
                        return `
                            <div onclick="toggleDetails(${i})" class="glass p-6 rounded-3xl shadow-lg border-l-4 ${isLive ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'border-transparent'} active:scale-95 transition">
                                <div class="flex justify-between items-center mb-4"><span class="stage-tag shadow-sm">${stageDisplay}</span><div class="flex items-center gap-2">${tv}<span class="text-[10px] font-black opacity-60 uppercase tracking-widest">${tStr}</span></div></div>
                                <div class="flex justify-between items-center text-2xl font-black italic tracking-tighter">
                                    <div class="flex-1 flex items-center justify-end truncate pl-2 pr-2 text-right drop-shadow-md">${m.homeTeam?.tla || 'TBD'} <img src="${m.homeTeam?.crest}" class="w-6 h-6 ml-3 object-contain inline drop-shadow-md"></div>
                                    <div class="px-4 py-2 bg-white/20 rounded-xl font-mono shadow-inner backdrop-blur-sm border border-white/10">${m.score.fullTime.home ?? 0} - ${m.score.fullTime.away ?? 0}</div>
                                    <div class="flex-1 flex items-center justify-start truncate pl-2 text-left drop-shadow-md"><img src="${m.awayTeam?.crest}" class="w-6 h-6 mr-3 object-contain inline drop-shadow-md"> ${m.awayTeam?.tla || 'TBD'}</div>
                                </div>
                                <div id="details-${i}" class="hidden mt-6 pt-5 border-t border-white/10">
                                    <div class="text-[9px] font-black uppercase tracking-widest opacity-60 text-center mb-2">Win Probability</div>
                                    <div class="w-full h-2.5 flex rounded-full overflow-hidden opacity-90 mb-2 shadow-inner bg-black/20">
                                        <div style="width: ${prob.h}%" class="bg-gradient-to-r from-blue-600 to-blue-400"></div><div style="width: ${prob.d}%" class="bg-white/30"></div><div style="width: ${prob.a}%" class="bg-gradient-to-r from-red-400 to-red-600"></div>
                                    </div>
                                    <div class="flex justify-between text-[8px] font-black uppercase tracking-widest opacity-60 mb-4"><span>${prob.h}%</span><span>DRAW ${prob.d}%</span><span>${prob.a}%</span></div>
                                    <div class="text-[10px] text-center opacity-60 font-black uppercase tracking-widest">${m.venue || 'Stadium TBD'}</div>
                                </div>
                            </div>`;
                    }).join('')}
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

window.savePrediction = (id, hN, aN) => { triggerHaptic('success'); const h = document.getElementById(`pred-h-${id}`).value; const a = document.getElementById(`pred-a-${id}`).value; if(h===""||a==="") return alert("Enter scores!"); predictions[id] = { h: parseInt(h), a: parseInt(a), hName: hN, aName: aN, basePoints: null, points: null }; localStorage.setItem('wc_predictions', JSON.stringify(predictions)); document.getElementById(`btn-save-${id}`).innerHTML = "Locked In 🔒"; setTimeout(() => evalPredictions(), 500); };
window.joinLeague = () => { triggerHaptic('heavy'); const u = document.getElementById('setup-username').value.trim(); const l = document.getElementById('setup-league-id').value.trim().toLowerCase().replace(/\s+/g, '-'); if(!u || !l) return alert("Enter Name & ID!"); myUsername = u; myLeagueId = l; localStorage.setItem('wc_username', u); localStorage.setItem('wc_leagueId', l); renderLeagueUI(); evalPredictions(); syncPointsToCloud(); };
window.leaveLeague = () => { if(confirm("Leave party?")) { myUsername = ''; myLeagueId = ''; localStorage.removeItem('wc_username'); localStorage.removeItem('wc_leagueId'); renderLeagueUI(); } };
function renderLeagueUI() { const s = document.getElementById('league-setup'); const b = document.getElementById('league-board'); if (myUsername && myLeagueId) { s.classList.add('hidden'); b.classList.remove('hidden'); document.getElementById('display-league-id').innerText = myLeagueId; fetchLeagueTable(); } else { s.classList.remove('hidden'); b.classList.add('hidden'); } }
window.switchPredictTab = (t) => { triggerHaptic('light'); document.getElementById('sub-picks').classList.toggle('hidden', t !== 'picks'); document.getElementById('sub-league').classList.toggle('hidden', t !== 'league'); document.getElementById('btnSubPicks').classList.toggle('active', t === 'picks'); document.getElementById('btnSubLeague').classList.toggle('active', t === 'league'); if(t === 'league') renderLeagueUI(); };

function renderPredictor() {
    const c = document.getElementById('predict-container'); let u = globalMatches.filter(m => m.status === 'TIMED' || m.status === 'SCHEDULED'); u.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)); u = u.slice(0, 10); 
    if (!u.length) return c.innerHTML = `<div class="glass p-6 rounded-3xl text-center opacity-50 font-black text-xs uppercase tracking-widest">No upcoming matches.</div>`;
    let html = ""; let cD = "";
    u.forEach(m => {
        const dStr = new Date(m.utcDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
        if (dStr !== cD) { html += `<div class="text-[10px] font-black uppercase tracking-widest opacity-60 mt-6 mb-3 text-center">${dStr}</div>`; cD = dStr; }
        const p = predictions[m.id];
        html += `<div class="glass p-6 rounded-3xl shadow-lg border border-white/10 mb-5"><div class="flex justify-between items-center mb-4"><span class="stage-tag shadow-sm">${m.group?'GROUP '+m.group.split('_')[1]:m.stage.replace('_',' ')}</span><span class="text-[10px] font-black opacity-50 tracking-widest">${new Date(m.utcDate).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div><div class="flex items-center justify-between"><div class="flex flex-col items-center w-1/3"><img src="${m.homeTeam?.crest}" class="w-8 h-8 mb-2 object-contain drop-shadow-md"><span class="text-xs font-black uppercase truncate drop-shadow-md px-1">${m.homeTeam?.tla || 'TBD'}</span></div><div class="flex space-x-3 items-center w-1/3 justify-center"><input id="pred-h-${m.id}" type="number" min="0" value="${p?p.h:''}" class="w-12 h-12 bg-white/20 text-center font-black rounded-xl outline-none border border-white/20 shadow-inner text-lg"><span class="opacity-50 font-black text-xl">-</span><input id="pred-a-${m.id}" type="number" min="0" value="${p?p.a:''}" class="w-12 h-12 bg-white/20 text-center font-black rounded-xl outline-none border border-white/20 shadow-inner text-lg"></div><div class="flex flex-col items-center w-1/3"><img src="${m.awayTeam?.crest}" class="w-8 h-8 mb-2 object-contain drop-shadow-md"><span class="text-xs font-black uppercase truncate drop-shadow-md px-1">${m.awayTeam?.tla || 'TBD'}</span></div></div><button id="btn-save-${m.id}" onclick="savePrediction('${m.id}', '${m.homeTeam?.name}', '${m.awayTeam?.name}')" class="w-full mt-6 py-3 gradient-btn font-black text-xs uppercase tracking-widest rounded-2xl active:scale-95 transition shadow-lg">${p ? 'Update Pick' : 'Lock It In 🔒'}</button></div>`;
    });
    const past = Object.keys(predictions).filter(id => predictions[id].points !== null).sort((a,b)=>b-a);
    if(past.length) {
        html += `<h3 class="font-black text-sm uppercase opacity-60 mb-3 mt-10 px-2 text-center tracking-widest">The Archive</h3>`;
        past.forEach(id => {
            const p = predictions[id]; const color = p.points >= 5 ? 'emerald' : p.points >= 2 ? 'blue' : 'slate'; const bonus = (p.points > p.basePoints) ? `<span class="bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-[8px] px-1.5 py-0.5 rounded ml-2 font-black shadow-sm">x2</span>` : '';
            html += `<div class="flex justify-between items-center glass p-4 rounded-2xl mb-3 border-l-4 border-${color}-400"><span class="text-xs font-black w-1/2 truncate drop-shadow-sm pl-1">${p.hName} ${p.h}-${p.a} ${p.aName}</span><span class="text-[10px] font-black text-${color}-400 uppercase tracking-widest">+${p.points} PTS ${bonus}</span></div>`;
        });
    }
    c.innerHTML = html;
}

function renderStandings(s) { const c = document.getElementById('sub-groups'); if (!s || !s.length) return c.innerHTML = `<div class="text-center py-20 opacity-40 font-black uppercase tracking-widest text-[10px]">No ESPN Standings data yet.</div>`; c.innerHTML = s.filter(g => g.type === 'TOTAL').map(group => `<div class="glass p-5 rounded-3xl shadow-lg mb-5 border border-white/10"><h3 class="font-black primary-text mb-4 border-b border-white/10 pb-3 text-xs uppercase tracking-widest">${group.group.replace('_',' ')}</h3><div class="space-y-3">${group.table.map(team => `<div class="flex justify-between items-center text-[10px] font-black"><div class="flex items-center gap-3 w-1/2"><span class="opacity-50 w-4 text-center">${team.position}</span><img src="${team.team.crest}" class="w-5 h-5 object-contain drop-shadow-sm"><span class="truncate tracking-wide px-1">${team.team.tla}</span></div><div class="flex gap-4 font-mono opacity-80 w-1/2 justify-end"><span>${team.playedGames}P</span><span class="primary-text text-sm drop-shadow-sm">${team.points}pts</span></div></div>`).join('')}</div></div>`).join(''); }

// --- V12.3: GOLDEN BOOT RENDERER (Hybrid Fix) ---
function renderScorers(s) { 
    const c = document.getElementById('tab-stats'); 
    if (!s || !s.length) return c.innerHTML = `<h2 class="text-2xl font-black primary-text mb-6 text-center drop-shadow-md">GOLDEN BOOT</h2><div class="glass p-8 rounded-3xl text-center opacity-50 text-xs font-black uppercase tracking-widest">Awaiting First Goal...</div>`; 
    
    c.innerHTML = `<h2 class="text-2xl font-black primary-text mb-6 text-center drop-shadow-md">GOLDEN BOOT</h2><div class="glass p-4 rounded-3xl shadow-lg border border-white/10">` + 
    s.map((player, i) => `
        <div class="flex justify-between items-center py-4 px-2 border-b border-white/10 last:border-0">
            <div class="flex items-center gap-4">
                <span class="opacity-50 text-xs font-black w-4 text-center">${i+1}</span>
                <div class="flex flex-col">
                    <span class="font-black text-sm tracking-wide drop-shadow-sm">${player.player.name}</span>
                    <span class="text-[9px] font-black uppercase tracking-widest opacity-60">${player.team.name}</span>
                </div>
            </div>
            <span class="font-black text-xl primary-text drop-shadow-md">${player.goals} ⚽</span>
        </div>
    `).join('') + `</div>`;
}

function renderBracket() { const c = document.getElementById('sub-bracket'); const k = globalMatches.filter(m => m.stage !== 'GROUP_STAGE' && m.stage !== null); if(!k.length) return c.innerHTML = `<div class="text-center py-20 opacity-40 font-black uppercase tracking-widest text-[10px]">Bracket arriving soon.</div>`; const stages = { 'ROUND_OF_32':[], 'ROUND_OF_16':[], 'QUARTER_FINALS':[], 'SEMI_FINALS':[], 'FINAL':[] }; k.forEach(m => { if(stages[m.stage]) stages[m.stage].push(m); }); let html = `<div class="flex space-x-6 px-4">`; Object.keys(stages).forEach(n => { if(!stages[n].length) return; html += `<div class="flex flex-col space-y-4 min-w-[180px] justify-around"><h4 class="text-center text-[10px] font-black uppercase opacity-60 mb-3 tracking-widest">${n.replace('_',' ')}</h4>`; stages[n].forEach(m => { const hS = m.score.fullTime.home??'-'; const aS = m.score.fullTime.away??'-'; html += `<div class="glass p-3 rounded-2xl text-xs font-black border-l-4 ${m.status==='IN_PLAY'?'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]':'border-white/20'}"><div class="flex justify-between items-center mb-2"><span class="truncate pr-2 drop-shadow-sm pl-1">${m.homeTeam?.tla||'TBD'}</span><span class="${hS>aS?'primary-text text-sm':''}">${hS}</span></div><div class="flex justify-between items-center"><span class="truncate pr-2 drop-shadow-sm pl-1">${m.awayTeam?.tla||'TBD'}</span><span class="${aS>hS?'primary-text text-sm':''}">${aS}</span></div></div>`; }); html += `</div>`; }); html += `</div>`; c.innerHTML = html; }

window.updatePWA = () => { triggerHaptic('heavy'); document.getElementById('update-icon').classList.add('animate-spin'); if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistration().then(r => { if (r) r.update().then(() => window.location.reload(true)); else window.location.reload(true); }); } else window.location.reload(true); };
window.manualSync = async () => { triggerHaptic('heavy'); const i = document.getElementById('sync-icon'); i.classList.add('animate-spin'); await fetchAllData(); setTimeout(() => i.classList.remove('animate-spin'), 800); };
window.nukeCache = () => { triggerHaptic('heavy'); if(confirm("Reset all data?")) { localStorage.clear(); navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister())); window.location.reload(true); } };
function switchTab(t) { triggerHaptic('light'); document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); document.getElementById(`tab-${t}`).classList.add('active'); ['matches', 'groups', 'predict', 'stats', 'settings'].forEach(id => { const b = document.getElementById(`btn-${id}`); b.classList.toggle('primary-text', id === t); b.classList.toggle('opacity-50', id !== t); }); }
window.switchSubTab = (s) => { triggerHaptic('light'); document.getElementById('sub-groups').classList.toggle('hidden', s !== 'groups'); document.getElementById('sub-bracket').classList.toggle('hidden', s !== 'bracket'); document.getElementById('btnSubGroups').classList.toggle('active', s === 'groups'); document.getElementById('btnSubBracket').classList.toggle('active', s === 'bracket'); };
function toggleDetails(i) { triggerHaptic('light'); const el = document.getElementById(`details-${i}`); if(el) el.classList.toggle('hidden'); }
function populateTeamSelector() { const s = document.getElementById('my-team-selector'); const t = [...new Set(globalMatches.map(m => [m.homeTeam?.name, m.awayTeam?.name]).flat())].filter(Boolean).sort(); const c = s.value; s.innerHTML = '<option value="ALL">Global View</option>' + t.map(name => `<option value="${name}">${name}</option>`).join(''); s.value = c; s.onchange = (e) => { triggerHaptic('light'); savedTeam = e.target.value; localStorage.setItem('myTeam', savedTeam); renderMatches(); }; }
document.addEventListener('DOMContentLoaded', () => { const s = localStorage.getItem('WC_Theme') === 'true'; applyTheme(s); fetchAllData(); });
