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
  console.error('Using default configuration...');
  config = {
    scraper: { intervalMinutes: 5 },
    server: { port: 3000 },
    logging: { enabled: true, directory: '../logs', console: true, file: true }
  };
}

const SCRAPE_INTERVAL = config.scraper.intervalMinutes * 60 * 1000;
const HTTP_SERVER_PORT = config.server.port;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 30000; // 30 seconds

let isScraperRunning = false;
let httpServer = null;
let fastScraper = null;
let plingWatcher = null;
let httpServerRestarts = 0;
let fastScraperRestarts = 0;
let plingWatcherRestarts = 0;
let consecutiveFailures = 0;
const logger = new Logger(config.logging);

function startHttpServer() {
  return new Promise((resolve, reject) => {
    // Kill existing HTTP server if it exists
    if (httpServer) {
      logger.warn('Stopping existing HTTP server...');
      httpServer.kill();
      httpServer = null;
    }

    logger.info('Starting HTTP server...');

    const scriptPath = path.join(__dirname, 'http-server.js');
    httpServer = spawn(process.execPath, [scriptPath], {
      cwd: __dirname,
      stdio: 'inherit'
    });

    httpServer.on('error', (err) => {
      logger.error(`HTTP Server error: ${err.message}`);
      reject(err);
    });

    httpServer.on('close', (code) => {
      if (code !== 0 && code !== null) {
        logger.error(`HTTP Server crashed with code ${code}`);

        // Ensure old process is fully terminated
        httpServer = null;

        // Auto-restart HTTP server with longer delay to allow port release
        if (httpServerRestarts < MAX_RETRY_ATTEMPTS) {
          httpServerRestarts++;
          logger.warn(`Attempting to restart HTTP server (${httpServerRestarts}/${MAX_RETRY_ATTEMPTS})...`);
          setTimeout(() => {
            startHttpServer()
              .then(() => {
                httpServerRestarts = 0;
                logger.success('HTTP server restarted successfully');
              })
              .catch(err => {
                logger.error(`Failed to restart HTTP server: ${err.message}`);
              });
          }, 10000); // Increased from 5000 to 10000ms to allow port to be released
        } else {
          logger.error('HTTP server failed too many times. Manual restart required.');
        }
      }
    });

    // Give it a moment to start
    setTimeout(() => {
      logger.success(`HTTP Server started on port ${HTTP_SERVER_PORT}`);
      resolve();
    }, 2000);
  });
}

function startFastScraper() {
  return new Promise((resolve) => {
    if (fastScraper) {
      logger.warn('Fast scraper already running');
      resolve();
      return;
    }

    logger.info('Starting fast scraper (1-minute updates for today\'s games)...');

    const scriptPath = path.join(__dirname, 'fast-scraper.js');
    fastScraper = spawn(process.execPath, [scriptPath], {
      cwd: __dirname,
      stdio: 'pipe' // Use pipe to suppress verbose output
    });

    fastScraper.on('error', (err) => {
      logger.error(`Fast scraper error: ${err.message}`);
    });

    fastScraper.on('close', (code) => {
      logger.warn(`Fast scraper stopped with code ${code}`);

      // Ensure old process is fully terminated
      fastScraper = null;

      // Auto-restart fast scraper if it crashes
      if (code !== 0 && code !== null) {
        // Unexpected exit - attempt restart
        if (fastScraperRestarts < MAX_RETRY_ATTEMPTS) {
          fastScraperRestarts++;
          logger.warn(`Attempting to restart fast scraper (${fastScraperRestarts}/${MAX_RETRY_ATTEMPTS})...`);
          setTimeout(() => {
            startFastScraper()
              .then(() => {
                fastScraperRestarts = 0;
                logger.success('Fast scraper restarted successfully');
              })
              .catch(err => {
                logger.error(`Failed to restart fast scraper: ${err.message}`);
              });
          }, 5000); // Wait 5 seconds before restart
        } else {
          logger.error('Fast scraper failed too many times. Manual restart required.');
        }
      } else if (code === 0) {
        // Clean exit (e.g., all games finished) - this is expected
        logger.info('Fast scraper exited cleanly (all games finished or shutdown requested)');
        fastScraperRestarts = 0;
      }
    });

    // Give it a moment to start
    setTimeout(() => {
      logger.success('Fast scraper started');
      resolve();
    }, 1000);
  });
}

