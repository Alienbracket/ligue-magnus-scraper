const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Update Frequency Monitor
 *
 * Monitors a game page at regular intervals to detect when data actually changes.
 * Tracks individual statistics, team statistics, and game state changes.
 * Generates a JSON report showing update patterns.
 */

// Configuration
const CHECK_INTERVAL = 30000; // 30 seconds between checks
const MAX_CHECKS = 120; // Run for 1 hour (120 checks × 30 seconds = 3600 seconds)

// Track changes
let checkCount = 0;
let previousData = null;
let changeLog = [];
let startTime = null;

// Extract all game data from the page
async function scrapeGameData(gameId) {
  const url = `https://liguemagnus.com/rencontre/${gameId}/`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(2000);

    const gameData = await page.evaluate(() => {
      const result = {
        score: {},
        teams: [],
        players: [],
        goalies: [],
        collective: {
          team1: {},
          team2: {}
        },
        timestamp: new Date().toISOString()
      };

      // Extract score from first table
      const tables = Array.from(document.querySelectorAll('table'));

      if (tables.length > 0) {
        const scoreTable = tables[0];
        const rows = Array.from(scoreTable.querySelectorAll('tbody tr, tr'));

        rows.forEach((row, idx) => {
          const cells = Array.from(row.querySelectorAll('td'));
          const teamName = cells[0]?.innerText.trim();
          const score = cells[1]?.innerText.trim();

          if (teamName && teamName.length > 0 && teamName !== 'Equipe') {
            result.teams.push(teamName);
            result.score[teamName] = score;
          }
        });
      }

      // Extract player data from all tables
      tables.forEach((table) => {
        const headers = Array.from(table.querySelectorAll('thead th, th')).map(h => h.innerText.trim());

        // Player roster table
        if (headers.includes('Joueur')) {
          const rows = Array.from(table.querySelectorAll('tbody tr'));
          const butIdx = headers.indexOf('But');
          const assIdx = headers.indexOf('Ass');
          const ptsIdx = headers.indexOf('Pts');
          const pmIdx = headers.indexOf('+/-');
          const tirsIdx = headers.indexOf('T');
          const penIdx = headers.indexOf('PEN');

          rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            const joueurCell = cells[0]?.innerText.trim();

            if (joueurCell && joueurCell.length > 0) {
              const match = joueurCell.match(/N[˚°]\s*(\d+)\s+(.+)/);
              if (match) {
                const playerData = {
                  number: parseInt(match[1]),
                  name: match[2].trim().split('\n')[0].trim(),
                  b: butIdx >= 0 ? (cells[butIdx]?.innerText || '').trim() : '',
                  a: assIdx >= 0 ? (cells[assIdx]?.innerText || '').trim() : '',
                  pts: ptsIdx >= 0 ? (cells[ptsIdx]?.innerText || '').trim() : '',
                  pm: pmIdx >= 0 ? (cells[pmIdx]?.innerText || '').trim() : '',
                  tirs: tirsIdx >= 0 ? (cells[tirsIdx]?.innerText || '').trim() : '',
                  pen: penIdx >= 0 ? (cells[penIdx]?.innerText || '').trim() : ''
                };
                result.players.push(playerData);
              }
            }
          });
        }

        // Goalie table
        if (headers.includes('Gardien')) {
          const rows = Array.from(table.querySelectorAll('tbody tr'));
          const minIdx = headers.indexOf('Min');
          const bcIdx = headers.indexOf('Buts encaissés');
          const arrIdx = headers.indexOf('Arrêts');

          rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            const gardienCell = cells[0]?.innerText.trim();

            if (gardienCell && gardienCell.length > 0) {
              const match = gardienCell.match(/N[˚°]\s*(\d+)\s+(.+)/);
              if (match) {
                const goalieData = {
                  number: parseInt(match[1]),
                  name: match[2].trim(),
                  min: minIdx >= 0 ? (cells[minIdx]?.innerText || '').trim() : '',
                  bc: bcIdx >= 0 ? (cells[bcIdx]?.innerText || '').trim() : '',
                  arr: arrIdx >= 0 ? (cells[arrIdx]?.innerText || '').trim() : ''
                };
                result.goalies.push(goalieData);
              }
            }
          });
        }
      });

      // Extract collective/team statistics
      // Look for tables with team totals (usually has "TOTAL" or team name rows with aggregated stats)
      tables.forEach((table, tableIndex) => {
        const headers = Array.from(table.querySelectorAll('thead th, th')).map(h => h.innerText.trim());
        const rows = Array.from(table.querySelectorAll('tbody tr, tr'));

        // Check if this is a team stats table
        rows.forEach(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          const firstCell = cells[0]?.innerText.trim().toUpperCase();

          // Check if this row contains team totals
          if (firstCell && (result.teams.includes(cells[0]?.innerText.trim()) || firstCell.includes('TOTAL'))) {
            const teamIndex = result.teams.indexOf(cells[0]?.innerText.trim());
            const targetTeam = teamIndex === 0 ? 'team1' : 'team2';

            // Extract available statistics from the row
            const collectiveStats = {};

            headers.forEach((header, idx) => {
              if (idx > 0 && cells[idx]) {
                const value = cells[idx].innerText.trim();
                const headerLower = header.toLowerCase();

                // Map common collective stat headers
                if (header === 'T' || headerLower.includes('tir')) collectiveStats.tirs = value;
                if (header === 'PEN' || headerLower.includes('pen')) collectiveStats.pen = value;
                if (header === 'But' || headerLower.includes('but')) collectiveStats.buts = value;
                if (header === 'Ass' || headerLower.includes('ass')) collectiveStats.assists = value;
                if (header === 'Pts' || headerLower.includes('pts')) collectiveStats.points = value;
                if (header === '+/-' || headerLower.includes('+/-')) collectiveStats.plus_minus = value;
                if (header === 'ENG' || headerLower.includes('eng')) collectiveStats.engagements = value;
              }
            });

            if (Object.keys(collectiveStats).length > 0) {
              result.collective[targetTeam] = {
                team_name: cells[0]?.innerText.trim(),
                ...collectiveStats
              };
            }
          }
        });
      });

      return result;
    });

    return gameData;

  } finally {
    await browser.close();
  }
}

