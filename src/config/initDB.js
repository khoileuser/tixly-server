const {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} = require('@aws-sdk/client-dynamodb');

/**
 * Initialize DynamoDB tables for the ticketing platform
 * Creates tables if they don't exist
 */
const initializeTables = async (dynamoClient) => {
  console.log('Initializing DynamoDB tables...');

  const tables = [
    {
      name: 'Users',
      schema: {
        TableName: 'Users',
        KeySchema: [{ AttributeName: 'cognitoId', KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: 'cognitoId', AttributeType: 'S' },
          { AttributeName: 'email', AttributeType: 'S' },
          { AttributeName: 'username', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'EmailIndex',
            KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
          {
            IndexName: 'UsernameIndex',
            KeySchema: [{ AttributeName: 'username', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
    },
    {
      name: 'Events',
      schema: {
        TableName: 'Events',
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
          { AttributeName: 'date', AttributeType: 'S' },
          { AttributeName: 'status', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'DateIndex',
            KeySchema: [{ AttributeName: 'date', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
          {
            IndexName: 'StatusIndex',
            KeySchema: [{ AttributeName: 'status', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
    },
    {
      name: 'Categories',
      schema: {
        TableName: 'Categories',
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
    },
    {
      name: 'Tickets',
      schema: {
        TableName: 'Tickets',
        KeySchema: [{ AttributeName: 'ticketId', KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: 'ticketId', AttributeType: 'S' },
          { AttributeName: 'eventId', AttributeType: 'S' },
          { AttributeName: 'userId', AttributeType: 'S' },
          { AttributeName: 'status', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'EventIdIndex',
            KeySchema: [{ AttributeName: 'eventId', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
          {
            IndexName: 'UserIdIndex',
            KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
          {
            IndexName: 'StatusIndex',
            KeySchema: [{ AttributeName: 'status', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
    },
  ];

  const results = await Promise.allSettled(
    tables.map((table) => createTableIfNotExists(dynamoClient, table))
  );

  // Log results
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`✓ ${tables[index].name} table: ${result.value}`);
    } else {
      console.error(
        `✗ ${tables[index].name} table failed:`,
        result.reason.message
      );
    }
  });

  const allSucceeded = results.every((result) => result.status === 'fulfilled');
  if (allSucceeded) {
    console.log('All tables initialized successfully!');
  } else {
    console.warn('Some tables failed to initialize');
  }

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
