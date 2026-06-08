const puppeteer = require('puppeteer');
const fs = require('fs').promises;

async function scrapeGKTable(browser, tableIndex, type) {
  const page = await browser.newPage();
  const url = 'https://liguemagnus.com/statistiques-individuelles/?tri_p=nombre_assists-desc&actif=stats&onglet=joueurs&page_p=1';

  console.log(`\nScraping ${type}...`);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

  // Add 3 second wait for dynamic tables
  console.log('Waiting for tables to load...');
  await page.waitForTimeout(3000);

  const data = await page.evaluate((idx) => {
    const tables = Array.from(document.querySelectorAll('table'));
    const table = tables[idx];

    if (!table) return [];

    const headers = Array.from(table.querySelectorAll('thead th')).map(h => h.innerText.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr'));

    return rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
      const obj = {};
      headers.forEach((h, i) => obj[h] = cells[i] || '');
      return obj;
    });
  }, tableIndex);

  console.log(`  Found ${data.length} goalies`);

  // Pad to 10 entries if needed
  while (data.length < 10) {
    data.push({
      RG: '', Nom: '', Équipe: '', MJ: '', MJE: '', Min: '',
      V: '', DPrl: '', D: '', Blan: '', BC: '', Moy: '', Arr: '', '% Arr': ''
    });
  }

  // Format output
  const output = {
    type: type,
    timestamp: new Date().toISOString(),
    count: data.filter(d => d.Nom !== '').length,
    data: data.map((item, index) => ({
      rank: index + 1,
      rg: item.RG || '',
      name: item.Nom || '',
      nom: item.Nom ? formatName(item.Nom) : '',
      equipe: item.Équipe || '',
      logo: getTeamLogo(item.Équipe),
      equ: getShortenedTeamName(item.Équipe),
      mj: item.MJ || '',
      mje: item.MJE || '',
      min: item.Min || '',
      v: item.V || '',
      dprl: item.DPrl || '',
      d: item.D || '',
      blan: item.Blan || '',
      bc: item.BC || '',
      moy: item.Moy || '',
      arr: item.Arr || '',
      arr_pct: item['% Arr'] || ''
    }))
  };

  await page.close();
  return output;
}

function formatName(name) {
  if (!name) return '';
  const match = name.match(/^([A-Z'-]+)([A-Z][a-z'-]+)$/);
  if (!match) return name;
  return `${match[2].charAt(0)}.${match[1]}`;
}

function getShortenedTeamName(team) {
  const map = {
    'ROUEN': 'ROU', 'ANGERS': 'ANG', 'GRENOBLE': 'GRE', 'MARSEILLE': 'MAR',
    'GAP': 'GAP', 'NICE': 'NIC', 'AMIENS': 'AMI', 'BORDEAUX': 'BOR',
    'CHAMONIX': 'CHA', 'CERGY-PONTOISE': 'CER', 'ANGLET': 'AGL', 'BRIANÇON': 'BRI'
  };
  return map[team] || '';
}

function getTeamLogo(team) {
  return team ? `C:\\Ettanfotboll_vMix\\graphics\\team_logos\\${team.toLowerCase().replace('ç','c')}.png` : '';
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const gk70plus = await scrapeGKTable(browser, 1, 'gk70plus');
    const gk70minus = await scrapeGKTable(browser, 2, 'gk70minus');

    await fs.writeFile('output/GK70plus.json', JSON.stringify(gk70plus, null, 2));
    await fs.writeFile('output/GK70minus.json', JSON.stringify(gk70minus, null, 2));

    console.log('\n✓ Successfully saved:');
    console.log(`  GK70plus.json (${gk70plus.count} goalies)`);
    console.log(`  GK70minus.json (${gk70minus.count} goalies)`);
  } catch (err) {
    console.error('Error:', err.message);
  }

  await browser.close();
})();
