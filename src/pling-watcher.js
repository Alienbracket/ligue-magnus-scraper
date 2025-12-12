const fs = require('fs');
const path = require('path');
const http = require('http');

const TODAYS_GAMES_PATH = path.join(__dirname, '../output/Todays_games.json');
const PLING_URL = 'http://localhost:3000/pling.json';
const CHECK_INTERVAL = 5000; // Check every 5 seconds
const DISPLAY_DELAY = 10000; // 10 seconds between pling displays

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

      // Check if home team scored
      if (currentScore.home > prevScore.home) {
        const homeTeam = game.home_team || game.equipe_domicile || '';
        goalCount++;
        goals.push({
          goalNumber: goalCount,
          game: game,
          scorer: homeTeam,
          scorerSide: 'home',
          timestamp: new Date().toISOString()
        });
        log(`${homeTeam} scores! ${currentScore.home}-${currentScore.away}`, 'goal');
      }

      // Check if away team scored
      if (currentScore.away > prevScore.away) {
        const awayTeam = game.away_team || game.equipe_exterieur || '';
        goalCount++;
        goals.push({
          goalNumber: goalCount,
          game: game,
          scorer: awayTeam,
          scorerSide: 'away',
          timestamp: new Date().toISOString()
        });
        log(`${awayTeam} scores! ${currentScore.home}-${currentScore.away}`, 'goal');
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
  const currentScore = getScore(game);

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
        pling_Hscore: currentScore.home.toString(),
        pling_Homecolor: homeColor,
        pling_Awayteam: awayTeam,
        pling_Alogo: awayLogo,
        pling_Ascore: currentScore.away.toString(),
        pling_Awaycolor: awayColor
      }
    ]
  };

  // Send to server
  const result = await sendPlingUpdate(plingData);

  if (result.success) {
    log(`Goal #${goalEvent.goalNumber} displayed: ${goalEvent.scorer} - ${homeTeam} ${currentScore.home}-${currentScore.away} ${awayTeam}`, 'success');
    log(`  → Sent to ${PLING_URL} (HTTP ${result.status})`);
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
