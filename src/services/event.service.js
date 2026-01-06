const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const { EventModel } = require('../models');
const s3Service = require('./s3.service');
const { cache } = require('../config/redis');

let dynamoDb;

// Cache TTL in seconds
const CACHE_TTL = {
  EVENT_BY_ID: 300, // 5 minutes
  ALL_EVENTS: 60, // 1 minute
  EVENTS_BY_CATEGORY: 120, // 2 minutes
};

/**
 * Initialize DynamoDB client
 */
const initDynamoDB = (config) => {
  const clientConfig = {
    region: config.region,
    requestHandler: new NodeHttpHandler({
      http2: false,
    }),
  };

  // Only set endpoint if provided (for local development)
  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
    console.log('[EventService] Using DynamoDB endpoint:', config.endpoint);
  } else {
    console.log('[EventService] Using AWS DynamoDB in region:', config.region);
  }

  // Only set explicit credentials if BOTH are provided and not empty
  // In ECS, credentials will be automatically obtained from IAM role
  if (
    config.accessKeyId &&
    config.secretAccessKey &&
    config.accessKeyId.trim() &&
    config.secretAccessKey.trim()
  ) {
    console.log('[EventService] Using explicit credentials');
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  } else {
    console.log('[EventService] Using IAM role credentials');
  }

  const client = new DynamoDBClient(clientConfig);
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
    // Try cache first
    const cacheKey = `event:${eventId}`;
    const cachedEvent = await cache.get(cacheKey);
    
    if (cachedEvent) {
      console.log(`[EventService] Cache HIT for event: ${eventId}`);
      return {
        success: true,
        data: enrichEvent(cachedEvent),
      };
    }

    console.log(`[EventService] Cache MISS for event: ${eventId}`);

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

    // Cache the result
    await cache.set(cacheKey, response.Item, CACHE_TTL.EVENT_BY_ID);

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

    // Create cache key based on filters
    const cacheKey = `events:all:${status || 'all'}:${categoryId || 'all'}:${limit}:${includeUnpublished}`;
    const cachedEvents = await cache.get(cacheKey);
    
    if (cachedEvents) {
      console.log(`[EventService] Cache HIT for events list`);
      return {
        success: true,
        data: cachedEvents.map(enrichEvent),
        count: cachedEvents.length,
      };
    }

    console.log(`[EventService] Cache MISS for events list`);

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

    // Cache the results (cache raw data, not enriched)
    const rawEvents = events.map(e => {
      const { timeStatus, availableSeats, isBookable, ...raw } = e;
      return raw;
    });
    await cache.set(cacheKey, rawEvents, CACHE_TTL.ALL_EVENTS);

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
 * Get events happening this week (Monday to Sunday)
 */
