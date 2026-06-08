#!/bin/bash
# Lineup Auto-Processor Wrapper
# Runs the lineup processor and handles logging

LOG_DIR="/home/ubuntu/ligue-magnus-scraper/logs"
mkdir -p "$LOG_DIR"

cd /home/ubuntu/ligue-magnus-scraper

echo "=== Lineup Processor Started: $(date) ===" >> "$LOG_DIR/lineup-processor.log"
/usr/bin/node src/lineup-auto.js >> "$LOG_DIR/lineup-processor.log" 2>&1
echo "=== Lineup Processor Finished: $(date) ===" >> "$LOG_DIR/lineup-processor.log"
echo "" >> "$LOG_DIR/lineup-processor.log"
