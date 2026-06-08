const http = require('http');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Load configuration
let config;
try {
  const configFile = fsSync.readFileSync(path.join(__dirname, '../config/config.json'), 'utf8');
  config = JSON.parse(configFile);
} catch (err) {
  console.error('Failed to load config.json, using defaults');
  config = {
    server: { port: 3000, host: '0.0.0.0', hostname: 'data.borka.live' },
    output: { directory: '../output' }
  };
}

const PORT = config.server.port;
const OUTPUT_DIR = path.join(__dirname, config.output.directory);
const startTime = new Date();

// Ensure output directory exists
try {
  if (!fsSync.existsSync(OUTPUT_DIR)) {
    fsSync.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  }
} catch (err) {
  console.error(`Failed to create output directory: ${err.message}`);
}

// Get local IP addresses
function getLocalIpAddresses() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal (localhost) and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }

  return results;
}

async function handleRequest(req, res) {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.url}`);

  // Handle CORS preflight requests (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // Handle POST requests for pling.json
  if (req.method === 'POST' && req.url === '/pling.json') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const filePath = path.join(OUTPUT_DIR, 'pling.json');
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: true, message: 'pling.json updated' }));
        console.log(`  ✓ Updated pling.json via POST`);
      } catch (err) {
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: false, error: err.message }));
        console.log(`  ✗ Failed to update pling.json: ${err.message}`);
      }
    });
    return;
  }

  // Health check endpoint
  if (req.url === '/health') {
    try {
      const files = await fs.readdir(OUTPUT_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const fileStats = await Promise.all(
        jsonFiles.map(async (file) => {
          const filePath = path.join(OUTPUT_DIR, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            size: stats.size,
            lastModified: stats.mtime,
            age: Math.floor((Date.now() - stats.mtime.getTime()) / 1000)
          };
        })
      );

      const health = {
        status: 'ok',
        uptime: Math.floor((Date.now() - startTime.getTime()) / 1000),
        timestamp: new Date().toISOString(),
        files: fileStats,
        filesCount: jsonFiles.length
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(health, null, 2));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: err.message }));
    }
    return;
  }

  // Handle root path - show available files
  if (req.url === '/' || req.url === '') {
    try {
      const files = await fs.readdir(OUTPUT_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      const ips = getLocalIpAddresses();
      const displayIp = config.server.hostname || ips[0] || 'data.borka.live';

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Ligue Magnus Stats - JSON API</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    h1 { color: #333; }
    ul { list-style: none; padding: 0; }
    li { margin: 10px 0; padding: 10px; background: #f4f4f4; border-radius: 5px; }
    a { color: #0066cc; text-decoration: none; font-weight: bold; }
    a:hover { text-decoration: underline; }
    .info { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; }
    code { background: #333; color: #fff; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Ligue Magnus Stats - JSON API</h1>
  <div class="info">
    <strong>JSON Data URLs:</strong><br>
    Use these URLs to access the stats data
  </div>
  <ul>
    ${jsonFiles.map(file => `
      <li>
        <a href="/${file}" target="_blank">${file}</a><br>
        <small>URL: <code>http://${displayIp}:${PORT}/${file}</code></small>
      </li>
    `).join('')}
  </ul>
  <p><small>Last updated: ${new Date().toLocaleString()}</small></p>
</body>
</html>
      `);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error reading output directory. Run scraper first: node scraper-to-json.js');
    }
    return;
  }

  // Handle JSON file requests
  const filePath = path.join(OUTPUT_DIR, req.url.slice(1));

  try {
    const data = await fs.readFile(filePath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Allow cross-origin requests
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found. Available files at http://data.borka.live:' + PORT);
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server error: ' + err.message);
    }
  }
}

