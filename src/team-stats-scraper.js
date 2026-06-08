const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Team configurations with their club URLs
const TEAMS = [
  {
    name: 'Amiens',
    slug: 'amiens',
    url: 'https://liguemagnus.com/club/22001s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\amiens.png'
  },
  {
    name: 'Angers',
    slug: 'angers',
    url: 'https://liguemagnus.com/club/52007s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\angers.png'
  },
  {
    name: 'Anglet',
    slug: 'anglet',
    url: 'https://liguemagnus.com/club/72001s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\anglet.png'
  },
  {
    name: 'Bordeaux',
    slug: 'bordeaux',
    url: 'https://liguemagnus.com/club/72003s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\bordeaux.png'
  },
  {
    name: 'Briançon',
    slug: 'briancon',
    url: 'https://liguemagnus.com/club/93003s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\briançon.png'
  },
  {
    name: 'Cergy-Pontoise',
    slug: 'cergy-pontoise',
    url: 'https://liguemagnus.com/club/11013s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\cergy-pontoise.png'
  },
  {
    name: 'Chamonix',
    slug: 'chamonix',
    url: 'https://liguemagnus.com/club/82005s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\chamonix.png'
  },
  {
    name: 'Gap',
    slug: 'gap',
    url: 'https://liguemagnus.com/club/93006s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\gap.png'
  },
  {
    name: 'Grenoble',
    slug: 'grenoble',
    url: 'https://liguemagnus.com/club/82007s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\grenoble.png'
  },
  {
    name: 'Marseille',
    slug: 'marseille',
    url: 'https://liguemagnus.com/club/93019s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\marseille.png'
  },
  {
    name: 'Nice',
    slug: 'nice',
    url: 'https://liguemagnus.com/club/93008s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\nice.png'
  },
  {
    name: 'Rouen',
    slug: 'rouen',
    url: 'https://liguemagnus.com/club/23001s/',
    logo: 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\rouen.png'
  }
];

// Format player name from "LASTNAME\nFirstname" to "FirstInitial.LASTNAME"
function formatPlayerName(fullName) {
  if (!fullName || typeof fullName !== 'string') return fullName;

  let lastName, firstName;

  // Check if name has newline separator
  if (fullName.includes('\n')) {
    const parts = fullName.split('\n');
    if (parts.length < 2) return fullName;
    lastName = parts[0].trim();
    firstName = parts[1].trim();
  } else {
    // No newline - format is "LASTNAMEFirstname(s)" (goalkeepers and some players)
    // Pattern: All UPPERCASE letters = last name, then Capital+lowercase = first name(s)
    // Enhanced regex to handle accented characters, spaces, and multiple first names
    const match = fullName.match(/^([A-ZÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇ'' \-]+)([A-ZÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇ].*)$/);

    if (!match) return fullName;

    lastName = match[1].trim();
    firstName = match[2].trim();
  }

  if (!firstName || !lastName) return fullName;

  // Get first letter of firstname
  const firstInitial = firstName.charAt(0).toUpperCase();

  // Format as FirstInitial. LASTNAME
  return `${firstInitial}. ${lastName}`;
}

// Sanitize field names for JSON
function sanitizeFieldName(name) {
  if (!name || typeof name !== 'string') return 'field';

  const isPercentage = name.trim().startsWith('%');

  let sanitized = name
    .trim()
    .toLowerCase()
    .replace(/^%\s*/, '')           // Remove leading % symbol
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[ñ]/g, 'n')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (isPercentage && sanitized) {
    sanitized = sanitized + '_pct';
  }

  if (!sanitized || /^[0-9]/.test(sanitized)) {
    sanitized = 'field_' + sanitized;
  }

  return sanitized || 'field';
}

