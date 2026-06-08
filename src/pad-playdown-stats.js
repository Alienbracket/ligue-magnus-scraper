const fs = require('fs');
const path = require('path');

console.log('[PAD] Padding playdown stats to 12 slots...');

const outputDir = path.join(__dirname, '../output');
const MAX_SLOTS = 12;

// Helper function to pad a stats file to 4 slots
function padStatsFile(filename, emptyTemplate) {
  const filePath = path.join(outputDir, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`[PAD] ${filename} not found, skipping`);
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const currentCount = data.data.length;

    if (currentCount >= MAX_SLOTS) {
      console.log(`[PAD] ${filename}: Already has ${currentCount} slots (>= ${MAX_SLOTS}), skipping`);
      return;
    }

    // Add empty slots up to MAX_SLOTS
    while (data.data.length < MAX_SLOTS) {
      const emptyEntry = {
        rank: data.data.length + 1,
        ...emptyTemplate
      };
      data.data.push(emptyEntry);
    }

    // Update count to reflect only real entries (not padded)
    data.count = currentCount;

    // Save back to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[PAD] ${filename}: Padded from ${currentCount} to ${MAX_SLOTS} slots (${currentCount} real teams, ${MAX_SLOTS - currentCount} empty)`);

  } catch (err) {
    console.error(`[PAD] Error processing ${filename}:`, err.message);
  }
}

// Pad Playdown_powerplay.json
padStatsFile('Playdown_powerplay.json', {
  equipe: "",
  logo: "",
  field_: "",
  mj: "",
  bpsup: "",
  nbre: "",
  bcsup: ""
});

// Pad Playdown_underlage.json
padStatsFile('Playdown_underlage.json', {
  equipe: "",
  logo: "",
  field_: "",
  mj: "",
  bcinf: "",
  nbre: "",
  bpinf: ""
});

// Pad Playdown_attendance.json
padStatsFile('Playdown_attendance.json', {
  equipe: "",
  logo: "",
  field_: "",
  total: "",
  matchs: "",
  moyenne: ""
});

// Pad Playdown_shots.json
padStatsFile('Playdown_shots.json', {
  equipe: "",
  logo: "",
  field_: "",
  tirs_equipe: "",
  tirs_adversaire: "",
  diff: ""
});

// Pad Playdown_shootouts.json
padStatsFile('Playdown_shootouts.json', {
  equipe: "",
  logo: "",
  field_: "",
  v: "",
  d: "",
  total: ""
});

console.log('[PAD] ✓ Playdown padding complete');
