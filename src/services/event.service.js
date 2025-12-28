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

/**
 * Search and filter events
 * @param {Object} params - Search parameters
 * @param {string} params.search - Search query for title/description/venue
 * @param {string} params.categoryId - Filter by category
 * @param {string} params.dateFrom - Filter events from this date
 * @param {string} params.dateTo - Filter events until this date
 * @param {number} params.priceMin - Minimum price filter
 * @param {number} params.priceMax - Maximum price filter
 * @param {string} params.location - Filter by location
 * @param {string} params.sortBy - Sort field (date, price, title)
 * @param {string} params.sortOrder - Sort order (asc, desc)
 * @param {number} params.limit - Max results
 * @param {number} params.offset - Pagination offset
 */
const searchEvents = async (params = {}) => {
  try {
    const {
      search,
      categoryId,
      dateFrom,
      dateTo,
      priceMin,
      priceMax,
      location,
      sortBy = 'date',
      sortOrder = 'asc',
      limit = 50,
      offset = 0,
    } = params;

    // Start with a scan for PUBLISHED events
    const command = new ScanCommand({
      TableName: EventModel.tableName,
      FilterExpression: '#status = :published',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':published': 'PUBLISHED',
      },
    });

    const response = await dynamoDb.send(command);
    let events = (response.Items || []).map(enrichEvent);

    // Filter only upcoming events
    const now = new Date();
    events = events.filter((event) => new Date(event.datetime) > now);

    // Apply search filter (title, description, venue, location)
    if (search) {
      const searchLower = search.toLowerCase();
      events = events.filter(
        (event) =>
          event.title?.toLowerCase().includes(searchLower) ||
          event.description?.toLowerCase().includes(searchLower) ||
          event.venue?.toLowerCase().includes(searchLower) ||
          event.location?.toLowerCase().includes(searchLower)
      );
    }

    // Filter by category
    if (categoryId) {
      events = events.filter(
        (event) => event.categoryIds && event.categoryIds.includes(categoryId)
      );
    }

    // Filter by date range
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      events = events.filter((event) => new Date(event.datetime) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      events = events.filter((event) => new Date(event.datetime) <= toDate);
    }

    // Filter by price range
    if (priceMin !== undefined && priceMin !== null) {
      events = events.filter((event) => event.pricePerSeat >= priceMin);
    }
    if (priceMax !== undefined && priceMax !== null) {
      events = events.filter((event) => event.pricePerSeat <= priceMax);
    }

    // Filter by location
    if (location) {
      const locationLower = location.toLowerCase();
      events = events.filter(
        (event) =>
          event.location?.toLowerCase().includes(locationLower) ||
          event.venue?.toLowerCase().includes(locationLower)
      );
    }

    // Sort events
    events.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'price':
          comparison = a.pricePerSeat - b.pricePerSeat;
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'date':
        default:
          comparison = new Date(a.datetime) - new Date(b.datetime);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    const totalCount = events.length;

    // Apply pagination
    events = events.slice(offset, offset + limit);

    return {
      success: true,
      data: events,
      count: events.length,
      totalCount,
      hasMore: offset + events.length < totalCount,
    };
  } catch (error) {
    console.error('Error searching events:', error);
    throw new Error('Failed to search events');
  }
};

/**
 * Get trending events (events with most bookings/least available seats)
 */
const getTrendingEvents = async (limit = 10) => {
  try {
    const now = new Date().toISOString();

    const command = new ScanCommand({
      TableName: EventModel.tableName,
      FilterExpression: '#datetime > :now AND #status = :published',
      ExpressionAttributeNames: {
        '#datetime': 'datetime',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':now': now,
        ':published': 'PUBLISHED',
      },
    });

    const response = await dynamoDb.send(command);
    let events = (response.Items || []).map(enrichEvent);

    // Sort by booking percentage (most booked first)
    events.sort((a, b) => {
      const aBookedPercentage =
        (a.totalSeats - a.availableSeats) / a.totalSeats;
      const bBookedPercentage =
        (b.totalSeats - b.availableSeats) / b.totalSeats;
      return bBookedPercentage - aBookedPercentage;
    });

    // Apply limit
    events = events.slice(0, limit);

    return {
      success: true,
      data: events,
      count: events.length,
    };
  } catch (error) {
    console.error('Error getting trending events:', error);
    throw new Error('Failed to retrieve trending events');
  }
};

