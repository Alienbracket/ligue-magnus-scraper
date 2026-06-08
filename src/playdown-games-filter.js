const fs = require('fs');
const path = require('path');

// Read playdown games data
const playdownGamesPath = path.join(__dirname, '../output/playdown-games.json');

if (!fs.existsSync(playdownGamesPath)) {
  console.error('playdown-games.json not found. Run scrape-playdown-games.js first.');
  process.exit(1);
}

const playdownData = JSON.parse(fs.readFileSync(playdownGamesPath, 'utf8'));
const games = playdownData.data;

console.log(`Processing ${games.length} playdown games...\n`);

// Get today's date in YYYY-MM-DD format (in local timezone)
const today = new Date();
const todayStr = today.toISOString().split('T')[0];

console.log(`Today's date: ${todayStr}\n`);

// Filter today's games
const todaysGames = games.filter(game => {
  if (!game.date_numeric) return false;
  return game.date_numeric === todayStr;
});

// Load existing playdown-todays-games to preserve all fields except scores/periods
// This prevents data "toggling" when the scraper temporarily fails or returns incomplete data
let existingTodaysGames = {};
try {
  const existingTodaysPath = path.join(__dirname, '../output/playdown-todays-games.json');
  if (fs.existsSync(existingTodaysPath)) {
    const existingData = JSON.parse(fs.readFileSync(existingTodaysPath, 'utf8'));
    if (existingData.data && Array.isArray(existingData.data)) {
      existingData.data.forEach(game => {
        if (game.id) {  // Skip empty placeholder games
          existingTodaysGames[game.id] = game;
        }
      });
    }
  }
} catch (err) {
  // Ignore errors, just continue
}

// FIELD LOCKING: Lock all fields except scores and periods
// Only scores, etat, and en_cours can be updated on subsequent scrapes
const protectedTodaysGames = todaysGames.map(game => {
  const existing = existingTodaysGames[game.id];

  // If we have existing data for this game, preserve all static fields
  if (existing) {
    // These fields are LOCKED (never change after first scrape):
    // - All team data (names, logos, shorts)
    // - Match label, date, time, arena
    // - Round and phase information

    // These fields can UPDATE (live data):
    // - home_score, away_score
    // - etat (game state)
    // - en_cours (in progress flag)

    // Merge strategy: Start with existing data, add any NEW fields from scraper,
    // but don't update existing non-live fields
    const merged = { ...game, ...existing };

    // Override with live fields from new scrape
    return {
      ...merged,
      home_score: game.home_score !== null ? game.home_score : existing.home_score,
      away_score: game.away_score !== null ? game.away_score : existing.away_score,
      etat: game.etat || existing.etat,
      en_cours: game.en_cours || existing.en_cours
    };
  }

  // New game - use all data from scraper
  return game;
});

// Process today's games to add period and vs_match fields
const processedTodaysGames = protectedTodaysGames.map(game => {
  // Determine period text
  let period = 'Avant le match';
  if (game.etat === 'T') {
    period = 'Terminé';
  } else if (game.en_cours) {
    period = 'En cours';
  }

  // Create vs_match field
  let vs_match = game.time || '';

  // Check if game has started (has non-zero scores OR is in progress OR is finished)
  const gameHasStarted = game.en_cours || game.etat === 'T' ||
                         (game.home_score !== null && game.home_score !== 0) ||
                         (game.away_score !== null && game.away_score !== 0);

  if (gameHasStarted && game.home_score !== null && game.home_score !== undefined && game.home_score !== '') {
    // Game has started - show scores
    if (game.en_cours) {
      // Game is live - show score with brackets
      vs_match = `(${game.home_score}-${game.away_score})`;
    } else {
      // Game finished - show score without brackets
      vs_match = `${game.home_score}-${game.away_score}`;
    }
  }
  // Otherwise keep the time as vs_match

  return {
    ...game,
    vs_match: vs_match,
    period: period,
    divider: "#FFFFFF"
  };
});

// Filter upcoming games (future dates, not including today)
const upcomingGames = games.filter(game => {
  if (!game.date_numeric) return false;
  return game.date_numeric > todayStr;
});

// Sort upcoming games by date (already sorted but just to be sure)
upcomingGames.sort((a, b) => {
  const dateA = new Date(a.date_numeric + ' ' + a.time);
  const dateB = new Date(b.date_numeric + ' ' + b.time);
  return dateA - dateB;
});

// Create today's games output (no padding - merge script handles it)
const todaysOutput = {
  type: 'playdown-todays-games',
  timestamp: new Date().toISOString(),
  date: todayStr,
  count: processedTodaysGames.length,
  phase: playdownData.phase,
  data: processedTodaysGames
};

// Create upcoming games output
const upcomingOutput = {
  type: 'playdown-upcoming-games',
  timestamp: new Date().toISOString(),
  count: upcomingGames.length,
  phase: playdownData.phase,
  data: upcomingGames
};

// Save to files
const outputDir = path.join(__dirname, '../output');
fs.writeFileSync(
  path.join(outputDir, 'playdown-todays-games.json'),
  JSON.stringify(todaysOutput, null, 2)
);

fs.writeFileSync(
  path.join(outputDir, 'playdown-upcoming-games.json'),
  JSON.stringify(upcomingOutput, null, 2)
);

// Display results
console.log('='.repeat(60));
console.log('TODAY\'S PLAYDOWN GAMES');
console.log('='.repeat(60));

if (protectedTodaysGames.length === 0) {
  console.log('No games scheduled for today.\n');
} else {
  protectedTodaysGames.forEach((game) => {
    console.log(`\n${game.rank}. ${game.match}`);
    console.log(`   Time: ${game.time}`);
    console.log(`   ${game.home_team} (${game.home_short}) vs ${game.away_team} (${game.away_short})`);
    if (game.arena) {
      console.log(`   Arena: ${game.arena}`);
    }
    if (game.home_score !== null) {
      console.log(`   Score: ${game.home_score} - ${game.away_score}`);
    }
    if (game.etat === 'T') {
      console.log(`   Status: Finished`);
    } else if (game.en_cours) {
      console.log(`   Status: In Progress`);
    } else {
      console.log(`   Status: Upcoming`);
    }
  });
  console.log();
}

console.log('='.repeat(60));
console.log('UPCOMING PLAYDOWN GAMES');
console.log('='.repeat(60));

if (upcomingGames.length === 0) {
  console.log('No upcoming games scheduled.\n');
} else {
  // Show first 10 upcoming games
  const gamesToShow = upcomingGames.slice(0, 10);
  gamesToShow.forEach((game) => {
    console.log(`\n${game.rank}. ${game.match}`);
    console.log(`   Date: ${game.date} ${game.time}`);
    console.log(`   ${game.home_team} (${game.home_short}) vs ${game.away_team} (${game.away_short})`);
  });

  if (upcomingGames.length > 10) {
    console.log(`\n   ... and ${upcomingGames.length - 10} more games`);
  }
  console.log();
}

console.log('='.repeat(60));
console.log(`\nSaved to:`);
console.log(`  - ${path.join(outputDir, 'playdown-todays-games.json')} (${protectedTodaysGames.length} games)`);
console.log(`  - ${path.join(outputDir, 'playdown-upcoming-games.json')} (${upcomingGames.length} games)`);
