const API_URL = 'https://wc2026-proxy.baldynapperrwe.workers.dev/'; 

let globalMatches = [];
let savedTeam = localStorage.getItem('myTeam') || 'ALL';
let countdownInterval;
let notifiedMatches = new Set(); // Prevent spamming notifications

// --- INIT ---
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);

document.getElementById('my-team-selector').value = savedTeam;
document.getElementById('my-team-selector').addEventListener('change', (e) => {
    savedTeam = e.target.value;
    localStorage.setItem('myTeam', savedTeam);
    renderMatches();
});

// Request Notification Permission
document.getElementById('notify-btn').addEventListener('click', () => {
    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                alert("Alerts enabled! We'll notify you when " + (savedTeam === 'ALL' ? 'a match' : savedTeam) + " is about to play.");
                document.getElementById('notify-btn').classList.add('text-yellow-400');
            }
        });
    }
});

if ("Notification" in window && Notification.permission === "granted") {
    document.getElementById('notify-btn').classList.add('text-yellow-400');
}

// --- FETCH DATA ---
async function fetchAllData() {
    const statusMsg = document.getElementById('status-message');
    try {
        statusMsg.classList.remove('hidden');

        // Fetch Matches, Standings, AND Scorers
        const [matchesRes, standingsRes, scorersRes] = await Promise.all([
            fetch(`${API_URL}?endpoint=matches`),
            fetch(`${API_URL}?endpoint=standings`),
            fetch(`${API_URL}?endpoint=scorers`)
        ]);

        if (!matchesRes.ok) throw new Error("API failed");

        const matchesData = await matchesRes.json();
        const standingsData = await standingsRes.json();
        const scorersData = await scorersRes.json();

        globalMatches = matchesData.matches || [];
        
        populateTeamSelector();
        renderMatches();
        if(standingsData.standings) renderStandings(standingsData.standings);
        if(scorersData.scorers) renderScorers(scorersData.scorers);

        startCountdown();
        checkAlerts();

        statusMsg.classList.add('hidden');
        setTimeout(fetchAllData, 60000); 

    } catch (err) {
        statusMsg.textContent = "Offline. Retrying soon.";
        statusMsg.classList.add('text-red-400');
        setTimeout(fetchAllData, 60000);
    }
}

