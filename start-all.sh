#!/bin/bash

echo "╔════════════════════════════════════════╗"
echo "║   Ligue Magnus Stats Auto-Scraper    ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Starting all services with PM2..."
echo ""

# Change to script directory
cd "$(dirname "$0")"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "ERROR: PM2 is not installed"
    echo "Install with: npm install -g pm2"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "node_modules not found. Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install dependencies"
        exit 1
    fi
    echo ""
fi

# Stop any existing processes
echo "Stopping existing processes..."
pm2 delete all 2>/dev/null || true
echo ""

# Start all services
echo "Starting auto-scraper..."
pm2 start src/auto-scraper.js --name "auto-scraper"

echo "Starting fast-scraper..."
pm2 start src/fast-scraper.js --name "fast-scraper"

echo "Starting pling-watcher..."
pm2 start src/pling-watcher.js --name "pling-watcher"

echo "Starting HTTP server..."
pm2 start src/http-server.js --name "http-server"

echo ""
echo "All services started!"
echo ""

# Save PM2 configuration
pm2 save

# Show status
pm2 list

echo ""
echo "Useful commands:"
echo "  pm2 list          - Show all running processes"
echo "  pm2 logs          - Show logs for all processes"
echo "  pm2 logs [name]   - Show logs for specific process"
echo "  pm2 restart all   - Restart all processes"
echo "  pm2 stop all      - Stop all processes"
echo "  pm2 delete all    - Delete all processes"
