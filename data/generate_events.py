#!/usr/bin/env python3
"""
Expands the recurring services in the Street Sheet into dated event instances.

The Street Sheet describes several services as recurrence rules rather than
weekly hours — "2nd & 4th Tue", "4th Wednesday of each month", "1st Saturday".
The app's hours parser deliberately refuses to interpret those (it would read
"2nd & 4th Tue" as *every* Tuesday and send someone to a closed clinic), so they
show as "Check hours" on the Map tab.

Those are exactly what the Events tab is for. This turns each rule into concrete
dated instances for a given window.

    python3 generate_events.py                    # next 21 days
    python3 generate_events.py --days 30
    python3 generate_events.py --start 2026-08-01 --days 14

Writes events.json, which server/seedEvents.js loads into the database.

Every rule below is traceable to a line in the Summer 2026 Street Sheet. Where the
sheet is ambiguous — a cadence with no anchor date — the event is marked
unconfirmed so the app shows a "call first" warning rather than implying certainty.
"""

import argparse
import json
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).parent
OUT = HERE / "events.json"
# Written straight into the app bundle so the Community tab works with no server.
IOS_EVENTS = HERE.parent / "ios/KCResources/KCResources/Resources/events.json"

# Times in the Street Sheet are Kansas City local. Emitting them without an
# offset would let the server parse them as UTC and shift every clinic by five
# hours — a 4pm clinic showing as 11am. ZoneInfo also handles the CDT/CST switch,
# so a window spanning early November stays correct.
KC = ZoneInfo("America/Chicago")


def local_iso(day: date, hhmm: str) -> str:
    """'2026-07-20', '16:00' -> '2026-07-20T16:00:00-05:00'"""
    hour, minute = (int(part) for part in hhmm.split(":"))
    return datetime.combine(day, time(hour, minute), tzinfo=KC).isoformat()

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)

