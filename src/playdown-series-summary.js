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

// Read playdown games data
const playdownGamesPath = path.join(__dirname, '../output/playdown-games.json');

if (!fs.existsSync(playdownGamesPath)) {
  console.error('playdown-games.json not found. Run scrape-playdown-games.js first.');
  process.exit(1);
}

const playdownData = JSON.parse(fs.readFileSync(playdownGamesPath, 'utf8'));
const games = playdownData.data;

// Read playdown standings data (optional)
const playdownStandingsPath = path.join(__dirname, '../output/playdown-standings.json');
let standingsData = null;
if (fs.existsSync(playdownStandingsPath)) {
  const standingsFile = JSON.parse(fs.readFileSync(playdownStandingsPath, 'utf8'));
  standingsData = standingsFile.data;
  console.log(`Found ${standingsData.length} teams in standings data`);
}

console.log(`Processing ${games.length} playdown games...\n`);

// Group games by series (team matchup)
const seriesMap = {};

games.forEach(game => {
  // Create a unique series key based on the two teams (alphabetically sorted to ensure consistency)
  const teams = [game.home_short, game.away_short].sort();
  const seriesKey = teams.join(' vs ');

  if (!seriesMap[seriesKey]) {
    // Initialize series
    const team1FullName = teams[0] === game.home_short ? game.home_team : game.away_team;
    const team2FullName = teams[1] === game.home_short ? game.home_team : game.away_team;

    seriesMap[seriesKey] = {
      series_id: seriesKey,
      round: game.round || game.phase || 'Playdown Series',
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

// Add logo field to standings data
const standingsWithLogos = standingsData ? standingsData.map(team => ({
  ...team,
  logo: getTeamLogo(team.team_name)
})) : [];

// Create output - playdowns only have round-robin series, no playoffs structure
const output = {
  type: 'playdown-series-summary',
  timestamp: new Date().toISOString(),
  phase: playdownData.phase,
  standings: standingsWithLogos,  // Add standings data with logos
  series: allSeries
};

// Save to file
const outputPath = path.join(__dirname, '../output/playdown-series.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log('Playdown Series Summary');
console.log('='.repeat(60));
console.log();

console.log('PLAYDOWN SERIES (Round-Robin)');
console.log('-'.repeat(60));
allSeries.forEach((s, idx) => {
  console.log(`${idx + 1}. ${s.team1.name} vs ${s.team2.name}`);
  console.log(`   Round: ${s.round}`);
  console.log(`   Series: ${s.team1.wins} - ${s.team2.wins}`);
  console.log(`   Games played: ${s.games.filter(g => g.status === 'finished').length} / ${s.games.length}`);
  console.log();
});

console.log(`Saved to: ${outputPath}`);
