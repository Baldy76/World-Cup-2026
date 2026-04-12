// --- CONFIGURATION ---
const API_URL = 'https://wc2026-proxy.baldynapperrwe.workers.dev/'; 

let globalMatches = [];
let savedTeam = localStorage.getItem('myTeam') || 'ALL';

// --- INIT ---
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);

document.getElementById('my-team-selector').value = savedTeam;
document.getElementById('my-team-selector').addEventListener('change', (e) => {
    savedTeam = e.target.value;
    localStorage.setItem('myTeam', savedTeam);
    renderMatches(); // Re-render instantly with filter
});

// --- FETCH DATA ---
async function fetchAllData() {
    const statusMsg = document.getElementById('status-message');
    try {
        statusMsg.classList.remove('hidden');
        statusMsg.textContent = "Syncing live data...";

        // Fetch Matches and Standings simultaneously 
        const [matchesRes, standingsRes] = await Promise.all([
            fetch(`${API_URL}?endpoint=matches`),
            fetch(`${API_URL}?endpoint=standings`)
        ]);

        if (!matchesRes.ok || !standingsRes.ok) throw new Error("API failed");

        const matchesData = await matchesRes.json();
        const standingsData = await standingsRes.json();

        globalMatches = matchesData.matches || [];
        
        populateTeamSelector(globalMatches);
        renderMatches();
        renderStandings(standingsData.standings || []);

        statusMsg.classList.add('hidden');
        setTimeout(fetchAllData, 60000); // Auto-refresh every 60s

    } catch (err) {
        console.error(err);
        statusMsg.textContent = "Offline or Network Error. Retrying soon.";
        statusMsg.classList.add('text-red-400');
        setTimeout(fetchAllData, 60000);
    }
}

// --- RENDER MATCHES (WITH FLAGS & DETAILS) ---
function renderMatches() {
    const container = document.getElementById('tab-matches');
    container.innerHTML = '';

    // Filter by "My Team" if selected
    let matchesToRender = globalMatches;
    if (savedTeam !== 'ALL') {
        matchesToRender = globalMatches.filter(m => 
            m.homeTeam?.name === savedTeam || m.awayTeam?.name === savedTeam
        );
    }

    if (matchesToRender.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-400">No matches found.</div>';
        return;
    }

    matchesToRender.forEach((match, index) => {
        const isLive = match.status === 'IN_PLAY';
        const homeScore = match.score?.fullTime?.home ?? '-';
        const awayScore = match.score?.fullTime?.away ?? '-';
        
        // Flags (crests)
        const homeFlag = match.homeTeam?.crest ? `<img src="${match.homeTeam.crest}" class="w-5 h-5 inline mr-2 object-contain">` : '';
        const awayFlag = match.awayTeam?.crest ? `<img src="${match.awayTeam.crest}" class="w-5 h-5 inline ml-2 object-contain">` : '';

        // Determine Match Status Text
        let statusText = match.status;
        if (isLive) statusText = '🔴 LIVE';
        if (match.status === 'TIMED' || match.status === 'SCHEDULED') statusText = 'Upcoming';
        if (match.status === 'FINISHED') statusText = 'FT';

        const card = `
            <div onclick="toggleDetails(${index})" class="bg-slate-800 p-4 rounded-xl shadow-lg border-l-4 ${isLive ? 'border-red-500' : 'border-emerald-500'} cursor-pointer hover:bg-slate-750 transition">
                <div class="flex justify-between text-xs mb-3">
                    <span class="text-slate-400">${new Date(match.utcDate).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</span>
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

                <div id="details-${index}" class="hidden mt-4 pt-3 border-t border-slate-700 text-sm text-slate-300 text-center">
                    ${match.stage ? `Stage: ${match.stage.replace('_', ' ')}` : ''} <br>
                    ${match.group ? `Group: ${match.group}` : ''}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', card);
    });
}

function toggleDetails(index) {
    const detailsDiv = document.getElementById(`details-${index}`);
    detailsDiv.classList.toggle('hidden');
}

// --- RENDER STANDINGS (GROUPS) ---
function renderStandings(standings) {
    const container = document.getElementById('tab-groups');
    container.innerHTML = '';

    if (!standings || standings.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-400">Group standings not available yet.</div>';
        return;
    }

    standings.forEach(group => {
        if(group.type !== 'TOTAL') return; // Only show total standings

        let rows = group.table.map(team => `
            <div class="flex items-center justify-between py-2 border-b border-slate-700 text-sm last:border-0">
                <div class="flex items-center w-1/2">
                    <span class="text-slate-400 w-4">${team.position}</span>
                    <img src="${team.team.crest}" class="w-4 h-4 mx-2">
                    <span class="font-semibold truncate">${team.team.tla || team.team.name}</span>
                </div>
                <div class="w-1/2 flex justify-end space-x-3 text-slate-300 font-mono text-xs">
                    <span title="Played" class="w-4 text-center">${team.playedGames}</span>
                    <span title="Goal Difference" class="w-4 text-center">${team.goalDifference}</span>
                    <span title="Points" class="w-4 text-center font-bold text-emerald-400">${team.points}</span>
                </div>
            </div>
        `).join('');

        const tableHTML = `
            <div class="bg-slate-800 rounded-xl p-4 shadow-lg">
                <h3 class="font-bold text-emerald-400 mb-2 border-b border-slate-700 pb-2">${group.group}</h3>
                <div class="flex justify-end space-x-3 text-xs text-slate-500 font-mono mb-1 pr-1">
                    <span class="w-4 text-center">P</span>
                    <span class="w-4 text-center">GD</span>
                    <span class="w-4 text-center">Pts</span>
                </div>
                ${rows}
            </div>
        `;
        container.insertAdjacentHTML('beforeend', tableHTML);
    });
}

// --- UI HELPERS ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Update button colors
    document.getElementById('btn-matches').classList.replace(tabName === 'matches' ? 'text-slate-400' : 'text-emerald-400', tabName === 'matches' ? 'text-emerald-400' : 'text-slate-400');
    document.getElementById('btn-groups').classList.replace(tabName === 'groups' ? 'text-slate-400' : 'text-emerald-400', tabName === 'groups' ? 'text-emerald-400' : 'text-slate-400');
}

function populateTeamSelector(matches) {
    const selector = document.getElementById('my-team-selector');
    const currentVal = selector.value;
    
    // Extract unique team names
    const teams = new Set();
    matches.forEach(m => {
        if (m.homeTeam?.name) teams.add(m.homeTeam.name);
        if (m.awayTeam?.name) teams.add(m.awayTeam.name);
    });

    const sortedTeams = Array.from(teams).sort();
    
    selector.innerHTML = '<option value="ALL">All Teams</option>' + 
        sortedTeams.map(team => `<option value="${team}">${team}</option>`).join('');
    
    selector.value = currentVal; // Restore selection
}

// Kickoff
fetchAllData();
