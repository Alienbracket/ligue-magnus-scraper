#!/bin/bash
# Ligue Magnus Scraper Status Dashboard

# Only clear screen if not in live mode (check for parameter)
if [ "$1" != "--no-clear" ]; then
  clear
fi

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}LIGUE MAGNUS SCRAPER - STATUS DASHBOARD${NC}                    ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Server info
echo -e "${BOLD}📡 Server Information${NC}"
echo -e "   Host: ${GREEN}data.borka.live${NC}"
echo -e "   Time: ${YELLOW}$(date '+%Y-%m-%d %H:%M:%S %Z')${NC}"
echo ""

# Statistics Update Times - REMOVED FOR CLEANER DISPLAY
# echo -e "${BOLD}📈 Statistikuppdateringar${NC}"
# ... (code commented out)
# echo ""

# PM2 Process Status
echo -e "${BOLD}⚙️  Scraper Processes${NC}"
echo ""
pm2 jlist | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
data.forEach(proc => {
  const name = proc.name.padEnd(20);
  const status = proc.pm2_env.status;
  const uptime = proc.pm2_env.pm_uptime;
  const restarts = proc.pm2_env.restart_time;
  const cpu = proc.monit.cpu + '%';
  const mem = Math.round(proc.monit.memory / 1024 / 1024) + 'MB';

  const statusColor = status === 'online' ? '\x1b[32m' : '\x1b[31m';
  const restartColor = restarts > 100 ? '\x1b[31m' : restarts > 10 ? '\x1b[33m' : '\x1b[32m';

  // Calculate uptime
  const uptimeMs = Date.now() - uptime;
  const days = Math.floor(uptimeMs / 86400000);
  const hours = Math.floor((uptimeMs % 86400000) / 3600000);
  const mins = Math.floor((uptimeMs % 3600000) / 60000);
  let uptimeStr = '';
  if (days > 0) uptimeStr = days + 'd ' + hours + 'h';
  else if (hours > 0) uptimeStr = hours + 'h ' + mins + 'm';
  else uptimeStr = mins + 'm';

  console.log('   ' + name + statusColor + status.padEnd(10) + '\x1b[0m' +
              ' Uptime: ' + uptimeStr.padEnd(10) +
              ' Restarts: ' + restartColor + restarts + '\x1b[0m' +
              '  CPU: ' + cpu.padEnd(6) + ' Mem: ' + mem);
});
" 2>/dev/null || echo "   Unable to read PM2 status"

# Check fast-scraper mode (online = fast mode, offline = slow mode or not running)
FAST_MODE="offline"
FAST_MODE_TEXT=""

