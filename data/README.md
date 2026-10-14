# The dataset

102 Kansas City metro resources across food, shelter, health, showers/laundry, crisis,
youth, veterans and general support.

| File | Role |
|---|---|
| `resources.csv` | **The master.** Edit this. |
| `resources.xlsx` | Same data, formatted for editing in Excel/Numbers |
| `resources.json` | Generated. Bundled into the iOS app and seeded into the server. |
| `build_dataset.py` | CSV → JSON + XLSX, with optional geocoding |

## Where it comes from

The primary source is the **Kansas City Public Library Street Sheet, Summer 2026** —
an official directory of services for people experiencing homelessness, republished
**quarterly** at [kclibrary.org/outreach](https://kclibrary.org/outreach).

This matters for maintenance: rather than scraping a dozen provider sites that each
change independently, one trusted document refreshes four times a year. When the next
edition lands, update the CSV from it and re-run the build.

Supplemented by the KCPD Community Resource Guide (shelter listings) and provider
websites for Kansas-side coverage, which the Street Sheet is thin on — Duchesne Clinic,
Swope's KCK locations, JayDoc, Lion's House, Veronica's Voice.

## Editing

Edit `resources.csv` (or the xlsx and export back to CSV), then:

```bash
python3 build_dataset.py            # convert
python3 build_dataset.py --geocode  # convert + fill in missing coordinates
```

`--geocode` uses OpenStreetMap's Nominatim, honors its 1 request/second policy, writes
coordinates back into the CSV so it only runs once per address, and rejects anything
landing outside a KC-metro bounding box.

> **Since the admin area exists, the live catalogue is edited at checkpointkc.com/admin**
> (Resources), and Supabase is the copy of record. This CSV is a snapshot of how the data
> started. Use Export CSV in the admin to get the current data. `npm run seed` refuses to
> run once the admin has recorded edits, because it would overwrite them; `--force`
> overrides that.
>
> Review workbooks (`data/review/*.xlsx`) go in through **Import** in the admin: load the
> file, and its New places and Changes tabs become lists you can add in one go or open one
> row at a time, already filled in. The Decision column is respected; blank rows start
> selected only when recommended Approve. Rows already in the catalogue are recognised, so
> loading a workbook twice doesn't duplicate anything. Afterwards, Resources → No map pin →
> Look up all places the new addresses on the map.

Then reseed the server if you're using it:

```bash
node ../server/seedFromJson.js
```

Seeding matches on `id`, so re-running updates rows rather than duplicating them.

### Columns

- **id** — stable slug. Don't change it; it's the key for geocode caching and DB upserts.
- **category** — one of `food`, `shelter`, `health`, `hygiene`, `crisis`, `youth`,
  `veterans`, `support`
- **services** — semicolon-separated, e.g. `Hot Meals;Showers;Mail`
- **hours** — free text, copied verbatim from the source. The app parses it best-effort
  and falls back to "Check hours" when unsure. Don't reformat it into something lossy.
- **verified** — `TRUE` only if the listing is confirmed by an authoritative source.
  `FALSE` shows a "Call first" warning in the app.
- **latitude / longitude** — leave blank for new rows; geocoding fills them.

### Entries without a street address

Hotlines, mobile outreach, and domestic violence shelters (which publish a hotline
instead of an address, for safety) use a placeholder in `address`:

`Phone only` · `Confidential - call hotline` · `Call for location` · `Text 4HELP`

These are flagged `mappable: false`, get no map pin, and always appear in the list
regardless of the distance filter.

## Known gaps

- **84 of 102 entries need geocoding.** Run `--geocode`, or let the app do it on first
  launch.
- **Two entries are unverified.** Washington Square Park's Tuesday dinner was listed as
  suspended through the World Cup (which ended July 19, 2026); JayDoc's clinic nights
  weren't confirmed.
- **Kansas-side coverage is thinner** than Missouri. The Street Sheet is KCMO-focused.
  Wyandotte County pantries in particular are under-represented — Catholic Charities
  WyCo and Giving Hope KC were dropped because no reliable address could be confirmed.
- **Some organizations appear multiple times** by design — Bishop Sullivan and True Light
  run distinct programs at different addresses and hours. True Light's basic-needs office
  (712 E 31st) is a different building from Emancipation Station (717 E 31st).

## A note on the data

Every row sends a real person somewhere, possibly on foot. Wrong hours cost someone a
wasted trip — more so since Kansas City buses stopped being fare-free on June 1, 2026.
When a listing is uncertain, mark `verified` as `FALSE` rather than guessing. The app is
built to degrade honestly, and that only works if the data is honest about what it
doesn't know.