# Recurrence kinds:
#   weekly        -> every <weekday>
#   nth_weekday   -> the Nth <weekday> of the month (n may be a list)
#   biweekly      -> every second <weekday>, needs an `anchor` date
RULES = [
    {
        "title": "Free Medical Clinic",
        "organization": "Care Beyond the Boulevard",
        "category": "health",
        "description": "Free medical care for people who are homeless or uninsured. Walk-in, no appointment or insurance needed.",
        "location_name": "Independence Boulevard Christian Church",
        "address": "606 Gladstone Boulevard", "city": "Kansas City", "state": "MO", "zip_code": "64124",
        "contact_phone": "(913) 291-2273",
        "recurrence": {"kind": "weekly", "weekday": MON},
        "start_time": "16:00", "end_time": "19:00",
        "confirmed": True,
        "source": "KCPL Street Sheet Summer 2026 — 'Mon 4pm-7pm'",
    },
    {
        "title": "Free Medical Clinic (Saturday)",
        "organization": "Care Beyond the Boulevard",
        "category": "health",
        "description": "Saturday morning free medical clinic. Walk-in.",
        "location_name": "Independence Boulevard Christian Church",
        "address": "606 Gladstone Boulevard", "city": "Kansas City", "state": "MO", "zip_code": "64124",
        "contact_phone": "(913) 291-2273",
        "recurrence": {"kind": "weekly", "weekday": SAT},
        "start_time": "09:00", "end_time": "12:00",
        "confirmed": True,
        "source": "KCPL Street Sheet Summer 2026 — 'Sat 9am-12pm'",
    },
    {
        "title": "Mobile Food Pantry",
        "organization": "Care Beyond the Boulevard",
        "category": "food",
        "description": "Mobile food pantry alongside the Saturday clinic. Second Saturday of the month only.",
        "location_name": "Independence Boulevard Christian Church",
        "address": "606 Gladstone Boulevard", "city": "Kansas City", "state": "MO", "zip_code": "64124",
        "contact_phone": "(913) 291-2273",
        "recurrence": {"kind": "nth_weekday", "weekday": SAT, "n": [2]},
        "start_time": "10:00", "end_time": "12:00",
        "confirmed": True,
        "source": "KCPL Street Sheet Summer 2026 — '2nd Sat 10am-12pm Mobile food pantry'",
    },
    {
        "title": "Free Medical Clinic",
        "organization": "Care Beyond the Boulevard",
        "category": "health",
        "description": "Morning clinic at Cherith Brook, second and fourth Tuesdays only.",
        "location_name": "Cherith Brook Catholic Worker",
        "address": "3226 E 12th Street", "city": "Kansas City", "state": "MO", "zip_code": "64127",
        "contact_phone": "(913) 291-2273",
        "recurrence": {"kind": "nth_weekday", "weekday": TUE, "n": [2, 4]},
        "start_time": "08:30", "end_time": "10:30",
        "confirmed": True,
        "source": "KCPL Street Sheet Summer 2026 — '2nd and 4th Tues: 8:30-10:30am'",
    },
    {
        "title": "Evening Medical Clinic",
        "organization": "Care Beyond the Boulevard",
        "category": "health",
        "description": "Thursday evening clinic at Cherith Brook.",
        "location_name": "Cherith Brook Catholic Worker",
        "address": "3226 E 12th Street", "city": "Kansas City", "state": "MO", "zip_code": "64127",
        "contact_phone": "(913) 291-2273",
        "recurrence": {"kind": "weekly", "weekday": THU},
        "start_time": "17:00", "end_time": "18:30",
        "confirmed": True,
        "source": "KCPL Street Sheet Summer 2026 — 'Thurs: 5pm-6:30pm'",
    },
    {
        "title": "Veterans Commissary",
        "organization": "Veterans Community Project",
        "category": "veterans",
        "description": "Food, hygiene supplies and support for veterans. Fourth Wednesday of the month.",
        "location_name": "Veterans Community Project Welcome Center",
        "address": "8827 Troost Avenue", "city": "Kansas City", "state": "MO", "zip_code": "64131",
        "contact_phone": "(816) 599-6503",
        "recurrence": {"kind": "nth_weekday", "weekday": WED, "n": [4]},
        "start_time": "09:00", "end_time": "15:00",
        "confirmed": True,
        "source": "KCPL Street Sheet Summer 2026 — 'Fourth Wednesday Commissary 9:00am-3:00pm'",
    },
    {
        "title": "Coffee & Conversation",
        "organization": "Kansas City Public Library",
        "category": "support",
        "description": "Coffee, snacks, and direct access to resources and personal care items. Note: the library's regular Community Resources desk is closed on this day.",
        "location_name": "Central Library, Third Floor",
        "address": "14 W 10th Street", "city": "Kansas City", "state": "MO", "zip_code": "64105",
        "contact_phone": "(816) 701-3767",
        "recurrence": {"kind": "nth_weekday", "weekday": WED, "n": [4]},
        "start_time": "10:30", "end_time": "11:30",
        "confirmed": True,
        "source": "KCPL Street Sheet Summer 2026 — 'Fourth Wednesday of each month from 10:30-11:30am'",
    },
    {
        "title": "Street Outreach — Supplies Giveaway",
        "organization": "Street Support KC",
        "category": "support",
        "description": "Backpacks, sleeping bags, sack lunches and clothes. First Saturday of the month.",
        "location_name": "10th & Baltimore",
        "address": "10th & Baltimore", "city": "Kansas City", "state": "MO", "zip_code": "64105",
        "contact_phone": "",
        "recurrence": {"kind": "nth_weekday", "weekday": SAT, "n": [1]},
        "start_time": "09:00", "end_time": "11:00",
        "confirmed": True,
        "source": "KCPL Street Sheet Summer 2026 — '1st Saturday/month 9am'",
    },
    {
        "title": "Food Pantry & Personal Care",
        "organization": "St. Paul's Episcopal Church",
        "category": "food",
        "description": "Food pantry and personal care items on the south side of the church.",
        "location_name": "St. Paul's Episcopal Church",
        "address": "40th & Main Street", "city": "Kansas City", "state": "MO", "zip_code": "64111",
        "contact_phone": "(816) 931-2850",
        "recurrence": {"kind": "weekly", "weekday": SAT, "except_nth": [3]},
        "start_time": "09:00", "end_time": "11:00",
        "confirmed": True,
        "source": "KCPL Street Sheet Summer 2026 — 'Saturdays 9-11am except 3rd Sat'",
    },
    {
        "title": "Food Pantry & Personal Care (3rd Saturday)",
        "organization": "St. Paul's Episcopal Church",
        "category": "food",
        "description": "Later hours on the third Saturday of the month.",
        "location_name": "St. Paul's Episcopal Church",
        "address": "40th & Main Street", "city": "Kansas City", "state": "MO", "zip_code": "64111",
        "contact_phone": "(816) 931-2850",
        "recurrence": {"kind": "nth_weekday", "weekday": SAT, "n": [3]},
        "start_time": "10:00", "end_time": "12:00",
        "confirmed": True,
        "source": "KCPL Street Sheet Summer 2026 — '3rd Sat. 10am-12pm'",
    },
    {
        "title": "Evening Clinic",
        "organization": "St. Paul's Episcopal Church",
        "category": "food",
        "description": "Wednesday evening pantry.",
        "location_name": "St. Paul's Episcopal Church",
        "address": "40th & Main Street", "city": "Kansas City", "state": "MO", "zip_code": "64111",
        "contact_phone": "(816) 931-2850",
        "recurrence": {"kind": "weekly", "weekday": WED},
        "start_time": "17:30", "end_time": "19:30",
        "confirmed": True,
        "source": "KCPL Street Sheet Summer 2026 — 'Wed. 5:30-7:30pm'",
    },
    {
        "title": "Swope Mobile Medical Unit",
        "organization": "Swope Health",
        "category": "health",
        "description": "Mobile medical unit stops at the Hope Faith campus. The Street Sheet says every other Thursday but does not say which — confirm before travelling.",
        "location_name": "Hope Faith Homeless Assistance Campus",
        "address": "705 Virginia Avenue", "city": "Kansas City", "state": "MO", "zip_code": "64106",
        "contact_phone": "(816) 599-5480",
        # No anchor date is published, so this cadence is a guess. Flagged unconfirmed.
        "recurrence": {"kind": "biweekly", "weekday": THU, "anchor": "2026-07-23"},
        "start_time": "09:00", "end_time": "12:00",
        "confirmed": False,
        "source": "KCPL Street Sheet Summer 2026 — 'every other Thurs from 9:00am-12:00pm' (which Thursdays not stated)",
    },
]


