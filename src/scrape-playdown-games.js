const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Use phase 651 for playdowns
const phase = '651';
const url = `https://liguemagnus.com/calendrier-resultats-pm/?phase=${phase}`;

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

// Convert date to French text format (e.g., "13 mars")
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

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Capture the playdown games API call
  let playdownData = null;
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
              playdownData = items;
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

  console.log(`Loading ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForTimeout(3000);

  await browser.close();

  if (!playdownData) {
    console.log('No playdown data found!');
    return;
  }

  console.log(`\nFound ${playdownData.length} playdown games\n`);

  // Transform to match playoff games format
  const games = playdownData.map(game => {
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

    // Format arena name
    let arenaName = game.lieu_de_pratique ? game.lieu_de_pratique.nom : null;
    if (arenaName && arenaName.includes('POMGE')) {
      arenaName = 'Marseille - POMGE';
    }

    // Get team names - use libelle_court if available, fallback to abreviation
    const homeTeamShort = game.receveur ? (game.receveur.libelle_court || game.receveur.abreviation) : null;
    const awayTeamShort = game.visiteur ? (game.visiteur.libelle_court || game.visiteur.abreviation) : null;
    const homeTeamFull = game.receveur ? game.receveur.libelle_complet : null;
    const awayTeamFull = game.visiteur ? game.visiteur.libelle_complet : null;

    return {
      id: game.id,
      match: game.rencontre_libelle,
      date: formatDateToFrench(gameDate),
      date_numeric: gameDate,
      time: gameTime,
      arena: arenaName,
      home_team: homeTeamShort,
      home_logo: getTeamLogo(homeTeamFull),
      home_short: game.receveur ? game.receveur.abreviation : null,
      away_team: awayTeamShort,
      away_logo: getTeamLogo(awayTeamFull),
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
  let existingGames = {};
  try {
    const existingPath = 'output/playdown-games.json';
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

  // Sort by date and add rank
  protectedGames.sort((a, b) => {
    const dateA = new Date(a.date_numeric + ' ' + a.time);
    const dateB = new Date(b.date_numeric + ' ' + b.time);
    return dateA - dateB;
  });

  // Add rank field
  const rankedGames = protectedGames.map((game, index) => ({
    rank: index + 1,
    ...game
  }));

  // Save to JSON
  const jsonOutput = {
    type: "playdown-games",
    timestamp: new Date().toISOString(),
    count: rankedGames.length,
    phase: phase,
    data: rankedGames
  };

  await fs.mkdir('output', { recursive: true });
  await fs.writeFile('output/playdown-games.json', JSON.stringify(jsonOutput, null, 2));

  console.log('Saved to: output/playdown-games.json\n');

  // Show all games grouped by phase
  const byPhase = {};
  rankedGames.forEach(game => {
    const phase = game.phase || 'Unknown';
    if (!byPhase[phase]) byPhase[phase] = [];
    byPhase[phase].push(game);
  });

  Object.keys(byPhase).forEach(phase => {
    console.log(`\n=== ${phase} ===`);
    byPhase[phase].forEach((game) => {
      console.log(`\n${game.rank}. ${game.match}`);
      console.log(`   Date: ${game.date} ${game.time}`);
      console.log(`   ${game.home_team} (${game.home_short}) vs ${game.away_team} (${game.away_short})`);
      if (game.arena) {
        console.log(`   Arena: ${game.arena}`);
      }
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
