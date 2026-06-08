# Manual Fast-Scraper Start Guide

## Quick Reference

### From your watcher or terminal:

```bash
# Normal start (auto-checks if it should start)
./start-fast-scraper.sh

# Force start/restart with interactive prompt
./start-fast-scraper.sh --force
# or
./start-fast-scraper.sh -f

# Show help
./start-fast-scraper.sh --help
```

---

## Scenarios

### 1. Fast-scraper is already running

**Without force flag:**
```bash
$ ./start-fast-scraper.sh
Fast-scraper is already running
Tip: Use --force or -f flag to restart it manually
```

**With force flag:**
```bash
$ ./start-fast-scraper.sh --force
Fast-scraper is already running.
Do you want to restart it? (y/n): y
Restarting fast-scraper...
[PM2] Applying action restartProcessId on app [fast-scraper](ids: [ 5 ])
[PM2] [fast-scraper](5) ✓
Fast-scraper has been restarted.
```

---

### 2. Fast-scraper is not running, but it's not time yet (e.g., >2h before game)

**Without force flag:**
```bash
$ ./start-fast-scraper.sh
Not time to start fast-scraper yet (no games, finished, or too early)
Tip: Use --force or -f flag to start it manually
```

**With force flag:**
```bash
$ ./start-fast-scraper.sh --force
Not time to start fast-scraper yet (no games, finished, or too early)
Do you want to start it anyway? (y/n): y
Starting fast-scraper (manual override)...
[PM2] Starting /home/ubuntu/ligue-magnus-scraper/src/fast-scraper.js in fork_mode
[PM2] Done.
Fast-scraper started.
```

---

### 3. Within 2 hours of game (auto-start conditions met)

```bash
$ ./start-fast-scraper.sh
Starting fast-scraper...
[PM2] Starting /home/ubuntu/ligue-magnus-scraper/src/fast-scraper.js in fork_mode
[PM2] Done.
```

---

## Use Cases

### 🎯 Manual Override 2h Before Game

You're watching and want to start monitoring early:

```bash
./start-fast-scraper.sh --force
# Answer 'y' when prompted
```

### 🔄 Restart to Apply Changes

You made changes to the scraper code:

```bash
./start-fast-scraper.sh --force
# Answer 'y' to restart
```

### 📊 Check Status Without Starting

```bash
./start-fast-scraper.sh
# Will tell you if it's running or why it won't start
```

---

## Safety Features

✅ **Interactive Confirmation**: Always asks y/n when forcing, prevents accidents

✅ **Non-Interactive Protection**: When run from cron, force flag is ignored (prevents auto-restarts)

✅ **Clear Messages**: Always tells you what's happening and why

✅ **Smart Defaults**: Won't start if conditions aren't met unless you explicitly force it

---

## Integration with Your Watcher

You can call this from your watcher script:

```bash
# Option 1: Let it decide automatically
/home/ubuntu/ligue-magnus-scraper/start-fast-scraper.sh

# Option 2: Force with automatic 'y' (use with caution)
echo "y" | /home/ubuntu/ligue-magnus-scraper/start-fast-scraper.sh --force

# Option 3: Better - provide a menu option that runs it interactively
# (Let the user confirm y/n themselves)
/home/ubuntu/ligue-magnus-scraper/start-fast-scraper.sh --force
```

---

## Troubleshooting

### "Fast-scraper is already running" but you want to restart

Use the force flag:
```bash
./start-fast-scraper.sh --force
```

### Script says "non-interactive mode" when using --force

This happens when piping input (like `echo "y" |`). The script is designed this way to prevent accidental restarts from cron jobs. Run it directly in your terminal instead.

### Need to force-start without confirmation (scripts/automation)

Use PM2 directly:
```bash
pm2 restart fast-scraper
# or if not running:
pm2 start src/fast-scraper.js --name fast-scraper
```

But note: The start-fast-scraper.sh is safer because it checks conditions first.