const getThisWeekEvents = async (limit = 20) => {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Calculate start of this week (Monday 00:00)
    let daysUntilMonday = 1 - dayOfWeek;
    if (daysUntilMonday > 0) daysUntilMonday -= 7; // If we're past Monday, go to last Monday

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + daysUntilMonday);
    weekStart.setHours(0, 0, 0, 0);

    // Calculate end of week (Sunday 23:59:59)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const command = new ScanCommand({
      TableName: EventModel.tableName,
      FilterExpression:
        '#datetime >= :start AND #datetime <= :end AND #status = :published',
      ExpressionAttributeNames: {
        '#datetime': 'datetime',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':start': weekStart.toISOString(),
        ':end': weekEnd.toISOString(),
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
        start: weekStart.toISOString(),
        end: weekEnd.toISOString(),
      },
    };
  } catch (error) {
    console.error('Error getting this week events:', error);
    throw new Error('Failed to retrieve this week events');
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

/**
 * Create a new event
 * @param {Object} eventData - Event data
 * @returns {Object} Created event
 */
const createEvent = async (eventData) => {
  try {
    // Validate event data
    const validatedData = EventModel.validate(eventData);

    // Prepare for creation (adds id, timestamps)
    const event = EventModel.prepareForCreation(validatedData);

    const command = new PutCommand({
      TableName: EventModel.tableName,
      Item: event,
    });

    await dynamoDb.send(command);

    // Invalidate all events list cache
    await cache.delPattern('events:all:*');
    console.log('[EventService] Invalidated events list cache after create');

    return {
      success: true,
      data: enrichEvent(event),
      message: 'Event created successfully',
    };
  } catch (error) {
    console.error('Error creating event:', error);
    return {
      success: false,
      message: error.message || 'Failed to create event',
    };
  }
};

/**
 * Update an existing event
 * @param {string} eventId - Event ID
 * @param {Object} updateData - Data to update
 * @returns {Object} Updated event
 */
const updateEvent = async (eventId, updateData) => {
  try {
    // First, get the existing event
    const existingResult = await getEventById(eventId);
    if (!existingResult.success) {
      return {
        success: false,
        message: 'Event not found',
      };
    }

    // Merge existing data with updates
    const existingEvent = existingResult.data;
    const mergedData = {
      ...existingEvent,
      ...updateData,
      id: eventId, // Ensure ID doesn't change
      takenSeats: existingEvent.takenSeats, // Preserve taken seats
      createdAt: existingEvent.createdAt, // Preserve created timestamp
    };

    // Validate merged data
    const validatedData = EventModel.validate(mergedData);

    // Prepare for update (adds updatedAt)
    const updatedEvent = EventModel.prepareForUpdate(validatedData);

    const command = new PutCommand({
      TableName: EventModel.tableName,
      Item: updatedEvent,
    });

    await dynamoDb.send(command);

    // Invalidate cache for this event and all events lists
    await cache.del(`event:${eventId}`);
    await cache.delPattern('events:all:*');
    console.log(`[EventService] Invalidated cache for event: ${eventId}`);

    return {
      success: true,
      data: enrichEvent(updatedEvent),
      message: 'Event updated successfully',
    };
  } catch (error) {
    console.error('Error updating event:', error);
    return {
      success: false,
      message: error.message || 'Failed to update event',
    };
  }
};

/**
 * Delete an event
 * @param {string} eventId - Event ID
 * @returns {Object} Deletion result
 */
const deleteEvent = async (eventId) => {
  try {
    // First, get the existing event to delete its image if exists
    const existingResult = await getEventById(eventId);
    if (!existingResult.success) {
      return {
        success: false,
        message: 'Event not found',
      };
    }

    const existingEvent = existingResult.data;

    // Delete image from S3 if exists
    if (existingEvent.imageUrl) {
      try {
        await s3Service.deleteImage(existingEvent.imageUrl);
      } catch (imgError) {
        console.warn('Failed to delete event image:', imgError);
        // Continue with event deletion even if image deletion fails
      }
    }

    const command = new DeleteCommand({
      TableName: EventModel.tableName,
      Key: {
        id: eventId,
      },
    });

    await dynamoDb.send(command);

    // Invalidate cache for this event and all events lists
    await cache.del(`event:${eventId}`);
    await cache.delPattern('events:all:*');
    console.log(`[EventService] Invalidated cache for deleted event: ${eventId}`);

    return {
      success: true,
      message: 'Event deleted successfully',
    };
  } catch (error) {
    console.error('Error deleting event:', error);
    return {
      success: false,
      message: error.message || 'Failed to delete event',
    };
  }
};

/**
 * Get all events for admin (including drafts)
 * @param {Object} filters - Filter options
 * @returns {Object} List of events
 */
const getAdminEvents = async (filters = {}) => {
  try {
    const { status, search, limit = 100, offset = 0 } = filters;

    let command;

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
      command = new ScanCommand({
        TableName: EventModel.tableName,
      });
    }

    const response = await dynamoDb.send(command);
    let events = (response.Items || []).map(enrichEvent);

    // Apply search filter
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

    // Sort by created date (newest first)
    events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalCount = events.length;

    // Apply pagination
    events = events.slice(offset, offset + limit);

    return {
      success: true,
      data: events,
      count: events.length,
      totalCount,
    };
  } catch (error) {
    console.error('Error getting admin events:', error);
    throw new Error('Failed to retrieve events');
  }
};

/**
 * Upload event image to S3
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - Original file name
 * @param {string} mimeType - MIME type
 * @returns {Object} Upload result
 */
const uploadEventImage = async (fileBuffer, fileName, mimeType) => {
  return await s3Service.uploadImage(fileBuffer, fileName, mimeType);
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
  getThisWeekEvents,
  getThisMonthEvents,
  getFeaturedEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getAdminEvents,
  uploadEventImage,
};
