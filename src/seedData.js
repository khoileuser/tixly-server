const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const {
  DeleteTableCommand,
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
  waitUntilTableNotExists,
} = require('@aws-sdk/client-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const { EventModel } = require('./models');

// Load environment variables
require('dotenv').config();

// Check for force flag
const FORCE_RESEED = process.argv.includes('--force');

// Initialize DynamoDB client with proper credentials
const clientConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
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
  console.warn('Warning: AWS credentials not found in environment variables.');
  console.warn(
    '   The script will use default AWS credential chain (IAM roles, ~/.aws/credentials, etc.)'
  );
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
 * Clear all data from a table
 */
const clearTable = async (tableName) => {
  try {
    console.log(`Clearing ${tableName}...`);
    const scanCommand = new ScanCommand({
      TableName: tableName,
    });
    const response = await dynamoDb.send(scanCommand);

    if (response.Items.length === 0) {
      console.log(`   No items to clear in ${tableName}`);
      return;
    }

    // Determine the primary key
    let keyName = 'id';
    if (tableName === 'Tickets') {
      keyName = 'id'; // Tickets table uses 'id' as primary key
    }

    // Delete all items
    for (const item of response.Items) {
      await dynamoDb.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { [keyName]: item[keyName] },
        })
      );
    }

    console.log(`   Cleared ${response.Items.length} items from ${tableName}`);
  } catch (error) {
    console.error(`   Error clearing ${tableName}:`, error.message);
  }
};

/**
 * Delete and recreate the Events table with proper indexes
 */
const recreateEventsTable = async () => {
  try {
    console.log('\nRecreating Events table with StatusIndex...');

    // Try to delete the table if it exists
    try {
      console.log('   Deleting existing Events table...');
      await client.send(new DeleteTableCommand({ TableName: 'Events' }));

      // Wait for table to be deleted
      console.log('   Waiting for table deletion...');
      await waitUntilTableNotExists(
        {
          client,
          maxWaitTime: 60,
          minDelay: 2,
          maxDelay: 5,
        },
        { TableName: 'Events' }
      );
      console.log('   Table deleted successfully');
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log('   Table does not exist, will create new one');
      } else {
        throw error;
      }
    }

    // Create the table with the proper schema including StatusIndex
    console.log('   Creating Events table with StatusIndex...');
    await client.send(new CreateTableCommand(EventModel.tableSchema));

    // Wait for table to be active
    console.log('   Waiting for table to become active...');
    await waitUntilTableExists(
      {
        client,
        maxWaitTime: 60,
        minDelay: 2,
        maxDelay: 5,
      },
      { TableName: 'Events' }
    );

    console.log('   Events table recreated successfully with StatusIndex!');
    return true;
  } catch (error) {
    console.error('   Error recreating Events table:', error.message);
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
    console.log(`Inserted item into ${tableName}: ${item.id || item.name}`);
  } catch (error) {
    console.error(`Error inserting into ${tableName}:`, error.message);
  }
};

/**
 * Seed Categories table
 */
