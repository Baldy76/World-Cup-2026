// --- CONFIGURATION (V2.0) ---
// Directing traffic to your private Cloudflare Worker
const API_URL = 'https://wc2026-proxy.baldynapperrwe.workers.dev/'; 

let fetchTimerId;

// --- PWA SETUP ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .catch(err => console.error("Service Worker Failed", err));
    });
}

// --- APP LOGIC ---
async function fetchMatches() {
    const container = document.getElementById('match-container');
    const statusMsg = document.getElementById('status-message');

    try {
        // Look ma, no API keys! Our Worker handles the secrets now.
        const response = await fetch(API_URL);

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        
        if (data && data.matches) {
            renderMatches(data.matches, container);
            statusMsg.classList.add('hidden');
        } else {
             throw new Error("Invalid data structure received");
        }

        // Fetch new data every 60 seconds
        scheduleNextFetch(60000);

    } catch (error) {
        console.error(error);
        statusMsg.textContent = "Network error or invalid data. Retrying soon...";
        statusMsg.classList.remove('hidden', 'animate-pulse');
        statusMsg.classList.add('text-red-400');
        
        // Retry in 60 seconds if it fails
        scheduleNextFetch(60000); 
    }
}

function scheduleNextFetch(delayMs) {
    clearTimeout(fetchTimerId);
    fetchTimerId = setTimeout(fetchMatches, delayMs);
}

function renderMatches(matches, container) {
    container.innerHTML = ''; 

    if (matches.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-400">No matches found for this tournament yet.</div>';
        return;
    }

    matches.forEach(match => {
        const statusColors = {
            'TIMED': 'text-slate-400',
            'SCHEDULED': 'text-slate-400',
            'IN_PLAY': 'text-red-500 font-bold animate-pulse',
            'PAUSED': 'text-amber-500',
            'FINISHED': 'text-emerald-500'
        };
        const statusText = match.status === 'IN_PLAY' ? 'LIVE' : match.status;
        const colorClass = statusColors[match.status] || 'text-slate-400';

        const homeScore = match.score?.fullTime?.home ?? '-';
        const awayScore = match.score?.fullTime?.away ?? '-';

        const matchCard = `
            <div class="bg-slate-800 p-4 rounded-xl shadow-lg border-l-4 ${match.status === 'IN_PLAY' ? 'border-red-500' : 'border-emerald-500'} flex flex-col">
                <div class="flex justify-between text-xs mb-3">
                    <span class="text-slate-400">${new Date(match.utcDate).toLocaleString()}</span>
                    <span class="${colorClass}">${statusText}</span>
                </div>
                <div class="flex justify-between items-center text-lg font-semibold">
                    <div class="flex-1 text-right truncate pr-2">${match.homeTeam?.name || 'TBD'}</div>
                    <div class="px-3 text-xl bg-slate-900 rounded mx-1 py-1 font-mono">
                        ${homeScore} : ${awayScore}
                    </div>
                    <div class="flex-1 text-left truncate pl-2">${match.awayTeam?.name || 'TBD'}</div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', matchCard);
    });
}

// Boot up the app
fetchMatches();
