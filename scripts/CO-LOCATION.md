# Running both servers on one box, smoothly and separately

Two services on the ThinkCentre: this resource tracker (Node, public-facing) and
the geometry clinical platform (Python/Flask, sensitive, internal). The goal is
that they share hardware but not fate — a problem in one, whether a crash, a
runaway process, or a compromise, doesn't reach the other.

The single most important idea: **the folder split gives you nothing on its own.**
Isolation comes from separate users, kernel sandboxing, resource caps, and
network boundaries. Here's each, cheapest first.

## 1. A separate OS user per service (do this first, costs nothing)

```bash
sudo useradd --system --home /srv/kcresources --shell /usr/sbin/nologin kcresources
sudo useradd --system --home /srv/geometry   --shell /usr/sbin/nologin geometry
```

Install each app under `/srv` (not `/home`) so nothing lives in a home directory
that a service might otherwise be able to read:

```bash
sudo cp -r <resource tracker repo> /srv/kcresources
sudo cp -r <geometry repo>         /srv/geometry
sudo chown -R kcresources:kcresources /srv/kcresources
sudo chown -R geometry:geometry       /srv/geometry
sudo chmod -R o-rwx /srv/kcresources /srv/geometry   # nothing world-readable
```

Now, at the filesystem level, the `kcresources` user cannot read
`/srv/geometry/instance/geometry.db` — the OS refuses it, regardless of any app
bug. That one step defeats the "compromise one, read the other" scenario for the
common case.

## 2. Kernel sandboxing via systemd (already wired for the tracker)

`scripts/systemd/kcresources.service` is hardened: `ProtectSystem=strict` (whole
FS read-only except its own two dirs), `ProtectHome=true` (all of `/home` hidden),
`InaccessiblePaths=` naming the geometry dir explicitly, dropped capabilities, and
a syscall allowlist. Even full code execution inside the Node process can't see
the geometry files.

After installing, check the score:

```bash
systemd-analyze security kcresources    # lower "exposure" is better; aim < 4
```

**Do the same for geometry.** It has a Dockerfile, so the cleanest option is to
run it in a container (section 5). If you'd rather run it under systemd too, here's
a matching template — note it's tightened *further* because it holds the sensitive
data:

```ini
# /etc/systemd/system/geometry.service
[Unit]
Description=Geometry clinical platform
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=geometry
Group=geometry
WorkingDirectory=/srv/geometry
# Bind to localhost ONLY — never 0.0.0.0. Nothing off-box should reach it.
ExecStart=/srv/geometry/.venv/bin/gunicorn --bind 127.0.0.1:8000 server.app:app
Restart=always
RestartSec=5

ProtectSystem=strict
ReadWritePaths=/srv/geometry/instance
ProtectHome=true
InaccessiblePaths=-/srv/kcresources -/home
PrivateTmp=true
NoNewPrivileges=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
SystemCallFilter=@system-service
SystemCallArchitectures=native

MemoryMax=512M
CPUQuota=75%
TasksMax=256

[Install]
WantedBy=multi-user.target
```

The two `InaccessiblePaths` lines point at each other — each service is explicitly
blind to the other's directory.

## 3. Resource caps so one can't starve the other

Both unit files set `MemoryMax`, `CPUQuota`, and `TasksMax`. Tune them to the
M70's RAM (e.g. if it has 16 GB, 512M each is conservative and fine). The point:
a memory leak or a load spike in the tracker can't drag the clinical platform
down — systemd caps it, and the OOM killer takes the offender, not a random
victim. Watch live usage with `systemctl status <service>` or `systemd-cgtop`.

## 4. Network boundaries

- **Different ports, both on localhost.** Tracker on 5001, geometry on 8000 (or
  whatever), both bound to `127.0.0.1`. Flask already defaults to localhost; make
  sure gunicorn does too (`--bind 127.0.0.1:8000`, never `0.0.0.0`).
- **Only the tracker faces the internet**, through a reverse proxy. The geometry
  platform should not be reachable from outside the box at all. If it ever needs
  remote access, put it behind its own auth AND a VPN/Tailscale, not the open web.
- **Firewall everything else off.** With `ufw`:

  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow 22/tcp        # SSH (consider limiting to your LAN)
  sudo ufw allow 80,443/tcp    # the reverse proxy only
  sudo ufw enable
  ```

  Note: the app ports (5001, 8000) are NOT opened — they're reachable only via
  localhost and the proxy.

- **Reverse proxy** — Caddy is the least error-prone on a home box (automatic
  HTTPS). Public traffic hits the tracker; geometry is simply absent from the
  config:

  ```
  # /etc/caddy/Caddyfile
  resources.yourdomain.org {
      reverse_proxy 127.0.0.1:5001
  }
  # geometry is intentionally NOT exposed here.
  ```

## 5. Or: containers (strongest practical isolation)

Geometry already has a Dockerfile. Running each service in its own container gives
separate filesystem and process namespaces almost for free:

- Each container sees only its own files. **Never mount a shared volume** between
  them, and never mount the host home into either.
- Put both behind the same reverse proxy; publish only the tracker.
- A compromise of one container doesn't see the other's filesystem at all.

If you go this route, the systemd units become "run this container" wrappers and
the file-permission steps matter less — but keep the separate-user and
localhost-binding habits anyway.

## 6. The rule that's easy to violate: don't share the database

SQLite tolerates concurrent writers from separate processes poorly, and sharing a
file is also a data-leak path. Each service keeps its own DB
(`/srv/kcresources/server/resources.db`, `/srv/geometry/instance/geometry.db`) and
they never touch each other's. If the two ever genuinely need shared data, that's
the moment to move that shared piece to Postgres with its own user and grants —
not to point both at one file.

## 7. Keep-it-healthy basics

- **Automatic security updates:** `sudo apt install unattended-upgrades` and
  enable it. A home server that never patches is the likeliest real-world breach
  path — far more than an app bug.
- **Backups, especially geometry.** Back up the SQLite files on a schedule to
  somewhere off the box (`sqlite3 geometry.db ".backup '/backup/geometry-$(date +%F).db'"`
  is safe to run live). Encrypt the backups if the data is sensitive.
- **Least-privilege SSH:** key-only, no root login, and ideally reachable only
  from your LAN or a VPN.
- **Watch the logs:** `journalctl -u kcresources -u geometry -f` shows both.

## Quick mental model

| Layer | What it stops |
|---|---|
| Separate users + file perms | One service reading the other's files |
| systemd sandbox / containers | A compromised process reaching outside its own dir |
| Resource caps | One service starving or crashing the other |
| Localhost binding + firewall + proxy | The sensitive service being reachable at all |
| Separate databases | Data bleed and write corruption |
| Patching + backups + SSH hygiene | The boring breaches that actually happen |

Do 1–4 and you've addressed the scenario you asked about. Add 5 if you want the
strongest practical wall. 6–7 are what keep it running well over months.
