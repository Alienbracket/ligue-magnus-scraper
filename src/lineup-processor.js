const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Lineup Processor
 *
 * Takes a game lineup JSON and team statistics JSONs, then creates
 * two separate JSONs (home and away) with combined lineup + stats data
 */

// Normalize player name for matching
function normalizePlayerName(name) {
  if (!name || typeof name !== 'string') return '';

  return name
    .toUpperCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[àáâãäå]/g, 'A')
    .replace(/[èéêë]/g, 'E')
    .replace(/[ìíîï]/g, 'I')
    .replace(/[òóôõö]/g, 'O')
    .replace(/[ùúûü]/g, 'U')
    .replace(/[ç]/g, 'C')
    .replace(/[ñ]/g, 'N')
    .replace(/[^A-Z]/g, '');
}

// Find player in team stats by name matching
function findPlayerInStats(lineupPlayerName, teamStats) {
  const normalizedLineupName = normalizePlayerName(lineupPlayerName);

  // Search in players
  for (const player of teamStats.players.data) {
    const normalizedStatName = normalizePlayerName(player.name);
    const normalizedStatNom = normalizePlayerName(player.nom);

    if (normalizedLineupName === normalizedStatName ||
        normalizedLineupName === normalizedStatNom) {
      return { ...player, type: 'player' };
    }
  }

  // Search in goalies
  for (const goalie of teamStats.goalies.data) {
    const normalizedStatName = normalizePlayerName(goalie.name);
    const normalizedStatNom = normalizePlayerName(goalie.nom);

    if (normalizedLineupName === normalizedStatName ||
        normalizedLineupName === normalizedStatNom) {
      return { ...goalie, type: 'goalie' };
    }
  }

  return null;
}

// Prefix all keys in an object with a given prefix
function prefixObjectKeys(obj, prefix) {
  if (!obj || typeof obj !== 'object') return obj;

  const prefixed = {};
  for (const [key, value] of Object.entries(obj)) {
    prefixed[`${prefix}_${key}`] = value;
  }
  return prefixed;
}

// Map arena names to team slugs
function arenaToTeamSlug(arena) {
  if (!arena) return null;

  const arenaMap = {
    'rouen': 'rouen',
    'île lacroix': 'rouen',
    'angers': 'angers',
    'iceparc': 'angers',
    'grenoble': 'grenoble',
    'pôle sud': 'grenoble',
    'marseille': 'marseille',
    'pomge': 'marseille',
    'gap': 'gap',
    'nice': 'nice',
    'jean bouin': 'nice',
    'amiens': 'amiens',
    'coliseum': 'amiens',
    'bordeaux': 'bordeaux',
    'chamonix': 'chamonix',
    'cergy-pontoise': 'cergy-pontoise',
    'cergy': 'cergy-pontoise',
    'anglet': 'anglet',
    'briancon': 'briancon',
    'briançon': 'briancon'
  };

  const arenaLower = arena.toLowerCase();
  for (const [key, slug] of Object.entries(arenaMap)) {
    if (arenaLower.includes(key)) {
      return slug;
    }
  }

  return null;
}

