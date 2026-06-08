const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

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
              console.log('Found', items.length, 'games from API');
              items.slice(0, 10).forEach((game, i) => {
                console.log('Game', i+1, ':', game.rencontre_libelle, 'on', game.date_rencontre);
              });
            }
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  });

  await page.goto('https://liguemagnus.com/calendrier-resultats/', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (!apiData) {
    console.log('No game data found!');
  } else {
    // Check for today's games
    const now = new Date();
    const parisTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const today = parisTime.toISOString().split('T')[0];
    console.log('\nToday is:', today);

    const todayGames = apiData.filter(g => g.date_rencontre && g.date_rencontre.startsWith(today));
    console.log('Games today:', todayGames.length);
    todayGames.forEach(g => {
      console.log(' -', g.rencontre_libelle, 'at', g.date_rencontre);
    });
  }

  await browser.close();
})();
