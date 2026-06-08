const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const Logger = require('./logger');

// Load configuration
let config;
try {
  const configFile = fs.readFileSync(path.join(__dirname, '../config/config.json'), 'utf8');
  config = JSON.parse(configFile);
} catch (err) {
  console.error('Failed to load config.json:', err.message);
  process.exit(1);
}

const FAST_INTERVAL = 60 * 1000; // 1 minute (during games)
const SLOW_INTERVAL = 60 * 60 * 1000; // 1 hour (before games)
const DORMANT_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes (when dormant)
const FORCE_FAST_MODE = process.env.FORCE_FAST_MODE === 'true'; // Force fast mode via env var
const logger = new Logger(config.logging);
let isRunning = false;
let currentInterval = FORCE_FAST_MODE ? FAST_INTERVAL : SLOW_INTERVAL; // Start with forced or slow mode
let updateTimer = null;
let twentyOClockTimer = null; // Timer for 20:00 forced update
let firstGameTimer = null; // Timer for first game +5min update
let isDormant = false; // Track if scraper is in dormant mode

// Create a temporary config file with only today's games
const fastConfig = {
  ...config,
  scraper: {
    ...config.scraper,
    urls: config.scraper.urls.filter(url => url.dateFilter === 'today')
  }
};

const fastConfigPath = path.join(__dirname, '../config/fast-config.json');
fs.writeFileSync(fastConfigPath, JSON.stringify(fastConfig, null, 2));

// Function to check if we're in active operating hours
function isInActiveHours() {
  try {
    // Get current Paris time
    const now = new Date();
    const parisNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const dayOfWeek = parisNow.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = parisNow.getHours();

    // Weekdays (Monday-Friday): Only active 19:00-23:59
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      if (hour >= 19 && hour <= 23) {
        return true;
      }
      return false;
    }

    // Weekends (Saturday-Sunday): Check if there are games today
    // If yes, be dynamic based on game times (2 hours before first game until all finished)
    // If no games, stay dormant
    const todaysGamesPath = path.join(__dirname, '../output', 'Todays_games.json');
    if (fs.existsSync(todaysGamesPath)) {
      const data = JSON.parse(fs.readFileSync(todaysGamesPath, 'utf8'));

      // Filter out test games and empty slots
      const realGames = data.data?.filter(game =>
        game.id !== null &&
        game.match !== '' &&
        !game.phase?.includes('Test') &&
        game.date !== 'Test'
      ) || [];

      // No real games on weekend = stay dormant
      if (realGames.length === 0) {
        return false;
      }

      // Check if all games are finished
      const allFinished = realGames.every(game => game.etat === 'T');
      if (allFinished) {
        return false; // Games finished, go dormant
      }

      // Check if we're within 2 hours of first game or games are in progress
      const firstGame = realGames[0];
      if (firstGame.date_numeric && firstGame.time) {
        const [year, month, day] = firstGame.date_numeric.split('-').map(Number);
        const [hours, minutes] = firstGame.time.split(':').map(Number);

        const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
        const parisHour = parseInt(noonUTC.toLocaleString('en-US', {
          timeZone: 'Europe/Paris',
          hour: '2-digit',
          hour12: false
        }));
        const parisOffset = parisHour - 12;

        const gameDateTime = new Date(Date.UTC(year, month - 1, day, hours - parisOffset, minutes, 0));
        const hoursUntilGame = (gameDateTime - now) / (1000 * 60 * 60);

        // Active if within 2 hours of game or game time has passed (game might be ongoing)
        if (hoursUntilGame <= 2) {
          return true;
        }
      }

      // Check if any game is currently in progress
      const anyGameInProgress = realGames.some(game =>
        game.en_cours === true || game.etat === 'E'
      );
      if (anyGameInProgress) {
        return true;
      }

      return false; // Too early for games
    }

    // No games file on weekend = stay dormant
    return false;
  } catch (err) {
    logger.error(`[FAST] Error checking active hours: ${err.message}`);
    return true; // Default to active on error (safer)
  }
}

