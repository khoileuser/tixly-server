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
  BillingMode: 'PAY_PER_REQUEST',
  GlobalSecondaryIndexes: [
    {
      IndexName: 'UserIdIndex',
      KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'EventIdIndex',
      KeySchema: [{ AttributeName: 'eventId', KeyType: 'HASH' }],
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
  eventId: Joi.string().uuid().required(),
  pricePerSeat: Joi.number().min(0).required(),
  takenSeats: Joi.array()
    .items(Joi.alternatives().try(Joi.number(), Joi.string()))
    .min(1)
    .required(), // Array of seat identifiers (numbers or strings)
  userId: Joi.string().required(),
  name: Joi.string().allow('').optional(),
  email: Joi.string().email().allow('').optional(),
  phoneNumber: Joi.string().allow('').optional(),
  status: Joi.string()
    .valid('PENDING', 'CONFIRMED', 'REFUNDED')
    .default('PENDING'),
  purchaseDate: Joi.string().isoDate().optional(),
  refundedAt: Joi.string().isoDate().optional().allow(null),
  expiresAt: Joi.string().isoDate().optional(), // For PENDING bookings
  createdAt: Joi.string().isoDate().optional(),
  updatedAt: Joi.string().isoDate().optional(),
});

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
 * Adds auto-generated fields like id, timestamps, expiration
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
 * Check if booking can be refunded
 * @param {Object} booking - Booking object
 * @returns {boolean} True if booking can be refunded (within 24 hours of purchase)
 */
const canBeRefunded = (booking) => {
  if (booking.status !== 'CONFIRMED') return false;

  const purchaseDate = new Date(booking.purchaseDate || booking.createdAt);
  const now = new Date();
  const hoursSincePurchase = (now - purchaseDate) / (1000 * 60 * 60);

  return hoursSincePurchase <= 24;
};

/**
 * Prepare booking for confirmation
 * @param {Object} booking - Booking object
 * @returns {Object} Updated booking data
 */
const prepareForConfirmation = (booking) => {
  return {
    status: 'CONFIRMED',
    purchaseDate: new Date().toISOString(),
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
    expiresAt: null,
    updatedAt: new Date().toISOString(),
  };
};

/**
 * Prepare booking for refund
 * @param {Object} booking - Booking object
 * @returns {Object} Updated booking data
 */
const prepareForRefund = (booking) => {
  return {
    status: 'REFUNDED',
    refundedAt: new Date().toISOString(),
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
  calculateExpirationTime,
  isExpired,
  canBeConfirmed,
  canBeCancelled,
  canBeRefunded,
  prepareForConfirmation,
  prepareForCancellation,
  prepareForRefund,
};
