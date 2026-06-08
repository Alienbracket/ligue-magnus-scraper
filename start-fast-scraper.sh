#!/bin/bash
# Script to intelligently start fast-scraper if needed
# Usage: ./start-fast-scraper.sh [--force|-f] [--help|-h]
#
# Options:
#   --force, -f    Force start/restart with interactive confirmation
#   --help, -h     Show this help message
#
# Examples:
#   ./start-fast-scraper.sh           # Auto-start if conditions are met
#   ./start-fast-scraper.sh --force   # Manual start/restart with y/n prompt

# Show help
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [--force|-f] [--help|-h]"
    echo ""
    echo "Intelligently starts fast-scraper based on game schedule."
    echo ""
    echo "Options:"
    echo "  --force, -f    Force start/restart with interactive y/n confirmation"
    echo "  --help, -h     Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0              # Auto-start if within 2h of games"
    echo "  $0 --force      # Manual start/restart with confirmation prompt"
    exit 0
fi

cd /home/ubuntu/ligue-magnus-scraper

# Check for force flag
FORCE_START=false
if [ "$1" = "--force" ] || [ "$1" = "-f" ]; then
    FORCE_START=true
fi

# Check if fast-scraper is already running
if pm2 list | grep -q "fast-scraper.*online"; then
    if [ "$FORCE_START" = true ]; then
        # Force mode: ask for confirmation (works from watcher too!)
        echo "Scrapers are currently running."
        echo -n "Do you want to restart ALL scrapers (fast-scraper, http-server, pling-watcher)? (y/n): "
        read -r response
        if [ "$response" != "y" ] && [ "$response" != "Y" ]; then
            echo "Cancelled. Scrapers not restarted."
            exit 0
        fi
        echo ""
        echo "Restarting all scrapers..."
        echo ""

        # Function to restart and verify a process
        restart_and_verify() {
            local process_name=$1
            local step=$2

            echo "  [$step/3] Restarting $process_name..."

            # Check if process exists in PM2
            if ! pm2 list | grep -q "$process_name"; then
                echo "        ⊗ $process_name not found in PM2, skipping..."
                return 0
            fi

            # Restart the process
            if pm2 restart $process_name >/dev/null 2>&1; then
                # Wait a moment for it to start
                sleep 2

                # Verify it's online
                if pm2 list | grep -q "$process_name.*online"; then
                    echo "        ✓ $process_name is online"
                    return 0
                else
                    echo "        ✗ WARNING: $process_name restarted but status is not online!"
                    return 1
                fi
            else
                echo "        ✗ ERROR: Failed to restart $process_name"
                return 1
            fi
        }

        # Track if any restarts failed
        RESTART_FAILURES=0

        # Restart all scrapers in sequence
        restart_and_verify "fast-scraper" "1" || ((RESTART_FAILURES++))
        restart_and_verify "http-server" "2" || ((RESTART_FAILURES++))
        restart_and_verify "pling-watcher" "3" || ((RESTART_FAILURES++))

        echo ""

        if [ $RESTART_FAILURES -eq 0 ]; then
            echo "✓ All scrapers restarted successfully!"
        else
            echo "⚠ Some scrapers had issues ($RESTART_FAILURES failed)"
            echo "   Run 'pm2 logs <name>' to check for errors"
        fi

        echo ""

        # Show status
        pm2 list
        exit 0
    else
        echo "Fast-scraper is already running"
        echo "Tip: Use --force or -f flag to restart it manually"
        exit 0
    fi
fi

# Check if there are games today by running a quick check
if [ -f "output/Todays_games.json" ]; then
    # Use node to check if we should start
    SHOULD_START=$(node -e "
        try {
            const fs = require('fs');
            const data = JSON.parse(fs.readFileSync('output/Todays_games.json', 'utf8'));

            // No games today
            if (!data.data || data.data.length === 0) {
                console.log('false');
                process.exit(0);
            }

            // Check if all games are finished
            const allFinished = data.data.every(g => g.etat === 'T');
            if (allFinished) {
                console.log('false');
                process.exit(0);
            }

            // Check if games are more than 2 hours away
            const firstGame = data.data[0];
            if (firstGame.date_numeric && firstGame.time) {
                const dateTimeStr = \`\${firstGame.date_numeric} \${firstGame.time}\`;
                const gameDateTime = new Date(new Date(dateTimeStr).toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
                const now = new Date();
                const parisNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
                const hoursUntilGame = (gameDateTime - parisNow) / (1000 * 60 * 60);

                if (hoursUntilGame > 2) {
                    console.log('false');
                    process.exit(0);
                }
            }

            // Should start
            console.log('true');
        } catch (e) {
            console.log('false');
        }
    ")

    if [ "$SHOULD_START" = "true" ]; then
        echo "Starting fast-scraper..."
        pm2 start src/fast-scraper.js --name fast-scraper
    else
        # Check if force start requested
        if [ "$FORCE_START" = true ]; then
            # Force mode: ask if they want to start anyway
            echo "Not time to start fast-scraper yet (no games, finished, or too early)"
            echo -n "Do you want to start it anyway? (y/n): "
            read -r response
            if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
                echo "Starting fast-scraper (manual override)..."
                pm2 start src/fast-scraper.js --name fast-scraper
                echo "Fast-scraper started."
            else
                echo "Cancelled."
            fi
        else
            echo "Not time to start fast-scraper yet (no games, finished, or too early)"
            echo "Tip: Use --force or -f flag to start it manually"
        fi
    fi
else
    if [ "$FORCE_START" = true ]; then
        echo "No Todays_games.json file found"
        echo -n "Do you want to start fast-scraper anyway? (y/n): "
        read -r response
        if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
            echo "Starting fast-scraper (manual override)..."
            pm2 start src/fast-scraper.js --name fast-scraper
            echo "Fast-scraper started."
        else
            echo "Cancelled."
        fi
    else
        echo "No Todays_games.json file found, skipping"
    fi
fi
