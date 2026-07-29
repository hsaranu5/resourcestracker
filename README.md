# Resources Tracker

A comprehensive application for tracking homelessness resources including food, clothing, shelter, medical services, and other materials. The app aggregates information from websites and social media posts of various organizations (such as Uplift KC, churches, etc.) and provides a live map interface for finding nearby resources.

## Features

- **Live Map View**: Interactive map showing all available resources with color-coded markers by type
- **Search Functionality**: 
  - Search by zip code
  - Search by street address
  - Filter by resource type (food, clothing, shelter, medical, other)
  - Distance-based results with radius search
- **Resource Management**: Add, view, and manage resources with full details
- **Community Section**: Everyone can read posts; publishing is limited to organizations verified by Care Beyond, who sign in with a one-time email code (no passwords — see `design/VERIFIED-POSTER-AUTH.md`). Manage who can post with `node server/manageAllowlist.js --add <email> "<Org name>"`. In development, sign-in codes print to the server console; set `EMAIL_MODE=provider` and configure `server/mailer.js` before launch.
- **Organization Tracking**: Track organizations that provide resources

## Tech Stack

- **Frontend**: React with Leaflet maps
- **Backend**: Node.js with Express
- **Database**: SQLite
- **Maps**: OpenStreetMap via Leaflet (no API key required)

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Setup Steps

1. **Clone or navigate to the project directory**

2. **Install dependencies** (both root and client):
   ```bash
   npm run install-all
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to change the port (default 5001) or to turn on real email delivery
   (see [Email delivery](#email-delivery) below).

4. **Seed the database** — required, and easy to miss:
   ```bash
   npm run seed
   ```
   `resources.db` is gitignored, so a fresh clone starts with an empty database
   and the map will show no locations until this is run. The seed loads the 116
   resources from `data/resources.json`; it matches on `slug`, so re-running it
   updates rows instead of duplicating them.

5. **Start the development servers**:
   ```bash
   npm run dev
   ```
   This will start both the backend server (port 5001) and the React frontend (port 3000)
   
   **Note**: Port 5000 is used by macOS AirPlay Receiver, so the backend uses port 5001 instead.

   Or start them separately:
   ```bash
   # Terminal 1 - Backend
   npm run server

   # Terminal 2 - Frontend
   npm run client
   ```

6. **Open your browser** and navigate to `http://localhost:3000`

   The application should now be running! You'll see:
   - A map view with sample resources (if you ran the seed script)
   - Search functionality in the sidebar
   - Community posts section
   - Ability to add new resources

## Email delivery

Verified organisations sign in with a 6-digit code sent to their email. Delivery
is controlled entirely by `.env` — `server/mailer.js` never needs editing.

| `EMAIL_MODE` | Behaviour |
|---|---|
| `console` (default) | Codes print to the server terminal. Good for local development. |
| `smtp` | Codes are emailed over SMTP. |

### Using Gmail (interim, before the real domain)

Gmail requires an **App Password** — the normal account password is rejected.

1. Enable 2-Step Verification on the Google account.
2. Generate an App Password at <https://myaccount.google.com/apppasswords>.
3. In `.env`:
   ```
   EMAIL_MODE=smtp
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=youraddress@gmail.com
   SMTP_PASS=abcdefghijklmnop
   MAIL_FROM="Care Beyond <youraddress@gmail.com>"
   ```
   Gmail rewrites the `From` header to the authenticated account, so the address
   in `MAIL_FROM` must match `SMTP_USER`.
4. Confirm it works before relying on it:
   ```bash
   npm run test-mail -- you@example.com
   ```
   This validates the credentials, then sends one message with a dummy code.

Restart the server after changing `.env` — env vars are read at boot.

**Gmail limits**: roughly 500 messages per day, and Google may flag the account
if volume spikes. Fine for a pilot with a handful of verified orgs; move to a
transactional provider (Resend, SendGrid, Postmark) once the domain exists. That
migration is only a change of `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM`.

## Usage

### Searching for Resources

1. Enter a zip code or street address in the search bar
2. Optionally select a resource type filter
3. Click "Search Resources" to see results on the map and in the list
4. Click on any resource marker or list item to see details

### Adding Resources

1. Click the "+ Add Resource" button in the sidebar
2. Fill in the resource details (name, type, address, etc.)
3. The system will automatically geocode the address to get coordinates
4. Submit the form to add the resource

### Community Posts

1. Switch to the "Community" tab
2. View existing posts from community members
3. Click "+ Create Post" to share information or updates
4. Posts can be anonymous or include your name

## API Endpoints

### Resources
- `GET /api/resources` - Get all resources (optional query: `?type=food&zip_code=64108`)
- `GET /api/resources/:id` - Get a specific resource
- `POST /api/resources` - Create a new resource
- `PUT /api/resources/:id` - Update a resource
- `DELETE /api/resources/:id` - Delete a resource

### Search
- `GET /api/search?zip_code=64108&address=123 Main St&type=food&radius=10` - Search resources

### Community Posts
- `GET /api/posts` - Get all posts (optional query: `?resource_id=1`)
- `GET /api/posts/:id` - Get a specific post
- `POST /api/posts` - Create a new post
- `DELETE /api/posts/:id` - Delete a post

### Organizations
- `GET /api/organizations` - Get all organizations
- `POST /api/organizations` - Create a new organization

## Database Schema

The application uses SQLite with the following tables:

- **resources**: Stores resource information with location data
- **community_posts**: Stores community posts
- **organizations**: Tracks organizations that provide resources

## Adding Sample Data

You can add sample data by making POST requests to the API or using the web interface. Example:

```bash
curl -X POST http://localhost:5001/api/resources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Community Food Pantry",
    "organization": "Uplift KC",
    "type": "food",
    "description": "Free food distribution",
    "address": "123 Main St",
    "city": "Kansas City",
    "state": "MO",
    "zip_code": "64108",
    "phone": "816-555-1234",
    "hours": "Mon-Fri 9am-5pm",
    "source": "Uplift KC"
  }'
```

## Future Enhancements

- Integration with social media APIs to automatically pull resource information
- User authentication and profiles
- Resource verification system
- Email/SMS notifications for new resources
- Mobile app version
- Advanced filtering and sorting options
- Resource availability calendar
- Photo uploads for resources

## Contributing

This is a community-focused application. Contributions are welcome! Please feel free to submit issues or pull requests.

## License

ISC

## Support

For issues or questions, please create an issue in the repository or contact the development team.

