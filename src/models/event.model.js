const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');

/**
 * Event Model
 * Defines the structure and validation for Event items in DynamoDB
 */

const tableName = 'Events';

// DynamoDB Table Schema (for table creation)
const tableSchema = {
  TableName: tableName,
  KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
  AttributeDefinitions: [
    { AttributeName: 'id', AttributeType: 'S' },
    { AttributeName: 'datetime', AttributeType: 'S' },
    { AttributeName: 'status', AttributeType: 'S' },
  ],
  BillingMode: 'PAY_PER_REQUEST',
  GlobalSecondaryIndexes: [
    {
      IndexName: 'DatetimeIndex',
      KeySchema: [{ AttributeName: 'datetime', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'StatusIndex',
      KeySchema: [{ AttributeName: 'status', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
};

// Validation Schema
const validationSchema = Joi.object({
  id: Joi.string().uuid().optional(),
  title: Joi.string().required().min(3).max(200),
  description: Joi.string().required().min(10).max(2000),
  datetime: Joi.string().isoDate().required(),
  location: Joi.string().required().min(3).max(300),
  venue: Joi.string().optional().max(200),
  categoryIds: Joi.array().items(Joi.string().uuid()).default([]),
  pricePerSeat: Joi.number().min(0).required(),
  totalSeats: Joi.number().integer().min(1).required(),
  seatsPerRow: Joi.number().integer().min(1).optional(),
  takenSeats: Joi.array()
    .items(Joi.alternatives().try(Joi.number(), Joi.string()))
    .default([]),
  organizerName: Joi.string().required(),
  imageUrl: Joi.string().uri().optional(),
  status: Joi.string().valid('PUBLISHED', 'DRAFT').default('DRAFT'),
  createdAt: Joi.string().isoDate().optional(),
  updatedAt: Joi.string().isoDate().optional(),
});

/**
 * Validate event data
 * @param {Object} data - Event data to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validated and sanitized data
 */
const validate = (data, options = {}) => {
  const { error, value } = validationSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    ...options,
  });

  if (error) {
    const errors = error.details.map((detail) => detail.message);
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  return value;
};

/**
 * Prepare event data for creation
 * Adds auto-generated fields like id, timestamps
 * @param {Object} data - Raw event data
 * @returns {Object} Event data ready for DynamoDB
 */
const prepareForCreation = (data) => {
  const now = new Date().toISOString();

  return {
    ...data,
    id: data.id || uuidv4(),
    status: data.status || 'DRAFT',
    takenSeats: data.takenSeats || [],
    categoryIds: data.categoryIds || [],
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Prepare event data for update
 * Updates the updatedAt timestamp
 * @param {Object} data - Update data
 * @returns {Object} Update data with timestamp
 */
const prepareForUpdate = (data) => {
  return {
    ...data,
    updatedAt: new Date().toISOString(),
  };
};

/**
 * Calculate available seats for an event
 * @param {Object} event - Event object
 * @returns {number} Number of available seats
 */
const calculateAvailableSeats = (event) => {
  return event.totalSeats - (event.takenSeats?.length || 0);
};

/**
 * Check if event is bookable
 * @param {Object} event - Event object
 * @returns {boolean} True if event can be booked
 */
const isBookable = (event) => {
  if (event.status !== 'PUBLISHED') return false;
  if (calculateAvailableSeats(event) <= 0) return false;

  const eventDate = new Date(event.datetime);
  const now = new Date();

  return eventDate > now;
};

/**
 * Get event status based on date
 * @param {Object} event - Event object
 * @returns {string} 'upcoming' or 'past'
 */
const getTimeStatus = (event) => {
  const eventDate = new Date(event.datetime);
  const now = new Date();

  return eventDate > now ? 'upcoming' : 'past';
};

module.exports = {
  tableName,
  tableSchema,
  validationSchema,
  validate,
  prepareForCreation,
  prepareForUpdate,
  calculateAvailableSeats,
  isBookable,
  getTimeStatus,
};
