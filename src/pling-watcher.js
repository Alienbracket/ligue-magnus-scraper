const fs = require('fs');
const path = require('path');
const http = require('http');

const TODAYS_GAMES_PATH = path.join(__dirname, '../output/Todays_games.json');
const PLING_URL = 'http://localhost:3000/pling.json';
const CHECK_INTERVAL = 5000; // Check every 5 seconds
const DISPLAY_DELAY = 15000; // 15 seconds between pling displays
const OUTPUT_DIR = path.join(__dirname, '../output');

// Playoff teams (top 8) - only see playoff games
const PLAYOFF_TEAMS = [
  'ROUEN', 'AMIENS', 'ANGERS', 'NICE', 'BORDEAUX', 'MARSEILLE', 'GRENOBLE', 'BRIANÇON'
];

// Playdown teams (bottom 4) - only see playdown games
const PLAYDOWN_TEAMS = [
  'CERGY-PONTOISE', 'ANGLET', 'CHAMONIX', 'GAP'
];

// All teams in the league
const ALL_TEAMS = [...PLAYOFF_TEAMS, ...PLAYDOWN_TEAMS];

let previousGames = {};
let goalQueue = [];
let isProcessing = false;
let goalCount = 0;
let displayedCount = 0;

// Logger
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = {
    info: '[INFO]',
    success: '[✓]',
    error: '[✗]',
    goal: '[GOAL]'
  }[type] || '[INFO]';

  console.log(`${timestamp} ${prefix} ${message}`);
}

// Send pling data to server
function sendPlingUpdate(plingData) {
  return new Promise((resolve, reject) => {
    const jsonData = JSON.stringify(plingData);
    const url = new URL(PLING_URL);

    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonData)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, status: res.statusCode });
        } else {
          resolve({ success: false, status: res.statusCode, message: responseData });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    req.write(jsonData);
    req.end();
  });
}

// Write team-specific pling files (excludes each team's own games and other series)
function writeTeamPlingFiles(plingData) {
  const homeTeam = plingData.data[0].pling_Hometeam;
  const awayTeam = plingData.data[0].pling_Awayteam;

  // Determine which series this game belongs to
  const isPlayoffGame = PLAYOFF_TEAMS.includes(homeTeam) && PLAYOFF_TEAMS.includes(awayTeam);
  const isPlaydownGame = PLAYDOWN_TEAMS.includes(homeTeam) && PLAYDOWN_TEAMS.includes(awayTeam);

  // Write a pling file for ALL teams
  ALL_TEAMS.forEach(team => {
    const teamSlug = team.toLowerCase()
      .replace(/ç/g, 'c')  // Explicitly replace ç with c
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  // Remove diacritical marks
      .replace(/[^a-z0-9]/g, '-');
    const teamPlingPath = path.join(OUTPUT_DIR, `pling_${teamSlug}.json`);

    // Check if team is in the same series as this game
    const teamInPlayoffs = PLAYOFF_TEAMS.includes(team);
    const teamInPlaydowns = PLAYDOWN_TEAMS.includes(team);
    const inSameSeries = (isPlayoffGame && teamInPlayoffs) || (isPlaydownGame && teamInPlaydowns);

    // Show the game only if:
    // 1. Team is not playing in this game
    // 2. Game is in the same series as the team
    if (team !== homeTeam && team !== awayTeam && inSameSeries) {
      // Team is not playing and game is in their series - show the game
      fs.writeFileSync(teamPlingPath, JSON.stringify(plingData, null, 2));
    } else {
      // Team is playing OR game is in different series - show empty data
      const emptyPlingData = {
        ...plingData,
        count: 0,
        data: []
      };
      fs.writeFileSync(teamPlingPath, JSON.stringify(emptyPlingData, null, 2));
    }
  });
}

// Create game key for tracking
function getGameKey(game) {
  const homeTeam = game.home_team || game.equipe_domicile || '';
  const awayTeam = game.away_team || game.equipe_exterieur || '';
  return `${homeTeam}_vs_${awayTeam}`;
}

