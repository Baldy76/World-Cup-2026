// --- CONFIGURATION ---
const API_KEY = '94316a379a82410f87c8b65e9b1795bb'; 
const TARGET_URL = 'https://api.football-data.org/v4/competitions/WC/matches';
const PROXY_URL = 'https://cors-anywhere.herokuapp.com/' + TARGET_URL;

let fetchTimerId;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
    });
}

async function fetchMatches() {
    const container = document.getElementById('match-container');
    const statusMsg = document.getElementById('status-message');

    try {
        const response = await fetch(PROXY_URL, {
            headers: { 
                'X-Auth-Token': API_KEY,
                'X-Requested-With': 'XMLHttpRequest' // Required by cors-anywhere
            }
        });

        if (response.status === 403 || response.status === 429) {
             throw new Error("PROXY_LOCKED");
        }

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        
        if (data && data.matches) {
            renderMatches(data.matches, container);
            statusMsg.classList.add('hidden');
        } else {
             throw new Error("Invalid data");
        }

        scheduleNextFetch(60000);

    } catch (error) {
        console.error(error);
        if (error.message === "PROXY_LOCKED" || error.message.includes("Failed to fetch")) {
            statusMsg.innerHTML = `
                <span class="text-red-400">Proxy access required!</span><br>
                <a href="https://cors-anywhere.herokuapp.com/corsdemo" target="_blank" class="text-blue-400 underline">
                    Click here to unlock the proxy
                </a>, click "Request temporary access", and then refresh this page.
            `;
            statusMsg.classList.remove('hidden', 'animate-pulse');
        } else {
            statusMsg.textContent = "Data error. Retrying...";
            scheduleNextFetch(60000);
        }
    }
}

function scheduleNextFetch(delayMs) {
    clearTimeout(fetchTimerId);
    fetchTimerId = setTimeout(fetchMatches, delayMs);
}

function renderMatches(matches, container) {
    container.innerHTML = ''; 
    if (matches.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-400">No matches scheduled yet.</div>';
        return;
    }

    matches.forEach(match => {
        const statusText = match.status === 'IN_PLAY' ? 'LIVE' : match.status;
        const homeScore = match.score?.fullTime?.home ?? '-';
        const awayScore = match.score?.fullTime?.away ?? '-';

        const matchCard = `
            <div class="bg-slate-800 p-4 rounded-xl shadow-lg border-l-4 ${match.status === 'IN_PLAY' ? 'border-red-500' : 'border-emerald-500'} flex flex-col">
                <div class="flex justify-between text-xs mb-3">
                    <span class="text-slate-400">${new Date(match.utcDate).toLocaleString()}</span>
                    <span class="${match.status === 'IN_PLAY' ? 'text-red-500 animate-pulse' : 'text-slate-400'}">${statusText}</span>
                </div>
                <div class="flex justify-between items-center text-lg font-semibold">
                    <div class="flex-1 text-right truncate pr-2">${match.homeTeam?.name || 'TBD'}</div>
                    <div class="px-3 text-xl bg-slate-900 rounded mx-1 py-1 font-mono">${homeScore} : ${awayScore}</div>
                    <div class="flex-1 text-left truncate pl-2">${match.awayTeam?.name || 'TBD'}</div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', matchCard);
    });
}

fetchMatches();
