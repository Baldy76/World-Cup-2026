// --- UK TV BROADCAST GUIDE ---
// Format: "HomeTeamName-AwayTeamName": "Broadcaster"
const UK_TV_GUIDE = {
    "Mexico-South Africa": "ITV",
    "Canada-Bosnia": "BBC", // Assuming Play-off A
    "USA-Paraguay": "BBC",
    "England-Croatia": "ITV",
    "England-Ghana": "BBC",
    "Panama-England": "ITV",
    "Scotland-Haiti": "BBC",
    "Scotland-Morocco": "ITV",
    "Scotland-Brazil": "BBC"
    // You can add the rest of the 104 matches here as needed!
};

// Helper function to get the logo HTML
function getTvBadge(home, away) {
    const matchKey1 = `${home}-${away}`;
    const matchKey2 = `${away}-${home}`; // Just in case the API flips home/away
    const channel = UK_TV_GUIDE[matchKey1] || UK_TV_GUIDE[matchKey2];
    
    if (channel === "BBC") {
        return `<span class="bg-black text-white px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest ml-2 border border-white/20">BBC</span>`;
    } else if (channel === "ITV") {
        return `<span class="bg-blue-900 text-cyan-300 px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest ml-2 border border-cyan-300/30">ITV</span>`;
    }
    return ''; // Return nothing if channel isn't mapped yet
}