// Generate vMix URLs text file
function generateVmixUrlsFile(ip, port) {
  const timestamp = new Date().toLocaleString();
  const content = `Ligue Magnus Stats - vMix Data Source URLs
Generated: ${timestamp}
Network IP: ${ip}
Port: ${port}

========================================
GAME DATA
========================================

Today's Games (Updates every 1 min during games):
http://${ip}:${port}/Todays_games.json

Upcoming Games (Next 6 games):
http://${ip}:${port}/Upcoming_games.json

All Games (Full season):
http://${ip}:${port}/games.json


========================================
PLAYER STATS
========================================

Points Leaders (Top 30):
http://${ip}:${port}/stats-points.json

Goals Leaders (Top 30):
http://${ip}:${port}/stats-goals.json

Assists Leaders (Top 30):
http://${ip}:${port}/stats-assists.json


========================================
GOALIE STATS
========================================

Goalies 70%+ Save Percentage:
http://${ip}:${port}/GK70plus.json

Goalies <70% Save Percentage:
http://${ip}:${port}/GK70minus.json


========================================
TEAM STATS
========================================

Standings:
http://${ip}:${port}/standings.json

Powerplay:
http://${ip}:${port}/Powerplay.json

Penalty Kill (Underlage):
http://${ip}:${port}/Underlage.json

Current Streaks:
http://${ip}:${port}/Current-streaks.json

Season Streaks:
http://${ip}:${port}/Season-streaks.json

Shots:
http://${ip}:${port}/Shots.json

Shootouts:
http://${ip}:${port}/Shootouts.json

Attendance:
http://${ip}:${port}/Attendance.json


========================================
NOTES
========================================

- All URLs update automatically (see intervals below)
- Today's Games: Every 1 minute when games are active, every 1 hour when waiting
- All Other Stats: Every 60 minutes
- Use these URLs in vMix Settings > Data Sources > Web Request
- Recommended vMix refresh: 30-60 seconds
- This file auto-updates when server restarts with new IP
`;

  try {
    fsSync.writeFileSync(path.join(__dirname, 'vmix-urls.txt'), content);
    console.log('\n✓ Generated: vmix-urls.txt');
  } catch (err) {
    console.error('Failed to generate vmix-urls.txt:', err.message);
  }
}

const server = http.createServer(handleRequest);

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  const displayHost = config.server.hostname || ips[0] || 'data.borka.live';

  console.log('\n=== HTTP Server Started ===');
  console.log(`\nLocal access:`);
  console.log(`  http://data.borka.live:${PORT}`);

  console.log(`\nNetwork access:`);
  console.log(`\nPlayer Stats:`);
  console.log(`  http://${displayHost}:${PORT}/stats-points.json`);
  console.log(`  http://${displayHost}:${PORT}/stats-goals.json`);
  console.log(`  http://${displayHost}:${PORT}/stats-assists.json`);
  console.log(`\nGoalie Stats:`);
  console.log(`  http://${displayHost}:${PORT}/GK70plus.json`);
  console.log(`  http://${displayHost}:${PORT}/GK70minus.json`);
  console.log(`\nTeam Stats:`);
  console.log(`  http://${displayHost}:${PORT}/standings.json`);
  console.log(`  http://${displayHost}:${PORT}/Powerplay.json`);
  console.log(`  http://${displayHost}:${PORT}/Underlage.json`);
  console.log(`  http://${displayHost}:${PORT}/Current-streaks.json`);
  console.log(`  http://${displayHost}:${PORT}/Season-streaks.json`);
  console.log(`  http://${displayHost}:${PORT}/Shots.json`);
  console.log(`  http://${displayHost}:${PORT}/Shootouts.json`);
  console.log(`  http://${displayHost}:${PORT}/Attendance.json`);
  console.log(`\nGames/Schedule:`);
  console.log(`  http://${displayHost}:${PORT}/games.json`);

  // Generate vMix URLs file
  generateVmixUrlsFile(displayHost, PORT);

  console.log(`\nPress Ctrl+C to stop server\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down server...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});