// Function to check if all today's games are finished
function areAllGamesFinished() {
  try {
    const todaysGamesPath = path.join(__dirname, '../output', 'Todays_games.json');

    // If file doesn't exist, games are not finished
    if (!fs.existsSync(todaysGamesPath)) {
      return false;
    }

    const data = JSON.parse(fs.readFileSync(todaysGamesPath, 'utf8'));

    // If no games today, consider as "not finished" (nothing to shut down for)
    if (!data.data || data.data.length === 0) {
      return false;
    }

    // Filter out test games and empty slots
    const realGames = data.data.filter(game =>
      game.id !== null &&
      game.match !== '' &&
      !game.phase?.includes('Test') &&  // Ignore test games
      game.date !== 'Test'               // Ignore test games
    );

    // If no real games, shut down
    if (realGames.length === 0) {
      logger.info(`[FAST] No real games today (only test/empty games)`);
      return true;
    }

    // Get current time
    const now = new Date();
    const parisNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const currentDateStr = parisNow.toISOString().split('T')[0]; // YYYY-MM-DD

    // Check if ALL real games are truly finished
    const allFinished = realGames.every(game => {
      // EXPLICIT CHECK 1: Game marked as finished with etat="T"
      if (game.etat === 'T') {
        return true; // Definitely finished
      }

      // EXPLICIT CHECK 2: If etat is null or not 'T', check if game date/time is valid
      if (game.date_numeric && game.time) {
        // Check if game is for today
        if (game.date_numeric !== currentDateStr) {
          // Game is not for today - if it's in the past, consider it finished
          if (game.date_numeric < currentDateStr) {
            logger.warn(`[FAST] Game ${game.match} is from past date ${game.date_numeric} but etat is not 'T'. Considering finished.`);
            return true; // Old game, probably finished
          } else {
            // Game is in the future
            logger.info(`[FAST] Game ${game.match} is for future date ${game.date_numeric}. Not finished.`);
            return false; // Future game, not finished
          }
        }

        // Game is for today - check the time
        const [year, month, day] = game.date_numeric.split('-').map(Number);
        const [hours, minutes] = game.time.split(':').map(Number);

        const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
        const parisHour = parseInt(noonUTC.toLocaleString('en-US', {
          timeZone: 'Europe/Paris',
          hour: '2-digit',
          hour12: false
        }));
        const parisOffset = parisHour - 12;

        const gameDateTime = new Date(Date.UTC(year, month - 1, day, hours - parisOffset, minutes, 0));

        // If game time hasn't arrived yet (more than 10 minutes in future)
        if (gameDateTime > now && (gameDateTime - now) > (10 * 60 * 1000)) {
          logger.info(`[FAST] Game ${game.match} hasn't started yet (starts at ${game.time}). Not finished.`);
          return false; // Game hasn't started, not finished
        }

        // Game time has passed but etat is not 'T'
        // This could mean: game in progress, or data not updated yet
        // Check if game is currently in progress
        if (game.en_cours === true || game.etat === 'E') {
          logger.info(`[FAST] Game ${game.match} is in progress. Not finished.`);
          return false; // Game in progress
        }

        // Game time has passed, etat is null/not T, and not marked as in progress
        // This is ambiguous - be conservative and assume NOT finished
        // (Could be about to start, or data lag)
        logger.warn(`[FAST] Game ${game.match} time passed (${game.time}) but etat=${game.etat}, en_cours=${game.en_cours}. Assuming NOT finished (data may be updating).`);
        return false; // Be conservative
      }

      // No time data - can't determine, assume not finished
      logger.warn(`[FAST] Game ${game.match} has no time data. etat=${game.etat}. Assuming NOT finished.`);
      return false;
    });

    return allFinished;
  } catch (err) {
    logger.error(`[FAST] Error checking if games are finished: ${err.message}`);
    return false; // Safe default: assume not finished on error
  }
}