def nth_of_month(d: date) -> int:
    """Which occurrence of this weekday within its month — 1st Tuesday, 2nd, etc."""
    return (d.day - 1) // 7 + 1


def matches(rule_rec: dict, d: date) -> bool:
    kind = rule_rec["kind"]
    if d.weekday() != rule_rec["weekday"]:
        return False

    if kind == "weekly":
        excluded = rule_rec.get("except_nth")
        return not (excluded and nth_of_month(d) in excluded)

    if kind == "nth_weekday":
        return nth_of_month(d) in rule_rec["n"]

    if kind == "biweekly":
        anchor = datetime.strptime(rule_rec["anchor"], "%Y-%m-%d").date()
        return ((d - anchor).days % 14) == 0 and d >= anchor

    raise ValueError(f"Unknown recurrence kind: {kind}")


_UNIT = __import__("re").compile(
    r",?\s*(?:"
    r"#\s*\S+"
    r"|\b(?:suite|ste\.?|apt\.?|apartment|unit|floor|fl\.?|"
    r"(?:first|second|third|fourth|fifth|ground)\s+floor)\b.*"
    r")$",
    __import__("re").IGNORECASE,
)


def _match_key(address: str) -> str:
    """Building-level key, ignoring suite/floor, for joining rules to resources."""
    return _UNIT.sub("", address.strip().lower()).strip(" ,")


def coordinate_lookup() -> dict:
    """
    Coordinates keyed by normalised street address, taken from resources.csv.

    Every venue in RULES is also a resource, so rather than geocoding these
    separately (and risking the two disagreeing) we reuse what's already there.
    An event without coordinates still shows in the list — it just can't show a
    distance or a map pin.
    """
    import csv

    path = HERE / "resources.csv"
    if not path.exists():
        return {}
    lookup = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["latitude"] and row["longitude"]:
                lookup.setdefault(_match_key(row["address"]),
                                  (float(row["latitude"]), float(row["longitude"])))
    return lookup