// Process lineup and create combined JSONs
async function processLineup(lineupPath, outputDir = null) {
  try {
    console.log('=== Lineup Processor ===\n');
    console.log(`Reading lineup from: ${lineupPath}`);

    // Read lineup JSON
    const lineupData = JSON.parse(await fs.readFile(lineupPath, 'utf8'));

    // Validate lineup structure (adjust based on actual format)
    if (!lineupData.home_team || !lineupData.away_team) {
      throw new Error('Lineup JSON must contain home_team and away_team fields');
    }

    const homeTeam = lineupData.home_team;
    const awayTeam = lineupData.away_team;

    console.log(`\nHome Team: ${homeTeam.name || homeTeam.team_name}`);
    console.log(`Away Team: ${awayTeam.name || awayTeam.team_name}`);
    console.log(`Arena: ${lineupData.arena || 'Unknown'}`);

    // Determine output directory
    if (!outputDir) {
      outputDir = path.join(path.dirname(lineupPath), 'game_lineups');
    }
    await fs.mkdir(outputDir, { recursive: true });

    // Determine arena slug
    const arenaSlug = arenaToTeamSlug(lineupData.arena) || homeTeam.slug;
    console.log(`Arena slug: ${arenaSlug}`);

    // Process home team
    console.log('\n--- Processing Home Team ---');
    const homeResult = await processTeamLineup(homeTeam, 'home', lineupData);

    // Save as both generic and arena-specific files
    const homeOutputPath = path.join(outputDir, 'home_lineup.json');
    const arenaHomeOutputPath = path.join(outputDir, `home_${arenaSlug}.json`);

    await fs.writeFile(homeOutputPath, JSON.stringify(homeResult, null, 2));
    await fs.writeFile(arenaHomeOutputPath, JSON.stringify(homeResult, null, 2));

    console.log(`✓ Saved: ${homeOutputPath}`);
    console.log(`✓ Saved: ${arenaHomeOutputPath}`);
    console.log(`  Roster: ${homeResult.roster.count} players`);
    console.log(`  Jersey range: 1-${homeResult.roster.max_jersey_number}`);
    console.log(`  Matched: ${homeResult.stats.matched}/${homeResult.stats.total}`);

    // Process away team
    console.log('\n--- Processing Away Team ---');
    const awayResult = await processTeamLineup(awayTeam, 'away', lineupData);

    // Save as both generic and arena-specific files
    const awayOutputPath = path.join(outputDir, 'away_lineup.json');
    const arenaAwayOutputPath = path.join(outputDir, `away_${arenaSlug}.json`);

    await fs.writeFile(awayOutputPath, JSON.stringify(awayResult, null, 2));
    await fs.writeFile(arenaAwayOutputPath, JSON.stringify(awayResult, null, 2));

    console.log(`✓ Saved: ${awayOutputPath}`);
    console.log(`✓ Saved: ${arenaAwayOutputPath}`);
    console.log(`  Roster: ${awayResult.roster.count} players`);
    console.log(`  Jersey range: 1-${awayResult.roster.max_jersey_number}`);
    console.log(`  Matched: ${awayResult.stats.matched}/${awayResult.stats.total}`);

    console.log('\n=== Processing Complete ===');

    return {
      home: homeOutputPath,
      away: awayOutputPath,
      arena_home: arenaHomeOutputPath,
      arena_away: arenaAwayOutputPath,
      arena_slug: arenaSlug
    };

  } catch (err) {
    console.error('Error processing lineup:', err.message);
    throw err;
  }
}

