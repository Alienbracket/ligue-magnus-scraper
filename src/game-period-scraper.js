const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Game Period Scraper
 *
 * Scrapes individual game pages to get accurate period information
 * for live games. Creates game_periods.json that other scrapers can read.
 */

const OUTPUT_PATH = path.join(__dirname, '../output/game_periods.json');
const TODAYS_GAMES_PATH = path.join(__dirname, '../output/Todays_games.json');

// Scrape period status from a single game page
async function scrapeGamePeriod(gameId, browser) {
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const url = `https://liguemagnus.com/rencontre/${gameId}/`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(1000);

    const periodInfo = await page.evaluate(() => {
      try {
        const bodyText = document.body.innerText;

        // Check for finished/postponed states first
        if (bodyText.match(/termin[ée]/i)) return "Terminé";
        if (bodyText.match(/report[ée]/i)) return "Reporté";

        // Look for game clock time (format: MM:SS)
        // The clock appears near "En cours" status
        const timeMatch = bodyText.match(/En cours[^\d]*(\d{1,2}):(\d{2})/i);
        if (timeMatch) {
          const minutes = parseInt(timeMatch[1], 10);
          const seconds = parseInt(timeMatch[2], 10);
          const totalMinutes = minutes; // + (seconds / 60); // We'll use just minutes for simplicity

          // Calculate period based on game time
          // Each period is 20 minutes
          if (totalMinutes < 20) {
            return "1ère période";
          } else if (totalMinutes < 40) {
            return "2ème période";
          } else if (totalMinutes < 60) {
            return "3ème période";
          } else if (totalMinutes < 70) {
            return "Prolongation";
          } else {
            return "Tirs au but";
          }
        }

        // Fallback: check for explicit period text
        if (bodyText.match(/1[èe]re\s*p[ée]riode/i)) return "1ère période";
        if (bodyText.match(/2[èe]me\s*p[ée]riode/i)) return "2ème période";
        if (bodyText.match(/3[èe]me\s*p[ée]riode/i)) return "3ème période";
        if (bodyText.match(/prolongation/i)) return "Prolongation";
        if (bodyText.match(/tirs?\s+au\s+but/i)) return "Tirs au but";

        // If game is "En cours" but no time found, return generic
        if (bodyText.match(/en\s+cours/i)) return "En cours";

        // Default
        return null;

      } catch (err) {
        console.error('Error parsing game data:', err.message);
        return "En cours";
      }
    });

    await page.close();
    return periodInfo;

  } catch (err) {
    console.error(`  ✗ Error scraping game ${gameId}: ${err.message}`);
    if (page && !page.isClosed()) {
      await page.close();
    }
    return null;
  }
}

// Main scraping function
async function scrapeAllGamePeriods() {
  console.log('=== Game Period Scraper ===\n');

  // Read today's games to get game IDs
  if (!fsSync.existsSync(TODAYS_GAMES_PATH)) {
    console.log('✗ Todays_games.json not found');
    return;
  }

  const todaysGames = JSON.parse(await fs.readFile(TODAYS_GAMES_PATH, 'utf8'));

  // Filter for real games that are live or upcoming (not finished, not test games)
  const gamesToScrape = todaysGames.data.filter(game =>
    game.id &&
    game.id !== null &&
    game.match !== '' &&
    !game.phase?.includes('Test') &&
    game.date !== 'Test' &&
    game.etat !== 'T'  // Not finished
  );

  if (gamesToScrape.length === 0) {
    console.log('No games to scrape (all finished or no games today)');

    // Write empty periods file
    await fs.writeFile(OUTPUT_PATH, JSON.stringify({
      timestamp: new Date().toISOString(),
      periods: {}
    }, null, 2));

    return;
  }

  console.log(`Found ${gamesToScrape.length} game(s) to scrape\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const periods = {};

  for (const game of gamesToScrape) {
    console.log(`Scraping game ${game.id}: ${game.match}`);
    const period = await scrapeGamePeriod(game.id, browser);

    if (period) {
      periods[game.id] = period;
      console.log(`  ✓ Period: ${period}`);
    } else {
      console.log(`  ⚠ Could not determine period`);
    }
  }

  await browser.close();

  // Save periods to JSON
  const output = {
    timestamp: new Date().toISOString(),
    periods: periods
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Saved ${Object.keys(periods).length} game period(s) to: ${OUTPUT_PATH}`);
}

// Run if called directly
if (require.main === module) {
  scrapeAllGamePeriods().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { scrapeAllGamePeriods, scrapeGamePeriod };