const seedCategories = async () => {
  console.log('\nSeeding Categories...');

  if (FORCE_RESEED) {
    await clearTable('Categories');
  } else if (!(await isTableEmpty('Categories'))) {
    console.log('Categories table already has data. Skipping...');
    return [];
  }

  const categories = [
    {
      id: uuidv4(),
      name: 'Music',
      description: 'Concerts, festivals, and live music performances',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Sports',
      description: 'Sporting events, matches, and tournaments',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Theater',
      description: 'Plays, musicals, and theatrical performances',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Comedy',
      description: 'Stand-up comedy shows and comedy events',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Conference',
      description: 'Business conferences, seminars, and workshops',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Food & Drink',
      description: 'Food festivals, wine tastings, and culinary events',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Art & Culture',
      description: 'Art exhibitions, gallery openings, and cultural events',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Family',
      description: 'Family-friendly events and activities',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Wellness',
      description: 'Yoga, meditation, fitness, and wellness events',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'Nightlife',
      description: 'Clubs, parties, and nightlife events',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
  console.log('\nSeeding Events...');

  if (FORCE_RESEED) {
    await clearTable('Events');
  } else if (!(await isTableEmpty('Events'))) {
    console.log('Events table already has data. Skipping...');
    return [];
  }

  // Helper function to get future dates with time
  const getFutureDateTime = (daysFromNow, hour = 19, minute = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };

  const events = [
    {
      id: uuidv4(),
      title: 'Summer Music Festival 2025',
      description:
        'A three-day outdoor music festival featuring top artists from around the world. Enjoy multiple stages, food vendors, and camping options.',
      datetime: getFutureDateTime(45, 14, 0),
      location: 'Central Park, New York, NY',
      venue: 'Central Park Main Stage',
      categoryIds: [
        categories.find((c) => c.name === 'Music')?.id || categories[0]?.id,
      ],
      pricePerSeat: 150.0,
      totalSeats: 5000,
      takenSeats: [],
      seatsPerRow: 20,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea',
      organizerName: 'Music Events Co.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'NBA Championship Finals - Game 5',
      description:
        'Watch the exciting NBA Championship Finals Game 5. Experience the thrill of professional basketball at its finest.',
      datetime: getFutureDateTime(30, 20, 0),
      location: 'Madison Square Garden, New York, NY',
      venue: 'Madison Square Garden',
      categoryIds: [
        categories.find((c) => c.name === 'Sports')?.id || categories[1]?.id,
      ],
      pricePerSeat: 250.0,
      totalSeats: 2000,
      takenSeats: [],
      seatsPerRow: 20,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc',
      organizerName: 'NBA Events',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Hamilton - Broadway Show',
      description:
        'The story of America then, told by America now. Experience the revolutionary musical phenomenon that is Hamilton.',
      datetime: getFutureDateTime(15, 20, 0),
      location: 'Richard Rodgers Theatre, New York, NY',
      venue: 'Richard Rodgers Theatre',
      categoryIds: [
        categories.find((c) => c.name === 'Theater')?.id || categories[2]?.id,
      ],
      pricePerSeat: 180.0,
      totalSeats: 800,
      takenSeats: [],
      seatsPerRow: 16,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1503095396549-807759245b35',
      organizerName: 'Broadway Productions',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Comedy Night with Dave Chappelle',
      description:
        'An evening of comedy with one of the greatest stand-up comedians of all time. Limited seats available!',
      datetime: getFutureDateTime(20, 21, 0),
      location: 'Comedy Cellar, New York, NY',
      venue: 'Comedy Cellar - Main Room',
      categoryIds: [
        categories.find((c) => c.name === 'Comedy')?.id || categories[3]?.id,
      ],
      pricePerSeat: 75.0,
      totalSeats: 300,
      takenSeats: [],
      seatsPerRow: 15,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca',
      organizerName: 'Comedy Central Productions',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'TechCrunch Disrupt 2025',
      description:
        "The world's leading authority in debuting revolutionary startups, introducing game-changing technologies and discussing what's top of mind for the tech industry.",
      datetime: getFutureDateTime(60, 9, 0),
      location: 'Moscone Center, San Francisco, CA',
      venue: 'Moscone Convention Center',
      categoryIds: [
        categories.find((c) => c.name === 'Conference')?.id ||
          categories[4]?.id,
      ],
      pricePerSeat: 500.0,
      totalSeats: 3000,
      takenSeats: [],
      seatsPerRow: 20,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
      organizerName: 'TechCrunch',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Food & Wine Festival',
      description:
        "Sample dishes from the city's best restaurants, attend cooking demonstrations, and enjoy wine tastings from renowned vineyards.",
      datetime: getFutureDateTime(25, 12, 0),
      location: 'Brooklyn Bridge Park, Brooklyn, NY',
      venue: 'Brooklyn Bridge Park',
      categoryIds: [
        categories.find((c) => c.name === 'Food & Drink')?.id ||
          categories[5]?.id,
      ],
      pricePerSeat: 85.0,
      totalSeats: 1500,
      takenSeats: [],
      seatsPerRow: 20,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1',
      organizerName: 'NYC Food Events',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Jazz Night at Blue Note',
      description:
        "An intimate evening featuring world-class jazz musicians in one of NYC's most iconic jazz clubs.",
      datetime: getFutureDateTime(10, 21, 30),
      location: 'Blue Note Jazz Club, New York, NY',
      venue: 'Blue Note Jazz Club',
      categoryIds: [
        categories.find((c) => c.name === 'Music')?.id || categories[0]?.id,
      ],
      pricePerSeat: 65.0,
      totalSeats: 200,
      takenSeats: [],
      seatsPerRow: 10,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f',
      organizerName: 'Blue Note Entertainment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'New York Marathon 2025',
      description:
        "Be part of the world's largest marathon! Run through all five boroughs of New York City.",
      datetime: getFutureDateTime(90, 8, 0),
      location: 'New York City, NY',
      venue: 'Starting Line: Staten Island',
      categoryIds: [
        categories.find((c) => c.name === 'Sports')?.id || categories[1]?.id,
      ],
      pricePerSeat: 295.0,
      totalSeats: 50000,
      takenSeats: [],
      seatsPerRow: 20,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3',
      organizerName: 'New York Road Runners',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Modern Art Exhibition',
      description:
        'Explore contemporary art from emerging and established artists. Features installations, paintings, sculptures, and digital art.',
      datetime: getFutureDateTime(12, 10, 0),
      location: 'MoMA, New York, NY',
      venue: 'Museum of Modern Art',
      categoryIds: [
        categories.find((c) => c.name === 'Art & Culture')?.id ||
          categories[6]?.id,
      ],
      pricePerSeat: 45.0,
      totalSeats: 500,
      takenSeats: [],
      seatsPerRow: 20,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5',
      organizerName: 'MoMA',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Kids Science Fair',
      description:
        'Interactive science demonstrations, experiments, and learning activities for children of all ages. Fun for the whole family!',
      datetime: getFutureDateTime(18, 10, 0),
      location: 'Discovery Center, Brooklyn, NY',
      venue: 'Discovery Science Center',
      categoryIds: [
        categories.find((c) => c.name === 'Family')?.id || categories[7]?.id,
      ],
      pricePerSeat: 35.0,
      totalSeats: 600,
      takenSeats: [],
      seatsPerRow: 20,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b',
      organizerName: 'Discovery Center',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Yoga & Meditation Retreat',
      description:
        'A day of mindfulness, yoga sessions, meditation workshops, and wellness talks. Find your inner peace and balance.',
      datetime: getFutureDateTime(35, 9, 0),
      location: 'Hudson Valley, NY',
      venue: 'Peaceful Retreat Center',
      categoryIds: [
        categories.find((c) => c.name === 'Wellness')?.id || categories[8]?.id,
      ],
      pricePerSeat: 120.0,
      totalSeats: 150,
      takenSeats: [],
      seatsPerRow: 15,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773',
      organizerName: 'Wellness Collective',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Electronic Music Night',
      description:
        'Dance the night away with top DJs spinning house, techno, and electronic beats. VIP tables available.',
      datetime: getFutureDateTime(8, 22, 0),
      location: 'Brooklyn Warehouse, Brooklyn, NY',
      venue: 'The Warehouse',
      categoryIds: [
        categories.find((c) => c.name === 'Nightlife')?.id || categories[9]?.id,
      ],
      pricePerSeat: 55.0,
      totalSeats: 800,
      takenSeats: [],
      seatsPerRow: 20,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3',
      organizerName: 'Nightlife Productions',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Rock Concert - The Legends Tour',
      description:
        'Classic rock legends reunite for an unforgettable night of greatest hits and fan favorites. Special guest performers.',
      datetime: getFutureDateTime(50, 20, 0),
      location: 'Barclays Center, Brooklyn, NY',
      venue: 'Barclays Center',
      categoryIds: [
        categories.find((c) => c.name === 'Music')?.id || categories[0]?.id,
      ],
      pricePerSeat: 135.0,
      totalSeats: 10000,
      takenSeats: [],
      seatsPerRow: 25,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4',
      organizerName: 'Live Nation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Wine Tasting Experience',
      description:
        'Sample premium wines from around the world. Learn about wine pairing, production, and tasting techniques from expert sommeliers.',
      datetime: getFutureDateTime(28, 18, 0),
      location: 'Tribeca, New York, NY',
      venue: 'The Wine Cellar',
      categoryIds: [
        categories.find((c) => c.name === 'Food & Drink')?.id ||
          categories[5]?.id,
      ],
      pricePerSeat: 95.0,
      totalSeats: 80,
      takenSeats: [],
      seatsPerRow: 10,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3',
      organizerName: 'Wine Enthusiast Events',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Shakespeare in the Park',
      description:
        "Experience the magic of Shakespeare performed outdoors under the stars. This season's production: A Midsummer Night's Dream.",
      datetime: getFutureDateTime(22, 19, 0),
      location: 'Central Park, New York, NY',
      venue: 'Delacorte Theater',
      categoryIds: [
        categories.find((c) => c.name === 'Theater')?.id || categories[2]?.id,
      ],
      pricePerSeat: 0.0,
      totalSeats: 1800,
      takenSeats: [],
      seatsPerRow: 20,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1516307365426-bea591f05011',
      organizerName: 'Public Theater',
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
 * Main seed function
 */
const seedDatabase = async () => {
  console.log('Starting database seeding...\n');
  if (FORCE_RESEED) {
    console.log('FORCE MODE: Clearing existing data before seeding\n');
  }
  console.log('='.repeat(50));

  try {
    // Recreate Events table with proper indexes
    console.log('\nStep 1: Recreating Events table with StatusIndex...');
    const tableRecreated = await recreateEventsTable();
    if (!tableRecreated) {
      throw new Error('Failed to recreate Events table');
    }

    // Seed in order: Categories -> Events
    console.log('\nStep 2: Seeding Categories...');
    const categories = await seedCategories();

    console.log('\nStep 3: Seeding Events...');
    const events = await seedEvents(categories);

    // Clear Tickets table in force mode
    if (FORCE_RESEED) {
      await clearTable('Tickets');
      console.log('\nCleaning up ticket references from Users table...');
      try {
        const usersResult = await dynamoDb.send(
          new ScanCommand({
            TableName: 'Users',
          })
        );

        if (usersResult.Items && usersResult.Items.length > 0) {
          for (const user of usersResult.Items) {
            // Remove tickets field if it exists
            if (user.tickets || user.ticketIds) {
              await dynamoDb.send(
                new PutCommand({
                  TableName: 'Users',
                  Item: {
                    ...user,
                    tickets: undefined,
                    ticketIds: undefined,
                  },
                })
              );
            }
          }
          console.log('   Cleaned up ticket references from Users table');
        }
      } catch (error) {
        console.error('   Error cleaning Users table:', error.message);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('Database seeding completed successfully!');
    console.log('\nSummary:');
    console.log(`   Events table recreated with StatusIndex`);
    console.log(`   Categories: ${categories.length} items`);
    console.log(`   Events: ${events.length} items`);
    console.log(
      '\nNote: Tickets are created through the booking system when users purchase tickets.'
    );
    console.log('Note: User data is created through Cognito registration.');
    if (!FORCE_RESEED && (categories.length === 0 || events.length === 0)) {
      console.log(
        '\nTip: Use --force flag to clear and re-seed existing data:'
      );
      console.log('   bun seed --force');
    }
    console.log('='.repeat(50));
  } catch (error) {
    console.error('\nError seeding database:', error);
    throw error;
  }
};

// Run the seed function if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('\nAll done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nSeeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
