const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');

const url = "https://liguemagnus.com/calendrier-resultats/";

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Capture the games API call
  let gamesData = null;
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('admin-ajax.php')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          // Look for the games data (has rencontre_libelle field)
          if (data.success && data.data && data.data.data) {
            const items = data.data.data;
            if (items.length > 0 && items[0].rencontre_libelle) {
              gamesData = items;
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

  if (!gamesData) {
    console.log('No games data found!');
    return;
  }

  console.log(`\nFound ${gamesData.length} games\n`);

  // Transform to simpler format
  const games = gamesData.map(game => {
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
  let existingGames = {};
  try {
    const existingPath = 'output/games.json';
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
    type: "games",
    timestamp: new Date().toISOString(),
    count: protectedGames.length,
    data: protectedGames
  };

  await fs.mkdir('output', { recursive: true });
  await fs.writeFile('output/games.json', JSON.stringify(jsonOutput, null, 2));

  console.log('Saved to: output/games.json\n');

  // Show first 5 games
  console.log('First 5 games:');
  protectedGames.slice(0, 5).forEach((game, idx) => {
    console.log(`\n${idx + 1}. ${game.match}`);
    console.log(`   Date: ${game.date}`);
    console.log(`   Home: ${game.home_team} (${game.home_short})`);
    console.log(`   Away: ${game.away_team} (${game.away_short})`);
    if (game.home_score !== null) {
      console.log(`   Score: ${game.home_score} - ${game.away_score}`);
    }
  });
})();
