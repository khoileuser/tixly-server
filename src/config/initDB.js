const {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} = require('@aws-sdk/client-dynamodb');
const {
  UserModel,
  EventModel,
  BookingModel,
  CategoryModel,
} = require('../models');

/**
 * Initialize DynamoDB tables for the ticketing platform
 * Creates tables if they don't exist
 */
const initializeTables = async (dynamoClient) => {
  console.log('Initializing DynamoDB tables...');

  const tables = [
    {
      name: 'Users',
      schema: UserModel.tableSchema,
    },
    {
      name: 'Events',
      schema: EventModel.tableSchema,
    },
    {
      name: 'Tickets',
      schema: BookingModel.tableSchema,
    },
    {
      name: 'Categories',
      schema: CategoryModel.tableSchema,
    },
  ];

  const results = await Promise.allSettled(
    tables.map((table) => createTableIfNotExists(dynamoClient, table))
  );

  // Log results (only log when tables are created or failed)
  const createdTables = [];
  const failedTables = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      if (result.value === 'Created successfully') {
        createdTables.push(tables[index].name);
        console.log(`${tables[index].name} table: Created successfully`);
      }
    } else {
      failedTables.push(tables[index].name);
      console.error(
        `${tables[index].name} table failed:`,
        result.reason.message
      );
    }
  });

  // Only show summary if tables were created or failed
  if (createdTables.length > 0) {
    console.log(
      `Database initialization complete. Created ${createdTables.length} table(s).`
    );
  }

  if (failedTables.length > 0) {
    console.warn('Some tables failed to initialize');
  }

  const allSucceeded = results.every((result) => result.status === 'fulfilled');
  return allSucceeded;
};

/**
 * Check if a table exists and create it if it doesn't
 */
const createTableIfNotExists = async (dynamoClient, { name, schema }) => {
  try {
    // Check if table exists
    await dynamoClient.send(
      new DescribeTableCommand({ TableName: schema.TableName })
    );
    return 'Already exists';
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      // Table doesn't exist, create it
      try {
        await dynamoClient.send(new CreateTableCommand(schema));
        // Wait for table to become active
        await waitForTableActive(dynamoClient, schema.TableName);
        return 'Created successfully';
      } catch (createError) {
        throw new Error(`Failed to create table: ${createError.message}`);
      }
    } else {
      throw new Error(`Failed to describe table: ${error.message}`);
    }
  }
};

/**
 * Wait for a table to become active after creation
 */
const waitForTableActive = async (
  dynamoClient,
  tableName,
  maxAttempts = 30
) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await dynamoClient.send(
        new DescribeTableCommand({ TableName: tableName })
      );
      if (response.Table.TableStatus === 'ACTIVE') {
        return true;
      }
      // Wait 1 second before next check
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      throw new Error(
        `Error waiting for table to become active: ${error.message}`
      );
    }
  }
  throw new Error(`Table ${tableName} did not become active in time`);
};

module.exports = initializeTables;
