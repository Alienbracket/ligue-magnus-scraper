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
const logger = new Logger(config.logging);
let isRunning = false;
let currentInterval = SLOW_INTERVAL; // Start with slow mode
let updateTimer = null;

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

    // Check if ALL games have etat="T" (Terminé = Finished)
    const allFinished = data.data.every(game => {
      return game.etat === 'T';
    });

    return allFinished;
  } catch (err) {
    logger.error(`[FAST] Error checking if games are finished: ${err.message}`);
    return false;
  }
}

// Function to check if we should be in fast mode based on game times
function shouldUseFastMode() {
  try {
    const todaysGamesPath = path.join(__dirname, 'output', 'Todays_games.json');

    // If file doesn't exist, use slow mode
    if (!fs.existsSync(todaysGamesPath)) {
      return false;
    }

    const data = JSON.parse(fs.readFileSync(todaysGamesPath, 'utf8'));

    // If no games today, use slow mode
    if (!data.data || data.data.length === 0) {
      return false;
    }

    // Get the first game's start time
    const firstGame = data.data[0];
    if (!firstGame.date) {
      return false;
    }

    // Parse the game date (format: "2025-12-05 20:00")
    const gameDateTime = new Date(firstGame.date);
    const now = new Date();

    // If current time has passed the first game's start time, use fast mode
    return now >= gameDateTime;
  } catch (err) {
    logger.error(`[FAST] Error checking game times: ${err.message}`);
    return false; // Default to slow mode on error
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
      cwd: __dirname,
      stdio: 'pipe' // Use pipe to suppress output
    });

    let output = '';
    scraper.stdout.on('data', (data) => {
      output += data.toString();
    });

    scraper.on('close', (code) => {
      isRunning = false;
      if (code === 0) {
        // Only log success if there's useful output
        const lines = output.split('\n').filter(line => line.includes('Todays_games'));
        if (lines.length > 0) {
          logger.info(`[FAST] ${lines[0].trim()}`);
        }
        resolve();
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

  // Check if all games are finished - if so, trigger shutdown
  if (areAllGamesFinished()) {
    logger.info(`[FAST] All today's games are finished! Initiating system shutdown...`);
    logger.info(`[FAST] Shutting down in 30 seconds to allow final data access...`);

    // Wait 30 seconds before shutdown to allow final data to be served
    setTimeout(() => {
      logger.info(`[FAST] System shutdown complete. All games finished.`);
      process.exit(0);
    }, 30000);
    return; // Don't schedule next update
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

async function start() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   Fast Scraper - Today\'s Games        ║');
  console.log('║   Smart Mode: 1 hour → 1 min          ║');
  console.log('╚════════════════════════════════════════╝\n');

  logger.info('[FAST] Starting smart fast scraper for today\'s games');

  // Determine initial mode
  const useFastMode = shouldUseFastMode();
  currentInterval = useFastMode ? FAST_INTERVAL : SLOW_INTERVAL;
  const mode = currentInterval === FAST_INTERVAL ? '1 minute (games started)' : '1 hour (waiting for games)';
  logger.info(`[FAST] Initial mode: ${mode}\n`);

  // Run immediately on startup
  await runFastScraper();

  // Schedule next update
  scheduleNextUpdate();

  logger.info('[FAST] Fast scraper running. Press Ctrl+C to stop.\n');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n');
  logger.info('[FAST] Shutting down...');

  // Clear timer
  if (updateTimer) {
    clearTimeout(updateTimer);
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
