const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Load configuration
// Accept config file path as command line argument
const configPath = process.argv[2] || path.join(__dirname, '../config/config.json');
let config;
try {
  const configFile = fsSync.readFileSync(configPath, 'utf8');
  config = JSON.parse(configFile);
} catch (err) {
  console.error('Failed to load config.json, using defaults');
  config = {
    scraper: {
      urls: [
        {
          url: "https://liguemagnus.com/statistiques-individuelles/?tri_p=nombre_points-desc&actif=stats&onglet=joueurs&phase=560",
          filename: "stats-points.json",
          type: "points"
        },
        {
          url: "https://liguemagnus.com/statistiques-individuelles/?phase=560&tri_p=nombre_buts-desc&actif=stats&onglet=joueurs",
          filename: "stats-goals.json",
          type: "goals"
        },
        {
          url: "https://liguemagnus.com/statistiques-individuelles/?phase=560&tri_p=nombre_assists-desc&actif=stats&onglet=joueurs",
          filename: "stats-assists.json",
          type: "assists"
        },
        {
          url: "https://liguemagnus.com/saison-reguliere/classement/?phase=560",
          filename: "standings.json",
          type: "standings"
        },
        {
          url: "https://liguemagnus.com/statistiques-individuelles/?tri_p=nombre_assists-desc&actif=stats&onglet=joueurs&page_p=1",
          filename: "GK70plus.json",
          type: "gk70plus",
          tableIndex: 1
        },
        {
          url: "https://liguemagnus.com/statistiques-individuelles/?tri_p=nombre_assists-desc&actif=stats&onglet=joueurs&page_p=1",
          filename: "GK70minus.json",
          type: "gk70minus",
          tableIndex: 2
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=560",
          filename: "Powerplay.json",
          type: "powerplay",
          tableIndex: 0
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=560",
          filename: "Underlage.json",
          type: "underlage",
          tableIndex: 1
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=560",
          filename: "Current-streaks.json",
          type: "currentstreaks",
          tableIndex: 2
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=560",
          filename: "Season-streaks.json",
          type: "seasonstreaks",
          tableIndex: 3
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=560",
          filename: "Shots.json",
          type: "shots",
          tableIndex: 4
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=560",
          filename: "Shootouts.json",
          type: "shootouts",
          tableIndex: 5
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=560",
          filename: "Attendance.json",
          type: "attendance",
          tableIndex: 6
        },
        {
          url: "https://liguemagnus.com/calendrier-resultats/",
          filename: "games.json",
          type: "games",
          useAPI: true
        }
      ]
    }
  };
}

const urls = config.scraper.urls;

// Map team names to logo file paths
function getTeamLogo(teamName) {
  const logoBasePath = 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\';

  if (!teamName || typeof teamName !== 'string') return null;

  // Normalize team name for matching
  const normalized = teamName.toUpperCase().trim();

  // Map team names to logo filenames
  const teamLogoMap = {
    'AMIENS': 'amiens.png',
    'GOTHIQUES D\'AMIENS': 'amiens.png',
    'GOTHIQUES DAMIENS': 'amiens.png',
    'ANGERS': 'angers.png',
    'DUCS D\'ANGERS': 'angers.png',
    'DUCS DANGERS': 'angers.png',
    'ANGLET': 'anglet.png',
    'ANGLET HORMADI': 'anglet.png',
    'BORDEAUX': 'bordeaux.png',
    'BOXERS DE BORDEAUX': 'bordeaux.png',
    'BRIANÇON': 'briançon.png',
    'BRIANCON': 'briançon.png',
    'DIABLES ROUGES DE BRIANÇON': 'briançon.png',
    'DIABLES ROUGES DE BRIANCON': 'briançon.png',
    'CERGY-PONTOISE': 'cergy-pontoise.png',
    'CERGY PONTOISE': 'cergy-pontoise.png',
    'JOKERS DE CERGY-PONTOISE': 'cergy-pontoise.png',
    'JOKERS DE CERGY PONTOISE': 'cergy-pontoise.png',
    'CHAMONIX': 'chamonix.png',
    'PIONNIERS DE CHAMONIX': 'chamonix.png',
    'GAP': 'gap.png',
    'RAPACES DE GAP': 'gap.png',
    'GRENOBLE': 'grenoble.png',
    'BRÛLEURS DE LOUPS DE GRENOBLE': 'grenoble.png',
    'BRULEURS DE LOUPS DE GRENOBLE': 'grenoble.png',
    'MARSEILLE': 'marseille.png',
    'SPARTIATES DE MARSEILLE': 'marseille.png',
    'NICE': 'nice.png',
    'AIGLES DE NICE': 'nice.png',
    'ROUEN': 'rouen.png',
    'DRAGONS DE ROUEN': 'rouen.png'
  };

  // Check for exact match or partial match
  for (const [teamKey, logoFile] of Object.entries(teamLogoMap)) {
    if (normalized === teamKey || normalized.includes(teamKey)) {
      return logoBasePath + logoFile;
    }
  }

  return null;
}

