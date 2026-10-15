# Deploying to Vercel + Supabase

Vercel serves `client/build` as static files and runs `api/index.js` (the
Express app from `server/app.js`) as one serverless function for every
`/api/*` request. Supabase Postgres is the only database. Scheduled jobs are
Vercel Cron Jobs (see `scripts/MAINTENANCE.md`).

Both are on free plans:

- **Supabase Free** pauses a project after a week without activity. A paused
  project refuses connections, so the whole API returns 500 until someone
  restores it from the dashboard. The daily cron touches the database and may
  keep it awake, but Supabase doesn't promise that, so a GitHub Actions
  workflow (`.github/workflows/supabase-keepalive.yml`) also queries it once a
  day. It needs the repository secret `DATABASE_URL` (either pooler string):
  GitHub → Settings → Secrets and variables → Actions. Then Actions →
  **Supabase keep-alive** → **Run workflow**, and it should go green.
- **Vercel Hobby** is for non-commercial use only, and runs crons at most once
  a day, to the hour.

## 1. Supabase

1. Create a project (Free plan). Pick the region closest to Vercel's default
   function region, `iad1` (Washington DC): **East US (N. Virginia)**.
2. Project Settings → Database → Connection string. Copy two:
   - **Transaction pooler** (port 6543): this is `DATABASE_URL` on Vercel.
   - **Session pooler** (port 5432): use it for the one-off commands below.
3. Optional: download the CA certificate from the same page for
   `DATABASE_CA_CERT` (see `.env.example`).

## 2. Schema and data (from your machine)

Stop the old server first so nothing is written to SQLite after the copy.

```bash
export DATABASE_URL='<session pooler string>'
npm install
npm run db:schema
npm run db:migrate-sqlite -- server/resources.db --archive data/archive.json
```

The migration copies every table with its original ids, moves each id
sequence past SQLite's high-water mark, loads `data/archive.json` into
`community_archive`, and prints a row-count comparison. It refuses to write
into tables that already have rows. Add `--replace` to empty them and copy
again.

## 3. Vercel

```bash
npm i -g vercel
vercel login
vercel link                     # creates or links the project; root = repo root
vercel env add DATABASE_URL     # transaction pooler string; Production + Preview
vercel env add CRON_SECRET      # openssl rand -hex 32
vercel env add EMAIL_MODE       # console | smtp
vercel env add SMTP_HOST        # and SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM when EMAIL_MODE=smtp
vercel env add REACT_APP_MAP_TILES_KEY   # optional; read at build time
vercel deploy                   # preview
vercel deploy --prod
```

`vercel.json` already sets the install/build commands, the output
directory, the `/api` and SPA rewrites, and the two crons. The build runs
with `CI=false` because Create React App otherwise fails the build on an
existing ESLint warning in `EventsList.js`.

## 4. Check the deployment

```bash
URL=https://<your-deployment>.vercel.app
curl -s $URL/api/resources | head -c 200
curl -s "$URL/api/search?zip_code=64108" | head -c 200
curl -s -X POST $URL/api/auth/request-code -H 'Content-Type: application/json' -d '{"email":"x@example.org"}'
curl -s -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/archive
```

Then sign in from the web app and check that the `org_session` cookie has
`Secure` set. That flag depends on `NODE_ENV=production`, which Vercel sets
for deployments.

## 5. The iOS app

The app reads its server from `ServerConfig.baseURLString`. Point it at the
new domain, or move the old hostname's DNS to Vercel. Sessions copied from
SQLite keep working because their token hashes were copied unchanged.
