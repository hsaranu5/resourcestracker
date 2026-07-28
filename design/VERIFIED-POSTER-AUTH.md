# Verified Poster Authentication — Design Spec

Applies to **all clients** (iOS app, future web version). The server is the single
source of truth; clients only differ in how they store the two client-side values
(see "Client storage rules" below).

## Goal

Let organizations approved by Care Beyond post to the Community Posts section,
while making it impossible for regular app users to gain that ability. Care Beyond
maintains the list of trusted org emails.

## Core model: allowlist + passwordless email codes

No passwords. No pre-created accounts. The allowlist **is** the account system.

1. Care Beyond maintains an allowlist: `email, org_name, added_by, added_at`.
2. Any user can tap **"Post as an organization"** and enter an email.
3. Server checks the allowlist:
   - On the list → email a 6-digit code (expires 10 minutes).
   - Not on the list → do nothing, but show the **identical** "check your email"
     message. Never reveal whether an email is on the list (prevents enumeration).
4. Correct code → server issues a session token → user can post.
   Posts are attributed to `org_name` from the allowlist (not user-entered).

Removing a row from the allowlist instantly revokes access — no orphaned
credentials when someone leaves an org.

## Sessions

- **Default:** short-lived session (a few hours). Safe for shared/library computers.
- **"Remember this device for 30 days":** opt-in checkbox at code entry, default
  **OFF**. Issues a 30-day token so staff on personal devices skip the code next time.

## Email prefill (convenience)

Save the last email used to request a code, client-side only, and prefill the
login field next visit. Include a **"Not you?"** link that clears it.
Harmless if exposed — the email grants nothing; the inbox code is the gate.

## Client storage rules

| Value | Web | iOS |
|---|---|---|
| Email prefill | `localStorage` (never a cookie — no need to send it to the server) | UserDefaults |
| Session token | **httpOnly cookie** (never localStorage — must be unreadable by JS) | Keychain |

Web notes: localStorage is per-browser, per-domain. Library machines that wipe
data or force private browsing will auto-clear the prefill — which is desirable
on exactly those machines.

## Server endpoints (Express + SQLite)

- `POST /auth/request-code` — body: `{ email }`. Always returns the same 200
  response. Rate-limit per email and per IP.
- `POST /auth/verify` — body: `{ email, code, rememberDevice }`. Returns session
  (httpOnly cookie for web; token in body for iOS to store in Keychain).
- Community post creation endpoints require a valid session; server stamps
  `org_name` from the allowlist row.
- Allowlist management: admin-only endpoints (or seed script initially) for
  Care Beyond to add/remove emails.

Tables: `allowlist(email, org_name, added_by, added_at)`,
`auth_codes(email, code_hash, expires_at, attempts)`.

## Security checklist

- [ ] Identical response for allowlisted vs. unknown emails
- [ ] Codes expire in 10 min; max ~5 attempts per code
- [ ] Rate limiting on `/auth/request-code`
- [ ] Store code **hashes**, not plaintext codes
- [ ] "Remember device" defaults OFF
- [ ] Session token never in web localStorage
- [ ] Post attribution comes from allowlist, never client input

## Rollout note

When launching, email approved orgs an **announcement** ("you can now post
community updates — sign in with this email address"), not credentials.
Unsolicited password emails look like phishing and create dormant-account risk.
