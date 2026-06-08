const fs = require('fs');
const path = require('path');

// All teams
const ALL_TEAMS = [
  'ROUEN', 'ANGERS', 'GRENOBLE', 'BORDEAUX', 'MARSEILLE', 'NICE',
  'AMIENS', 'BRIANÇON', 'CHAMONIX', 'ANGLET', 'GAP', 'CERGY-PONTOISE'
];

const outputDir = path.join(__dirname, 'output');
const plingPath = path.join(outputDir, 'pling.json');

// Read main pling.json
const plingData = JSON.parse(fs.readFileSync(plingPath, 'utf8'));
const homeTeam = plingData.data[0].pling_Hometeam;
const awayTeam = plingData.data[0].pling_Awayteam;

console.log(`Updating team pling files from: ${homeTeam} vs ${awayTeam}`);

// Write a file for each team
ALL_TEAMS.forEach(team => {
  const teamSlug = team.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacritical marks
    .replace(/[^a-z0-9]/g, '-');
  const teamPlingPath = path.join(outputDir, `pling_${teamSlug}.json`);

  if (team !== homeTeam && team !== awayTeam) {
    // Team is not playing - show the game
    fs.writeFileSync(teamPlingPath, JSON.stringify(plingData, null, 2));
    console.log(`✓ Updated: pling_${teamSlug}.json (showing game)`);
  } else {
    // Team is playing - show empty data
    const emptyPlingData = {
      ...plingData,
      count: 0,
      data: []
    };
    fs.writeFileSync(teamPlingPath, JSON.stringify(emptyPlingData, null, 2));
    console.log(`✓ Updated: pling_${teamSlug}.json (empty - team is playing)`);
  }
});

console.log('\nDone!');
