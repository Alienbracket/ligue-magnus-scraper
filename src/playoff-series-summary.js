const fs = require('fs');
const path = require('path');

// Team logo mapping (same as scraper-to-json.js)
function getTeamLogo(teamName) {
  const logoBasePath = 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\';

  if (!teamName || typeof teamName !== 'string') return null;

  const normalized = teamName.toUpperCase().trim();

  const teamLogoMap = {
    'AMIENS': 'amiens.png',
    'GOTHIQUES D\'AMIENS': 'amiens.png',
    'GOTHIQUES DAMIENS': 'amiens.png',
    'ANGERS': 'angers.png',
    'DUCS D\'ANGERS': 'angers.png',
    'DUCS DANGERS': 'angers.png',
    'ANGLET': 'anglet.png',
    'ANGLET HORMADI': 'anglet.png',
    'BORDEAUX': 'bordeaux.png',
    'BOXERS DE BORDEAUX': 'bordeaux.png',
    'BRIANÇON': 'briançon.png',
    'BRIANCON': 'briançon.png',
    'DIABLES ROUGES DE BRIANÇON': 'briançon.png',
    'DIABLES ROUGES DE BRIANCON': 'briançon.png',
    'CERGY-PONTOISE': 'cergy-pontoise.png',
    'CERGY PONTOISE': 'cergy-pontoise.png',
    'JOKERS DE CERGY-PONTOISE': 'cergy-pontoise.png',
    'JOKERS DE CERGY PONTOISE': 'cergy-pontoise.png',
    'CHAMONIX': 'chamonix.png',
    'PIONNIERS DE CHAMONIX': 'chamonix.png',
    'GAP': 'gap.png',
    'RAPACES DE GAP': 'gap.png',
    'GRENOBLE': 'grenoble.png',
    'BRÛLEURS DE LOUPS DE GRENOBLE': 'grenoble.png',
    'BRULEURS DE LOUPS DE GRENOBLE': 'grenoble.png',
    'MARSEILLE': 'marseille.png',
    'SPARTIATES DE MARSEILLE': 'marseille.png',
    'NICE': 'nice.png',
    'AIGLES DE NICE': 'nice.png',
    'ROUEN': 'rouen.png',
    'DRAGONS DE ROUEN': 'rouen.png'
  };

  for (const [teamKey, logoFile] of Object.entries(teamLogoMap)) {
    if (normalized === teamKey || normalized.includes(teamKey)) {
      return logoBasePath + logoFile;
    }
  }

  return null;
}