// Compare two data snapshots and detect changes
function detectChanges(previous, current) {
  if (!previous) return null;

  const changes = {
    timestamp: current.timestamp,
    score_changed: false,
    score_updated_at: null,
    players_changed: [],
    players_updated_at: null,
    goalies_changed: [],
    goalies_updated_at: null,
    collective_changed: [],
    collective_updated_at: null,
    details: {}
  };

  // Check score changes
  if (JSON.stringify(previous.score) !== JSON.stringify(current.score)) {
    changes.score_changed = true;
    changes.score_updated_at = current.timestamp;
    changes.details.score = {
      before: previous.score,
      after: current.score
    };
  }

  // Check player stat changes
  current.players.forEach((currentPlayer) => {
    const previousPlayer = previous.players.find(p => p.number === currentPlayer.number && p.name === currentPlayer.name);

    if (previousPlayer) {
      const statsChanged = ['b', 'a', 'pts', 'pm', 'tirs', 'pen'].some(
        stat => previousPlayer[stat] !== currentPlayer[stat]
      );

      if (statsChanged) {
        changes.players_changed.push({
          number: currentPlayer.number,
          name: currentPlayer.name,
          before: previousPlayer,
          after: currentPlayer
        });
      }
    }
  });

  if (changes.players_changed.length > 0) {
    changes.players_updated_at = current.timestamp;
  }

  // Check goalie stat changes
  current.goalies.forEach((currentGoalie) => {
    const previousGoalie = previous.goalies.find(g => g.number === currentGoalie.number && g.name === currentGoalie.name);

    if (previousGoalie) {
      const statsChanged = ['min', 'bc', 'arr'].some(
        stat => previousGoalie[stat] !== currentGoalie[stat]
      );

      if (statsChanged) {
        changes.goalies_changed.push({
          number: currentGoalie.number,
          name: currentGoalie.name,
          before: previousGoalie,
          after: currentGoalie
        });
      }
    }
  });

  if (changes.goalies_changed.length > 0) {
    changes.goalies_updated_at = current.timestamp;
  }

  // Check collective/team stat changes
  ['team1', 'team2'].forEach(teamKey => {
    const prevTeam = previous.collective?.[teamKey];
    const currTeam = current.collective?.[teamKey];

    if (prevTeam && currTeam && JSON.stringify(prevTeam) !== JSON.stringify(currTeam)) {
      changes.collective_changed.push({
        team: teamKey,
        team_name: currTeam.team_name,
        before: prevTeam,
        after: currTeam
      });
    }
  });

  if (changes.collective_changed.length > 0) {
    changes.collective_updated_at = current.timestamp;
  }

  // Return null if no changes detected
  const hasChanges = changes.score_changed ||
                     changes.players_changed.length > 0 ||
                     changes.goalies_changed.length > 0 ||
                     changes.collective_changed.length > 0;

  return hasChanges ? changes : null;
}