function startPlingWatcher() {
  return new Promise((resolve) => {
    if (plingWatcher) {
      logger.warn('Pling watcher already running');
      resolve();
      return;
    }

    logger.info('Starting pling watcher (live goal notifications with 10s delay)...');

    const scriptPath = path.join(__dirname, 'pling-watcher.js');
    plingWatcher = spawn(process.execPath, [scriptPath], {
      cwd: __dirname,
      stdio: 'inherit'
    });

    plingWatcher.on('error', (err) => {
      logger.error(`Pling watcher error: ${err.message}`);
    });

    plingWatcher.on('close', (code) => {
      logger.warn(`Pling watcher stopped with code ${code}`);

      // Ensure old process is fully terminated
      plingWatcher = null;

      // Auto-restart pling watcher if it crashes
      if (code !== 0 && code !== null) {
        // Unexpected exit - attempt restart
        if (plingWatcherRestarts < MAX_RETRY_ATTEMPTS) {
          plingWatcherRestarts++;
          logger.warn(`Attempting to restart pling watcher (${plingWatcherRestarts}/${MAX_RETRY_ATTEMPTS})...`);
          setTimeout(() => {
            startPlingWatcher()
              .then(() => {
                plingWatcherRestarts = 0;
                logger.success('Pling watcher restarted successfully');
              })
              .catch(err => {
                logger.error(`Failed to restart pling watcher: ${err.message}`);
              });
          }, 5000); // Wait 5 seconds before restart
        } else {
          logger.error('Pling watcher failed too many times. Manual restart required.');
        }
      } else if (code === 0) {
        // Clean exit (e.g., shutdown requested) - this is expected
        logger.info('Pling watcher exited cleanly (shutdown requested)');
        plingWatcherRestarts = 0;
      }
    });

    // Give it a moment to start
    setTimeout(() => {
      logger.success('Pling watcher started');
      resolve();
    }, 1000);
  });
}

function runScraper() {
  return new Promise((resolve, reject) => {
    if (isScraperRunning) {
      logger.warn('Scraper already running, skipping...');
      resolve();
      return;
    }

    isScraperRunning = true;
    logger.info('Running scraper...');

    const scriptPath = path.join(__dirname, 'scraper-to-json.js');
    const scraper = spawn(process.execPath, [scriptPath], {
      cwd: __dirname,
      stdio: 'inherit'
    });

    scraper.on('close', (code) => {
      isScraperRunning = false;
      if (code === 0) {
        consecutiveFailures = 0;
        logger.success('Scraper completed successfully');
        resolve();
      } else {
        consecutiveFailures++;
        logger.error(`Scraper exited with code ${code} (${consecutiveFailures} consecutive failures)`);

        if (consecutiveFailures >= MAX_RETRY_ATTEMPTS) {
          logger.error('Too many consecutive failures. Check logs and website availability.');
        }

        reject(new Error(`Scraper failed with code ${code}`));
      }
    });

    scraper.on('error', (err) => {
      isScraperRunning = false;
      consecutiveFailures++;
      logger.error(`Scraper error: ${err.message}`);
      reject(err);
    });
  });
}

async function runScraperWithRetry() {
  let attempts = 0;

  while (attempts < MAX_RETRY_ATTEMPTS) {
    try {
      await runScraper();
      return; // Success, exit retry loop
    } catch (err) {
      attempts++;
      if (attempts < MAX_RETRY_ATTEMPTS) {
        logger.warn(`Retrying in ${RETRY_DELAY / 1000} seconds... (Attempt ${attempts + 1}/${MAX_RETRY_ATTEMPTS})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      } else {
        logger.error(`Failed after ${MAX_RETRY_ATTEMPTS} attempts. Will retry at next scheduled time.`);
      }
    }
  }
}

async function scheduleNextRun() {
  const minutes = SCRAPE_INTERVAL / 60000;
  logger.info(`Next scrape scheduled in ${minutes} minutes`);

  setTimeout(async () => {
    await runScraperWithRetry();
    scheduleNextRun();
  }, SCRAPE_INTERVAL);
}

async function start() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   Ligue Magnus Stats Auto-Scraper    ║');
  console.log('╚════════════════════════════════════════╝\n');

  logger.info(`Configuration loaded`);
  logger.info(`Scrape interval: ${config.scraper.intervalMinutes} minutes`);
  logger.info(`HTTP Port: ${HTTP_SERVER_PORT}`);
  logger.info(`Logging: ${config.logging.file ? 'File + Console' : 'Console only'}\n`);

  try {
    // Run scraper immediately on startup
    await runScraperWithRetry();

    // Start HTTP server
    await startHttpServer();

    // Start fast scraper for today's games (1-minute updates)
    await startFastScraper();

    // Start pling watcher for live goal notifications
    await startPlingWatcher();

    // Schedule next runs
    scheduleNextRun();

    logger.info('System running. Press Ctrl+C to stop.\n');
  } catch (err) {
    logger.error(`Startup error: ${err.message}`);
    logger.error('System will continue trying at scheduled intervals...');

    // Even if initial scrape fails, start HTTP server and schedule
    try {
      await startHttpServer();
      scheduleNextRun();
    } catch (serverErr) {
      logger.error(`Critical error: ${serverErr.message}`);
      process.exit(1);
    }
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n');
  logger.info('Shutting down gracefully...');

  if (httpServer) {
    httpServer.kill();
  }

  if (fastScraper) {
    fastScraper.kill();
  }

  if (plingWatcher) {
    plingWatcher.kill();
  }

  logger.info('Stopped');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

// Start the system
start();
