const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { scrapeAllLiveGameLineups } = require('./lineup-scraper');
const { processLineup } = require('./lineup-processor');

/**
 * Lineup Auto-Processor
 *
 * Automatically scrapes lineups for all live/upcoming games
 * and processes them to create arena-specific JSON files
 */

async function processAllGameLineups() {
  console.log('=== Lineup Auto-Processor ===\n');
  console.log(`Started: ${new Date().toLocaleString()}\n`);

  try {
    // Step 1: Scrape all live game lineups from website
    console.log('STEP 1: Scraping lineups from liguemagnus.com...\n');
    await scrapeAllLiveGameLineups();

    // Step 2: Find all scraped lineup files
    console.log('\n---\n');
    console.log('STEP 2: Processing scraped lineups...\n');

    const outputDir = path.join(__dirname, '../output');
    const files = await fs.readdir(outputDir);
    const lineupFiles = files.filter(f => f.startsWith('game_') && f.endsWith('_lineup.json'));

    if (lineupFiles.length === 0) {
      console.log('No lineup files found to process');
      return;
    }

    console.log(`Found ${lineupFiles.length} lineup file(s) to process\n`);

    // Step 3: Process each lineup file
    for (const file of lineupFiles) {
      const lineupPath = path.join(outputDir, file);
      const gameLineupsDir = path.join(outputDir, 'game_lineups');

      try {
        console.log(`Processing: ${file}`);
        await processLineup(lineupPath, gameLineupsDir);
        console.log('');
      } catch (err) {
        console.error(`✗ Error processing ${file}: ${err.message}\n`);
      }
    }

    console.log('=== Processing Complete ===');
    console.log(`Finished: ${new Date().toLocaleString()}\n`);
    console.log('Arena lineup files available at:');
    console.log('  http://data.borka.live:3000/game_lineups/');

  } catch (err) {
    console.error('Fatal error:', err);
    throw err;
  }
}

// Run if called directly
if (require.main === module) {
  processAllGameLineups().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { processAllGameLineups };