// Monitor game updates
async function monitorGameUpdates(gameId) {
  startTime = new Date();
  console.log(`\n=== Update Frequency Monitor ===`);
  console.log(`Game ID: ${gameId}`);
  console.log(`Start Time: ${startTime.toISOString()}`);
  console.log(`Check Interval: ${CHECK_INTERVAL / 1000} seconds`);
  console.log(`Max Checks: ${MAX_CHECKS}\n`);

  const monitoringData = {
    game_id: gameId,
    start_time: startTime.toISOString(),
    check_interval_seconds: CHECK_INTERVAL / 1000,
    total_checks: 0,
    changes_detected: 0,
    change_log: [],
    last_update_times: {
      score: null,
      individual_stats: null,
      collective_stats: null
    },
    summary: {
      score_updates: 0,
      player_stat_updates: 0,
      goalie_stat_updates: 0,
      collective_stat_updates: 0,
      average_update_interval_seconds: 0,
      update_intervals: []
    }
  };

  let lastChangeTime = null;

  while (checkCount < MAX_CHECKS) {
    checkCount++;
    const checkTime = new Date();

    try {
      console.log(`[Check ${checkCount}/${MAX_CHECKS}] ${checkTime.toISOString()}`);

      const currentData = await scrapeGameData(gameId);
      const changes = detectChanges(previousData, currentData);

      if (changes) {
        monitoringData.changes_detected++;
        console.log(`  ✓ CHANGE DETECTED!`);

        if (changes.score_changed) {
          console.log(`    - Score changed (${changes.score_updated_at})`);
          monitoringData.summary.score_updates++;
          monitoringData.last_update_times.score = changes.score_updated_at;
        }

        if (changes.players_changed.length > 0 || changes.goalies_changed.length > 0) {
          if (changes.players_changed.length > 0) {
            console.log(`    - ${changes.players_changed.length} player(s) stats changed (${changes.players_updated_at})`);
            monitoringData.summary.player_stat_updates++;
          }
          if (changes.goalies_changed.length > 0) {
            console.log(`    - ${changes.goalies_changed.length} goalie(s) stats changed (${changes.goalies_updated_at})`);
            monitoringData.summary.goalie_stat_updates++;
          }
          monitoringData.last_update_times.individual_stats = changes.players_updated_at || changes.goalies_updated_at;
        }

        if (changes.collective_changed.length > 0) {
          console.log(`    - Collective team stats changed (${changes.collective_updated_at})`);
          monitoringData.summary.collective_stat_updates++;
          monitoringData.last_update_times.collective_stats = changes.collective_updated_at;
        }

        // Calculate time since last change
        if (lastChangeTime) {
          const intervalSeconds = (new Date(changes.timestamp) - lastChangeTime) / 1000;
          monitoringData.summary.update_intervals.push(intervalSeconds);
          console.log(`    - Time since last update: ${intervalSeconds} seconds`);
        }

        lastChangeTime = new Date(changes.timestamp);
        monitoringData.change_log.push(changes);
      } else {
        console.log(`  - No changes detected`);
      }

      previousData = currentData;

      // Save progress periodically
      if (checkCount % 10 === 0) {
        await saveMonitoringReport(monitoringData);
      }

    } catch (err) {
      console.error(`  ✗ Error during check: ${err.message}`);
    }

    // Wait for next check (unless this is the last one)
    if (checkCount < MAX_CHECKS) {
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
    }
  }

  // Calculate final statistics
  monitoringData.total_checks = checkCount;
  monitoringData.end_time = new Date().toISOString();

  if (monitoringData.summary.update_intervals.length > 0) {
    const sum = monitoringData.summary.update_intervals.reduce((a, b) => a + b, 0);
    monitoringData.summary.average_update_interval_seconds = Math.round(sum / monitoringData.summary.update_intervals.length);
  }

  // Save final report
  await saveMonitoringReport(monitoringData);

  console.log(`\n=== Monitoring Complete ===`);
  console.log(`Total Checks: ${monitoringData.total_checks}`);
  console.log(`Changes Detected: ${monitoringData.changes_detected}`);
  console.log(`Score Updates: ${monitoringData.summary.score_updates}`);
  console.log(`Player Stat Updates: ${monitoringData.summary.player_stat_updates}`);
  console.log(`Goalie Stat Updates: ${monitoringData.summary.goalie_stat_updates}`);
  console.log(`Collective Stat Updates: ${monitoringData.summary.collective_stat_updates}`);

  if (monitoringData.summary.average_update_interval_seconds > 0) {
    console.log(`Average Update Interval: ${monitoringData.summary.average_update_interval_seconds} seconds`);
  }

  console.log(`\nLast Update Times:`);
  console.log(`  Score: ${monitoringData.last_update_times.score || 'Never updated'}`);
  console.log(`  Individual Stats: ${monitoringData.last_update_times.individual_stats || 'Never updated'}`);
  console.log(`  Collective Stats: ${monitoringData.last_update_times.collective_stats || 'Never updated'}`);

  return monitoringData;
}

