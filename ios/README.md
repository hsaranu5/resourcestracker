# KC Resources — iOS app

A proof-of-concept resource finder for the Kansas City metro (Missouri and Kansas sides).
Split-screen map and list of food, shelter, healthcare, showers, crisis, youth, veteran
and support services, sorted by distance from the user.

## Running it

1. Open `KCResources/KCResources.xcodeproj` in Xcode 16 or later.
2. Set your development team under **Signing & Capabilities** (needed for a real device).
3. Pick a simulator or device and hit Run.

Deployment target is iOS 17.0. No third-party packages — MapKit and CoreLocation only.

To test location in the simulator: **Features → Location → Custom Location**, and enter
`39.0997`, `-94.5786` for downtown KC.

## How it's put together

| Path | What it does |
|---|---|
| `Models/Resource.swift` | Resource model and the eight categories |
| `Models/OpeningHours.swift` | Parses free-text hours into an Open/Closed badge |
| `Services/LocationManager.swift` | Battery-conscious CoreLocation wrapper |
| `Services/ResourceStore.swift` | Loads JSON, geocodes, ranks by distance, syncs |
| `Services/DirectionsService.swift` | Apple/Google Maps handoff, phone, website |
| `Services/ServerConfig.swift` | Optional Express backend address |
| `Views/ContentView.swift` | Split map/list layout with a draggable divider |
| `Views/ResourceMapView.swift` | Map, pins, radius circle |
| `Views/ResourceListView.swift` | List, rows, expanded selection |
| `Views/ResourceDetailSheet.swift` | Full detail sheet |
| `Views/FilterBar.swift` | Category chips and radius picker |
| `Views/SettingsSheet.swift` | Location mode, data source, transit note |

The Xcode project uses **file-system synchronized groups**, so any `.swift` file you drop
into `KCResources/` is picked up automatically — no need to edit the project file.

## Decisions worth knowing about

**Location is checked once by default.** Continuous GPS is the fastest way to drain a
phone, and the app only needs a rough fix to sort by distance. Settings offers a
"Keep updating" mode (~10s, 100m filter) for people actively walking somewhere. Updates
stop entirely when the app leaves the foreground.

**Coordinates are resolved on-device.** The dataset ships with addresses, not lat/lng.
On first launch `CLGeocoder` fills in the missing coordinates and caches them to disk,
so it happens once. Results outside a KC-metro bounding box are rejected, which guards
against the geocoder matching a same-named street in another state.

You can bake the coordinates in ahead of time instead — see `data/README.md`. That makes
first launch instant and is what you'd want before any real pilot.

**Hotlines and confidential shelters have no map pin.** Domestic violence shelters
publish a hotline rather than an address, and Uplift's outreach is mobile. These are
marked `mappable: false`, always appear in the list regardless of radius, and render as
call-only cards. Someone who needs a crisis line shouldn't have it filtered out by
geography.

**The app never claims a place is open unless it's sure.** Free-text hours are parsed
best-effort. Anything unrecognized ("Call for availability") shows "Check hours" rather
than a guess. Entries with week-of-month rules — "2nd & 4th Tue", "closed 4th Wednesday"
— also show "Check hours", because reading those as *every* Tuesday would send someone
to a clinic that's shut. A wasted trip here can mean miles on foot.

**Unconfirmed entries are labelled.** Anything with `verified: FALSE` shows a "Call
first" badge and a warning in the detail sheet.

## The Community tab

Three tabs: **Find** (map + list), **Community** (events and posts), **Settings**.
The map stays first because "I need food today" should never be more than one tap
from launch.

**Events cover what the resource hours can't.** The dataset encodes recurring
schedules; events are for one-offs — a mobile pantry this Saturday, a clinic bus at
a specific camp, a coat giveaway. Grouped by day with Today/Tomorrow headers.

**Only verified organisations can publish.** The app is read-only for the people it
serves. Publishing needs a bearer token issued per organisation:

```bash
node server/issueToken.js "Care Beyond the Boulevard" outreach@example.org
node server/issueToken.js --list
node server/issueToken.js --revoke <token>
```

This is a product decision as much as a security one. An open feed read by people in
crisis is a target for scams, and a false "free meals at 6pm" costs somebody a walk
across town. It also means no moderation queue to staff and no accounts for end users.

**Events are cancelled, never deleted.** A cancelled event stays in the list with a
strikethrough and the organiser's explanation, because someone may already have
planned their day around it. Silently vanishing is worse than visibly cancelled.

**Staleness is shown, not implied.** A resource's hours are stable for months; an
event is a claim about a specific afternoon. The feed caches to disk and displays how
old it is, with a warning past six hours. Pull to refresh.

### Endpoints

| Method | Path | Auth |
|---|---|---|
| GET | `/api/community/events?lat=&lng=&radius=&category=&from=&to=` | public |
| POST | `/api/community/events` | org token |
| PATCH | `/api/community/events/:slug` | org token, own events only |
| GET | `/api/community/posts` | public |
| POST | `/api/community/posts` | org token |

Sample data to see it working:

```bash
node server/seedSampleEvents.js          # 5 events (one cancelled) + 3 posts
node server/seedSampleEvents.js --clear
```

Everything seeded is attributed to "Sample Data" so it can't be mistaken for a real
listing.

### Before this handles real posts

The token check is deliberately minimal — opaque strings in a table, no rotation, no
expiry, no rate limiting. That's fine for a pilot with a few trusted partners. Before
real use: store hashes rather than raw tokens, add rate limiting, and add rotation.

## Optional server sync

The app works fully offline. To point it at the Express backend in `/server`:

1. Set `baseURLString` in `Services/ServerConfig.swift`
   (`http://localhost:5001` for the simulator, or your Mac's LAN IP for a device).
2. Seed and start the server:
   ```bash
   npm install
   python3 data/build_dataset.py     # CSV -> JSON
   node server/seedFromJson.js       # JSON -> SQLite
   npm run server
   ```

Endpoints the app uses:

- `GET /api/resources/export` — full dataset in the app's payload shape
- `GET /api/resources/nearby?lat=&lng=&radius=&category=` — server-side distance query

A downloaded dataset is cached locally, so a failed sync falls back to the last good copy
and then to the bundled JSON. Sync failure is never fatal.

`Info.plist` allows plain HTTP on local networks only (`NSAllowsLocalNetworking`) for
development. Use HTTPS and drop that key before shipping anything.

## Before this is more than a demo

- **Bake in coordinates** so first launch doesn't depend on geocoding.
- **Confirm the two unverified entries** — Washington Square Park's dinner (suspended
  during the World Cup, which ended July 19 2026) and JayDoc's clinic nights.
- **Accessibility pass.** Dynamic Type at accessibility sizes will need testing; the row
  layout is dense.
- **Offline map tiles.** MapKit needs a network connection to draw tiles. The list works
  offline, but the map won't.
- **Decide the update path.** The Street Sheet is republished quarterly; someone has to
  re-run the pipeline and ship it. Server sync avoids an App Store release each quarter.
