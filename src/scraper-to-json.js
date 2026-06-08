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
          url: "https://liguemagnus.com/statistiques-individuelles/?tri_p=nombre_points-desc&actif=stats&onglet=joueurs&phase=652",
          filename: "stats-points.json",
          type: "points"
        },
        {
          url: "https://liguemagnus.com/statistiques-individuelles/?phase=652&tri_p=nombre_buts-desc&actif=stats&onglet=joueurs",
          filename: "stats-goals.json",
          type: "goals"
        },
        {
          url: "https://liguemagnus.com/statistiques-individuelles/?phase=652&tri_p=nombre_assists-desc&actif=stats&onglet=joueurs",
          filename: "stats-assists.json",
          type: "assists"
        },
        {
          url: "https://liguemagnus.com/saison-reguliere/classement/?phase=652",
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
          url: "https://liguemagnus.com/statistiques-collectives/?phase=652",
          filename: "Powerplay.json",
          type: "powerplay",
          tableIndex: 0
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=652",
          filename: "Underlage.json",
          type: "underlage",
          tableIndex: 1
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=652",
          filename: "Current-streaks.json",
          type: "currentstreaks",
          tableIndex: 2
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=652",
          filename: "Season-streaks.json",
          type: "seasonstreaks",
          tableIndex: 3
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=652",
          filename: "Shots.json",
          type: "shots",
          tableIndex: 4
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=652",
          filename: "Shootouts.json",
          type: "shootouts",
          tableIndex: 5
        },
        {
          url: "https://liguemagnus.com/statistiques-collectives/?phase=652",
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

// Convert date to French text format (e.g., "19 décembre")
function formatDateToFrench(dateString) {
  if (!dateString) return null;

  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];

  try {
    const [year, month, day] = dateString.split('-');
    const monthIndex = parseInt(month, 10) - 1;
    const dayNum = parseInt(day, 10);

    return `${dayNum} ${months[monthIndex]}`;
  } catch (e) {
    return null;
  }
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

  // Check if name starts with '%' - handle percentage fields specially
  const isPercentage = name.trim().startsWith('%');

  // Check if name ends with '+' or '-' before cleaning
  const original = name.replace(/\d+$/, '').trim();
  const endsWithPlus = original.endsWith('+');
  const endsWithMinus = original.endsWith('-');

  let sanitized = name
    .replace(/\d+$/, '')            // Remove number suffix (e.g., "01", "02")
    .trim()
    .toLowerCase()
    .replace(/^%\s*/, '')           // Remove leading % symbol and spaces
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

  // Add suffixes to preserve field distinction
  if (isPercentage && sanitized) {
    sanitized = sanitized + '_pct';
  } else if (endsWithPlus && sanitized) {
    sanitized = sanitized + '_plus';
  } else if (endsWithMinus && sanitized) {
    sanitized = sanitized + '_minus';
  }

  // If empty or starts with number, prefix with 'field_'
  if (!sanitized || /^[0-9]/.test(sanitized)) {
    sanitized = 'field_' + sanitized;
  }

  return sanitized || 'field';
}