# First check if process is running
if pm2 list | grep -q "fast-scraper.*online" 2>/dev/null; then
  # Check recent logs to determine mode (fast = 1 min, slow = 1 hour)
  RECENT_LOG=$(pm2 logs fast-scraper --lines 30 --nostream 2>/dev/null | grep -E "(Initial mode|Switching)" | tail -1)

  if echo "$RECENT_LOG" | grep -q "1 min"; then
    FAST_MODE="online"
    FAST_MODE_TEXT="fast mode"
  elif echo "$RECENT_LOG" | grep -q "1 hour"; then
    FAST_MODE="offline"
    FAST_MODE_TEXT="slow mode"
  else
    # Fallback: check if any game is in progress
    if [ -f "/home/ubuntu/ligue-magnus-scraper/output/Todays_games.json" ]; then
      IN_PROGRESS=$(node -e "
        try {
          const data = require('fs').readFileSync('/home/ubuntu/ligue-magnus-scraper/output/Todays_games.json', 'utf8');
          const games = JSON.parse(data);
          const hasLive = games.data && games.data.some(g => g.en_cours === true);
          console.log(hasLive ? 'true' : 'false');
        } catch(e) { console.log('false'); }
      " 2>/dev/null)

      if [ "$IN_PROGRESS" = "true" ]; then
        FAST_MODE="online"
        FAST_MODE_TEXT="fast mode"
      else
        FAST_MODE="offline"
        FAST_MODE_TEXT="slow mode"
      fi
    fi
  fi
fi

# Display status
if [ "$FAST_MODE" = "online" ]; then
  echo -e "   fast-scraper        \033[32monline    \033[0m                         \033[2m(cron)\033[0m"
else
  echo -e "   fast-scraper        \033[33moffline   \033[0m                         \033[2m(cron)\033[0m"
fi

echo ""

# Today's Games Status
echo -e "${BOLD}🏒 Today's Games${NC}"
if [ -f "/home/ubuntu/ligue-magnus-scraper/output/Todays_games.json" ]; then
  node -e "
  try {
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('/home/ubuntu/ligue-magnus-scraper/output/Todays_games.json', 'utf8'));

    console.log('   Total games: \x1b[36m' + (data.count || 0) + '\x1b[0m');
    console.log('   Last updated: \x1b[33m' + new Date(data.timestamp).toLocaleString() + '\x1b[0m');
    console.log('');

    if (data.data && data.data.length > 0) {
      const now = new Date();
      const parisNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));

      const upcoming = data.data.filter(g => g.etat !== 'T' && !g.en_cours);
      const inProgress = data.data.filter(g => g.en_cours);
      const finished = data.data.filter(g => g.etat === 'T');

      if (inProgress.length > 0) {
        console.log('   \x1b[1;32m⚡ LIVE NOW (' + inProgress.length + ' games):\x1b[0m');
        inProgress.forEach(g => {
          console.log('      ' + g.match + ' - \x1b[32m' + g.vs_match + '\x1b[0m ' + g.period);
        });
        console.log('');
      }

      if (finished.length > 0) {
        console.log('   \x1b[1;34m✓ Finished (' + finished.length + ' games)\x1b[0m');
        console.log('');
      }

      if (inProgress.length === 0 && finished.length === 0 && upcoming.length > 0) {
        console.log('   \x1b[33mGames scheduled for today, waiting for start...\x1b[0m');
      }
    } else {
      console.log('   \x1b[33mNo games scheduled for today\x1b[0m');
    }
  } catch (e) {
    console.log('   \x1b[31mError reading game data: ' + e.message + '\x1b[0m');
  }
  "
else
  echo -e "   ${RED}No game data file found${NC}"
fi

echo ""

# Recent scraper activity - REMOVED FOR CLEANER DISPLAY
# echo -e "${BOLD}📊 Recent Activity${NC}"
# ... (code commented out)
# echo ""

# Latest Pling Scores
echo -e "${BOLD}🚨 Latest Pling Scores${NC}"
if [ -f "/home/ubuntu/.pm2/logs/pling-watcher-out.log" ]; then
  # Get the last 3 successfully displayed goals from the log
  grep "\[✓\] Goal #" /home/ubuntu/.pm2/logs/pling-watcher-out.log | tail -3 | while read -r line; do
    # Extract time, goal number, and score info
    TIME=$(echo "$line" | awk '{print $1, $2}')
    GOAL_INFO=$(echo "$line" | sed 's/.*displayed: //')

    echo -e "   ${GREEN}${TIME}${NC} - ${YELLOW}${GOAL_INFO}${NC}"
  done

  # If no goals found, show message
  if [ $(grep -c "\[✓\] Goal #" /home/ubuntu/.pm2/logs/pling-watcher-out.log 2>/dev/null || echo 0) -eq 0 ]; then
    echo -e "   ${YELLOW}No goals recorded yet${NC}"
  fi
else
  echo -e "   ${RED}Pling watcher log not found${NC}"
fi

echo ""

# Quick commands help - REMOVED FOR CLEANER DISPLAY
# echo -e "${BOLD}💡 Quick Commands${NC}"
# ... (code commented out)

echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
