
const API_URL = 'https://api.football-data.org/v4/competitions/WC/matches';
const API_KEY = 'YOUR_SECRET_KEY';

async function updateScores() {
    try {
        const response = await fetch(API_URL, {
            headers: { 'X-Auth-Token': API_KEY }
        });
        const data = await response.json();
        renderMatches(data.matches);
    } catch (error) {
        console.error("Failed to fetch latest scores", error);
    }
}

// Refresh data every 5 minutes during the tournament
setInterval(updateScores, 300000);
