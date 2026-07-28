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

3. **Set up environment variables** (optional):
   ```bash
   cp .env.example .env
   ```
   Edit `.env` if you need to change the port (default is 5000)

4. **Start the development servers**:
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

5. **Open your browser** and navigate to `http://localhost:3000`

   The application should now be running! You'll see:
   - A map view with sample resources (if you ran the seed script)
   - Search functionality in the sidebar
   - Community posts section
   - Ability to add new resources

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

