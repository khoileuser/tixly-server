const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const { EventModel } = require('../models');

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
 * Enrich event with dynamic fields using model helper methods
 */
const enrichEvent = (event) => {
  if (!event) return null;

  return {
    ...event,
    timeStatus: EventModel.getTimeStatus(event), // upcoming or past
    availableSeats: EventModel.calculateAvailableSeats(event),
    isBookable: EventModel.isBookable(event),
    // status field from DB remains as is (PUBLISHED or DRAFT)
  };
};

/**
 * Get event by ID
 */
const getEventById = async (eventId) => {
  try {
    const command = new GetCommand({
      TableName: EventModel.tableName,
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
      data: enrichEvent(response.Item),
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
    const {
      status,
      categoryId,
      limit = 50,
      includeUnpublished = false,
    } = filters;

    let command;

    // If filtering by publication status (PUBLISHED/DRAFT), use StatusIndex
    if (status && (status === 'PUBLISHED' || status === 'DRAFT')) {
      command = new QueryCommand({
        TableName: EventModel.tableName,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
        },
      });
    } else {
      // Otherwise scan - for public API, default to only PUBLISHED events
      command = new ScanCommand({
        TableName: EventModel.tableName,
        FilterExpression: includeUnpublished
          ? undefined
          : '#status = :published',
        ExpressionAttributeNames: includeUnpublished
          ? undefined
          : {
              '#status': 'status',
            },
        ExpressionAttributeValues: includeUnpublished
          ? undefined
          : {
              ':published': 'PUBLISHED',
            },
      });
    }

    const response = await dynamoDb.send(command);

    let events = (response.Items || []).map(enrichEvent);

    // Filter by category if specified (check if categoryId is in categoryIds array)
    if (categoryId) {
      events = events.filter(
        (event) => event.categoryIds && event.categoryIds.includes(categoryId)
      );
    }

    // Sort by datetime
    events.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    // Apply limit after filtering
    events = events.slice(0, limit);

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
const getEventsByCategory = async (categoryId, includeUnpublished = false) => {
  try {
    const command = new ScanCommand({
      TableName: EventModel.tableName,
      FilterExpression: includeUnpublished
        ? 'contains(categoryIds, :categoryId)'
        : 'contains(categoryIds, :categoryId) AND #status = :published',
      ExpressionAttributeNames: includeUnpublished
        ? undefined
        : {
            '#status': 'status',
          },
      ExpressionAttributeValues: includeUnpublished
        ? {
            ':categoryId': categoryId,
          }
        : {
            ':categoryId': categoryId,
            ':published': 'PUBLISHED',
          },
    });

    const response = await dynamoDb.send(command);

    const events = (response.Items || []).map(enrichEvent);

    return {
      success: true,
      data: events,
      count: events.length,
    };
  } catch (error) {
    console.error('Error getting events by category:', error);
    throw new Error('Failed to retrieve events');
  }
};

/**
 * Get upcoming events (events with date in the future and PUBLISHED status)
 */
const getUpcomingEvents = async (limit = 20, includeUnpublished = false) => {
  try {
    const now = new Date().toISOString();

    const command = new ScanCommand({
      TableName: EventModel.tableName,
      FilterExpression: includeUnpublished
        ? '#datetime > :now'
        : '#datetime > :now AND #status = :published',
      ExpressionAttributeNames: includeUnpublished
        ? {
            '#datetime': 'datetime',
          }
        : {
            '#datetime': 'datetime',
            '#status': 'status',
          },
      ExpressionAttributeValues: includeUnpublished
        ? {
            ':now': now,
          }
        : {
            ':now': now,
            ':published': 'PUBLISHED',
          },
    });

    const response = await dynamoDb.send(command);

    let events = (response.Items || []).map(enrichEvent);

    // Sort by datetime ascending (earliest first)
    events.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    // Apply limit
    events = events.slice(0, limit);

    return {
      success: true,
      data: events,
      count: events.length,
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