function dataToJson(data, type) {
  // Types that need numbered field names (team01, team02, etc.)
  const typesNeedingNumberedFields = ['currentstreaks', 'seasonstreaks'];
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
      // Special handling: preserve divider field names (don't sanitize)
      const isDividerField = key === 'divider';
      const fieldName = isDividerField ? key : sanitizeFieldName(key);

      // For divider fields, add directly to cleanedItem and continue
      if (isDividerField) {
        cleanedItem[key] = value;
        continue;
      }

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
          // 1. Add as "name" with original value
          // 2. Add as "nom" with formatted value (without number suffixes)
          cleanedItem['name'] = value;  // Original full name
          cleanedItem['nom'] = formatPlayerName(value);  // Formatted: FirstInitial.LASTNAME
        } else {
          // Use base field name without number suffix
          let finalValue = value;

          // Special handling for percentage fields in collective stats
          if (type === 'powerplay' && baseFieldName === 'field_' && value) {
            finalValue = value + '%';
          }
          if (type === 'underlage' && baseFieldName === 'field_' && value) {
            finalValue = value + '%';
          }
          if (type === 'shootouts' && (baseFieldName === 'field_' || baseFieldName === 'arrets_pct') && value) {
            finalValue = value + '%';
          }
          if (type === 'shots' && (baseFieldName === 'equipe' || baseFieldName === 'bp') && value && /^\d+\.?\d*$/.test(value)) {
            // Only add % if value is numeric (to avoid adding % to team names)
            finalValue = value + '%';
          }

          // Round moyenne to nearest whole number for attendance stats
          if (type === 'attendance' && baseFieldName === 'moyenne' && value) {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              finalValue = Math.round(numValue).toString();
            }
          }

          cleanedItem[baseFieldName] = finalValue;
        }

        // Add logo fields based on field type
        if (isTeamField) {
          // Generic team field - add generic logo without number suffix
          cleanedItem['logo'] = getTeamLogo(value);

          // For individual stats, also add shortened team name
          if (isIndividualStats) {
            cleanedItem['equ'] = getShortenedTeamName(value);
          }
        }
        if (isHomeTeamField) {
          // Home team field - add home_logo only without number suffix
          cleanedItem['home_logo'] = getTeamLogo(value);
        }
        if (isAwayTeamField) {
          // Away team field - add away_logo only without number suffix
          cleanedItem['away_logo'] = getTeamLogo(value);
        }
      }
    }

    return cleanedItem;
  });

  // Pad goalie stats to always have 10 entries
  if ((type === 'gk70plus' || type === 'gk70minus') && cleanedData.length < 10) {
    const emptyGoalieEntry = {
      rank: 0,
      rg: "",
      name: "",
      nom: "",
      equipe: "",
      logo: "",
      equ: "",
      mj: "",
      mje: "",
      min: "",
      v: "",
      dprl: "",
      d: "",
      blan: "",
      bc: "",
      moy: "",
      arr: "",
      arr_pct: ""
    };

    // Add empty entries to reach 10 total
    while (cleanedData.length < 10) {
      const emptyEntry = { ...emptyGoalieEntry, rank: cleanedData.length + 1 };
      cleanedData.push(emptyEntry);
    }
  }

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
  let page;
  try {
    page = await browser.newPage();
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

      await page.goto(urlConfig.url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      await page.waitForTimeout(3000);

      if (!apiData) {
        console.log(`✗ No API data found for: ${urlConfig.filename}`);
        await page.close();
        return 0;
      }

      // Debug: Save first game to file to see available fields
      if (apiData.length > 0) {
        try {
          const fs = require('fs');
          fs.writeFileSync('output/debug_raw_game.json', JSON.stringify(apiData[0], null, 2));
          console.log('\n✓ Saved raw game data to: output/debug_raw_game.json\n');
        } catch (e) {
          console.log('Error saving debug file:', e.message);
        }
      }

      // Transform games data
      const games = apiData.map(game => {
        // Extract scores from score array by matching equipe_id
        let home_score = null;
        let away_score = null;
        if (game.score && Array.isArray(game.score) && game.score.length >= 2) {
          // Match scores by team ID (equipe_id)
          const homeTeamId = game.receveur?.id;
          const awayTeamId = game.visiteur?.id;

          game.score.forEach(scoreEntry => {
            if (scoreEntry.equipe_id === homeTeamId) {
              home_score = scoreEntry.score;
            } else if (scoreEntry.equipe_id === awayTeamId) {
              away_score = scoreEntry.score;
            }
          });
        }

        // Split date and time
        const dateTimeParts = game.date_rencontre ? game.date_rencontre.split(' ') : [null, null];
        const gameDate = dateTimeParts[0];
        const gameTime = dateTimeParts[1];

        // Format arena name - special case for POMGE
        let arenaName = game.lieu_de_pratique ? game.lieu_de_pratique.nom : null;
        if (arenaName && arenaName.includes('POMGE')) {
          arenaName = 'Marseille - POMGE';
        }

        return {
          id: game.id,
          match: game.rencontre_libelle,
          date: formatDateToFrench(gameDate),
          date_numeric: gameDate,
          time: gameTime,
          arena: arenaName,
          home_team: game.receveur ? game.receveur.libelle_court : null,
          home_short: game.receveur ? game.receveur.abreviation : null,
          away_team: game.visiteur ? game.visiteur.libelle_court : null,
          away_short: game.visiteur ? game.visiteur.abreviation : null,
          phase: game.phase ? game.phase.libelle : null,
          etat: game.etat || null,  // "T" = Terminé (finished)
          en_cours: game.en_cours || false,  // true if game is in progress
          home_score: home_score,
          away_score: away_score
        };
      });

      // Add vs_match and period fields for today's games based on game state
      if (urlConfig.type === 'todaysgames') {
        // Load period data from game_periods.json if available
        let gamePeriods = {};
        try {
          const periodsPath = path.join('output', 'game_periods.json');
          if (fs.existsSync(periodsPath)) {
            const periodsData = JSON.parse(fs.readFileSync(periodsPath, 'utf8'));
            gamePeriods = periodsData.periods || {};
          }
        } catch (err) {
          // If we can't read periods data, just continue with default values
        }

        // Real games - add vs_match and period fields
        // Get current Paris time for time-based fallback
        const now = new Date();
        const parisNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));

        for (const game of games) {
          // Fallback logic: If game time has passed by 10+ minutes and etat != 'T', assume it's live
          // (API can be slow to update en_cours status)
          let shouldBeEnCours = game.en_cours;

          if (!shouldBeEnCours && game.etat !== 'T' && game.date_numeric && game.time) {
            try {
              const [year, month, day] = game.date_numeric.split('-').map(Number);
              const [hours, minutes] = game.time.split(':').map(Number);

              // Create game start time in Paris timezone
              const gameDateTime = new Date(year, month - 1, day, hours, minutes, 0);
              const minutesSinceStart = (parisNow - gameDateTime) / (1000 * 60);

              // If game started 10+ minutes ago and not finished, mark as live
              if (minutesSinceStart >= 10) {
                shouldBeEnCours = true;
                game.en_cours = true; // Update the field
              }
            } catch (e) {
              // If time parsing fails, just use API value
            }
          }

          if (shouldBeEnCours) {
            game.vs_match = `${game.home_score || 0}-${game.away_score || 0}`;
            // Use period from game_periods.json if available, otherwise default to "En cours"
            game.period = gamePeriods[game.id] || "En cours";
          } else if (game.etat === 'T') {
            game.vs_match = `(${game.home_score || 0}:${game.away_score || 0})`;
            game.period = "Match terminé";
          } else {
            game.vs_match = game.time || '';
            game.period = "Avant le match";
          }
        }
      }

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
        // Get today's date in YYYY-MM-DD format in Europe/Paris timezone
        const now = new Date();
        const parisDateStr = now.toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });
        const today = parisDateStr.split(' ')[0]; // Format: YYYY-MM-DD HH:MM:SS -> get YYYY-MM-DD
        filteredGames = protectedGames.filter(game => {
          if (!game.date_numeric) return false;
          return game.date_numeric === today;
        });
      } else if (urlConfig.dateFilter === 'upcoming') {
        // Get today's date in YYYY-MM-DD format in Europe/Paris timezone
        const now = new Date();
        const parisDateStr = now.toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });
        const today = parisDateStr.split(' ')[0]; // Format: YYYY-MM-DD HH:MM:SS -> get YYYY-MM-DD

        // Get games after today (future dates only) and take first 6
        filteredGames = protectedGames
          .filter(game => {
            if (!game.date_numeric) return false;
            return game.date_numeric > today;
          })
          .slice(0, 6);
      }

      // Add mock test data for today's games if no real games exist
      if (urlConfig.type === 'todaysgames' && filteredGames.length === 0) {
        filteredGames = [
          {
            rank: 1,
            id: 99991,
            match: "MARSEILLE / GRENOBLE",
            date: "Test",
            date_numeric: new Date().toISOString().split('T')[0],
            time: "20:00",
            arena: "Marseille - POMGE",
            home_team: "MARSEILLE",
            home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\marseille.png",
            home_short: "MAR",
            away_team: "GRENOBLE",
            away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\grenoble.png",
            away_short: "GRE",
            phase: "Test - Saison régulière",
            etat: null,
            en_cours: true,
            home_score: 3,
            away_score: 2,
            vs_match: "3-2",
            period: "2ème période"
          },
          {
            rank: 2,
            id: 99992,
            match: "ROUEN / ANGERS",
            date: "Test",
            date_numeric: new Date().toISOString().split('T')[0],
            time: "19:30",
            arena: "Rouen - L'Île Lacroix",
            home_team: "ROUEN",
            home_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\rouen.png",
            home_short: "ROU",
            away_team: "ANGERS",
            away_logo: "C:\\Ettanfotboll_vMix\\graphics\\team_logos\\angers.png",
            away_short: "ANG",
            phase: "Test - Saison régulière",
            etat: null,
            en_cours: true,
            home_score: 1,
            away_score: 1,
            vs_match: "1-1",
            period: "1ère période"
          }
        ];
      }

      // Pad today's games to always have 6 slots for vMix (fill empty slots with blank data)
      if (urlConfig.type === 'todaysgames') {
        const MAX_GAMES = 6;

        // Count actual games (non-empty games)
        const actualGameCount = filteredGames.filter(game => game.id !== null && game.match !== "").length;

        while (filteredGames.length < MAX_GAMES) {
          const emptyGameNumber = filteredGames.length + 1;
          filteredGames.push({
            rank: emptyGameNumber,
            id: null,
            match: "",
            date: "",
            date_numeric: "",
            time: "",
            arena: "",
            home_team: "",
            home_logo: "",
            home_short: "",
            away_team: "",
            away_logo: "",
            away_short: "",
            phase: "",
            etat: null,
            en_cours: false,
            home_score: null,
            away_score: null,
            vs_match: "",
            period: ""
          });
        }

        // Add divider color fields to each game
        // Each game's divider is visible if the game has data (not empty)
        filteredGames.forEach((game, index) => {
          const hasGameData = game.id !== null && game.match !== "";
          game['divider'] = hasGameData ? '#FFFFFF' : '#00000000';
        });
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

    // Add extra wait for goalkeeper pages (tables load dynamically)
    if (urlConfig.type === 'gk70plus' || urlConfig.type === 'gk70minus') {
      await page.waitForTimeout(3000);
    }

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

    return data.length;
  } catch (err) {
    console.error(`✗ Error scraping ${urlConfig.url}:`, err.message);
    return 0;
  } finally {
    // Always close the page, even if there was an error
    if (page && !page.isClosed()) {
      await page.close();
    }
  }
}

(async () => {
  console.log('=== Ligue Magnus Stats Scraper ===\n');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  for (const urlConfig of urls) {
    await scrapePage(urlConfig, browser);
  }

  await browser.close();
  console.log('\n=== Scraping Complete ===');
  console.log('JSON files saved to: output/');
  console.log('Start the HTTP server with: node http-server.js');
})();
