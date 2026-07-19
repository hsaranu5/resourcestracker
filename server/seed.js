const db = require('./database');
const fetch = require('node-fetch');

// Sample data for seeding
const sampleResources = [
  {
    name: "Uplift KC Community Center",
    organization: "Uplift KC",
    type: "food",
    description: "Free meals and food pantry services",
    address: "1234 Main Street",
    city: "Kansas City",
    state: "MO",
    zip_code: "64108",
    phone: "816-555-0100",
    website: "https://upliftkc.org",
    hours: "Mon-Fri 9am-5pm, Sat 10am-2pm",
    source: "Uplift KC"
  },
  {
    name: "Hope Community Church Food Bank",
    organization: "Hope Community Church",
    type: "food",
    description: "Weekly food distribution",
    address: "567 Oak Avenue",
    city: "Kansas City",
    state: "MO",
    zip_code: "64110",
    phone: "816-555-0200",
    hours: "Wed 2pm-6pm",
    source: "Church"
  },
  {
    name: "Warm Hearts Clothing Closet",
    organization: "Community Outreach",
    type: "clothing",
    description: "Free clothing for all ages",
    address: "890 Elm Street",
    city: "Kansas City",
    state: "MO",
    zip_code: "64111",
    phone: "816-555-0300",
    hours: "Tue-Thu 10am-4pm",
    source: "Community Organization"
  },
  {
    name: "Safe Haven Shelter",
    organization: "City Services",
    type: "shelter",
    description: "Emergency overnight shelter",
    address: "2345 Park Boulevard",
    city: "Kansas City",
    state: "MO",
    zip_code: "64108",
    phone: "816-555-0400",
    hours: "24/7",
    source: "City Services"
  },
  {
    name: "Community Health Clinic",
    organization: "Health Services",
    type: "medical",
    description: "Free medical services and health screenings",
    address: "3456 Medical Drive",
    city: "Kansas City",
    state: "MO",
    zip_code: "64110",
    phone: "816-555-0500",
    website: "https://communityhealth.org",
    hours: "Mon-Fri 8am-6pm",
    source: "Health Services"
  }
];

// Geocode an address
const geocodeAddress = async (address) => {
  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`,
      {
        headers: {
          'User-Agent': 'ResourcesTracker/1.0'
        }
      }
    );
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon)
      };
    }
  } catch (error) {
    console.error('Geocoding error:', error);
  }
  return null;
};

// Seed the database
const seed = async () => {
  console.log('Starting database seed...');
  
  await db.init();

  const database = db.getDb();

  // Clear existing data (optional - comment out if you want to keep existing data)
  // database.run('DELETE FROM resources', (err) => {
  //   if (err) console.error('Error clearing resources:', err);
  // });

  let inserted = 0;
  for (const resource of sampleResources) {
    const fullAddress = `${resource.address}, ${resource.city}, ${resource.state} ${resource.zip_code}`;
    const coords = await geocodeAddress(fullAddress);
    
    const query = `
      INSERT INTO resources (
        name, organization, type, description, address, city, state,
        zip_code, latitude, longitude, phone, website, hours, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    database.run(
      query,
      [
        resource.name,
        resource.organization,
        resource.type,
        resource.description,
        resource.address,
        resource.city,
        resource.state,
        resource.zip_code,
        coords?.latitude || null,
        coords?.longitude || null,
        resource.phone,
        resource.website || null,
        resource.hours,
        resource.source
      ],
      function(err) {
        if (err) {
          console.error(`Error inserting ${resource.name}:`, err);
        } else {
          inserted++;
          console.log(`✓ Inserted: ${resource.name}`);
        }
      }
    );

    // Small delay to respect geocoding API rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Add sample organizations
  const sampleOrganizations = [
    {
      name: "Uplift KC",
      website: "https://upliftkc.org",
      social_media: "@upliftkc",
      description: "Community organization providing food and support services"
    },
    {
      name: "Hope Community Church",
      website: "https://hopechurchkc.org",
      social_media: "@hopechurchkc",
      description: "Local church providing food bank services"
    }
  ];

  for (const org of sampleOrganizations) {
    database.run(
      'INSERT OR IGNORE INTO organizations (name, website, social_media, description) VALUES (?, ?, ?, ?)',
      [org.name, org.website, org.social_media, org.description],
      (err) => {
        if (err) {
          console.error(`Error inserting organization ${org.name}:`, err);
        } else {
          console.log(`✓ Inserted organization: ${org.name}`);
        }
      }
    );
  }

  // Add sample community posts
  const samplePosts = [
    {
      title: "New Food Distribution This Week",
      content: "Uplift KC is hosting an additional food distribution this Friday from 2-4pm. Please bring ID and proof of address.",
      author: "Community Member"
    },
    {
      title: "Winter Clothing Drive",
      content: "The community center is collecting winter coats, hats, and gloves. Drop off at 1234 Main St any weekday.",
      author: "Anonymous"
    }
  ];

  for (const post of samplePosts) {
    database.run(
      'INSERT INTO community_posts (title, content, author) VALUES (?, ?, ?)',
      [post.title, post.content, post.author],
      (err) => {
        if (err) {
          console.error(`Error inserting post ${post.title}:`, err);
        } else {
          console.log(`✓ Inserted post: ${post.title}`);
        }
      }
    );
  }

  setTimeout(() => {
    console.log(`\n✓ Seed complete! Inserted ${inserted} resources.`);
    db.close();
    process.exit(0);
  }, 2000);
};

seed().catch(console.error);

