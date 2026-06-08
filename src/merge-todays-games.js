const fs = require('fs');
const path = require('path');

// Paths to files
const TODAYS_GAMES_PATH = path.join(__dirname, '../output/Todays_games.json');
const PLAYOFF_TODAYS_PATH = path.join(__dirname, '../output/playoff-todays-games.json');
const PLAYDOWN_TODAYS_PATH = path.join(__dirname, '../output/playdown-todays-games.json');

console.log('[MERGE] Merging playoff and playdown today\'s games to Todays_games.json...');

// Load playoff games
let playoffGames = [];
if (fs.existsSync(PLAYOFF_TODAYS_PATH)) {
  try {
    const data = JSON.parse(fs.readFileSync(PLAYOFF_TODAYS_PATH, 'utf8'));
    playoffGames = data.data || [];
    console.log(`[MERGE] Playoffs: ${playoffGames.length} total slots`);
  } catch (err) {
    console.log(`[MERGE] Error reading playoff games: ${err.message}`);
  }
}

// Load playdown games
let playdownGames = [];
if (fs.existsSync(PLAYDOWN_TODAYS_PATH)) {
  try {
    const data = JSON.parse(fs.readFileSync(PLAYDOWN_TODAYS_PATH, 'utf8'));
    playdownGames = data.data || [];
    console.log(`[MERGE] Playdowns: ${playdownGames.length} total slots`);
  } catch (err) {
    console.log(`[MERGE] Error reading playdown games: ${err.message}`);
  }
}

// Filter out empty/placeholder games (check for null, empty string, or no match)
playoffGames = playoffGames.filter(g =>
  g.match &&
  g.match.trim() !== '' &&
  g.id !== null &&
  g.id !== '' &&
  g.id !== undefined
);

playdownGames = playdownGames.filter(g =>
  g.match &&
  g.match.trim() !== '' &&
  g.id !== null &&
  g.id !== '' &&
  g.id !== undefined
);

// Log actual game counts after filtering
console.log(`[MERGE] Filtered: ${playoffGames.length} playoff games, ${playdownGames.length} playdown games`);

// Combine playoff and playdown games
const allGames = [...playoffGames, ...playdownGames];

// Re-assign rank numbers
allGames.forEach((game, index) => {
  game.rank = index + 1;
});

// Pad to always have 6 slots for vMix (fill empty slots with blank data)
const MAX_GAMES = 6;
while (allGames.length < MAX_GAMES) {
  const emptyGameNumber = allGames.length + 1;
  allGames.push({
    rank: emptyGameNumber,
    id: null,
    match: "",
    date: "",
    date_numeric: "",
    time: "",
    home_team: "",
    home_logo: "",
    home_short: "",
    away_team: "",
    away_logo: "",
    away_short: "",
    phase: "",
    etat: null,
    en_cours: false,
    home_score: null,
    away_score: null,
    vs_match: "",
    period: "",
    divider: "#00000000"
  });
}

// Add divider color fields to each game
// Each game's divider is visible if the game has data (not empty)
allGames.forEach((game) => {
  const hasGameData = game.id !== null && game.match !== "";
  game.divider = hasGameData ? '#FFFFFF' : '#00000000';
});

// Create merged output
const mergedOutput = {
  type: 'todaysgames',
  timestamp: new Date().toISOString(),
  count: allGames.filter(g => g.id !== null).length, // Count only real games
  data: allGames
};

// Save merged file
fs.writeFileSync(TODAYS_GAMES_PATH, JSON.stringify(mergedOutput, null, 2));

console.log(`[MERGE] ✓ Saved ${mergedOutput.count} games (${playoffGames.length} playoff + ${playdownGames.length} playdown) to Todays_games.json (${allGames.length} total slots)`);
