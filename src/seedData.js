const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

// Load environment variables
require('dotenv').config();

// Initialize DynamoDB client with proper credentials
const clientConfig = {
  region: process.env.AWS_REGION || 'ap-southeast-1',
  requestHandler: new NodeHttpHandler({
    http2: false,
  }),
};

// Add endpoint if specified (for local DynamoDB)
if (process.env.DYNAMODB_ENDPOINT) {
  clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

// Add credentials
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
} else {
  console.warn('⚠️  Warning: AWS credentials not found in environment variables.');
  console.warn('   The script will use default AWS credential chain (IAM roles, ~/.aws/credentials, etc.)');
}

const client = new DynamoDBClient(clientConfig);
const dynamoDb = DynamoDBDocumentClient.from(client);

/**
 * Check if a table has any data
 */
const isTableEmpty = async (tableName) => {
  try {
    const command = new ScanCommand({
      TableName: tableName,
      Limit: 1,
    });
    const response = await dynamoDb.send(command);
    return response.Items.length === 0;
  } catch (error) {
    console.error(`Error checking ${tableName}:`, error.message);
    return false;
  }
};

/**
 * Insert an item into DynamoDB
 */
const insertItem = async (tableName, item) => {
  try {
    await dynamoDb.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      })
    );
    console.log(`✓ Inserted item into ${tableName}: ${item.id || item.name}`);
  } catch (error) {
    console.error(`✗ Error inserting into ${tableName}:`, error.message);
  }
};

/**
 * Seed Categories table
 */
const seedCategories = async () => {
  console.log('\n📁 Seeding Categories...');

  if (!(await isTableEmpty('Categories'))) {
    console.log('Categories table already has data. Skipping...');
    return [];
  }

  const categories = [
    {
      id: uuidv4(),
      name: 'Music',
      description: 'Concerts, festivals, and live music performances',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Sports',
      description: 'Sporting events, matches, and tournaments',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Theater',
      description: 'Plays, musicals, and theatrical performances',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Comedy',
      description: 'Stand-up comedy shows and comedy events',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Conference',
      description: 'Business conferences, seminars, and workshops',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Food & Drink',
      description: 'Food festivals, wine tastings, and culinary events',
      createdAt: new Date().toISOString(),
    },
  ];

  for (const category of categories) {
    await insertItem('Categories', category);
  }

  return categories;
};

/**
 * Seed Events table
 */