// --- RENDER MATCHES (WITH EVENTS & LOCAL TIME) ---
function renderMatches() {
    const container = document.getElementById('tab-matches');
    container.innerHTML = '';

    let matchesToRender = savedTeam !== 'ALL' 
        ? globalMatches.filter(m => m.homeTeam?.name === savedTeam || m.awayTeam?.name === savedTeam)
        : globalMatches;

    if (matchesToRender.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-400">No matches found.</div>';
        return;
    }

    matchesToRender.forEach((match, index) => {
        const isLive = match.status === 'IN_PLAY';
        const isFinished = match.status === 'FINISHED';
        const homeScore = match.score?.fullTime?.home ?? '-';
        const awayScore = match.score?.fullTime?.away ?? '-';
        
        const homeFlag = match.homeTeam?.crest ? `<img src="${match.homeTeam.crest}" class="w-5 h-5 inline mr-2 object-contain">` : '';
        const awayFlag = match.awayTeam?.crest ? `<img src="${match.awayTeam.crest}" class="w-5 h-5 inline ml-2 object-contain">` : '';

        let statusText = match.status;
        if (isLive) statusText = '🔴 LIVE';
        if (match.status === 'TIMED' || match.status === 'SCHEDULED') statusText = 'Upcoming';
        if (isFinished) statusText = 'FT';

        // Format to Local Time
        const localTime = new Date(match.utcDate).toLocaleString([], {weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});

        // Goal Events Parsing (if available in API)
        let eventsHTML = '';
        if ((isLive || isFinished) && match.goals && match.goals.length > 0) {
            eventsHTML = match.goals.map(g => `
                <div class="flex justify-between text-xs py-1 border-b border-slate-700 last:border-0">
                    <span class="text-emerald-400">⚽ ${g.minute}'</span>
                    <span class="text-slate-300">${g.scorer?.name || 'Unknown'} (${g.team?.name || 'Team'})</span>
                </div>
            `).join('');
        } else if (isLive || isFinished) {
            eventsHTML = '<div class="text-xs text-slate-500">No detailed events available.</div>';
        }

        const card = `
            <div onclick="toggleDetails(${index})" class="bg-slate-800 p-4 rounded-xl shadow-lg border-l-4 ${isLive ? 'border-red-500' : 'border-emerald-500'} cursor-pointer hover:bg-slate-750 transition">
                <div class="flex justify-between text-xs mb-3">
                    <span class="text-slate-400">${localTime} (Local)</span>
                    <span class="font-bold ${isLive ? 'text-red-500 animate-pulse' : 'text-slate-400'}">${statusText}</span>
                </div>
                
                <div class="flex justify-between items-center text-lg font-semibold">
                    <div class="flex-1 flex items-center justify-end truncate pr-2">
                        <span class="truncate">${match.homeTeam?.tla || match.homeTeam?.name || 'TBD'}</span>
                        ${homeFlag}
                    </div>
                    <div class="px-3 text-xl bg-slate-900 rounded mx-1 py-1 font-mono">${homeScore} - ${awayScore}</div>
                    <div class="flex-1 flex items-center justify-start truncate pl-2">
                        ${awayFlag}
                        <span class="truncate">${match.awayTeam?.tla || match.awayTeam?.name || 'TBD'}</span>
                    </div>
                </div>

                <div id="details-${index}" class="hidden mt-4 pt-3 border-t border-slate-700">
                    <div class="text-center text-sm text-slate-400 mb-2 font-semibold">${match.stage ? match.stage.replace('_', ' ') : ''} ${match.group ? `- ${match.group}` : ''}</div>
                    ${eventsHTML}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', card);
    });
}

function toggleDetails(index) {
    document.getElementById(`details-${index}`).classList.toggle('hidden');
}

// --- RENDER SCORERS (GOLDEN BOOT) ---
function renderScorers(scorers) {
    const container = document.getElementById('scorers-container');
    container.innerHTML = '';
    
    if(!scorers || scorers.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-400">Stats available after first match.</div>';
        return;
    }

    scorers.forEach((s, i) => {
        const flag = s.team?.crest ? `<img src="${s.team.crest}" class="w-4 h-4 inline ml-2">` : '';
        const html = `
            <div class="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                <div class="flex items-center">
                    <span class="text-slate-500 w-6 font-mono">${i + 1}.</span>
                    <span class="font-semibold text-sm">${s.player.name}</span>
                    ${flag}
                </div>
                <div class="text-emerald-400 font-bold font-mono">${s.goals} ⚽</div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}

// --- RENDER STANDINGS ---
function renderStandings(standings) {
    const container = document.getElementById('tab-groups');
    container.innerHTML = '';
    standings.filter(g => g.type === 'TOTAL').forEach(group => {
        let rows = group.table.map(team => `
            <div class="flex items-center justify-between py-2 border-b border-slate-700 text-sm last:border-0">
                <div class="flex items-center w-1/2">
                    <span class="text-slate-400 w-4">${team.position}</span>
                    <img src="${team.team.crest}" class="w-4 h-4 mx-2">
                    <span class="font-semibold truncate">${team.team.tla || team.team.name}</span>
                </div>
                <div class="w-1/2 flex justify-end space-x-3 text-slate-300 font-mono text-xs">
                    <span class="w-4 text-center">${team.playedGames}</span>
                    <span class="w-4 text-center">${team.goalDifference}</span>
                    <span class="w-4 text-center font-bold text-emerald-400">${team.points}</span>
                </div>
            </div>
        `).join('');

        container.insertAdjacentHTML('beforeend', `
            <div class="bg-slate-800 rounded-xl p-4 shadow-lg">
                <h3 class="font-bold text-emerald-400 mb-2 border-b border-slate-700 pb-2">${group.group}</h3>
                <div class="flex justify-end space-x-3 text-xs text-slate-500 font-mono mb-1 pr-1">
                    <span class="w-4 text-center">P</span><span class="w-4 text-center">GD</span><span class="w-4 text-center">Pts</span>
                </div>
                ${rows}
            </div>
        `);
    });
}

// --- COUNTDOWN LOGIC ---
function startCountdown() {
    clearInterval(countdownInterval);
    const banner = document.getElementById('countdown-banner');
    
    // Find next upcoming match
    const upcoming = globalMatches.filter(m => m.status === 'TIMED' || m.status === 'SCHEDULED')
                                  .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))[0];

    if (!upcoming) {
        banner.classList.add('hidden');
        return;
    }

    banner.classList.remove('hidden');
    const targetDate = new Date(upcoming.utcDate).getTime();

    countdownInterval = setInterval(() => {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
            document.getElementById('countdown-timer').innerHTML = "MATCH STARTING!";
            clearInterval(countdownInterval);
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        
        let display = `${hours}h ${minutes}m`;
        if (days > 0) display = `${days}d ` + display;

        document.getElementById('countdown-timer').innerHTML = `${upcoming.homeTeam?.name} vs ${upcoming.awayTeam?.name} in ${display}`;
    }, 1000);
}

// --- NOTIFICATIONS LOGIC ---
function checkAlerts() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const now = new Date().getTime();
    
    globalMatches.forEach(match => {
        // Only alert if they selected ALL or if it's their team
        if (savedTeam !== 'ALL' && match.homeTeam?.name !== savedTeam && match.awayTeam?.name !== savedTeam) return;
        
        if (match.status === 'TIMED' || match.status === 'SCHEDULED') {
            const matchTime = new Date(match.utcDate).getTime();
            const minutesUntil = (matchTime - now) / 60000;

            // Alert if within 15 minutes and we haven't alerted yet
            if (minutesUntil > 0 && minutesUntil <= 15 && !notifiedMatches.has(match.id)) {
                new Notification("Match Kickoff Soon!", {
                    body: `${match.homeTeam?.name} vs ${match.awayTeam?.name} starts in ${Math.floor(minutesUntil)} minutes!`,
                    icon: 'https://cdn-icons-png.flaticon.com/512/53/53283.png'
                });
                notifiedMatches.add(match.id);
            }
        }
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    ['matches', 'groups', 'stats'].forEach(t => {
        document.getElementById(`btn-${t}`).classList.replace('text-emerald-400', 'text-slate-400');
    });
    document.getElementById(`btn-${tabName}`).classList.replace('text-slate-400', 'text-emerald-400');
}

function populateTeamSelector() {
    const selector = document.getElementById('my-team-selector');
    const teams = new Set();
    globalMatches.forEach(m => {
        if (m.homeTeam?.name) teams.add(m.homeTeam.name);
        if (m.awayTeam?.name) teams.add(m.awayTeam.name);
    });

    selector.innerHTML = '<option value="ALL">All Teams</option>' + 
        Array.from(teams).sort().map(team => `<option value="${team}">${team}</option>`).join('');
    selector.value = savedTeam; 
}

fetchAllData();
