# Keeping the server healthy

Two separate jobs, often confused:

1. **Keep the server running** — auto-start on boot, restart if it crashes.
2. **Weekly maintenance** — prune stale data, roll the events window, then bounce
   the process. This runs Monday at 12:05 AM.

The important thing to understand up front: **a restart alone does almost
nothing here.** The expired sessions, used login codes, and stale posts live in
the SQLite file and survive a restart — a fresh process just re-opens the same
file. The only real in-memory cache (login rate-limit counters) already clears
itself every 10 minutes. So "reboot the server weekly" on its own wouldn't free
anything. What actually reclaims space is `server/maintenance.js`, which deletes
the expired rows and runs `VACUUM` to compact the file. The restart is the least
important step; the cleanup is the point.

## What the weekly job does (`scripts/weekly-maintenance.sh`)

In order:

1. `data/generate_events.py --days 21` — regenerate the next three weeks of
   Street Sheet clinics, so the Events feed never empties out.
2. `server/seedEvents.js` — load them.
3. `server/maintenance.js` — the real cleanup:
   - delete **expired** sessions, login codes, and posts (only expired ones);
   - **archive** events that ended more than 7 days ago into `events_archive`
     (moved, not deleted — the history is kept);
   - `VACUUM` to shrink the database file.
4. Restart the server (a clean process that picks up the regenerated data).

**Preserved forever, never touched:** the org allowlist, the resource directory,
live sessions and posts, and upcoming events. "Clear the cache, keep the
lifetime data" — that's exactly the split.

You can run the cleanup by hand anytime to see it work:

```bash
node server/maintenance.js
```

## Scheduling it

`launchd` is **macOS only**, so which mechanism you use depends on what the
ThinkCentre M70 runs:

### Linux (most likely for the M70) — systemd

Files in `scripts/systemd/`. systemd handles both jobs cleanly: a *service* keeps
the server up, a *timer* fires the weekly maintenance.

```bash
# 1. Run the server as a managed service
sudo cp scripts/systemd/kcresources.service /etc/systemd/system/
sudo nano /etc/systemd/system/kcresources.service   # fill in the 3 placeholders
sudo systemctl daemon-reload
sudo systemctl enable --now kcresources

# 2. Schedule weekly maintenance
sudo cp scripts/systemd/kcresources-maintenance.* /etc/systemd/system/
sudo nano /etc/systemd/system/kcresources-maintenance.service  # placeholders
sudo systemctl enable --now kcresources-maintenance.timer

# Confirm
systemctl status kcresources
systemctl list-timers kcresources-maintenance
```

Test the maintenance run immediately, without waiting for Monday:

```bash
sudo systemctl start kcresources-maintenance.service
journalctl -u kcresources-maintenance -n 40
```

### macOS — launchd (how it works)

launchd is Apple's built-in scheduler and service manager — the equivalent of
systemd. You describe a job in a `.plist` file, drop it in `~/Library/LaunchAgents/`,
and `launchctl load` it. A job can be triggered on a calendar (`StartCalendarInterval`)
and, if it also has `KeepAlive`, launchd keeps the program running and restarts
it on crash. So the same two-job split applies: one plist to run the server, one
to fire weekly maintenance.

`scripts/launchd/com.kcresources.maintenance.plist` is the weekly job:

```bash
cp scripts/launchd/com.kcresources.maintenance.plist ~/Library/LaunchAgents/
nano ~/Library/LaunchAgents/com.kcresources.maintenance.plist   # fill in paths
launchctl load ~/Library/LaunchAgents/com.kcresources.maintenance.plist
launchctl start com.kcresources.maintenance   # test now
cat /tmp/kcresources-maintenance.log
```

The `StartCalendarInterval` block (Weekday 1, Hour 0, Minute 5) is Monday 12:05 AM.
If the Mac is asleep at that moment, launchd runs the job when it next wakes.

### Windows — Task Scheduler

If the M70 runs Windows: create a Basic Task, trigger Weekly → Monday → 12:05 AM,
action "Start a program" → `bash.exe` (from Git Bash or WSL) with the argument
`scripts/weekly-maintenance.sh`. Or run the server under WSL and use the systemd
path above.

## A note on the "GHW backend"

You mentioned running an additional backend alongside this on the M70. Two
things worth deciding early:

- **Port.** This server defaults to 5001 (`PORT` env var). Give the other backend
  a different port and put a reverse proxy (nginx/Caddy) in front if both need to
  be reachable on 80/443.
- **Don't share the SQLite file** between two services. SQLite tolerates it
  poorly under concurrent writes. If the GHW backend needs the same data, that's
  the point where moving to Postgres earns its keep — which is also what a real
  host would push you toward.

Tell me what the GHW backend is and I can be more specific.