// Scrape team statistics
async function scrapeTeamStats(team, browser) {
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
    );

    console.log(`\nScraping ${team.name}...`);
    console.log(`  URL: ${team.url}`);

    await page.goto(team.url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for tables to load
    await page.waitForTimeout(2000);

    // Extract player and goalie statistics
    const stats = await page.evaluate(() => {
      const result = {
        players: [],
        goalies_main: [],
        goalies_reserve: []
      };

      // Find all tables on the page
      const tables = Array.from(document.querySelectorAll('table'));

      // Helper function to extract table data
      function extractTableData(table) {
        const headers = Array.from(table.querySelectorAll('thead th')).map(h => h.innerText.trim());
        const rows = Array.from(table.querySelectorAll('tbody tr'));

        const data = rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
          const obj = {};

          headers.forEach((header, idx) => {
            obj[header] = cells[idx] || '';
          });

          return obj;
        });

        return { headers, data };
      }

      // Find tables by looking for specific headers
      tables.forEach((table, index) => {
        const headerCells = Array.from(table.querySelectorAll('thead th')).map(h => h.innerText.trim());

        // Check if this is a player stats table (has Pos, B, A, Pts columns)
        if (headerCells.includes('Pos') && headerCells.includes('B') && headerCells.includes('A') && headerCells.includes('Pts')) {
          const tableData = extractTableData(table);
          result.players = tableData.data;
        }

        // Check if this is a goalie stats table (has BC, Moy, Arr, % Arr columns)
        if (headerCells.includes('BC') && headerCells.includes('Moy') && headerCells.includes('Arr')) {
          const tableData = extractTableData(table);

          // First goalie table is main (>70%), second is reserve (<70%)
          if (result.goalies_main.length === 0) {
            result.goalies_main = tableData.data;
          } else {
            result.goalies_reserve = tableData.data;
          }
        }
      });

      return result;
    });

    // Process players
    const players = stats.players.map((player, index) => {
      const rank = index + 1;
      const cleanPlayer = { rank };

      // Format name
      if (player.Nom) {
        cleanPlayer.name = formatPlayerName(player.Nom); // Formatted name
        cleanPlayer.nom = formatPlayerName(player.Nom); // Formatted name
      }

      // Add all other fields with sanitized keys
      Object.keys(player).forEach(key => {
        if (key !== 'Nom') {
          const sanitizedKey = sanitizeFieldName(key);
          cleanPlayer[sanitizedKey] = player[key];
        }
      });

      return cleanPlayer;
    });

    // Process goalies (main + reserve)
    const allGoalies = [...stats.goalies_main, ...stats.goalies_reserve];
    const goalies = allGoalies.map((goalie, index) => {
      const rank = index + 1;
      const cleanGoalie = { rank };

      // Format name
      if (goalie.Nom) {
        cleanGoalie.name = formatPlayerName(goalie.Nom); // Formatted name
        cleanGoalie.nom = formatPlayerName(goalie.Nom); // Formatted name
      }

      // Add all other fields with sanitized keys
      Object.keys(goalie).forEach(key => {
        if (key !== 'Nom') {
          const sanitizedKey = sanitizeFieldName(key);
          cleanGoalie[sanitizedKey] = goalie[key];
        }
      });

      return cleanGoalie;
    });

    // Create final JSON structure
    const teamStats = {
      team: team.name,
      team_slug: team.slug,
      team_logo: team.logo,
      timestamp: new Date().toISOString(),
      players: {
        count: players.length,
        data: players
      },
      goalies: {
        count: goalies.length,
        data: goalies
      }
    };

    // Save to file
    const outputDir = path.join(__dirname, '../output/teams');
    await fs.mkdir(outputDir, { recursive: true });

    const filename = `team_${team.slug}.json`;
    const filepath = path.join(outputDir, filename);
    await fs.writeFile(filepath, JSON.stringify(teamStats, null, 2));

    console.log(`  ✓ Players: ${players.length}`);
    console.log(`  ✓ Goalies: ${goalies.length}`);
    console.log(`  ✓ Saved: ${filename}`);

    await page.close();
    return { success: true, players: players.length, goalies: goalies.length };

  } catch (err) {
    console.error(`  ✗ Error scraping ${team.name}: ${err.message}`);
    if (page && !page.isClosed()) {
      await page.close();
    }
    return { success: false, error: err.message };
  }
}

// Main function
async function main() {
  console.log('=== Ligue Magnus Team Stats Scraper ===\n');

  // Check if a specific team slug was provided as command line argument
  const targetTeamSlug = process.argv[2];

  let teamsToScrape = TEAMS;

  if (targetTeamSlug) {
    const targetTeam = TEAMS.find(t => t.slug === targetTeamSlug);
    if (targetTeam) {
      console.log(`Scraping only: ${targetTeam.name}\n`);
      teamsToScrape = [targetTeam];
    } else {
      console.log(`Team "${targetTeamSlug}" not found. Available teams:`);
      TEAMS.forEach(t => console.log(`  - ${t.slug}`));
      process.exit(1);
    }
  } else {
    console.log(`Scraping all ${TEAMS.length} teams\n`);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    success: 0,
    failed: 0,
    totalPlayers: 0,
    totalGoalies: 0
  };

  for (const team of teamsToScrape) {
    const result = await scrapeTeamStats(team, browser);

    if (result.success) {
      results.success++;
      results.totalPlayers += result.players;
      results.totalGoalies += result.goalies;
    } else {
      results.failed++;
    }

    // Small delay between teams to avoid rate limiting
    if (teamsToScrape.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await browser.close();

  console.log('\n=== Scraping Complete ===');
  console.log(`Teams scraped: ${results.success}/${teamsToScrape.length}`);
  console.log(`Total players: ${results.totalPlayers}`);
  console.log(`Total goalies: ${results.totalGoalies}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`\nJSON files saved to: output/teams/`);
}

// Run the scraper
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
