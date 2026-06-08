const fs = require('fs');
const path = require('path');

// All teams in the league
const ALL_TEAMS = [
  'ROUEN', 'ANGERS', 'GRENOBLE', 'BORDEAUX', 'MARSEILLE', 'NICE',
  'AMIENS', 'BRIANÇON', 'CHAMONIX', 'ANGLET', 'GAP', 'CERGY-PONTOISE'
];

// Real games from Todays_games.json - starting from 0-0
const games = [
  {
    home_team: "MARSEILLE",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\marseille.png",
    home_score: 0,
    away_team: "GRENOBLE",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\grenoble.png",
    away_score: 0
  },
  {
    home_team: "ROUEN",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\rouen.png",
    home_score: 0,
    away_team: "ANGERS",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\angers.png",
    away_score: 0
  },
  {
    home_team: "BORDEAUX",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\bordeaux.png",
    home_score: 0,
    away_team: "NICE",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\nice.png",
    away_score: 0
  },
  {
    home_team: "AMIENS",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\amiens.png",
    home_score: 0,
    away_team: "BRIANÇON",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\briançon.png",
    away_score: 0
  },
  {
    home_team: "CHAMONIX",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\chamonix.png",
    home_score: 0,
    away_team: "ANGLET",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\anglet.png",
    away_score: 0
  },
  {
    home_team: "GAP",
    home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\gap.png",
    home_score: 0,
    away_team: "CERGY-PONTOISE",
    away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\cergy-pontoise.png",
    away_score: 0
  }
];

const outputDir = path.join(__dirname, 'output');
const DISPLAY_DELAY = 10000; // 10 seconds between JSON updates (animation time + buffer)

let goalCount = 0;
let displayedCount = 0;
let goalQueue = [];
let isProcessing = false;

// Generate team-specific file path
function getTeamPlingPath(team) {
  const teamSlug = team.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return path.join(outputDir, `pling_${teamSlug}.json`);
}

// Initialize all team pling files with empty state
function initializeTeamFiles() {
  ALL_TEAMS.forEach(team => {
    const filePath = getTeamPlingPath(team);

    // Filter out games involving this team
    const teamGames = games.filter(game =>
      game.home_team !== team && game.away_team !== team
    );

    // Create data for all games not involving this team (all starting at 0-0)
    const teamGamesData = teamGames.map((game, index) => ({
      rank: index + 1,
      pling_Hometeam: game.home_team,
      pling_Hlogo: game.home_logo,
      pling_Hscore: "0",
      pling_Homecolor: "#00000000",
      pling_Awayteam: game.away_team,
      pling_Alogo: game.away_logo,
      pling_Ascore: "0",
      pling_Awaycolor: "#00000000"
    }));

    const emptyData = {
      type: "pling",
      timestamp: new Date().toISOString(),
      count: teamGamesData.length,
      data: teamGamesData
    };
    fs.writeFileSync(filePath, JSON.stringify(emptyData, null, 2), { mode: 0o644 });
  });
  console.log(`Initialized ${ALL_TEAMS.length} team-specific pling files with trigger=0`);
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

  // Write to ALL team files EXCEPT the two teams involved in this game
  const excludedTeams = [goalEvent.game.home_team, goalEvent.game.away_team];
  let filesUpdated = 0;

  // STEP 1: Write trigger update with OLD data + new sequence number
  // This triggers vMix animation without changing the visible data yet
  const triggerSeq = displayedCount;

  ALL_TEAMS.forEach(team => {
    if (!excludedTeams.includes(team)) {
      const filePath = getTeamPlingPath(team);
      // Read current data
      let currentData = {};
      try {
        currentData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (err) {
        // File might not exist yet
      }

      // Update only the trigger field
      const triggerData = {
        ...currentData,
        trigger: triggerSeq,
        timestamp: new Date().toISOString()
      };
      fs.writeFileSync(filePath, JSON.stringify(triggerData, null, 2), { mode: 0o644 });
    }
  });

  // STEP 2: Wait 200ms for vMix to start the animation
  await new Promise(resolve => setTimeout(resolve, 200));

  // STEP 3: Now update with the NEW score data
  // Write team-specific files with ALL games (excluding that team's games)
  ALL_TEAMS.forEach(team => {
    if (!excludedTeams.includes(team)) {
      // Filter out games involving this team
      const teamGames = games.filter(game =>
        game.home_team !== team && game.away_team !== team
      );

      // Create data for all games not involving this team
      const teamGamesData = teamGames.map((game, index) => ({
        rank: index + 1,
        pling_Hometeam: game.home_team,
        pling_Hlogo: game.home_logo,
        pling_Hscore: game.home_score.toString(),
        pling_Awayteam: game.away_team,
        pling_Alogo: game.away_logo,
        pling_Ascore: game.away_score.toString()
      }));

      const teamData = {
        type: "pling",
        timestamp: new Date().toISOString(),
        trigger: triggerSeq,
        count: teamGamesData.length,
        data: teamGamesData
      };

      const filePath = getTeamPlingPath(team);
      fs.writeFileSync(filePath, JSON.stringify(teamData, null, 2), { mode: 0o644 });
      filesUpdated++;
    }
  });

  console.log(`[Goal #${goalEvent.goalNumber} DISPLAYED] ${goalEvent.scorer} - ${goalEvent.game.home_team} ${goalEvent.game.home_score}-${goalEvent.game.away_score} ${goalEvent.game.away_team}`);
  console.log(`  → Trigger sequence: ${triggerSeq}`);
  console.log(`  → Updated ${filesUpdated} team pling files (excluded: ${excludedTeams.join(', ')})`);
  console.log(`  → Queue: ${goalQueue.length} remaining`);
  console.log('---');

  // Wait 10 seconds before processing next goal (allows animation to complete)
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

console.log(`Starting team-specific pling stress test...`);
console.log(`Simulating goals every ${interval}ms for ${duration}ms`);
console.log(`Display delay: ${DISPLAY_DELAY / 1000}s between updates (ensures vMix animation completes)`);
console.log(`Watching: ${games.length} games`);
console.log(`Teams: ${ALL_TEAMS.length}`);
console.log(`Output: ${outputDir}/pling_[team].json`);
console.log('---\n');

// Initialize team files
initializeTeamFiles();
console.log('⏳ Waiting 5 seconds for vMix to read initialized state (trigger=0)...\n');

// Wait 5 seconds after initialization to give vMix time to poll and read the 0-0 state
setTimeout(() => {
  console.log('✅ vMix should have read the initialized state. Starting goal generation...\n');

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
        console.log(`\nTeam-specific pling files:`);
        ALL_TEAMS.forEach(team => {
          const teamSlug = team.toLowerCase().replace(/[^a-z0-9]/g, '-');
          console.log(`  http://data.borka.live:3000/pling_${teamSlug}.json - excludes ${team} games`);
        });

        // Wait 5 seconds before exiting to give vMix time to read the final score
        console.log(`\n⏳ Waiting 5 seconds for vMix to read final score...`);
        setTimeout(() => {
          console.log(`✅ Done! vMix should have the final score now.`);
          process.exit(0);
        }, 5000);
      } else {
        console.log(`\n⏳ Waiting for queue to finish... (${goalQueue.length} goals remaining)`);
      }
    }, 2000);
  }, duration);
}, 5000);