// Function to check if we should be in fast mode based on game times
function shouldUseFastMode() {
  // If force fast mode is enabled, always return true
  if (FORCE_FAST_MODE) {
    return true;
  }

  try {
    const todaysGamesPath = path.join(__dirname, '..', 'output', 'Todays_games.json');

    // If file doesn't exist, use slow mode
    if (!fs.existsSync(todaysGamesPath)) {
      return false;
    }

    const data = JSON.parse(fs.readFileSync(todaysGamesPath, 'utf8'));

    // If no games today, use slow mode
    if (!data.data || data.data.length === 0) {
      return false;
    }

    // First check if any game is currently in progress
    const anyGameInProgress = data.data.some(game =>
      game.en_cours === true || game.etat === 'E'
    );

    if (anyGameInProgress) {
      return true; // Use fast mode if any game is in progress
    }

    // Get the first game's start time
    const firstGame = data.data[0];

    // Try different date field formats
    let gameDateTime;
    if (firstGame.date_numeric && firstGame.time) {
      // New format: separate date_numeric and time fields
      // Times in JSON are Paris local time - convert to UTC

      // Parse game time components
      const [year, month, day] = firstGame.date_numeric.split('-').map(Number);
      const [hours, minutes] = firstGame.time.split(':').map(Number);

      // Determine Paris timezone offset for this date (CET=+1 or CEST=+2)
      const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      const parisHour = parseInt(noonUTC.toLocaleString('en-US', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        hour12: false
      }));
      const parisOffset = parisHour - 12;

      // Convert Paris local time to UTC
      gameDateTime = new Date(Date.UTC(year, month - 1, day, hours - parisOffset, minutes, 0));
    } else if (firstGame.date01) {
      // Old format: combined date01 field
      gameDateTime = new Date(firstGame.date01);
    } else if (firstGame.date) {
      // Fallback to date field
      gameDateTime = new Date(firstGame.date);
    } else {
      return false;
    }

    // Check if date parsing was successful
    if (isNaN(gameDateTime.getTime())) {
      return false;
    }

    // Get current UTC time
    const now = new Date();

    // If current time has passed the first game's start time, use fast mode
    return now >= gameDateTime;
  } catch (err) {
    logger.error(`[FAST] Error checking game times: ${err.message}`);
    return false; // Default to slow mode on error
  }
}

// Function to run supplementary scrapers (standings, filters, series summaries)
async function runSupplementaryScrapers() {
  try {
    logger.info('[SUPP] Running supplementary scrapers...');

    const scriptsToRun = [
      { path: 'scrape-playoff-games.js', name: 'Scrape Playoff Games' },
      { path: 'scrape-playdown-games.js', name: 'Scrape Playdown Games' },
      { path: 'scrape-playdown-standings.js', name: 'Playdown Standings' },
      { path: 'playdown-games-filter.js', name: 'Playdown Games Filter' },
      { path: 'playdown-series-summary.js', name: 'Playdown Series Summary' },
      { path: 'playoff-games-filter.js', name: 'Playoff Games Filter' },
      { path: 'playoff-series-summary.js', name: 'Playoff Series Summary' },
      { path: 'pad-playoff-stats.js', name: 'Pad Playoff Stats to 12 Slots' },
      { path: 'merge-todays-games.js', name: 'Merge Today\'s Games (All Competitions)' }
    ];

    for (const script of scriptsToRun) {
      await new Promise((resolve) => {
        const scriptPath = path.join(__dirname, script.path);

        // Check if file exists
        if (!fs.existsSync(scriptPath)) {
          logger.warn(`[SUPP] ${script.name} script not found: ${scriptPath}`);
          resolve();
          return;
        }

        const scraper = spawn(process.execPath, [scriptPath], {
          cwd: path.join(__dirname, '..'),
          stdio: 'pipe'
        });

        scraper.on('close', (code) => {
          if (code === 0) {
            logger.info(`[SUPP] ✓ ${script.name}`);
          } else {
            logger.warn(`[SUPP] ${script.name} failed with code ${code}`);
          }
          resolve();
        });

        scraper.on('error', (err) => {
          logger.warn(`[SUPP] ${script.name} error: ${err.message}`);
          resolve();
        });
      });
    }

    logger.info('[SUPP] ✓ All supplementary scrapers completed');
  } catch (err) {
    logger.error(`[SUPP] Error running supplementary scrapers: ${err.message}`);
  }
}

