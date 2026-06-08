# Update Frequency Monitoring Guide

## Purpose

The `update-frequency-monitor.js` script monitors a live game page to detect **when** and **how often** the liguemagnus.com website actually updates its statistics during a game.

## What It Tracks

- **Score changes**: When team scores update (with timestamp)
- **Individual player statistics**: Goals, assists, points, +/-, shots, penalties (with timestamp)
- **Goalie statistics**: Minutes played, goals against, saves (with timestamp)
- **Collective team statistics**: Total shots, total penalties, team goals, team assists (with timestamp)
- **Update intervals**: Time between each data change
- **Category-specific timecodes**: Last update time for each data category

## Usage

### Run During a Live Game

```bash
node src/update-frequency-monitor.js <game_id>
```

**Example:**
```bash
node src/update-frequency-monitor.js 69031
```

### Configuration

By default, the monitor:
- Checks every **30 seconds**
- Runs for **120 checks** (1 hour total)
- Saves progress every 10 checks

To modify these settings, edit the constants at the top of `update-frequency-monitor.js`:

```javascript
const CHECK_INTERVAL = 30000; // 30 seconds between checks
const MAX_CHECKS = 120;       // 120 checks = 1 hour
```

## Output

### JSON Report Location

```
output/monitoring/update_frequency_game_<game_id>.json
```

### Report Structure

```json
{
  "game_id": "69031",
  "start_time": "2026-02-09T19:00:00.000Z",
  "end_time": "2026-02-09T20:00:00.000Z",
  "check_interval_seconds": 30,
  "total_checks": 120,
  "changes_detected": 45,
  "last_update_times": {
    "score": "2026-02-09T19:45:30.123Z",
    "individual_stats": "2026-02-09T19:46:00.456Z",
    "collective_stats": "2026-02-09T19:46:00.456Z"
  },
  "change_log": [
    {
      "timestamp": "2026-02-09T19:05:30.123Z",
      "score_changed": true,
      "score_updated_at": "2026-02-09T19:05:30.123Z",
      "players_changed": [
        {
          "number": 10,
          "name": "DUPONT Pierre",
          "before": { "b": "0", "a": "1", "pts": "1", "pm": "0", "tirs": "2", "pen": "0" },
          "after": { "b": "1", "a": "1", "pts": "2", "pm": "+1", "tirs": "3", "pen": "0" }
        }
      ],
      "players_updated_at": "2026-02-09T19:05:30.123Z",
      "goalies_changed": [],
      "goalies_updated_at": null,
      "collective_changed": [
        {
          "team": "team1",
          "team_name": "ROUEN",
          "before": { "tirs": "15", "pen": "2", "buts": "0", "assists": "0", "points": "0" },
          "after": { "tirs": "18", "pen": "2", "buts": "1", "assists": "1", "points": "2" }
        }
      ],
      "collective_updated_at": "2026-02-09T19:05:30.123Z",
      "details": {
        "score": {
          "before": { "ROUEN": "0", "ANGERS": "0" },
          "after": { "ROUEN": "1", "ANGERS": "0" }
        }
      }
    }
  ],
  "summary": {
    "score_updates": 12,
    "player_stat_updates": 28,
    "goalie_stat_updates": 5,
    "collective_stat_updates": 25,
    "average_update_interval_seconds": 120,
    "update_intervals": [45, 180, 90, 150, 120, ...]
  }
}
```

### Data Categories & Timecodes

The monitoring system tracks four main categories of data, each with its own timestamp:

**1. Score** (`last_update_times.score`)
- Team scores: `{"ROUEN": "3", "ANGERS": "2"}`
- Updates when the game score changes

**2. Individual Stats** (`last_update_times.individual_stats`)

*Player Stats:*
- `b`: Goals (buts)
- `a`: Assists
- `pts`: Points
- `pm`: Plus/minus (+/-)
- `tirs`: Shots on goal
- `pen`: Penalty minutes

*Goalie Stats:*
- `min`: Minutes played
- `bc`: Goals against (buts contre)
- `arr`: Saves (arrêts)

**3. Collective Stats** (`last_update_times.collective_stats`)

*Team-level statistics:*
- `tirs`: Total team shots
- `pen`: Total team penalty minutes
- `buts`: Total team goals
- `assists`: Total team assists
- `points`: Total team points
- `plus_minus`: Team +/-
- `engagements`: Team faceoffs/engagements

**4. Timecode Format**

All timestamps are in ISO 8601 format:
- Example: `"2026-02-09T19:05:30.123Z"`
- Each change includes both a general `timestamp` and category-specific timestamps
- This allows you to see if different categories update at different rates

## Console Output

While running, the script displays:

```
=== Update Frequency Monitor ===
Game ID: 69031
Start Time: 2026-02-09T19:00:00.000Z
Check Interval: 30 seconds
Max Checks: 120

[Check 1/120] 2026-02-09T19:00:00.000Z
  - No changes detected

[Check 3/120] 2026-02-09T19:01:00.000Z
  ✓ CHANGE DETECTED!
    - Score changed (2026-02-09T19:01:00.123Z)
    - 2 player(s) stats changed (2026-02-09T19:01:00.123Z)
    - Collective team stats changed (2026-02-09T19:01:00.123Z)
    - Time since last update: 120 seconds
  → Report saved: update_frequency_game_69031.json

=== Monitoring Complete ===
Total Checks: 120
Changes Detected: 45
Score Updates: 12
Player Stat Updates: 28
Goalie Stat Updates: 5
Collective Stat Updates: 25
Average Update Interval: 120 seconds

Last Update Times:
  Score: 2026-02-09T19:45:30.123Z
  Individual Stats: 2026-02-09T19:46:00.456Z
  Collective Stats: 2026-02-09T19:46:00.456Z
```

## When to Run

**Best time to run this monitor:**
- During a **live game** (not before or after)
- Start monitoring **when the game begins** (or shortly before)
- Let it run for at least **30-60 minutes** to capture patterns

## Analyzing Results

After monitoring a live game, check the JSON report to determine:

1. **Average update interval**: `summary.average_update_interval_seconds`
2. **Update pattern**: Look at `summary.update_intervals` to see consistency
3. **What changes most**: Compare `score_updates`, `player_stat_updates`, `goalie_stat_updates`

### Example Findings

If you discover:
- Average update interval: **60 seconds**
- Updates are consistent

Then you can optimize your scraper to check every **60 seconds** instead of every 30 seconds.

## Next Steps

Once you have monitoring data from a live game:

1. Review the `average_update_interval_seconds`
2. Update your `fast-scraper.js` `FAST_INTERVAL` to match
3. Avoid checking more frequently than the website updates (saves resources)

## Troubleshooting

**No changes detected:**
- Make sure the game is **currently live** (not scheduled or finished)
- Check if the game page actually has live statistics
- Verify the game ID is correct

**Script errors:**
- Ensure you have `puppeteer` installed: `npm install puppeteer`
- Check internet connectivity
- Verify the game page URL is accessible
