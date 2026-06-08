const fs = require('fs');
const path = require('path');

console.log('[PAD] Padding playoff stats to 12 slots...');

const outputDir = path.join(__dirname, '../output');
const MAX_SLOTS = 12;

// Helper function to pad a stats file to 12 slots
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

    // Add empty slots
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
    console.log(`[PAD] ${filename}: Padded from ${currentCount} to ${MAX_SLOTS} slots`);

  } catch (err) {
    console.error(`[PAD] Error processing ${filename}:`, err.message);
  }
}

// Pad Powerplay.json
padStatsFile('Powerplay.json', {
  equipe: "",
  logo: "",
  field_: "",
  mj: "",
  bpsup: "",
  nbre: "",
  bcsup: ""
});

// Pad Underlage.json
padStatsFile('Underlage.json', {
  equipe: "",
  logo: "",
  field_: "",
  mj: "",
  bcinf: "",
  nbre: "",
  bpinf: ""
});

// Pad Attendance.json
padStatsFile('Attendance.json', {
  equipe: "",
  logo: "",
  field_: "",
  total: "",
  matchs: "",
  moyenne: ""
});

console.log('[PAD] ✓ Padding complete');
