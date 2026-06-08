const fs = require('fs');
const path = require('path');

// Read game periods
const periodsPath = path.join(__dirname, '../output/game_periods.json');
const periodsData = JSON.parse(fs.readFileSync(periodsPath, 'utf8'));
const gamePeriods = periodsData.periods || {};

console.log('Game Periods loaded:');
console.log(JSON.stringify(gamePeriods, null, 2));

// Read today's games
const gamesPath = path.join(__dirname, '../output/Todays_games.json');
const gamesData = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));

console.log('\nMerging periods...');

// Merge periods into games
for (const game of gamesData.data) {
  const oldPeriod = game.period;
  if (game.en_cours) {
    game.period = gamePeriods[game.id] || "En cours";
  }
  console.log(`Game ${game.id}: ${oldPeriod} -> ${game.period}`);
}

// Save updated games
fs.writeFileSync(gamesPath, JSON.stringify(gamesData, null, 2));

console.log(`\n✓ Updated Todays_games.json`);
console.log('\nSample game periods:');
for (const game of gamesData.data.slice(0, 3)) {
  console.log(`  ${game.match}: ${game.period}`);
}
