const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Use phase 651 for playdown standings
const phase = '651';
const url = `https://liguemagnus.com/saison-reguliere/classement-pm-2/?phase=${phase}`;

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Capture the standings API call (in case it uses API in the future)
  let standingsData = null;

  page.on('response', async (response) => {
    const responseUrl = response.url();

    try {
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();

        // Look for the standings data (has team statistics)
        if (data.success && data.data && data.data.data) {
          const items = data.data.data;
          if (items.length > 0 && (items[0].equipe || items[0].pts !== undefined)) {
            standingsData = items;
          }
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
  );

  console.log(`Loading ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForTimeout(5000);  // Wait longer for data to load

  // If API didn't capture data, try scraping from DOM
  if (!standingsData) {
    console.log('API interception failed, trying DOM scraping...');

    // Try to extract data from the table
    const tableData = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const teams = [];

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');

        if (cells.length >= 10) {
          // Extract data from cells
          // Note: Cell 2 is empty (team logo), so actual data starts at cell 3
          teams.push({
            rank: cells[0]?.innerText?.trim(),
            team: cells[1]?.innerText?.trim(),
            pts: cells[3]?.innerText?.trim(),    // Points at cell 3
            mj: cells[4]?.innerText?.trim(),     // Matches played at cell 4
            v: cells[5]?.innerText?.trim(),      // Wins at cell 5
            vprl: cells[6]?.innerText?.trim(),   // OT wins at cell 6
            dprl: cells[7]?.innerText?.trim(),   // OT losses at cell 7
            d: cells[8]?.innerText?.trim(),      // Losses at cell 8
            bp: cells[9]?.innerText?.trim(),     // Goals for at cell 9
            bc: cells[10]?.innerText?.trim(),    // Goals against at cell 10
            pen: cells[11]?.innerText?.trim()    // Penalties at cell 11
          });
        }
      });
      return teams;
    });

    console.log('Extracted', tableData.length, 'teams from DOM');

    if (tableData.length > 0) {
      standingsData = tableData;
    }
  }

  await browser.close();

  if (!standingsData || standingsData.length === 0) {
    console.log('No standings data found!');
    return;
  }

  console.log(`\nFound ${standingsData.length} teams in playdown standings\n`);

  // Transform to simpler format - handle both API and DOM formats
  const standings = standingsData.map((team, index) => {
    // Check if this is API format (has equipe object) or DOM format (has rank string)
    const isApiFormat = team.equipe !== undefined;

    return {
      rank: isApiFormat ? (index + 1) : (parseInt(team.rank) || index + 1),
      team_name: isApiFormat ? (team.equipe ? team.equipe.libelle_complet : null) : team.team,
      team_short: isApiFormat ? (team.equipe ? team.equipe.abreviation : null) : null,
      team_id: isApiFormat ? (team.equipe ? team.equipe.id : null) : null,
      points: parseInt(team.pts) || 0,
      mj: parseInt(team.mj) || 0,  // Matches played
      v: parseInt(team.v) || 0,  // Wins
      vprl: parseInt(team.vprl) || 0,  // Wins in overtime/shootout
      dprl: parseInt(team.dprl) || 0,  // Losses in overtime/shootout
      d: parseInt(team.d) || 0,  // Losses
      bp: parseInt(team.bp) || 0,  // Goals for
      bc: parseInt(team.bc) || 0,  // Goals against
      goal_diff: (parseInt(team.bp) || 0) - (parseInt(team.bc) || 0),
      pen: parseInt(team.pen) || 0,  // Penalties
      form: team.forme || null  // Recent form string
    };
  });

  // Sort by rank/points (just in case)
  standings.sort((a, b) => b.points - a.points);

  // Re-assign rank after sorting
  standings.forEach((team, index) => {
    team.rank = index + 1;
  });

  // Save to JSON
  const jsonOutput = {
    type: "playdown-standings",
    timestamp: new Date().toISOString(),
    count: standings.length,
    phase: phase,
    data: standings
  };

  await fs.mkdir('output', { recursive: true });
  await fs.writeFile('output/playdown-standings.json', JSON.stringify(jsonOutput, null, 2));

  console.log('Saved to: output/playdown-standings.json\n');

  // Display standings table
  console.log('=== PLAYDOWN STANDINGS ===\n');
  console.log('Rank | Team                  | Pts | MJ | W | WOT | LOT | L | GF | GA | +/-  | Pen');
  console.log('-'.repeat(90));

  standings.forEach(team => {
    const teamName = team.team_name ? team.team_name.padEnd(20).substring(0, 20) : 'Unknown'.padEnd(20);
    const rank = String(team.rank).padStart(4);
    const pts = String(team.points).padStart(3);
    const mj = String(team.mj).padStart(2);
    const w = String(team.v).padStart(2);
    const wot = String(team.vprl).padStart(3);
    const lot = String(team.dprl).padStart(3);
    const l = String(team.d).padStart(2);
    const gf = String(team.bp).padStart(2);
    const ga = String(team.bc).padStart(2);
    const diff = String(team.goal_diff >= 0 ? '+' + team.goal_diff : team.goal_diff).padStart(5);
    const pen = String(team.pen).padStart(3);

    console.log(`${rank} | ${teamName} | ${pts} | ${mj} | ${w} | ${wot} | ${lot} | ${l} | ${gf} | ${ga} | ${diff} | ${pen}`);
  });
})();
