const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Load configuration to get phase
const configPath = path.join(__dirname, '../config/config.json');
let phase = '652'; // default phase
try {
  const configFile = fsSync.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configFile);
  // Extract phase from any URL in config
  const urlWithPhase = config.scraper.urls.find(u => u.url.includes('phase='));
  if (urlWithPhase) {
    const match = urlWithPhase.url.match(/phase=(\d+)/);
    if (match) phase = match[1];
  }
} catch (err) {
  console.log('Using default phase:', phase);
}

const url = `https://liguemagnus.com/calendrier-resultats-po/?phase=${phase}`;

// Team logo mapping
function getTeamLogo(teamName) {
  const logoBasePath = 'C:\\Ettanfotboll_vMix\\graphics\\team_logos\\';

  if (!teamName || typeof teamName !== 'string') return null;

  const normalized = teamName.toUpperCase().trim();

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

  for (const [teamKey, logoFile] of Object.entries(teamLogoMap)) {
    if (normalized === teamKey || normalized.includes(teamKey)) {
      return logoBasePath + logoFile;
    }
  }

  return null;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Capture the playoff games API call
  let playoffData = null;
  page.on('response', async (response) => {
    const responseUrl = response.url();
    if (responseUrl.includes('admin-ajax.php')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          // Look for the games data (has rencontre_libelle field)
          if (data.success && data.data && data.data.data) {
            const items = data.data.data;
            if (items.length > 0 && items[0].rencontre_libelle) {
              playoffData = items;
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
  );

  // Set extra headers to prevent caching
  await page.setExtraHTTPHeaders({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  console.log(`Loading ${url}...`);
  // Add cache-buster to URL
  const urlWithCacheBuster = `${url}&_=${Date.now()}`;
  await page.goto(urlWithCacheBuster, { waitUntil: 'networkidle0' });
  await page.waitForTimeout(3000);

  await browser.close();

  if (!playoffData) {
    console.log('No playoff data found!');
    return;
  }

  console.log(`\nFound ${playoffData.length} playoff games\n`);

  // Transform to simpler format with playoff-specific fields
  const games = playoffData.map(game => {
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

    // Determine playoff round from phase or match label
    let round = null;
    const matchLabel = game.rencontre_libelle || '';
    if (matchLabel.toLowerCase().includes('quart')) {
      round = 'Quarter-finals';
    } else if (matchLabel.toLowerCase().includes('demi')) {
      round = 'Semi-finals';
    } else if (matchLabel.toLowerCase().includes('final')) {
      round = 'Finals';
    } else if (game.phase && game.phase.libelle) {
      round = game.phase.libelle;
    }

    // Parse date_rencontre to split into date and time
    // Format is typically "2026-03-13 20:00"
    let date_numeric = null;
    let time = null;
    if (game.date_rencontre) {
      const parts = game.date_rencontre.split(' ');
      if (parts.length >= 2) {
        date_numeric = parts[0];  // "2026-03-13"
        time = parts[1];          // "20:00"
      }
    }

    return {
      id: game.id,
      match: game.rencontre_libelle,
      date: game.date_rencontre,
      date_numeric: date_numeric,
      time: time,
      home_team: game.receveur ? game.receveur.libelle_complet : null,
      home_logo: getTeamLogo(game.receveur ? game.receveur.libelle_complet : null),
      home_short: game.receveur ? game.receveur.abreviation : null,
      away_team: game.visiteur ? game.visiteur.libelle_complet : null,
      away_logo: getTeamLogo(game.visiteur ? game.visiteur.libelle_complet : null),
      away_short: game.visiteur ? game.visiteur.abreviation : null,
      round: round,
      phase: game.phase ? game.phase.libelle : null,
      etat: game.etat || null,  // "T" = Terminé (finished)
      en_cours: game.en_cours || false,  // true if game is in progress
      home_score: home_score,
      away_score: away_score
    };
  });

  // Protect finished game scores from being overwritten with null
  // Load existing data to preserve scores
  let existingGames = {};
  try {
    const existingPath = 'output/playoff-games.json';
    if (fsSync.existsSync(existingPath)) {
      const existingData = JSON.parse(fsSync.readFileSync(existingPath, 'utf8'));
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

  // Save to JSON
  const jsonOutput = {
    type: "playoff-games",
    timestamp: new Date().toISOString(),
    count: protectedGames.length,
    phase: phase,
    data: protectedGames
  };

  await fs.mkdir('output', { recursive: true });
  await fs.writeFile('output/playoff-games.json', JSON.stringify(jsonOutput, null, 2));

  console.log('Saved to: output/playoff-games.json\n');

  // Show all games grouped by round
  const byRound = {};
  protectedGames.forEach(game => {
    const round = game.round || 'Unknown';
    if (!byRound[round]) byRound[round] = [];
    byRound[round].push(game);
  });

  Object.keys(byRound).forEach(round => {
    console.log(`\n=== ${round} ===`);
    byRound[round].forEach((game, idx) => {
      console.log(`\n${idx + 1}. ${game.match}`);
      console.log(`   Date: ${game.date}`);
      console.log(`   ${game.home_team} (${game.home_short}) vs ${game.away_team} (${game.away_short})`);
      if (game.home_score !== null) {
        console.log(`   Score: ${game.home_score} - ${game.away_score}`);
      }
      if (game.etat === 'T') {
        console.log(`   Status: Finished`);
      } else if (game.en_cours) {
        console.log(`   Status: In Progress`);
      } else {
        console.log(`   Status: Upcoming`);
      }
    });
  });
})();
