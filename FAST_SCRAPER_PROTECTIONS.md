# Fast Scraper Anti-Restart-Loop Protections

## The Original Problem

The fast-scraper was stuck in an infinite restart loop (812+ restarts) because:

1. **Ambiguous game state terminology**: Both "not started" and "finished" games can have `etat: null`
2. **Process exit on edge cases**: The scraper would exit when it detected no real games
3. **PM2 auto-restart**: PM2 automatically restarts exited processes
4. **Result**: Continuous restart loop preventing proper game monitoring

### What Happened on Jan 27, 2026

- Games were scheduled for Jan 27 starting at 19:00+
- At midnight and throughout the day, the scraper was in a restart loop
- The cron job saw the scraper as "online" (constantly restarting) so it never properly started monitoring
- Real games happened but weren't properly tracked

---

## Protection Layer 1: Never Exit - Stay Alive in Dormant Mode

**Key Change**: The scraper now NEVER calls `process.exit(0)` except on manual shutdown (SIGINT).

Instead of exiting when there are no games or outside active hours, the scraper:
- Enters **dormant mode**
- Checks every 5 minutes if it should become active
- Stays alive continuously, preventing PM2 restart loops

### Operating Schedule

**Weekdays (Mon-Fri)**:
- Active: 19:00-23:59 Paris time
- Dormant: 00:00-18:59 Paris time

**Weekends (Sat-Sun)**:
- Active: 2 hours before first game until all games finished
- Dormant: When no games scheduled or all games finished

---

## Protection Layer 2: Explicit Time-Based Game State Detection

**Key Change**: Added explicit checks to distinguish between "not started" and "finished" games.

The `areAllGamesFinished()` function now checks:

### 1. Explicit Finish State
```javascript
if (game.etat === 'T') {
  return true; // DEFINITELY FINISHED
}
```

### 2. Game Date Check
```javascript
if (game.date_numeric < currentDateStr) {
  // Game is from past date but not marked finished
  // Log warning and consider it finished
  return true;
} else if (game.date_numeric > currentDateStr) {
  // Game is in the future
  return false; // NOT FINISHED
}
```

### 3. Game Time Check (for today's games)
```javascript
if (gameDateTime > now && (gameDateTime - now) > 10_minutes) {
  // Game hasn't started yet (more than 10 min in future)
  return false; // NOT FINISHED
}
```

### 4. In-Progress Check
```javascript
if (game.en_cours === true || game.etat === 'E') {
  // Game is currently in progress
  return false; // NOT FINISHED
}
```

### 5. Conservative Default
```javascript
// If game time has passed but etat is null and not marked in progress
// This is AMBIGUOUS - assume NOT finished (conservative approach)
return false; // Prevents premature dormancy
```

---

## Protection Layer 3: Enhanced Logging

Added detailed logging to track decision-making:

```
[FAST] ════════════════════════════════════════
[FAST] Current Paris time: 15:32 on Tue
[FAST] Outside active hours (weekday before 19:00). Entering dormant mode.
[FAST] Will check every 5 minutes for activity window.
[FAST] Process will stay alive (no restart loop).
[FAST] ════════════════════════════════════════
```

When checking if games are finished, logs like:
```
[FAST] Game MARSEILLE / GRENOBLE hasn't started yet (starts at 20:00). Not finished.
[FAST] Game ROUEN / ANGERS is in progress. Not finished.
[FAST] Game NICE / BORDEAUX time passed (19:30) but etat=null, en_cours=false.
       Assuming NOT finished (data may be updating).
```

---

## Protection Layer 4: Safe Error Defaults

All error cases default to SAFE behavior:

```javascript
catch (err) {
  logger.error(`[FAST] Error checking if games are finished: ${err.message}`);
  return false; // SAFE DEFAULT: assume NOT finished on error
}
```

This prevents the scraper from incorrectly thinking games are finished due to data errors.

---

## How This Prevents the Restart Loop

### Old Behavior
```
Game has etat=null
  → Scraper thinks "no games or finished"
  → Calls process.exit(0)
  → PM2 restarts it immediately
  → Checks again, same condition
  → Restart loop begins
```

### New Behavior
```
Game has etat=null
  → Check if time is in future: "Game hasn't started yet"
  → Return NOT finished
  → Stay in active monitoring mode
  → OR if outside active hours, enter dormant mode
  → Stay alive, check again in 5 minutes
  → No restart loop possible
```

---

## Testing & Verification

After implementing these protections:

**Before**:
- Uptime: 1-5 seconds
- Restarts: 812+ (constantly increasing)
- Status: Restart loop

**After**:
- Uptime: 90+ seconds (stable)
- Restarts: 812 (not increasing)
- Status: Dormant mode (healthy)

The scraper will now:
1. ✅ Stay alive during off-hours
2. ✅ Activate automatically at 19:00 on weekdays
3. ✅ Properly distinguish between not-started and finished games
4. ✅ Never enter a restart loop again
5. ✅ Provide clear logging for debugging

---

## Future Maintenance

If you see restart issues again, check:

1. **PM2 logs**: `pm2 logs fast-scraper --lines 50`
2. **Restart counter**: `pm2 list` - look at the ↺ column
3. **Uptime**: Should be minutes/hours, not seconds
4. **Log messages**: Look for "Entering dormant mode" or game state warnings

The detailed logging will show exactly why the scraper made any decision.
