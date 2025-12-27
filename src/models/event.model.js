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
};

// Validation Schema (similar to Mongoose schema)
const validationSchema = Joi.object({
  id: Joi.string().uuid().optional(), // Auto-generated if not provided
  name: Joi.string().required().min(3).max(200),
  description: Joi.string().required().min(10).max(2000),
  date: Joi.string().isoDate().required(),
  time: Joi.string()
    .required()
    .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:MM format
  location: Joi.string().required().min(3).max(300),
  category: Joi.string().required(),
  totalSeats: Joi.number().integer().min(1).required(),
  pricePerSeat: Joi.number().min(0).required(),
  status: Joi.string()
    .valid('active', 'cancelled', 'completed')
    .default('active'),
  imageUrl: Joi.string().uri().optional(),
  organizerId: Joi.string().required(),
  takenSeats: Joi.array().items(Joi.string()).default([]),
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
    status: data.status || 'active',
    takenSeats: data.takenSeats || [],
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
  if (event.status !== 'active') return false;
  if (calculateAvailableSeats(event) <= 0) return false;

  const eventDate = new Date(event.date);
  const now = new Date();

  return eventDate > now;
};

/**
 * Get event status based on date
 * @param {Object} event - Event object
 * @returns {string} 'upcoming' or 'past'
 */
const getTimeStatus = (event) => {
  const eventDate = new Date(event.date);
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
