const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Lineup Scraper
 *
 * Scrapes game lineup data from liguemagnus.com/rencontre/{gameId}/
 * and formats it for use with lineup-processor.js
 */

// Normalize team name to slug
function teamNameToSlug(teamName) {
  if (!teamName) return '';

  const slugMap = {
    'ROUEN': 'rouen',
    'ANGERS': 'angers',
    'GRENOBLE': 'grenoble',
    'MARSEILLE': 'marseille',
    'GAP': 'gap',
    'NICE': 'nice',
    'AMIENS': 'amiens',
    'BORDEAUX': 'bordeaux',
    'CHAMONIX': 'chamonix',
    'CERGY-PONTOISE': 'cergy-pontoise',
    'ANGLET': 'anglet',
    'BRIANCON': 'briancon'
  };

  return slugMap[teamName.toUpperCase()] || teamName.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

// Position code to full position
function positionCodeToFull(code) {
  const positionMap = {
    'A': 'A',  // Attaquant
    'D': 'D',  // Défenseur
    'GB': 'G', // Gardien de but
    'G': 'G'
  };
  return positionMap[code] || code;
}

// Scrape lineup from a game page
async function scrapeLineup(gameId, gameData = {}) {
  console.log(`\n=== Scraping lineup for game ${gameId} ===\n`);

  const url = `https://liguemagnus.com/rencontre/${gameId}/`;
  console.log(`URL: ${url}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    // Capture the raw HTML response
    let rawHTML = null;
    page.on('response', async (response) => {
      if (response.url() === url && !rawHTML) {
        try {
          rawHTML = await response.text();
        } catch (e) {
          // Ignore
        }
      }
    });

    // Navigate to the game page
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Extract roster data from tables
    const lineupData = await page.evaluate(() => {
      const result = {
        teams: [],
        rosters: []
      };

      // Find all tables on the page
      const tables = Array.from(document.querySelectorAll('table'));

      // Extract team names from the first table (score table)
      if (tables.length > 0) {
        const scoreTable = tables[0];
        const rows = Array.from(scoreTable.querySelectorAll('tbody tr, tr'));
        rows.forEach(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          const teamName = cells[0]?.innerText.trim();
          if (teamName && teamName.length > 0 && teamName !== 'Equipe') {
            result.teams.push(teamName);
          }
        });
      }

      tables.forEach((table, tableIndex) => {
        const headers = Array.from(table.querySelectorAll('thead th, th')).map(h => h.innerText.trim());

        // Check if this is a player roster table (has "Joueur" column)
        if (headers.includes('Joueur')) {
          const rows = Array.from(table.querySelectorAll('tbody tr'));
          const players = [];

          // Map live stat columns by header name
          const butIdx = headers.indexOf('But');
          const assIdx = headers.indexOf('Ass');
          const ptsIdx = headers.indexOf('Pts');
          const pmIdx = headers.indexOf('+/-');
          const tirsIdx = headers.indexOf('T');
          const penIdx = headers.indexOf('PEN');
          const engIdx = headers.indexOf('ENG');

          rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length === 0) return;

            const joueurCell = cells[0]?.innerText.trim();
            if (!joueurCell || joueurCell === '') return;

            // Parse "N˚{number} {name}" format (name is on first line)
            const match = joueurCell.match(/N[˚°]\s*(\d+)\s+(.+)/);
            if (match) {
              const number = parseInt(match[1]);
              const name = match[2].trim();

              // Position appears after newline in the cell (e.g. "N˚4 BERGERON Justin \n A")
              const cellParts = joueurCell.split('\n');
              const position = cellParts.length > 1 ? cellParts[cellParts.length - 1].trim() : '';

              // Extract live in-game stats using header indices
              const live = {};
              if (butIdx >= 0) live.b = (cells[butIdx]?.innerText || '').trim();
              if (assIdx >= 0) live.a = (cells[assIdx]?.innerText || '').trim();
              if (ptsIdx >= 0) live.pts = (cells[ptsIdx]?.innerText || '').trim();
              if (pmIdx >= 0) live.field_ = (cells[pmIdx]?.innerText || '').trim();
              if (tirsIdx >= 0) live.tirs = (cells[tirsIdx]?.innerText || '').trim();
              if (penIdx >= 0) live.pen = (cells[penIdx]?.innerText || '').trim();
              if (engIdx >= 0) live.eng = (cells[engIdx]?.innerText || '').trim();

              players.push({ name, number, type: 'player', position, live });
            }
          });

          if (players.length > 0) {
            result.rosters.push({ type: 'players', data: players, tableIndex });
          }
        }

        // Check if this is a goalie table (has "Gardien" column)
        if (headers.includes('Gardien')) {
          const rows = Array.from(table.querySelectorAll('tbody tr'));
          const goalies = [];

          // Map live stat columns by header name
          const minIdx = headers.indexOf('Min');
          const bcIdx = headers.indexOf('Buts encaissés');
          const arrIdx = headers.indexOf('Arrêts');

          rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length === 0) return;

            const gardienCell = cells[0]?.innerText.trim();
            if (!gardienCell || gardienCell === '') return;

            // Parse "N˚{number} {name}" format
            const match = gardienCell.match(/N[˚°]\s*(\d+)\s+(.+)/);
            if (match) {
              const number = parseInt(match[1]);
              const name = match[2].trim();

              // Extract live in-game stats using header indices
              const live = {};
              if (minIdx >= 0) live.min = (cells[minIdx]?.innerText || '').trim();
              if (bcIdx >= 0) live.bc = (cells[bcIdx]?.innerText || '').trim();
              if (arrIdx >= 0) live.arr = (cells[arrIdx]?.innerText || '').trim();

              goalies.push({ name, number, type: 'goalie', live });
            }
          });

          if (goalies.length > 0) {
            result.rosters.push({ type: 'goalies', data: goalies, tableIndex });
          }
        }
      });

      return result;
    });

    console.log(`Found ${lineupData.rosters.length} roster table(s)`);

    // Group rosters by type and assign to teams
    // Typically: [team1_players, team1_goalies, team2_players, team2_goalies]
    const playerRosters = lineupData.rosters.filter(r => r.type === 'players');
    const goalieRosters = lineupData.rosters.filter(r => r.type === 'goalies');

    if (playerRosters.length < 2) {
      console.log('⚠ Warning: Could not find enough roster tables');
      console.log(`  Found ${playerRosters.length} player table(s) and ${goalieRosters.length} goalie table(s)`);
    }

    // Process player and goalie data
    const team1Players = playerRosters[0]?.data.map(p => ({
      name: p.name,
      number: p.number,
      position: p.position || 'A',
      live: p.live || {}
    })) || [];

    const team1Goalies = goalieRosters[0]?.data.map(g => ({
      name: g.name,
      number: g.number,
      position: 'G',
      live: g.live || {}
    })) || [];

    const team2Players = playerRosters[1]?.data.map(p => ({
      name: p.name,
      number: p.number,
      position: p.position || 'A',
      live: p.live || {}
    })) || [];

    const team2Goalies = goalieRosters[1]?.data.map(g => ({
      name: g.name,
      number: g.number,
      position: 'G',
      live: g.live || {}
    })) || [];

    // Use team names from gameData if available, otherwise from extracted data
    const homeTeamName = gameData.home_team || lineupData.teams[0] || '';
    const awayTeamName = gameData.away_team || lineupData.teams[1] || '';

    // Create output structure
    const output = {
      game_id: gameId,
      date: gameData.date_numeric || new Date().toISOString().split('T')[0],
      arena: gameData.arena || '',
      home_team: {
        name: homeTeamName,
        slug: teamNameToSlug(homeTeamName),
        players: team1Players,
        goalies: team1Goalies
      },
      away_team: {
        name: awayTeamName,
        slug: teamNameToSlug(awayTeamName),
        players: team2Players,
        goalies: team2Goalies
      }
    };

    console.log(`\nExtracted lineup:`);
    console.log(`  Home (${output.home_team.name}): ${output.home_team.players.length} players, ${output.home_team.goalies.length} goalies`);
    console.log(`  Away (${output.away_team.name}): ${output.away_team.players.length} players, ${output.away_team.goalies.length} goalies`);

    return output;

  } finally {
    await browser.close();
  }
}

// Scrape lineups for all live/upcoming games
async function scrapeAllLiveGameLineups() {
  console.log('=== Lineup Scraper - Live Games ===\n');

  // Read today's games
  const todaysGamesPath = path.join(__dirname, '../output/Todays_games.json');

  if (!fsSync.existsSync(todaysGamesPath)) {
    console.error(`✗ Todays_games.json not found at ${todaysGamesPath}`);
    return;
  }

  const todaysGames = JSON.parse(await fs.readFile(todaysGamesPath, 'utf8'));

  if (!todaysGames.data || todaysGames.data.length === 0) {
    console.log('No games found for today');
    return;
  }

  // Filter for live or upcoming games (non-finished games with real IDs)
  const liveGames = todaysGames.data.filter(game =>
    game.id &&
    game.id !== null &&
    game.match !== '' &&
    game.etat !== 'T' // Not finished
  );

  console.log(`Found ${liveGames.length} live/upcoming games\n`);

  for (const game of liveGames) {
    try {
      const lineup = await scrapeLineup(game.id, game);

      // Save lineup to file
      const outputPath = path.join(__dirname, '../output', `game_${game.id}_lineup.json`);
      await fs.writeFile(outputPath, JSON.stringify(lineup, null, 2));
      console.log(`✓ Saved lineup to: ${outputPath}\n`);

    } catch (err) {
      console.error(`✗ Error scraping game ${game.id}: ${err.message}\n`);
    }
  }
}

// CLI usage
async function main() {
  const command = process.argv[2];
  const gameId = process.argv[3];

  if (command === 'game' && gameId) {
    // Scrape specific game
    const lineup = await scrapeLineup(gameId);
    const outputPath = path.join(__dirname, '../output', `game_${gameId}_lineup.json`);
    await fs.writeFile(outputPath, JSON.stringify(lineup, null, 2));
    console.log(`\n✓ Saved to: ${outputPath}`);

  } else if (command === 'live' || !command) {
    // Scrape all live games
    await scrapeAllLiveGameLineups();

  } else {
    console.log('Usage:');
    console.log('  node lineup-scraper.js              # Scrape all live/upcoming games');
    console.log('  node lineup-scraper.js live         # Scrape all live/upcoming games');
    console.log('  node lineup-scraper.js game 68838   # Scrape specific game ID');
    process.exit(1);
  }
}

module.exports = { scrapeLineup, scrapeAllLiveGameLineups };

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