// Extract score from game object
function getScore(game) {
  return {
    home: parseInt(game.home_score || game.score_domicile || 0),
    away: parseInt(game.away_score || game.score_exterieur || 0)
  };
}

// Detect goals by comparing current games with previous state
function detectGoals(currentGames) {
  const goals = [];

  if (!currentGames || !currentGames.data || currentGames.data.length === 0) {
    return goals;
  }

  currentGames.data.forEach(game => {
    const gameKey = getGameKey(game);
    const currentScore = getScore(game);

    if (previousGames[gameKey]) {
      const prevScore = previousGames[gameKey];
      const homeGoals = currentScore.home - prevScore.home;
      const awayGoals = currentScore.away - prevScore.away;

      // Process home team goals (could be multiple)
      for (let i = 0; i < homeGoals; i++) {
        const homeTeam = game.home_team || game.equipe_domicile || '';
        goalCount++;
        // Calculate the score after THIS specific goal
        const scoreAfterGoal = {
          home: prevScore.home + i + 1,
          away: prevScore.away
        };
        goals.push({
          goalNumber: goalCount,
          game: game,
          scorer: homeTeam,
          scorerSide: 'home',
          scoreSnapshot: scoreAfterGoal,
          timestamp: new Date().toISOString()
        });
        log(`${homeTeam} scores! ${scoreAfterGoal.home}-${scoreAfterGoal.away}`, 'goal');
      }

      // Process away team goals (could be multiple)
      for (let i = 0; i < awayGoals; i++) {
        const awayTeam = game.away_team || game.equipe_exterieur || '';
        goalCount++;
        // Calculate the score after THIS specific goal
        const scoreAfterGoal = {
          home: prevScore.home + homeGoals,
          away: prevScore.away + i + 1
        };
        goals.push({
          goalNumber: goalCount,
          game: game,
          scorer: awayTeam,
          scorerSide: 'away',
          scoreSnapshot: scoreAfterGoal,
          timestamp: new Date().toISOString()
        });
        log(`${awayTeam} scores! ${scoreAfterGoal.home}-${scoreAfterGoal.away}`, 'goal');
      }
    }

    // Update previous state
    previousGames[gameKey] = currentScore;
  });

  return goals;
}