/**
 * Get events happening this weekend (Friday to Sunday)
 */
const getWeekendEvents = async (limit = 20) => {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Calculate start of this weekend (Friday 00:00)
    let daysUntilFriday = 5 - dayOfWeek;
    if (daysUntilFriday < 0) daysUntilFriday += 7;
    if (dayOfWeek === 0) daysUntilFriday = -2; // If Sunday, go back to Friday
    if (dayOfWeek === 6) daysUntilFriday = -1; // If Saturday, go back to Friday

    const weekendStart = new Date(now);
    weekendStart.setDate(now.getDate() + daysUntilFriday);
    weekendStart.setHours(0, 0, 0, 0);

    // Calculate end of weekend (Sunday 23:59:59)
    const weekendEnd = new Date(weekendStart);
    weekendEnd.setDate(weekendStart.getDate() + 2);
    weekendEnd.setHours(23, 59, 59, 999);

    const command = new ScanCommand({
      TableName: EventModel.tableName,
      FilterExpression:
        '#datetime >= :start AND #datetime <= :end AND #status = :published',
      ExpressionAttributeNames: {
        '#datetime': 'datetime',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':start': weekendStart.toISOString(),
        ':end': weekendEnd.toISOString(),
        ':published': 'PUBLISHED',
      },
    });

    const response = await dynamoDb.send(command);
    let events = (response.Items || []).map(enrichEvent);

    // Sort by datetime
    events.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    // Apply limit
    events = events.slice(0, limit);

    return {
      success: true,
      data: events,
      count: events.length,
      dateRange: {
        start: weekendStart.toISOString(),
        end: weekendEnd.toISOString(),
      },
    };
  } catch (error) {
    console.error('Error getting weekend events:', error);
    throw new Error('Failed to retrieve weekend events');
  }
};

/**
 * Get events happening this month
 */
const getThisMonthEvents = async (limit = 20) => {
  try {
    const now = new Date();

    // Start from now
    const monthStart = now.toISOString();

    // End of current month
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    const command = new ScanCommand({
      TableName: EventModel.tableName,
      FilterExpression:
        '#datetime >= :start AND #datetime <= :end AND #status = :published',
      ExpressionAttributeNames: {
        '#datetime': 'datetime',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':start': monthStart,
        ':end': monthEnd.toISOString(),
        ':published': 'PUBLISHED',
      },
    });

    const response = await dynamoDb.send(command);
    let events = (response.Items || []).map(enrichEvent);

    // Sort by datetime
    events.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    // Apply limit
    events = events.slice(0, limit);

    return {
      success: true,
      data: events,
      count: events.length,
      dateRange: {
        start: monthStart,
        end: monthEnd.toISOString(),
      },
    };
  } catch (error) {
    console.error('Error getting this month events:', error);
    throw new Error('Failed to retrieve this month events');
  }
};

/**
 * Get featured events for carousel (upcoming events with images, sorted by date)
 */
const getFeaturedEvents = async (limit = 5) => {
  try {
    const now = new Date().toISOString();

    const command = new ScanCommand({
      TableName: EventModel.tableName,
      FilterExpression:
        '#datetime > :now AND #status = :published AND attribute_exists(imageUrl)',
      ExpressionAttributeNames: {
        '#datetime': 'datetime',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':now': now,
        ':published': 'PUBLISHED',
      },
    });

    const response = await dynamoDb.send(command);
    let events = (response.Items || []).map(enrichEvent);

    // Filter events that have images
    events = events.filter((event) => event.imageUrl);

    // Sort by datetime (soonest first)
    events.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    // Apply limit
    events = events.slice(0, limit);

    return {
      success: true,
      data: events,
      count: events.length,
    };
  } catch (error) {
    console.error('Error getting featured events:', error);
    throw new Error('Failed to retrieve featured events');
  }
};

module.exports = {
  initDynamoDB,
  getEventById,
  getAllEvents,
  getEventsByCategory,
  getUpcomingEvents,
  getAllCategories,
  searchEvents,
  getTrendingEvents,
  getWeekendEvents,
  getThisMonthEvents,
  getFeaturedEvents,
};
