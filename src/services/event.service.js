const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

let dynamoDb;

/**
 * Initialize DynamoDB client
 */
const initDynamoDB = (config) => {
  const client = new DynamoDBClient({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestHandler: new NodeHttpHandler({
      http2: false,
    }),
  });

  dynamoDb = DynamoDBDocumentClient.from(client);
};

/**
 * Get event by ID
 */
const getEventById = async (eventId) => {
  try {
    const command = new GetCommand({
      TableName: 'Events',
      Key: {
        id: eventId,
      },
    });

    const response = await dynamoDb.send(command);

    if (!response.Item) {
      return {
        success: false,
        message: 'Event not found',
      };
    }

    return {
      success: true,
      data: response.Item,
    };
  } catch (error) {
    console.error('Error getting event:', error);
    throw new Error('Failed to retrieve event');
  }
};

/**
 * Get all events with optional filters
 */
const getAllEvents = async (filters = {}) => {
  try {
    const { status, categoryId, limit = 50 } = filters;

    let command;

    // If filtering by status, use the StatusDateIndex GSI
    if (status) {
      command = new QueryCommand({
        TableName: 'Events',
        IndexName: 'StatusDateIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
        },
        Limit: limit,
      });
    } else {
      // Otherwise, scan the table
      command = new ScanCommand({
        TableName: 'Events',
        Limit: limit,
      });
    }

    const response = await dynamoDb.send(command);

    let events = response.Items || [];

    // Filter by category if specified
    if (categoryId) {
      events = events.filter((event) => event.categoryId === categoryId);
    }

    return {
      success: true,
      data: events,
      count: events.length,
    };
  } catch (error) {
    console.error('Error getting events:', error);
    throw new Error('Failed to retrieve events');
  }
};

/**
 * Get events by category
 */
const getEventsByCategory = async (categoryId) => {
  try {
    const command = new ScanCommand({
      TableName: 'Events',
      FilterExpression: 'categoryId = :categoryId',
      ExpressionAttributeValues: {
        ':categoryId': categoryId,
      },
    });

    const response = await dynamoDb.send(command);

    return {
      success: true,
      data: response.Items || [],
      count: response.Items?.length || 0,
    };
  } catch (error) {
    console.error('Error getting events by category:', error);
    throw new Error('Failed to retrieve events');
  }
};

/**
 * Get upcoming events (events with status 'upcoming')
 */
const getUpcomingEvents = async (limit = 20) => {
  try {
    const command = new QueryCommand({
      TableName: 'Events',
      IndexName: 'StatusDateIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': 'upcoming',
      },
      Limit: limit,
      ScanIndexForward: true, // Sort by date ascending (earliest first)
    });

    const response = await dynamoDb.send(command);

    return {
      success: true,
      data: response.Items || [],
      count: response.Items?.length || 0,
    };
  } catch (error) {
    console.error('Error getting upcoming events:', error);
    throw new Error('Failed to retrieve upcoming events');
  }
};

/**
 * Get all categories
 */
const getAllCategories = async () => {
  try {
    const command = new ScanCommand({
      TableName: 'Categories',
    });

    const response = await dynamoDb.send(command);

    return {
      success: true,
      data: response.Items || [],
      count: response.Items?.length || 0,
    };
  } catch (error) {
    console.error('Error getting categories:', error);
    throw new Error('Failed to retrieve categories');
  }
};

module.exports = {
  initDynamoDB,
  getEventById,
  getAllEvents,
  getEventsByCategory,
  getUpcomingEvents,
  getAllCategories,
};