// Process the goal queue with 10-second delays
async function processQueue() {
  if (isProcessing || goalQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const goalEvent = goalQueue.shift();
  displayedCount++;

  const game = goalEvent.game;
  const homeTeam = game.home_team || game.equipe_domicile || '';
  const awayTeam = game.away_team || game.equipe_exterieur || '';
  const homeLogo = game.home_logo || game.logo_domicile || '';
  const awayLogo = game.away_logo || game.logo_exterieur || '';

  // Use the score snapshot from when the goal was scored, not current game state
  const scoreAtGoal = goalEvent.scoreSnapshot;

  // Determine which team scored for color highlighting
  let homeColor = "#00000000"; // transparent
  let awayColor = "#00000000"; // transparent

  if (goalEvent.scorerSide === 'home') {
    homeColor = "#1922e0"; // blue highlight
  } else if (goalEvent.scorerSide === 'away') {
    awayColor = "#1922e0"; // blue highlight
  }

  // Create pling data structure
  const plingData = {
    type: "pling",
    timestamp: new Date().toISOString(),
    count: 1,
    data: [
      {
        rank: 1,
        pling_Hometeam: homeTeam,
        pling_Hlogo: homeLogo,
        pling_Hscore: scoreAtGoal.home.toString(),
        pling_Homecolor: homeColor,
        pling_Awayteam: awayTeam,
        pling_Alogo: awayLogo,
        pling_Ascore: scoreAtGoal.away.toString(),
        pling_Awaycolor: awayColor
      }
    ]
  };

  // Send to server
  const result = await sendPlingUpdate(plingData);

  if (result.success) {
    log(`Goal #${goalEvent.goalNumber} displayed: ${goalEvent.scorer} - ${homeTeam} ${scoreAtGoal.home}-${scoreAtGoal.away} ${awayTeam}`, 'success');
    log(`  → Sent to ${PLING_URL} (HTTP ${result.status})`);

    // Also write team-specific pling files
    writeTeamPlingFiles(plingData);

    // Determine series for logging
    const isPlayoffGame = PLAYOFF_TEAMS.includes(homeTeam) && PLAYOFF_TEAMS.includes(awayTeam);
    const series = isPlayoffGame ? 'PLAYOFF' : 'PLAYDOWN';
    log(`  → Updated team-specific pling files (${series} series only, ${homeTeam} & ${awayTeam} excluded)`);
  } else {
    log(`Failed to send goal #${goalEvent.goalNumber}: ${result.error || result.message}`, 'error');
  }

  if (goalQueue.length > 0) {
    log(`  → ${goalQueue.length} goals remaining in queue`);
    log(`  → Waiting ${DISPLAY_DELAY / 1000}s for animation...`);
  }

  // Wait before processing next goal
  await new Promise(resolve => setTimeout(resolve, DISPLAY_DELAY));
  isProcessing = false;
}

// Watch for changes in Todays_games.json
function checkForUpdates() {
  try {
    // Check if file exists
    if (!fs.existsSync(TODAYS_GAMES_PATH)) {
      return;
    }

    // Read current games
    const fileContent = fs.readFileSync(TODAYS_GAMES_PATH, 'utf8');
    const currentGames = JSON.parse(fileContent);

    // Detect goals
    const goals = detectGoals(currentGames);

    // Add goals to queue
    if (goals.length > 0) {
      goalQueue.push(...goals);
      log(`${goals.length} goal(s) added to queue (${goalQueue.length} total in queue)`);
    }

  } catch (err) {
    if (err.code !== 'ENOENT') {
      log(`Error checking for updates: ${err.message}`, 'error');
    }
  }
}

// Initialize previous games state
function initializePreviousGames() {
  try {
    if (!fs.existsSync(TODAYS_GAMES_PATH)) {
      log('Waiting for Todays_games.json to be created...');
      return;
    }

    const fileContent = fs.readFileSync(TODAYS_GAMES_PATH, 'utf8');
    const currentGames = JSON.parse(fileContent);

    if (currentGames.data && currentGames.data.length > 0) {
      currentGames.data.forEach(game => {
        const gameKey = getGameKey(game);
        previousGames[gameKey] = getScore(game);
      });
      log(`Initialized tracking for ${Object.keys(previousGames).length} games`, 'success');
    }
  } catch (err) {
    log(`Error initializing: ${err.message}`, 'error');
  }
}

// Start the watcher
function start() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     Pling Watcher - Live Goals        ║');
  console.log('╚════════════════════════════════════════╝\n');

  log('Starting pling watcher...');
  log(`Monitoring: ${TODAYS_GAMES_PATH}`);
  log(`Posting to: ${PLING_URL}`);
  log(`Check interval: ${CHECK_INTERVAL / 1000}s`);
  log(`Display delay: ${DISPLAY_DELAY / 1000}s\n`);

  // Initialize previous state
  initializePreviousGames();

  // Start checking for updates
  setInterval(checkForUpdates, CHECK_INTERVAL);

  // Process goal queue
  setInterval(processQueue, 1000);

  log('Watcher running. Press Ctrl+C to stop.\n');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n');
  log('Shutting down pling watcher...');
  log(`Total goals detected: ${goalCount}`);
  log(`Total goals displayed: ${displayedCount}`);
  log(`Goals remaining in queue: ${goalQueue.length}`);
  process.exit(0);
});

// Handle errors
process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}`, 'error');
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  log(`Unhandled rejection: ${reason}`, 'error');
});

// Start the watcher
start();