// Process individual team lineup
async function processTeamLineup(teamLineupData, side, fullLineupData) {
  // Extract team info
  const teamName = teamLineupData.name || teamLineupData.team_name;
  const teamSlug = teamLineupData.slug || teamName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Load team statistics JSON
  const teamStatsPath = path.join(__dirname, '../output/teams', `team_${teamSlug}.json`);

  if (!fsSync.existsSync(teamStatsPath)) {
    console.log(`  ⚠ Warning: Team stats not found for "${teamSlug}" at ${teamStatsPath}`);
    console.log(`  Creating lineup without stats...`);
  }

  let teamStats = null;
  if (fsSync.existsSync(teamStatsPath)) {
    teamStats = JSON.parse(await fs.readFile(teamStatsPath, 'utf8'));
    console.log(`  ✓ Loaded team stats: ${teamStats.players.count} players, ${teamStats.goalies.count} goalies`);
  }

  // Process lineup players
  const lineupPlayers = teamLineupData.players || teamLineupData.lineup || [];
  const lineupGoalies = teamLineupData.goalies || [];

  console.log(`  Processing ${lineupPlayers.length} players and ${lineupGoalies.length} goalies from lineup...`);

  let matchedCount = 0;
  let totalCount = lineupPlayers.length + lineupGoalies.length;

  // Combine all players and goalies into one list
  const allLineupPlayers = [
    ...lineupPlayers.map(p => ({ ...p, type: 'player' })),
    ...lineupGoalies.map(g => ({ ...g, type: 'goalie' }))
  ];

  // Process each player/goalie
  const processedRoster = {};

  allLineupPlayers.forEach((lineupPlayer) => {
    const jerseyNum = parseInt(lineupPlayer.number || lineupPlayer.jersey_number) || 0;

    const playerData = {
      [`${side}_jersey_nr`]: jerseyNum,
      [`${side}_lineup_name`]: lineupPlayer.name || '',
      [`${side}_lineup_position`]: lineupPlayer.type === 'goalie' ? 'G' : (lineupPlayer.position || lineupPlayer.pos || '')
    };

    // Attach live in-game stats if available - keep live object with prefix AND add prefixed fields
    if (lineupPlayer.live && Object.keys(lineupPlayer.live).length > 0) {
      playerData[`${side}_live`] = lineupPlayer.live; // Keep live object with side prefix
      const prefixedLive = prefixObjectKeys(lineupPlayer.live, side);
      Object.assign(playerData, prefixedLive); // Also add prefixed versions
    }

    // Try to match with stats
    if (teamStats) {
      const matchedStats = findPlayerInStats(lineupPlayer.name, teamStats);
      if (matchedStats) {
        matchedCount++;

        // Extract and prefix ALL stat fields including name and nom
        const statFields = { ...matchedStats };
        delete statFields.type; // Don't include internal type field

        const prefixedStats = prefixObjectKeys(statFields, side);

        // Preserve the live object AND prefixed live fields - don't let prefixedStats overwrite them
        const liveField = `${side}_live`;
        const liveData = playerData[liveField];

        // Extract all prefixed live stat fields from playerData (e.g., away_b, away_a, away_pts, etc.)
        const prefixedLiveFields = {};
        if (liveData && Object.keys(liveData).length > 0) {
          for (const liveKey of Object.keys(liveData)) {
            const prefixedKey = `${side}_${liveKey}`;
            if (playerData[prefixedKey] !== undefined) {
              prefixedLiveFields[prefixedKey] = playerData[prefixedKey];
            }
          }
        }

        processedRoster[jerseyNum] = {
          ...playerData,
          ...prefixedStats,
          ...prefixedLiveFields,  // Apply prefixed live fields AFTER stats to override them
          [`${side}_matched`]: true
        };

        // Re-add live object if it exists to ensure it's not overwritten
        if (liveData) {
          processedRoster[jerseyNum][liveField] = liveData;
        }
      } else {
        processedRoster[jerseyNum] = { ...playerData, [`${side}_matched`]: false };
      }
    } else {
      processedRoster[jerseyNum] = { ...playerData, [`${side}_matched`]: false };
    }
  });

  // Find the highest jersey number
  const maxJerseyNumber = Math.max(...Object.keys(processedRoster).map(n => parseInt(n)), 99);

  // Create array with empty slots for all jersey numbers (1-99 or up to max)
  const rosterArray = [];
  for (let i = 1; i <= maxJerseyNumber; i++) {
    if (processedRoster[i]) {
      rosterArray.push(processedRoster[i]);
    } else {
      // Empty slot with prefixed fields
      rosterArray.push({
        [`${side}_jersey_nr`]: i,
        [`${side}_lineup_name`]: '',
        [`${side}_lineup_position`]: '',
        [`${side}_matched`]: false,
        [`${side}_empty`]: true
      });
    }
  }

  // Create final JSON structure
  const result = {
    game_info: {
      game_id: fullLineupData.game_id || null,
      date: fullLineupData.date || null,
      arena: fullLineupData.arena || null,
      home_team: fullLineupData.home_team?.name || fullLineupData.home_team?.team_name,
      away_team: fullLineupData.away_team?.name || fullLineupData.away_team?.team_name,
      side: side
    },
    team: {
      name: teamName,
      slug: teamSlug,
      logo: teamStats ? teamStats.team_logo : null
    },
    timestamp: new Date().toISOString(),
    roster: {
      count: totalCount,
      max_jersey_number: maxJerseyNumber,
      data: rosterArray
    },
    stats: {
      total: totalCount,
      matched: matchedCount,
      unmatched: totalCount - matchedCount,
      match_rate: totalCount > 0 ? ((matchedCount / totalCount) * 100).toFixed(1) + '%' : '0%'
    }
  };

  return result;
}

// CLI Usage
async function main() {
  const lineupPath = process.argv[2];
  const outputDir = process.argv[3];

  if (!lineupPath) {
    console.log('Usage: node lineup-processor.js <lineup.json> [output_dir]');
    console.log('\nExample:');
    console.log('  node lineup-processor.js ../output/game_lineup.json');
    console.log('  node lineup-processor.js ../output/game_lineup.json ../output/game_lineups');
    console.log('\nExpected lineup JSON format:');
    console.log(JSON.stringify({
      game_id: 12345,
      date: "2026-01-26",
      arena: "Angers - IceParc",
      home_team: {
        name: "Angers",
        slug: "angers",
        players: [
          { name: "HALLEY Philippe", number: 10, position: "A" },
          { name: "CHARBONNEAU Jonathan", number: 71, position: "A" }
        ],
        goalies: [
          { name: "BELLEMARE William", number: 30 }
        ]
      },
      away_team: {
        name: "Rouen",
        slug: "rouen",
        players: [
          { name: "CHAKIACHVILI Tommy", number: 20, position: "A" }
        ],
        goalies: [
          { name: "PINTARIC Matija", number: 33 }
        ]
      }
    }, null, 2));
    process.exit(1);
  }

  await processLineup(lineupPath, outputDir);
}

// Export for use as module
module.exports = {
  processLineup,
  processTeamLineup,
  findPlayerInStats,
  normalizePlayerName
};

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
