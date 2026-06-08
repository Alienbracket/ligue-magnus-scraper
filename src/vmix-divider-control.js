const http = require('http');
const fs = require('fs').promises;
const path = require('path');

// vMix configuration
const VMIX_HOST = 'localhost'; // CHANGE THIS to your vMix machine IP (e.g., '192.168.1.100')
const VMIX_PORT = 8088;

// Divider configuration
const DIVIDER_COUNT = 6;
const DIVIDER_PREFIX = 'divider_match';
const DIVIDER_SUFFIX = '.fill.color';

// Colors
const COLOR_ON = '#FFFFFF';   // White - divider visible
const COLOR_OFF = '#00000000'; // Transparent - divider hidden

/**
 * Send a command to vMix via HTTP API
 */
function sendVmixCommand(functionName, params = {}) {
  return new Promise((resolve, reject) => {
    // Build query string
    const queryParams = new URLSearchParams({
      Function: functionName,
      ...params
    });

    const options = {
      hostname: VMIX_HOST,
      port: VMIX_PORT,
      path: `/api/?${queryParams.toString()}`,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Set a color value in vMix
 */
async function setDividerColor(dividerNumber, color) {
  const dividerName = `${DIVIDER_PREFIX}${dividerNumber}${DIVIDER_SUFFIX}`;

  try {
    await sendVmixCommand('SetColor', {
      Input: 'todaysGames',
      SelectedName: dividerName,
      Value: color
    });
    console.log(`✓ Divider ${dividerNumber}: ${color === COLOR_ON ? 'ON' : 'OFF'}`);
  } catch (err) {
    console.error(`✗ Failed to set divider ${dividerNumber}:`, err.message);
  }
}

/**
 * Update all dividers based on game count
 */
async function updateDividers(gameCount) {
  console.log(`\n=== Updating vMix Dividers ===`);
  console.log(`Game count: ${gameCount}`);
  console.log(`Dividers needed: ${Math.max(0, gameCount - 1)}\n`);

  // Number of dividers to turn on = game count - 1
  // (divider goes BETWEEN games, so 2 games = 1 divider, 3 games = 2 dividers, etc.)
  const dividersToEnable = Math.max(0, gameCount - 1);

  // Update each divider
  for (let i = 1; i <= DIVIDER_COUNT; i++) {
    const shouldBeOn = i <= dividersToEnable;
    const color = shouldBeOn ? COLOR_ON : COLOR_OFF;
    await setDividerColor(i, color);
  }

  console.log('\n=== Dividers Updated ===\n');
}

/**
 * Main function
 */
async function main() {
  try {
    // Read the Todays_games.json file
    const jsonPath = path.join(__dirname, '../output/Todays_games.json');
    const jsonData = await fs.readFile(jsonPath, 'utf8');
    const data = JSON.parse(jsonData);

    // Get game count
    const gameCount = data.count || 0;

    // Update dividers
    await updateDividers(gameCount);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { updateDividers, sendVmixCommand };
