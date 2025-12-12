const fs = require('fs');
const path = require('path');
const http = require('http');

// Real games from Todays_games.json
const games = [
  {
    home_team: "MARSEILLE",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\marseille.png",
    home_score: 3,
    away_team: "GRENOBLE",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\grenoble.png",
    away_score: 2
  },
  {
    home_team: "ROUEN",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\rouen.png",
    home_score: 1,
    away_team: "ANGERS",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\angers.png",
    away_score: 1
  },
  {
    home_team: "BORDEAUX",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\bordeaux.png",
    home_score: 2,
    away_team: "NICE",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\nice.png",
    away_score: 3
  },
  {
    home_team: "AMIENS",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\amiens.png",
    home_score: 0,
    away_team: "BRIANÇON",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\briançon.png",
    away_score: 1
  },
  {
    home_team: "CHAMONIX",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\chamonix.png",
    home_score: 2,
    away_team: "ANGLET",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\anglet.png",
    away_score: 2
  },
  {
    home_team: "GAP",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\gap.png",
    home_score: 1,
    away_team: "CERGY-PONTOISE",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\cergy-pontoise.png",
    away_score: 0
  }
];

const outputPath = path.join(__dirname, 'output', 'pling.json');
const DISPLAY_DELAY = 10000; // 10 seconds between JSON updates (animation time + buffer)
const REMOTE_URL = 'http://data.borka.live:3000/pling.json';

let goalCount = 0;
let displayedCount = 0;
let goalQueue = [];
let isProcessing = false;
let previousScores = {}; // Track previous scores for each game

// Send data to remote URL
function sendToRemote(data) {
  return new Promise((resolve, reject) => {
    const jsonData = JSON.stringify(data);
    const url = new URL(REMOTE_URL);

    const options = {
      hostname: url.hostname,
      port: url.port,
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

// Generate a goal event (adds to queue)
function generateGoal() {
  // Pick a random game
  const gameIndex = Math.floor(Math.random() * games.length);
  const game = { ...games[gameIndex] };

  // Randomly score a goal for home or away team
  const homeScores = Math.random() > 0.5;
  if (homeScores) {
    game.home_score++;
    games[gameIndex].home_score++;
  } else {
    game.away_score++;
    games[gameIndex].away_score++;
  }

  goalCount++;
  const scorer = homeScores ? game.home_team : game.away_team;

  // Add goal to queue
  goalQueue.push({
    goalNumber: goalCount,
    game: game,
    scorer: scorer,
    timestamp: new Date().toISOString()
  });

  console.log(`[Goal #${goalCount} SCORED] ${scorer} scores! ${game.home_team} ${game.home_score}-${game.away_score} ${game.away_team} (queued, ${goalQueue.length} in queue)`);
}

// Process the goal queue (writes to JSON with delay)
async function processQueue() {
  if (isProcessing || goalQueue.length === 0) {
    return;
  }

  isProcessing = true;

  const goalEvent = goalQueue.shift();
  displayedCount++;

  // Create game key for tracking
  const gameKey = `${goalEvent.game.home_team}_${goalEvent.game.away_team}`;

  // Determine which team scored by comparing with previous score
  let homeColor = "#00000000"; // transparent
  let awayColor = "#00000000"; // transparent

  if (previousScores[gameKey]) {
    const prevHome = previousScores[gameKey].home_score;
    const prevAway = previousScores[gameKey].away_score;

    if (goalEvent.game.home_score > prevHome) {
      homeColor = "#1922e0"; // blue - home team scored
    } else if (goalEvent.game.away_score > prevAway) {
      awayColor = "#1922e0"; // blue - away team scored
    }
  } else {
    // First goal of the game - check which score is not 0
    if (goalEvent.game.home_score > 0) {
      homeColor = "#1922e0";
    } else if (goalEvent.game.away_score > 0) {
      awayColor = "#1922e0";
    }
  }

  // Update previous scores
  previousScores[gameKey] = {
    home_score: goalEvent.game.home_score,
    away_score: goalEvent.game.away_score
  };

  const plingData = {
    type: "pling",
    timestamp: new Date().toISOString(),
    count: 1,
    data: [
      {
        rank: 1,
        pling_Hometeam: goalEvent.game.home_team,
        pling_Hlogo: goalEvent.game.home_logo,
        pling_Hscore: goalEvent.game.home_score.toString(),
        pling_Homecolor: homeColor,
        pling_Awayteam: goalEvent.game.away_team,
        pling_Alogo: goalEvent.game.away_logo,
        pling_Ascore: goalEvent.game.away_score.toString(),
        pling_Awaycolor: awayColor
      }
    ]
  };

  // Write to local file
  fs.writeFileSync(outputPath, JSON.stringify(plingData, null, 2), { mode: 0o644 });

  // Send to remote URL
  const result = await sendToRemote(plingData);

  console.log(`[Goal #${goalEvent.goalNumber} DISPLAYED] ${goalEvent.scorer} - ${goalEvent.game.home_team} ${goalEvent.game.home_score}-${goalEvent.game.away_score} ${goalEvent.game.away_team}`);
  console.log(`  → Updated local JSON at ${new Date().toLocaleTimeString()}`);
  if (result.success) {
    console.log(`  ✓ Sent to remote URL (HTTP ${result.status})`);
  } else {
    console.log(`  ✗ Failed to send to remote: ${result.error || result.message || 'Unknown error'}`);
  }
  console.log(`  → ${goalQueue.length} goals remaining in queue`);
  console.log('---');

  // Wait 7 seconds before processing next goal (allows animation to complete)
  if (goalQueue.length > 0) {
    console.log(`  ⏳ Waiting ${DISPLAY_DELAY / 1000}s for animation to complete...`);
  }

  await new Promise(resolve => setTimeout(resolve, DISPLAY_DELAY));
  isProcessing = false;
}

// Check queue periodically
setInterval(processQueue, 1000);

// Get interval from command line argument (default 3 seconds)
const interval = parseInt(process.argv[2]) || 3000;
const duration = parseInt(process.argv[3]) || 60000; // default 60 seconds

console.log(`Starting pling stress test with queue system...`);
console.log(`Simulating goals every ${interval}ms for ${duration}ms`);
console.log(`Display delay: ${DISPLAY_DELAY / 1000}s between updates (ensures vMix animation completes)`);
console.log(`Watching: ${games.length} games`);
console.log(`Local output: ${outputPath}`);
console.log(`Remote URL: ${REMOTE_URL}`);
console.log('---\n');

// Initial goal
generateGoal();

// Set up interval to generate goals
const intervalId = setInterval(generateGoal, interval);

// Stop after duration
setTimeout(() => {
  clearInterval(intervalId);

  // Wait for queue to finish processing
  const checkQueue = setInterval(() => {
    if (goalQueue.length === 0 && !isProcessing) {
      clearInterval(checkQueue);

      console.log(`\n=== Stress test complete! ===`);
      console.log(`Total goals scored: ${goalCount}`);
      console.log(`Total goals displayed: ${displayedCount}`);
      console.log(`Goals still in queue: ${goalQueue.length}`);
      console.log(`\nFinal scores:`);
      games.forEach(game => {
        console.log(`  ${game.home_team} ${game.home_score}-${game.away_score} ${game.away_team}`);
      });
      process.exit(0);
    } else {
      console.log(`\n⏳ Waiting for queue to finish... (${goalQueue.length} goals remaining)`);
    }
  }, 2000);
}, duration);