const seedEvents = async (categories) => {
  console.log('\n🎉 Seeding Events...');

  if (!(await isTableEmpty('Events'))) {
    console.log('Events table already has data. Skipping...');
    return [];
  }

  // Helper function to get future dates
  const getFutureDate = (daysFromNow) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString();
  };

  const events = [
    {
      id: uuidv4(),
      title: 'Summer Music Festival 2025',
      description:
        'A three-day outdoor music festival featuring top artists from around the world. Enjoy multiple stages, food vendors, and camping options.',
      date: getFutureDate(45),
      location: 'Central Park, New York, NY',
      venue: 'Central Park Main Stage',
      categoryId:
        categories.find((c) => c.name === 'Music')?.id || categories[0]?.id,
      categoryName: 'Music',
      price: 150.0,
      totalTickets: 5000,
      availableTickets: 5000,
      status: 'upcoming',
      imageUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea',
      organizerId: 'system',
      organizerName: 'Music Events Co.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'NBA Championship Finals - Game 5',
      description:
        'Watch the exciting NBA Championship Finals Game 5. Experience the thrill of professional basketball at its finest.',
      date: getFutureDate(30),
      location: 'Madison Square Garden, New York, NY',
      venue: 'Madison Square Garden',
      categoryId:
        categories.find((c) => c.name === 'Sports')?.id || categories[1]?.id,
      categoryName: 'Sports',
      price: 250.0,
      totalTickets: 2000,
      availableTickets: 1500,
      status: 'upcoming',
      imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc',
      organizerId: 'system',
      organizerName: 'NBA Events',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Hamilton - Broadway Show',
      description:
        'The story of America then, told by America now. Experience the revolutionary musical phenomenon that is Hamilton.',
      date: getFutureDate(15),
      location: 'Richard Rodgers Theatre, New York, NY',
      venue: 'Richard Rodgers Theatre',
      categoryId:
        categories.find((c) => c.name === 'Theater')?.id || categories[2]?.id,
      categoryName: 'Theater',
      price: 180.0,
      totalTickets: 800,
      availableTickets: 200,
      status: 'upcoming',
      imageUrl: 'https://images.unsplash.com/photo-1503095396549-807759245b35',
      organizerId: 'system',
      organizerName: 'Broadway Productions',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Comedy Night with Dave Chappelle',
      description:
        'An evening of comedy with one of the greatest stand-up comedians of all time. Limited seats available!',
      date: getFutureDate(20),
      location: 'Comedy Cellar, New York, NY',
      venue: 'Comedy Cellar - Main Room',
      categoryId:
        categories.find((c) => c.name === 'Comedy')?.id || categories[3]?.id,
      categoryName: 'Comedy',
      price: 75.0,
      totalTickets: 300,
      availableTickets: 50,
      status: 'upcoming',
      imageUrl: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca',
      organizerId: 'system',
      organizerName: 'Comedy Central Productions',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'TechCrunch Disrupt 2025',
      description:
        "The world's leading authority in debuting revolutionary startups, introducing game-changing technologies and discussing what's top of mind for the tech industry.",
      date: getFutureDate(60),
      location: 'Moscone Center, San Francisco, CA',
      venue: 'Moscone Convention Center',
      categoryId:
        categories.find((c) => c.name === 'Conference')?.id ||
        categories[4]?.id,
      categoryName: 'Conference',
      price: 500.0,
      totalTickets: 3000,
      availableTickets: 2500,
      status: 'upcoming',
      imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
      organizerId: 'system',
      organizerName: 'TechCrunch',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Food & Wine Festival',
      description:
        "Sample dishes from the city's best restaurants, attend cooking demonstrations, and enjoy wine tastings from renowned vineyards.",
      date: getFutureDate(25),
      location: 'Brooklyn Bridge Park, Brooklyn, NY',
      venue: 'Brooklyn Bridge Park',
      categoryId:
        categories.find((c) => c.name === 'Food & Drink')?.id ||
        categories[5]?.id,
      categoryName: 'Food & Drink',
      price: 85.0,
      totalTickets: 1500,
      availableTickets: 1200,
      status: 'upcoming',
      imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1',
      organizerId: 'system',
      organizerName: 'NYC Food Events',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Jazz Night at Blue Note',
      description:
        "An intimate evening featuring world-class jazz musicians in one of NYC's most iconic jazz clubs.",
      date: getFutureDate(10),
      location: 'Blue Note Jazz Club, New York, NY',
      venue: 'Blue Note Jazz Club',
      categoryId:
        categories.find((c) => c.name === 'Music')?.id || categories[0]?.id,
      categoryName: 'Music',
      price: 65.0,
      totalTickets: 200,
      availableTickets: 180,
      status: 'upcoming',
      imageUrl: 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f',
      organizerId: 'system',
      organizerName: 'Blue Note Entertainment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'New York Marathon 2025',
      description:
        "Be part of the world's largest marathon! Run through all five boroughs of New York City.",
      date: getFutureDate(90),
      location: 'New York City, NY',
      venue: 'Starting Line: Staten Island',
      categoryId:
        categories.find((c) => c.name === 'Sports')?.id || categories[1]?.id,
      categoryName: 'Sports',
      price: 295.0,
      totalTickets: 50000,
      availableTickets: 45000,
      status: 'upcoming',
      imageUrl: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3',
      organizerId: 'system',
      organizerName: 'New York Road Runners',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  for (const event of events) {
    await insertItem('Events', event);
  }

  return events;
};

/**
 * Seed Tickets table with some sample tickets
 * Note: These are just sample tickets without real user data
 */
const seedTickets = async (events) => {
  console.log('\n🎫 Seeding Tickets...');

  if (!(await isTableEmpty('Tickets'))) {
    console.log('Tickets table already has data. Skipping...');
    return [];
  }

  // Create a few sample tickets for demonstration
  // In production, these would be created when users purchase tickets
  const tickets = [
    {
      id: uuidv4(),
      eventId: events[0]?.id, // Summer Music Festival
      userId: 'sample-user-1', // This would be a real Cognito user ID
      userName: 'Sample User',
      userEmail: 'sample@example.com',
      purchaseDate: new Date().toISOString(),
      ticketType: 'General Admission',
      price: 150.0,
      quantity: 2,
      totalAmount: 300.0,
      status: 'confirmed',
      qrCode: `TICKET-${uuidv4()}`,
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      eventId: events[2]?.id, // Hamilton
      userId: 'sample-user-2',
      userName: 'Sample User 2',
      userEmail: 'sample2@example.com',
      purchaseDate: new Date().toISOString(),
      ticketType: 'Premium Seating',
      price: 180.0,
      quantity: 1,
      totalAmount: 180.0,
      status: 'confirmed',
      qrCode: `TICKET-${uuidv4()}`,
      createdAt: new Date().toISOString(),
    },
  ];

  for (const ticket of tickets) {
    await insertItem('Tickets', ticket);
  }

  return tickets;
};

/**
 * Main seed function
 */
const seedDatabase = async () => {
  console.log('🌱 Starting database seeding...\n');
  console.log('='.repeat(50));

  try {
    // Seed in order: Categories -> Events -> Tickets
    const categories = await seedCategories();
    const events = await seedEvents(categories);
    const tickets = await seedTickets(events);

    console.log('\n' + '='.repeat(50));
    console.log('✅ Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Categories: ${categories.length} items`);
    console.log(`   Events: ${events.length} items`);
    console.log(`   Tickets: ${tickets.length} sample items`);
    console.log(
      '\n💡 Note: User data is created through Cognito registration.'
    );
    console.log('='.repeat(50));
  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
    throw error;
  }
};

// Run the seed function if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('\n✨ All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
