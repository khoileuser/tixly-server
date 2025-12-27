const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');

/**
 * Booking (Ticket) Model
 * Defines the structure and validation for Booking items in DynamoDB
 */

const tableName = 'Tickets';

// DynamoDB Table Schema (for table creation)
const tableSchema = {
  TableName: tableName,
  KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
  AttributeDefinitions: [
    { AttributeName: 'id', AttributeType: 'S' },
    { AttributeName: 'userId', AttributeType: 'S' },
    { AttributeName: 'eventId', AttributeType: 'S' },
    { AttributeName: 'status', AttributeType: 'S' },
  ],
  GlobalSecondaryIndexes: [
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
      IndexName: 'EventIdIndex',
      KeySchema: [{ AttributeName: 'eventId', KeyType: 'HASH' }],
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
  userId: Joi.string().required(),
  eventId: Joi.string().uuid().required(),
  takenSeats: Joi.array()
    .items(Joi.alternatives().try(Joi.number(), Joi.string()))
    .min(1)
    .required(), // Array of seat identifiers (numbers or strings)
  status: Joi.string()
    .valid('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')
    .default('PENDING'),
  paymentStatus: Joi.string()
    .valid('UNPAID', 'PAID', 'REFUNDED')
    .default('UNPAID'),
  pricePerSeat: Joi.number().min(0).required(),
  bookingCode: Joi.string().optional(), // Unique booking reference
  expiresAt: Joi.string().isoDate().optional(), // For PENDING bookings
  confirmedAt: Joi.string().isoDate().optional().allow(null),
  cancelledAt: Joi.string().isoDate().optional().allow(null),
  purchaseDate: Joi.string().isoDate().optional(),
  name: Joi.string().allow('').optional(),
  email: Joi.string().email().allow('').optional(),
  phone: Joi.string().allow('').optional(),
  createdAt: Joi.string().isoDate().optional(),
  updatedAt: Joi.string().isoDate().optional(),
});

/**
 * Generate a unique booking code
 * @returns {string} 8-character booking code
 */
const generateBookingCode = () => {
  return uuidv4().substring(0, 8).toUpperCase();
};

/**
 * Calculate expiration time for pending bookings
 * @param {number} minutesFromNow - Minutes until expiration (default: from env.bookingTimeoutMinutes)
 * @returns {string} ISO date string
 */
const calculateExpirationTime = (
  minutesFromNow = env.bookingTimeoutMinutes
) => {
  const expirationDate = new Date();
  expirationDate.setMinutes(expirationDate.getMinutes() + minutesFromNow);
  return expirationDate.toISOString();
};

/**
 * Validate booking data
 * @param {Object} data - Booking data to validate
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
 * Prepare booking data for creation
 * Adds auto-generated fields like id, bookingCode, timestamps, expiration
 * @param {Object} data - Raw booking data
 * @returns {Object} Booking data ready for DynamoDB
 */
const prepareForCreation = (data) => {
  const now = new Date().toISOString();
  const isPending = !data.status || data.status === 'PENDING';

  return {
    ...data,
    id: data.id || uuidv4(),
    status: data.status || 'PENDING',
    paymentStatus: data.paymentStatus || 'UNPAID',
    bookingCode: data.bookingCode || generateBookingCode(),
    expiresAt: isPending ? calculateExpirationTime() : undefined,
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Prepare booking data for update
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
 * Check if booking is expired
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking is expired
 */
const isExpired = (booking) => {
  if (booking.status !== 'PENDING') return false;
  if (!booking.expiresAt) return false;

  return new Date(booking.expiresAt) < new Date();
};

/**
 * Check if booking can be confirmed
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking can be confirmed
 */
const canBeConfirmed = (booking) => {
  return booking.status === 'PENDING' && !isExpired(booking);
};

/**
 * Check if booking can be cancelled
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking can be cancelled
 */
const canBeCancelled = (booking) => {
  return booking.status === 'PENDING' || booking.status === 'CONFIRMED';
};

/**
 * Prepare booking for confirmation
 * @param {Object} booking - Booking object
 * @returns {Object} Updated booking data
 */
const prepareForConfirmation = (booking) => {
  return {
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    confirmedAt: new Date().toISOString(),
    expiresAt: null, // Remove expiration
    updatedAt: new Date().toISOString(),
  };
};

/**
 * Prepare booking for cancellation
 * @param {Object} booking - Booking object
 * @returns {Object} Updated booking data
 */
const prepareForCancellation = (booking) => {
  return {
    status: 'CANCELLED',
    cancelledAt: new Date().toISOString(),
    expiresAt: null,
    updatedAt: new Date().toISOString(),
  };
};

module.exports = {
  tableName,
  tableSchema,
  validationSchema,
  validate,
  prepareForCreation,
  prepareForUpdate,
  generateBookingCode,
  calculateExpirationTime,
  isExpired,
  canBeConfirmed,
  canBeCancelled,
  prepareForConfirmation,
  prepareForCancellation,
};