// Get shortened team name (3 letters)
function getShortenedTeamName(teamName) {
  if (!teamName || typeof teamName !== 'string') return null;

  const normalized = teamName.toUpperCase().trim();

  // Special case for ANGLET
  if (normalized === 'ANGLET' || normalized.includes('ANGLET')) {
    return 'HOR';
  }

  // Map full team names to their abbreviations
  const teamShortMap = {
    'AMIENS': 'AMI',
    'ANGERS': 'ANG',
    'BORDEAUX': 'BOR',
    'BRIANÇON': 'BRI',
    'BRIANCON': 'BRI',
    'CERGY-PONTOISE': 'CER',
    'CERGY PONTOISE': 'CER',
    'CHAMONIX': 'CHA',
    'GAP': 'GAP',
    'GRENOBLE': 'GRE',
    'MARSEILLE': 'MAR',
    'NICE': 'NIC',
    'ROUEN': 'ROU'
  };

  // Check for exact match or partial match
  for (const [teamKey, shortName] of Object.entries(teamShortMap)) {
    if (normalized === teamKey || normalized.includes(teamKey)) {
      return shortName;
    }
  }

  // Fallback: return first 3 letters
  return normalized.substring(0, 3);
}

// Format player name from "LASTNAME\nFirstname" or "LASTNAMEFirstname" to "FirstInitial.LASTNAME"
function formatPlayerName(fullName) {
  if (!fullName || typeof fullName !== 'string') return fullName;

  let lastName, firstName;

  // Check if name has newline separator (regular players)
  if (fullName.includes('\n')) {
    const parts = fullName.split('\n');
    if (parts.length < 2) return fullName;
    lastName = parts[0].trim();
    firstName = parts[1].trim();
  } else {
    // No newline - format is "LASTNAMEFirstname" (goalkeepers)
    // Find where LASTNAME ends and Firstname begins
    // LASTNAME is all uppercase, Firstname starts with uppercase followed by lowercase
    const match = fullName.match(/^([A-ZÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇ''-]+)([A-Z][a-zàáâãäåèéêëìíîïòóôõöùúûüç'-]+)$/);

    if (!match) return fullName;

    lastName = match[1].trim();
    firstName = match[2].trim();
  }

  if (!firstName || !lastName) return fullName;

  // Get first letter of firstname
  const firstInitial = firstName.charAt(0).toUpperCase();

  // Format as FirstInitial.LASTNAME
  return `${firstInitial}.${lastName}`;
}

function sanitizeFieldName(name) {
  if (!name || typeof name !== 'string') return 'field';

  let sanitized = name
    .replace(/_\d+$/, '')           // Remove number suffix
    .trim()
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')      // Replace accented characters
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[ñ]/g, 'n')
    .replace(/[^a-z0-9_]/g, '_')    // Replace invalid chars with underscore
    .replace(/_+/g, '_')            // Replace multiple underscores with single
    .replace(/^_|_$/g, '');         // Remove leading/trailing underscores

  // If empty or starts with number, prefix with 'field_'
  if (!sanitized || /^[0-9]/.test(sanitized)) {
    sanitized = 'field_' + sanitized;
  }

  return sanitized || 'field';
}

function dataToJson(data, type) {
  // Types that need numbered field names (team01, team02, etc.)
  const typesNeedingNumberedFields = ['currentstreaks', 'seasonstreaks', 'todaysgames', 'upcominggames'];
  const needsNumberedFields = typesNeedingNumberedFields.includes(type);

  // Types that are individual stats (need name formatting and team abbreviations)
  const individualStatsTypes = ['points', 'goals', 'assists', 'gk70plus', 'gk70minus'];
  const isIndividualStats = individualStatsTypes.includes(type);

  // Clean up the data by sanitizing field names
  const cleanedData = data.map((item, index) => {
    const rank = index + 1;
    const cleanedItem = { rank: rank };
    const numberSuffix = rank.toString().padStart(2, '0');

    for (const [key, value] of Object.entries(item)) {
      const fieldName = sanitizeFieldName(key);

      // Extract base field name and number suffix if present (e.g., "equipe01" -> "equipe" and "01")
      const numberMatch = fieldName.match(/^(.+?)(\d{2})$/);
      const baseFieldName = numberMatch ? numberMatch[1] : fieldName;
      const existingNumberSuffix = numberMatch ? numberMatch[2] : null;

      // Detect if this is a team-related field
      const isTeamField = baseFieldName === 'team' || baseFieldName === 'equipe';
      const isHomeTeamField = baseFieldName === 'home_team';
      const isAwayTeamField = baseFieldName === 'away_team';

      // Add number suffix to field names for specific types (team01, team02, etc.)
      if (needsNumberedFields) {
        const numberedFieldName = fieldName + numberSuffix;
        cleanedItem[numberedFieldName] = value;

        // Add logo and shortened team name fields based on field type
        if (isTeamField) {
          // Generic team field - add generic logo
          const logoFieldName = 'logo' + numberSuffix;
          cleanedItem[logoFieldName] = getTeamLogo(value);

          // Add shortened team name
          const equFieldName = 'equ' + numberSuffix;
          cleanedItem[equFieldName] = getShortenedTeamName(value);
        }
        if (isHomeTeamField) {
          // Home team field - add home_logo and home_equ
          const homeLogoFieldName = 'home_logo' + numberSuffix;
          cleanedItem[homeLogoFieldName] = getTeamLogo(value);

          const homeEquFieldName = 'home_equ' + numberSuffix;
          cleanedItem[homeEquFieldName] = getShortenedTeamName(value);
        }
        if (isAwayTeamField) {
          // Away team field - add away_logo and away_equ
          const awayLogoFieldName = 'away_logo' + numberSuffix;
          cleanedItem[awayLogoFieldName] = getTeamLogo(value);

          const awayEquFieldName = 'away_equ' + numberSuffix;
          cleanedItem[awayEquFieldName] = getShortenedTeamName(value);
        }
      } else {
        // Special handling for individual stats
        const isPlayerNameField = baseFieldName === 'nom';

        if (isIndividualStats && isPlayerNameField) {
          // For "nom" field in individual stats:
          // 1. Add as "name01", "name02", etc. with original value
          // 2. Add as "nom01", "nom02", etc. with formatted value
          const nameFieldName = existingNumberSuffix ? 'name' + existingNumberSuffix : 'name';
          const nomFieldName = existingNumberSuffix ? 'nom' + existingNumberSuffix : 'nom';

          cleanedItem[nameFieldName] = value;  // Original full name
          cleanedItem[nomFieldName] = formatPlayerName(value);  // Formatted: FirstInitial.LASTNAME
        } else {
          cleanedItem[fieldName] = value;
        }

        // Add logo fields based on field type
        if (isTeamField) {
          // Generic team field - add generic logo
          if (existingNumberSuffix) {
            // Field already has a number (e.g., equipe01)
            const logoFieldName = 'logo' + existingNumberSuffix;
            cleanedItem[logoFieldName] = getTeamLogo(value);

            // For individual stats, also add shortened team name
            if (isIndividualStats) {
              const equFieldName = 'equ' + existingNumberSuffix;
              cleanedItem[equFieldName] = getShortenedTeamName(value);
            }
          } else {
            cleanedItem['logo'] = getTeamLogo(value);

            // For individual stats, also add shortened team name
            if (isIndividualStats) {
              cleanedItem['equ'] = getShortenedTeamName(value);
            }
          }
        }
        if (isHomeTeamField) {
          // Home team field - add home_logo only
          const homeLogoFieldName = existingNumberSuffix ? 'home_logo' + existingNumberSuffix : 'home_logo';
          cleanedItem[homeLogoFieldName] = getTeamLogo(value);
        }
        if (isAwayTeamField) {
          // Away team field - add away_logo only
          const awayLogoFieldName = existingNumberSuffix ? 'away_logo' + existingNumberSuffix : 'away_logo';
          cleanedItem[awayLogoFieldName] = getTeamLogo(value);
        }
      }
    }

    return cleanedItem;
  });

  // Create JSON structure
  const jsonOutput = {
    type: type,
    timestamp: new Date().toISOString(),
    count: cleanedData.length,
    data: cleanedData
  };

  return JSON.stringify(jsonOutput, null, 2);
}

async function scrapePage(urlConfig, browser) {
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
    );

    console.log(`Loading ${urlConfig.url}...`);

    // Special handling for API-based scraping (games)
    if (urlConfig.useAPI) {
      let apiData = null;

      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('admin-ajax.php')) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              const data = await response.json();
              if (data.success && data.data && data.data.data) {
                const items = data.data.data;
                if (items.length > 0 && items[0].rencontre_libelle) {
                  apiData = items;
                }
              }
            }
          } catch (e) {
            // Ignore errors
          }
        }
      });

      await page.goto(urlConfig.url, { waitUntil: 'networkidle0' });
      await page.waitForTimeout(3000);

      if (!apiData) {
        console.log(`✗ No API data found for: ${urlConfig.filename}`);
        await page.close();
        return 0;
      }

      // Transform games data
      const games = apiData.map(game => {
        // Extract scores from score array
        let home_score = null;
        let away_score = null;
        if (game.score && Array.isArray(game.score) && game.score.length >= 2) {
          // First entry is usually home team
          home_score = game.score[0].score;
          // Second entry is usually away team
          away_score = game.score[1].score;
        }

        return {
          id: game.id,
          match: game.rencontre_libelle,
          date: game.date_rencontre,
          home_team: game.receveur ? game.receveur.libelle_complet : null,
          home_short: game.receveur ? game.receveur.abreviation : null,
          away_team: game.visiteur ? game.visiteur.libelle_complet : null,
          away_short: game.visiteur ? game.visiteur.abreviation : null,
          phase: game.phase ? game.phase.libelle : null,
          etat: game.etat || null,  // "T" = Terminé (finished)
          en_cours: game.en_cours || false,  // true if game is in progress
          home_score: home_score,
          away_score: away_score
        };
      });

      // Protect finished game scores from being overwritten with null
      // Load existing data to preserve scores
      const existingDataPath = path.join('output', urlConfig.filename);
      let existingGames = {};
      try {
        if (fs.existsSync(existingDataPath)) {
          const existingData = JSON.parse(fs.readFileSync(existingDataPath, 'utf8'));
          if (existingData.data && Array.isArray(existingData.data)) {
            // Create lookup by game ID
            existingData.data.forEach(game => {
              existingGames[game.id] = game;
            });
          }
        }
      } catch (err) {
        // If we can't read existing data, just continue
      }

      // Merge with existing data to preserve scores
      const protectedGames = games.map(game => {
        const existing = existingGames[game.id];

        // If existing game had scores but new data has null, keep the existing scores
        if (existing &&
            existing.home_score !== null && existing.away_score !== null &&
            (game.home_score === null || game.away_score === null)) {
          return {
            ...game,
            home_score: existing.home_score,
            away_score: existing.away_score,
            etat: existing.etat || game.etat  // Also preserve etat
          };
        }

        return game;
      });

      // Filter games based on dateFilter parameter
      let filteredGames = protectedGames;

      if (urlConfig.dateFilter === 'today') {
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];
        filteredGames = protectedGames.filter(game => {
          if (!game.date) return false;
          const gameDate = game.date.split(' ')[0]; // Extract date part
          return gameDate === today;
        });
      } else if (urlConfig.dateFilter === 'upcoming') {
        // Get today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get games after today and take first 6
        filteredGames = protectedGames
          .filter(game => {
            if (!game.date) return false;
            const gameDate = new Date(game.date);
            return gameDate > today;
          })
          .slice(0, 6);
      }

      const json = dataToJson(filteredGames, urlConfig.type);
      await fs.mkdir('output', { recursive: true });
      await fs.writeFile(`output/${urlConfig.filename}`, json);
      console.log(`✓ Saved: ${urlConfig.filename} (${filteredGames.length} games)`);
      await page.close();
      return filteredGames.length;
    }

    // Regular table scraping
    await page.goto(urlConfig.url, { waitUntil: 'networkidle0' });

    const data = await page.evaluate((tableIndex) => {
      const tables = Array.from(document.querySelectorAll('table'));
      const allRows = [];

      // If tableIndex is specified, only scrape that table
      const tablesToScrape = tableIndex !== undefined ? [tables[tableIndex]] : tables;

      tablesToScrape.forEach(table => {
        if (!table) return; // Skip if table doesn't exist

        const headers = Array.from(table.querySelectorAll('thead th')).map(h => h.innerText.trim());

        // Check if this is a streaks table (no headers, uses colspan)
        const hasColspan = table.querySelectorAll('td[colspan], th[colspan]').length > 0;
        const isStreaksTable = headers.length === 0 && hasColspan;

        if (isStreaksTable) {
          // Special handling for streaks tables
          let currentCategory = '';
          const rows = Array.from(table.querySelectorAll('tbody tr'));

          rows.forEach((row) => {
            const cells = Array.from(row.querySelectorAll('td, th'));

            if (cells.length === 0) return;

            // Check if this is a category row (has colspan)
            const firstCell = cells[0];
            if (firstCell.hasAttribute('colspan')) {
              currentCategory = firstCell.innerText.trim();
              return;
            }

            // Data row
            const cellTexts = cells.map(c => c.innerText.trim());
            if (cellTexts.length >= 2) {
              const obj = {
                category: currentCategory,
                team: cellTexts[0],
                value: cellTexts[1]
              };
              allRows.push(obj);
            }
          });
        } else {
          // Normal table handling
          // Try tbody first, then fall back to all tr in table
          let rows = Array.from(table.querySelectorAll('tbody tr'));

          // If no tbody rows, try getting all tr except those in thead
          if (rows.length === 0) {
            const allTrs = Array.from(table.querySelectorAll('tr'));
            const theadTrs = Array.from(table.querySelectorAll('thead tr'));
            rows = allTrs.filter(tr => !theadTrs.includes(tr));
          }

          rows.forEach((row, rowIndex) => {
            const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());

            // Skip rows with no td cells
            if (cells.length === 0) return;

            const obj = {};

            headers.forEach((header, idx) => {
              const key = header.replace(/\s+/g, '_') + String(rowIndex + 1).padStart(2, '00');
              obj[key] = cells[idx] || '';
            });

            allRows.push(obj);
          });
        }
      });

      return allRows;
    }, urlConfig.tableIndex);

    // Convert to JSON
    const json = dataToJson(data, urlConfig.type);

    // Create output directory
    await fs.mkdir('output', { recursive: true });

    // Save JSON file
    await fs.writeFile(`output/${urlConfig.filename}`, json);

    const itemType = (urlConfig.type === 'standings') ? 'teams' :
                     (urlConfig.type === 'gk70plus' || urlConfig.type === 'gk70minus') ? 'goalies' : 'players';
    console.log(`✓ Saved: ${urlConfig.filename} (${data.length} ${itemType})`);

    await page.close();
    return data.length;
  } catch (err) {
    console.error(`✗ Error scraping ${urlConfig.url}:`, err.message);
    return 0;
  }
}

(async () => {
  console.log('=== Ligue Magnus Stats Scraper ===\n');
  const browser = await puppeteer.launch({ headless: true });

  for (const urlConfig of urls) {
    await scrapePage(urlConfig, browser);
  }

  await browser.close();
  console.log('\n=== Scraping Complete ===');
  console.log('JSON files saved to: output/');
  console.log('Start the HTTP server with: node http-server.js');
})();