// Function to shorten team names to just the city
function getShortenedTeamName(teamName) {
  if (!teamName || typeof teamName !== 'string') return teamName;

  // Extract city name - the part after the last "de" or "d'"
  const normalized = teamName.trim();

  // Match patterns like "Dragons de Rouen", "Diables Rouges de Briançon", "Brûleurs de Loups de Grenoble"
  // Look for the last occurrence of "de " or "d'" - use greedy .* to skip to the last one
  const deMatch = normalized.match(/.*(?:de |d')(.+)$/i);
  if (deMatch) {
    return deMatch[1].trim();
  }

  // If no pattern matched, return the original name
  return teamName;
}

// Team ranking/seeding order (higher seeds first)
const teamRanking = {
  'ROU': 1,   // Rouen
  'ANG': 2,   // Angers
  'GRE': 3,   // Grenoble
  'BOR': 4,   // Bordeaux
  'AMI': 5,   // Amiens
  'NIC': 6,   // Nice
  'BRI': 7,   // Briançon
  'MAR': 8    // Marseille
};

// Function to sort teams by ranking
function sortTeamsByRanking(team1Short, team2Short) {
  const rank1 = teamRanking[team1Short] || 999;
  const rank2 = teamRanking[team2Short] || 999;

  // Lower rank number = higher seed, should come first
  if (rank1 < rank2) return [team1Short, team2Short];
  return [team2Short, team1Short];
}

// Read playoff games data
const playoffGamesPath = path.join(__dirname, '../output/playoff-games.json');

if (!fs.existsSync(playoffGamesPath)) {
  console.error('playoff-games.json not found. Run scrape-playoff-games.js first.');
  process.exit(1);
}

const playoffData = JSON.parse(fs.readFileSync(playoffGamesPath, 'utf8'));
const games = playoffData.data;

console.log(`Processing ${games.length} playoff games...\n`);

// Group games by series (team matchup)
const seriesMap = {};

games.forEach(game => {
  // Create a unique series key based on the two teams (sorted by ranking, not alphabetically)
  const teams = sortTeamsByRanking(game.home_short, game.away_short);
  const seriesKey = teams.join(' vs ');

  if (!seriesMap[seriesKey]) {
    // Initialize series
    const team1FullName = teams[0] === game.home_short ? game.home_team : game.away_team;
    const team2FullName = teams[1] === game.home_short ? game.home_team : game.away_team;

    seriesMap[seriesKey] = {
      series_id: seriesKey,
      round: game.round || game.phase || 'Playoff Series',
      team1: {
        name: getShortenedTeamName(team1FullName),
        short: teams[0],
        logo: getTeamLogo(team1FullName),
        wins: 0
      },
      team2: {
        name: getShortenedTeamName(team2FullName),
        short: teams[1],
        logo: getTeamLogo(team2FullName),
        wins: 0
      },
      games: []
    };
  }

  // Add game to series
  seriesMap[seriesKey].games.push({
    id: game.id,
    date: game.date,
    home_team: game.home_short,
    away_team: game.away_short,
    home_score: game.home_score,
    away_score: game.away_score,
    status: game.etat === 'T' ? 'finished' : (game.en_cours ? 'in_progress' : 'upcoming')
  });

  // Count wins if game is finished
  if (game.etat === 'T' && game.home_score !== null && game.away_score !== null) {
    if (game.home_score > game.away_score) {
      // Home team won
      if (game.home_short === seriesMap[seriesKey].team1.short) {
        seriesMap[seriesKey].team1.wins++;
      } else {
        seriesMap[seriesKey].team2.wins++;
      }
    } else if (game.away_score > game.home_score) {
      // Away team won
      if (game.away_short === seriesMap[seriesKey].team1.short) {
        seriesMap[seriesKey].team1.wins++;
      } else {
        seriesMap[seriesKey].team2.wins++;
      }
    }
  }
});

// Convert to array and sort games by date
const allSeries = Object.values(seriesMap).map(s => {
  s.games.sort((a, b) => new Date(a.date) - new Date(b.date));
  return s;
});

// Sort series alphabetically
allSeries.sort((a, b) => a.series_id.localeCompare(b.series_id));

// Separate by round
// Note: "Série finale pour le titre" appears to be the quarter-finals round name
const quarterFinals = allSeries.filter(s =>
  s.round && (
    s.round.toLowerCase().includes('quart') ||
    s.round.toLowerCase().includes('série finale pour le titre')
  )
);

const semiFinals = allSeries.filter(s =>
  s.round && s.round.toLowerCase().includes('demi') && !s.round.toLowerCase().includes('quart')
);

const finals = allSeries.filter(s =>
  s.round && (
    s.round.toLowerCase() === 'finale' ||
    (s.round.toLowerCase().includes('final') &&
     !s.round.toLowerCase().includes('demi') &&
     !s.round.toLowerCase().includes('quart') &&
     !s.round.toLowerCase().includes('série finale pour le titre'))
  )
);

// Create placeholder series if needed
const createPlaceholderSeries = (id, round) => ({
  series_id: id,
  round: round,
  team1: {
    name: " ",
    short: " ",
    logo: "",
    wins: " "
  },
  team2: {
    name: " ",
    short: " ",
    logo: "",
    wins: " "
  },
  games: []
});

// Ensure we always have 2 semi-final placeholders
while (semiFinals.length < 2) {
  semiFinals.push(createPlaceholderSeries(`SF${semiFinals.length + 1}`, 'Demi-finale'));
}

// Ensure we always have 1 final placeholder
while (finals.length < 1) {
  finals.push(createPlaceholderSeries('Final', 'Finale'));
}

// Combine all series into quarters array for vMix compatibility
const allSeriesFlat = [...quarterFinals, ...semiFinals, ...finals];

// Create output
const output = {
  type: 'playoff-series-summary',
  timestamp: new Date().toISOString(),
  phase: playoffData.phase,
  quarters: {
    round: 'Quart de finale',
    series: allSeriesFlat
  },
  semis: {
    round: 'Demi-finale',
    series: semiFinals
  },
  final: {
    round: 'Finale',
    series: finals
  }
};

// Save to file
const outputPath = path.join(__dirname, '../output/playoff-series.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log('Playoff Series Summary');
console.log('='.repeat(60));
console.log();

console.log('QUARTER-FINALS');
console.log('-'.repeat(60));
quarterFinals.forEach((s, idx) => {
  if (s.team1.name) {
    console.log(`${idx + 1}. ${s.team1.name} vs ${s.team2.name}`);
    console.log(`   Series: ${s.team1.wins} - ${s.team2.wins}`);
    console.log(`   Games played: ${s.games.filter(g => g.status === 'finished').length} / ${s.games.length}`);
  } else {
    console.log(`${idx + 1}. TBD vs TBD`);
  }
  console.log();
});

console.log('\nSEMI-FINALS');
console.log('-'.repeat(60));
semiFinals.forEach((s, idx) => {
  if (s.team1.name) {
    console.log(`${idx + 1}. ${s.team1.name} vs ${s.team2.name}`);
    console.log(`   Series: ${s.team1.wins} - ${s.team2.wins}`);
    console.log(`   Games played: ${s.games.filter(g => g.status === 'finished').length} / ${s.games.length}`);
  } else {
    console.log(`${idx + 1}. TBD vs TBD`);
  }
  console.log();
});

console.log('\nFINAL');
console.log('-'.repeat(60));
finals.forEach((s, idx) => {
  if (s.team1.name) {
    console.log(`${idx + 1}. ${s.team1.name} vs ${s.team2.name}`);
    console.log(`   Series: ${s.team1.wins} - ${s.team2.wins}`);
    console.log(`   Games played: ${s.games.filter(g => g.status === 'finished').length} / ${s.games.length}`);
  } else {
    console.log(`${idx + 1}. TBD vs TBD`);
  }
  console.log();
});

console.log(`\nSaved to: ${outputPath}`);
