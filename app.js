// --- CONFIGURATION ---
const API_KEY = '94316a379a82410f87c8b65e9b1795bb'; 
const API_URL = 'https://api.football-data.org/v4/competitions/WC/matches';
let fetchTimerId;

// --- PWA SETUP ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log("Service Worker Registered"))
            .catch(err => console.error("Service Worker Failed", err));
    });
}

// --- APP LOGIC & RATE LIMIT HANDLING ---
async function fetchMatches() {
    const container = document.getElementById('match-container');
    const statusMsg = document.getElementById('status-message');

    try {
        const response = await fetch(API_URL, {
            headers: { 'X-Auth-Token': API_KEY }
        });

        // 1. Check for Rate Limit Headers
        const requestsAvailable = response.headers.get('X-Requests-Available-Minute');
        const secondsToReset = response.headers.get('X-RequestCounter-Reset');

        // 2. Handle HTTP 429 (Too Many Requests)
        if (response.status === 429) {
            const waitTime = secondsToReset ? parseInt(secondsToReset) * 1000 : 60000;
            statusMsg.textContent = `API Limit Reached. Pausing updates for ${waitTime / 1000}s...`;
            statusMsg.classList.remove('hidden', 'text-slate-400', 'animate-pulse');
            statusMsg.classList.add('text-amber-400');
            
            scheduleNextFetch(waitTime);
            return;
        }

        // 3. Handle General Errors
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        // 4. Parse and Render Data
        const data = await response.json();
        renderMatches(data.matches, container);
        statusMsg.classList.add('hidden');

        // 5. Smart Throttling for next fetch
        let nextFetchDelay = 60000; // Default: 1 minute
        if (requestsAvailable && parseInt(requestsAvailable) <= 2) {
            // If we are down to 2 or fewer requests for this minute, wait for the reset
            nextFetchDelay = secondsToReset ? (parseInt(secondsToReset) + 2) * 1000 : 60000;
            console.warn(`Running low on requests. Next fetch delayed by ${nextFetchDelay / 1000}s`);
        }

        scheduleNextFetch(nextFetchDelay);

    } catch (error) {
        console.error(error);
        statusMsg.textContent = "Network error or invalid data. Retrying soon...";
        statusMsg.classList.remove('hidden', 'animate-pulse');
        statusMsg.classList.add('text-red-400');
        
        // Retry in 60 seconds if it fails completely
        scheduleNextFetch(60000); 
    }
}

function scheduleNextFetch(delayMs) {
    clearTimeout(fetchTimerId);
    fetchTimerId = setTimeout(fetchMatches, delayMs);
}

function renderMatches(matches, container) {
    container.innerHTML = ''; // Clear old data

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

        const matchCard = `
            <div class="bg-slate-800 p-4 rounded-xl shadow-lg border-l-4 ${match.status === 'IN_PLAY' ? 'border-red-500' : 'border-emerald-500'} flex flex-col">
                <div class="flex justify-between text-xs mb-3">
                    <span class="text-slate-400">${new Date(match.utcDate).toLocaleString()}</span>
                    <span class="${colorClass}">${statusText}</span>
                </div>
                <div class="flex justify-between items-center text-lg font-semibold">
                    <div class="flex-1 text-right truncate pr-2">${match.homeTeam.name || 'TBD'}</div>
                    <div class="px-3 text-xl bg-slate-900 rounded mx-1 py-1 font-mono">
                        ${match.score.fullTime.home ?? '-'} : ${match.score.fullTime.away ?? '-'}
                    </div>
                    <div class="flex-1 text-left truncate pl-2">${match.awayTeam.name || 'TBD'}</div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', matchCard);
    });
}

// Boot up the app
fetchMatches();