function runFastScraper() {
  return new Promise((resolve) => {
    if (isRunning) {
      logger.warn('[FAST] Scraper still running, skipping...');
      resolve();
      return;
    }

    isRunning = true;
    logger.info('[FAST] Updating today\'s games...');

    const scriptPath = path.join(__dirname, 'scraper-to-json.js');
    const scraper = spawn(process.execPath, [scriptPath, fastConfigPath], {
      cwd: path.join(__dirname, '..'), // Run from parent directory
      stdio: 'pipe' // Use pipe to suppress output
    });

    let output = '';
    scraper.stdout.on('data', (data) => {
      output += data.toString();
    });

    scraper.on('close', async (code) => {
      isRunning = false;
      if (code === 0) {
        // Only log success if there's useful output
        const lines = output.split('\n').filter(line => line.includes('Todays_games'));
        if (lines.length > 0) {
          logger.info(`[FAST] ${lines[0].trim()}`);
        }

        // After updating today's games, scrape period info for live games
        try {
          const periodScraperPath = path.join(__dirname, 'game-period-scraper.js');
          const periodScraper = spawn(process.execPath, [periodScraperPath], {
            cwd: path.join(__dirname, '..'),
            stdio: 'pipe'
          });

          periodScraper.on('close', async (periodCode) => {
            if (periodCode === 0) {
              logger.info('[FAST] ✓ Updated game periods');

              // Now merge the period data into Todays_games.json
              try {
                const fs = require('fs');
                const periodsPath = path.join(__dirname, '../output/game_periods.json');
                const gamesPath = path.join(__dirname, '../output/Todays_games.json');

                if (fs.existsSync(periodsPath) && fs.existsSync(gamesPath)) {
                  const periodsData = JSON.parse(fs.readFileSync(periodsPath, 'utf8'));
                  const gamesData = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
                  const gamePeriods = periodsData.periods || {};

                  // Merge periods into games
                  for (const game of gamesData.data) {
                    // Update period if we have live period data (regardless of en_cours flag)
                    if (gamePeriods[game.id]) {
                      game.period = gamePeriods[game.id];
                      // Also mark as live if we have period data
                      if (game.period !== "Avant le match" && game.period !== "Terminé") {
                        game.en_cours = true;
                      }
                    }
                  }

                  fs.writeFileSync(gamesPath, JSON.stringify(gamesData, null, 2));
                  logger.info('[FAST] ✓ Merged period data into Todays_games.json');
                }
              } catch (mergeErr) {
                logger.warn(`[FAST] Period merge error: ${mergeErr.message}`);
              }
            }

            // After period scraper, run supplementary scrapers
            await runSupplementaryScrapers();
            resolve();
          });

          periodScraper.on('error', (err) => {
            logger.warn(`[FAST] Period scraper error: ${err.message}`);
            resolve();
          });
        } catch (err) {
          logger.warn(`[FAST] Could not run period scraper: ${err.message}`);
          resolve();
        }
      } else {
        logger.error(`[FAST] Update failed with code ${code}`);
        resolve();
      }
    });

    scraper.on('error', (err) => {
      isRunning = false;
      logger.error(`[FAST] Error: ${err.message}`);
      resolve();
    });
  });
}

function scheduleNextUpdate() {
  // Clear existing timer
  if (updateTimer) {
    clearTimeout(updateTimer);
  }

  // Check if we're in active operating hours
  const inActiveHours = isInActiveHours();

  if (!inActiveHours) {
    // ANTI-RESTART-LOOP PROTECTION: Stay alive in dormant mode instead of exiting
    // This prevents PM2 from restarting the process repeatedly
    if (!isDormant) {
      const now = new Date();
      const parisNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
      const dayOfWeek = parisNow.getDay();
      const hour = parisNow.getHours();
      const minute = parisNow.getMinutes();
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

      logger.info(`[FAST] ════════════════════════════════════════`);
      logger.info(`[FAST] Current Paris time: ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]}`);

      if (isWeekday && hour < 19) {
        logger.info(`[FAST] Outside active hours (weekday before 19:00). Entering dormant mode.`);
      } else if (isWeekday && hour >= 0 && hour < 19) {
        logger.info(`[FAST] Outside active hours (weekday after midnight, before 19:00). Entering dormant mode.`);
      } else if (!isWeekday) {
        logger.info(`[FAST] Weekend: No games or too early. Entering dormant mode.`);
      } else {
        logger.info(`[FAST] All games finished or outside active hours. Entering dormant mode.`);
      }
      logger.info(`[FAST] Will check every 5 minutes for activity window.`);
      logger.info(`[FAST] Process will stay alive (no restart loop).`);
      logger.info(`[FAST] ════════════════════════════════════════`);
      isDormant = true;
    }

    // Schedule a check in 5 minutes
    updateTimer = setTimeout(() => {
      scheduleNextUpdate(); // Re-evaluate if we should become active
    }, DORMANT_CHECK_INTERVAL);
    return;
  }

  // We're in active hours - exit dormant mode if needed
  if (isDormant) {
    logger.info(`[FAST] Entered active hours. Resuming normal operation.`);
    isDormant = false;
  }

  // Check if all games are finished (but stay alive in dormant mode)
  if (areAllGamesFinished()) {
    if (!isDormant) {
      logger.info(`[FAST] All today's games are finished. Entering dormant mode.`);
      isDormant = true;
    }
    // Stay alive, check again in 5 minutes
    updateTimer = setTimeout(() => {
      scheduleNextUpdate();
    }, DORMANT_CHECK_INTERVAL);
    return;
  }

  // Check if we should switch modes
  const useFastMode = shouldUseFastMode();
  const newInterval = useFastMode ? FAST_INTERVAL : SLOW_INTERVAL;

  // Log mode change
  if (newInterval !== currentInterval) {
    const oldMode = currentInterval === FAST_INTERVAL ? 'fast (1 min)' : 'slow (1 hour)';
    const newMode = newInterval === FAST_INTERVAL ? 'fast (1 min)' : 'slow (1 hour)';
    logger.info(`[FAST] Switching from ${oldMode} to ${newMode} mode`);
    currentInterval = newInterval;
  }

  // Schedule next run
  updateTimer = setTimeout(async () => {
    await runFastScraper();
    scheduleNextUpdate(); // Schedule the next one
  }, currentInterval);
}