// Save monitoring report to file
async function saveMonitoringReport(data) {
  const outputDir = path.join(__dirname, '../output/monitoring');
  await fs.mkdir(outputDir, { recursive: true });

  const filename = `update_frequency_game_${data.game_id}.json`;
  const filepath = path.join(outputDir, filename);

  await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  console.log(`  → Report saved: ${filename}`);
}

// CLI Usage
async function main() {
  const gameId = process.argv[2];

  if (!gameId) {
    console.log('Usage: node update-frequency-monitor.js <game_id>');
    console.log('\nExample:');
    console.log('  node update-frequency-monitor.js 69031');
    console.log('\nThis will monitor the game page for changes and create a report showing:');
    console.log('  - When score updates occur');
    console.log('  - When individual player statistics change');
    console.log('  - When goalie statistics change');
    console.log('  - Average time between updates');
    console.log('\nConfiguration:');
    console.log(`  Check Interval: ${CHECK_INTERVAL / 1000} seconds`);
    console.log(`  Max Checks: ${MAX_CHECKS} (total monitoring time: ${(MAX_CHECKS * CHECK_INTERVAL) / 60000} minutes)`);
    process.exit(1);
  }

  await monitorGameUpdates(gameId);
}

module.exports = { monitorGameUpdates, scrapeGameData, detectChanges };

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
