# Ligue Magnus Stats Scraper for vMix

A comprehensive web scraper for Ligue Magnus (French Ice Hockey League) statistics, optimized for vMix graphics integration.

## Features

- **Automated Data Collection**: Scrapes player stats, team standings, game schedules, and live scores
- **Smart Scraping Modes**:
  - Slow mode (1 hour interval) when waiting for games
  - Fast mode (1 minute interval) during active games
  - Auto-shutdown after games finish
- **vMix Integration**: All data formatted with numbered fields (team01, team02, etc.) for easy vMix data source mapping
- **Score Protection**: Prevents overwriting finished game scores with null values
- **HTTP Server**: Serves JSON data via HTTP for real-time vMix access
- **Team Logos**: Automatic team logo path generation
- **Player Name Formatting**: Converts names to broadcast-ready format (FirstInitial.LASTNAME)

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm

### Setup

1. Clone the repository
2. Install dependencies: `npm install`

## Usage

**Windows:** Run `start.bat`
**Linux/Mac:** Run `node src/auto-scraper.js`

## vMix Integration

All JSON files are served via HTTP at `http://<your-ip>:3000/<filename>`

See `vmix-urls.txt` for complete URL list (auto-generated on server start).

## License

MIT