// Function to schedule a forced update at 20:00 Paris time on game days
function scheduleTwentyOClockUpdate() {
  try {
    // Clear any existing 20:00 timer
    if (twentyOClockTimer) {
      clearTimeout(twentyOClockTimer);
      twentyOClockTimer = null;
    }

    // Get current time in Paris
    const now = new Date();
    const parisNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));

    // Create target time: today at 20:00 Paris time
    const targetParis = new Date(parisNow);
    targetParis.setHours(20, 0, 0, 0);

    // If 20:00 has already passed today, don't schedule
    if (parisNow >= targetParis) {
      logger.info('[FAST] 20:00 Paris time has already passed today. Skipping 20:00 auto-update.');
      return;
    }

    // Convert target Paris time to UTC for scheduling
    // We need to find the UTC timestamp that corresponds to 20:00 Paris time
    const parisOffset = (targetParis.getTimezoneOffset() - now.getTimezoneOffset()) / 60;
    const targetUTC = new Date(targetParis.getTime() - (parisOffset * 60 * 60 * 1000));

    const msUntilTwenty = targetUTC - now;

    if (msUntilTwenty > 0) {
      const minutesUntil = Math.floor(msUntilTwenty / 60000);
      logger.info(`[FAST] Scheduled automatic update at 20:00 Paris time (in ${minutesUntil} minutes)`);

      twentyOClockTimer = setTimeout(async () => {
        logger.info('[FAST] ⏰ Triggering scheduled 20:00 update...');
        await runFastScraper();
        logger.info('[FAST] ✓ 20:00 update completed');

        // Re-evaluate mode and schedule next update
        scheduleNextUpdate();
      }, msUntilTwenty);
    }
  } catch (err) {
    logger.error(`[FAST] Error scheduling 20:00 update: ${err.message}`);
  }
}

// Function to schedule a forced update 5 minutes after the first game starts
function scheduleFirstGameUpdate() {
  try {
    // Clear any existing first game timer
    if (firstGameTimer) {
      clearTimeout(firstGameTimer);
      firstGameTimer = null;
    }

    // Read today's games to get the first game time
    const todaysGamesPath = path.join(__dirname, '../output', 'Todays_games.json');

    if (!fs.existsSync(todaysGamesPath)) {
      logger.info('[FAST] No games file found. Skipping first game auto-update.');
      return;
    }

    const data = JSON.parse(fs.readFileSync(todaysGamesPath, 'utf8'));

    // If no games today, skip
    if (!data.data || data.data.length === 0) {
      logger.info('[FAST] No games today. Skipping first game auto-update.');
      return;
    }

    // Get the first game
    const firstGame = data.data[0];

    if (!firstGame.date_numeric || !firstGame.time) {
      logger.info('[FAST] First game has no time data. Skipping first game auto-update.');
      return;
    }

    // Parse game time components
    const [year, month, day] = firstGame.date_numeric.split('-').map(Number);
    const [hours, minutes] = firstGame.time.split(':').map(Number);

    // Determine Paris timezone offset for this date (CET=+1 or CEST=+2)
    const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const parisHour = parseInt(noonUTC.toLocaleString('en-US', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      hour12: false
    }));
    const parisOffset = parisHour - 12;

    // Convert Paris local time to UTC
    const gameDateTime = new Date(Date.UTC(year, month - 1, day, hours - parisOffset, minutes, 0));

    // Check if date parsing was successful
    if (isNaN(gameDateTime.getTime())) {
      logger.error('[FAST] Failed to parse first game time. Skipping first game auto-update.');
      return;
    }

    // Add 5 minutes to game start time
    const targetTime = new Date(gameDateTime.getTime() + (5 * 60 * 1000));
    const now = new Date();

    // If target time has already passed, don't schedule
    if (now >= targetTime) {
      logger.info('[FAST] First game +5min time has already passed. Skipping first game auto-update.');
      return;
    }

    const msUntilTarget = targetTime - now;
    const minutesUntil = Math.floor(msUntilTarget / 60000);

    // Format game time for display
    const gameTimeStr = `${firstGame.time || 'unknown'}`;

    logger.info(`[FAST] Scheduled automatic update 5min after first game starts (${gameTimeStr} + 5min = in ${minutesUntil} minutes)`);

    firstGameTimer = setTimeout(async () => {
      logger.info(`[FAST] ⏰ Triggering first game +5min update (game started at ${gameTimeStr})...`);
      await runFastScraper();
      logger.info('[FAST] ✓ First game +5min update completed');

      // Re-evaluate mode and schedule next update
      scheduleNextUpdate();
    }, msUntilTarget);
  } catch (err) {
    logger.error(`[FAST] Error scheduling first game update: ${err.message}`);
  }
}