def expand(start: date, days: int):
    coords = coordinate_lookup()
    events = []
    for rule in RULES:
        for offset in range(days):
            day = start + timedelta(days=offset)
            if not matches(rule["recurrence"], day):
                continue
            hit = coords.get(_match_key(rule["address"]))
            events.append({
                "latitude": hit[0] if hit else None,
                "longitude": hit[1] if hit else None,
                "title": rule["title"],
                "description": rule["description"],
                "organization": rule["organization"],
                "category": rule["category"],
                "locationName": rule["location_name"],
                "address": rule["address"],
                "city": rule["city"],
                "state": rule["state"],
                "zipCode": rule["zip_code"],
                "contactPhone": rule["contact_phone"],
                "startsAt": local_iso(day, rule["start_time"]),
                "endsAt": local_iso(day, rule["end_time"]),
                "confirmed": rule["confirmed"],
                "source": rule["source"],
            })
    events.sort(key=lambda e: e["startsAt"])
    return events


def write_ios_bundle(events):
    """
    Emits the events in the exact shape `CommunityEvent` decodes, straight into
    the app bundle.

    This is what makes the Community tab work with no server at all — the same
    approach the resource list already uses. Server sync, when configured, simply
    replaces this. For a demo it means no infrastructure to go wrong: no laptop
    server, no shared wifi, no LAN address.
    """
    if not IOS_EVENTS.parent.exists():
        print(f"\n(iOS bundle folder not found, skipping {IOS_EVENTS.name})")
        return

    def to_app(e, index):
        caveat = ("\n\nThis schedule could not be confirmed from the source — "
                  "call before travelling.")
        return {
            # Stable id from org + title + start, so a regenerated feed keeps
            # selection and scroll position sensible.
            "id": f"ss-{index}-{e['startsAt'][:10]}",
            "title": e["title"],
            "description": e["description"] + ("" if e["confirmed"] else caveat),
            "organization": e["organization"],
            "category": e["category"],
            "locationName": e["locationName"],
            "address": e["address"],
            "city": e["city"],
            "state": e["state"],
            "zipCode": e["zipCode"],
            "startsAt": e["startsAt"],
            "endsAt": e["endsAt"],
            "status": "scheduled",
            "cancellationNote": "",
            "contactPhone": e["contactPhone"],
            "resourceId": None,
            "mappable": e["latitude"] is not None,
            "latitude": e["latitude"],
            "longitude": e["longitude"],
        }

    payload = {
        "version": 1,
        "count": len(events),
        "events": [to_app(e, i) for i, e in enumerate(events)],
    }
    IOS_EVENTS.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nWrote {len(events)} events into the app bundle "
          f"({IOS_EVENTS.relative_to(HERE.parent)})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=21)
    ap.add_argument("--start", type=str, default=None)
    args = ap.parse_args()

    start = datetime.strptime(args.start, "%Y-%m-%d").date() if args.start else date.today()
    events = expand(start, args.days)

    OUT.write_text(json.dumps({
        "generated": datetime.now().isoformat(timespec="seconds"),
        "window": {"start": start.isoformat(), "days": args.days},
        "events": events
    }, indent=2), encoding="utf-8")

    write_ios_bundle(events)

    print(f"{len(events)} events from {start} over {args.days} days -> {OUT.name}\n")
    current = None
    for e in events:
        day = e["startsAt"][:10]
        if day != current:
            current = day
            label = datetime.strptime(day, "%Y-%m-%d").strftime("%a %d %b")
            print(f"  {label}")
        flag = "" if e["confirmed"] else "   [unconfirmed]"
        t = e["startsAt"][11:16]
        print(f"     {t}  {e['title'][:44]:44} {e['organization'][:26]}{flag}")

    unconfirmed = sum(1 for e in events if not e["confirmed"])
    if unconfirmed:
        print(f"\n{unconfirmed} instance(s) flagged unconfirmed — cadence not stated in the source.")

    located = sum(1 for e in events if e["latitude"] is not None)
    print(f"{located}/{len(events)} have coordinates (matched against resources.csv).")
    missing = {e["address"] for e in events if e["latitude"] is None}
    for address in sorted(missing):
        print(f"  no coordinate for: {address}")


if __name__ == "__main__":
    main()