async function start() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   Fast Scraper - Today\'s Games        ║');
  console.log('║   Smart Mode: Dynamic Schedule        ║');
  console.log('║   Weekdays: 19:00-23:59               ║');
  console.log('║   Weekends: 2h before games           ║');
  console.log('╚════════════════════════════════════════╝\n');

  logger.info('[FAST] Starting smart fast scraper for today\'s games');

  if (FORCE_FAST_MODE) {
    logger.info('[FAST] ⚡ FORCE FAST MODE ENABLED - Will use 1 minute interval regardless of game status');
  }

  // Check if we're in active hours
  const inActiveHours = isInActiveHours();

  if (!inActiveHours) {
    logger.info('[FAST] Currently outside active operating hours.');
    logger.info('[FAST] Entering dormant mode. Will activate when needed.');
    isDormant = true;
    // Don't run scraper now, just schedule checks
    scheduleNextUpdate();
    logger.info('[FAST] Fast scraper running in dormant mode. Press Ctrl+C to stop.\n');
    return;
  }

  // We're in active hours
  const todaysGamesPath = path.join(__dirname, '../output', 'Todays_games.json');
  if (fs.existsSync(todaysGamesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(todaysGamesPath, 'utf8'));

      // Check if all games are already finished
      if (areAllGamesFinished()) {
        logger.info('[FAST] All games for today are finished.');
        logger.info('[FAST] Entering dormant mode. Will reactivate when needed.');
        isDormant = true;
        scheduleNextUpdate();
        logger.info('[FAST] Fast scraper running in dormant mode. Press Ctrl+C to stop.\n');
        return;
      }
    } catch (err) {
      logger.warn(`[FAST] Error checking games status: ${err.message}`);
      // Continue anyway
    }
  }

  // Determine initial mode
  const useFastMode = shouldUseFastMode();
  currentInterval = useFastMode ? FAST_INTERVAL : SLOW_INTERVAL;
  const mode = FORCE_FAST_MODE
    ? '1 minute (FORCED FAST MODE)'
    : (currentInterval === FAST_INTERVAL ? '1 minute (games started)' : '1 hour (waiting for games)');
  logger.info(`[FAST] Initial mode: ${mode}\n`);

  // Run immediately on startup
  await runFastScraper();

  // Schedule automatic update at 20:00 Paris time (if not passed yet)
  scheduleTwentyOClockUpdate();

  // Schedule automatic update 5 minutes after first game starts
  scheduleFirstGameUpdate();

  // Schedule next update
  scheduleNextUpdate();

  logger.info('[FAST] Fast scraper running actively. Press Ctrl+C to stop.\n');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n');
  logger.info('[FAST] Shutting down...');

  // Clear timers
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  if (twentyOClockTimer) {
    clearTimeout(twentyOClockTimer);
  }
  if (firstGameTimer) {
    clearTimeout(firstGameTimer);
  }

  // Clean up temp config
  try {
    fs.unlinkSync(fastConfigPath);
  } catch (err) {
    // Ignore
  }

  process.exit(0);
});

// Start the fast scraper
start();
