const Joi = require('joi');

/**
 * User Model
 * Defines the structure and validation for User items in DynamoDB
 */

const tableName = 'Users';

// DynamoDB Table Schema (for table creation)
const tableSchema = {
  TableName: tableName,
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
};

// Validation Schema (similar to Mongoose schema)
const validationSchema = Joi.object({
  cognitoId: Joi.string().required(),
  email: Joi.string().email().required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  firstName: Joi.string().min(1).max(50).optional(),
  lastName: Joi.string().min(1).max(50).optional(),
  phoneNumber: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional(),
  role: Joi.string().valid('user', 'admin', 'organizer').default('user'),
  isActive: Joi.boolean().default(true),
  profilePicture: Joi.string().uri().optional(),
  createdAt: Joi.string().isoDate().optional(),
  updatedAt: Joi.string().isoDate().optional(),
  lastLoginAt: Joi.string().isoDate().optional().allow(null),
});

/**
 * Validate user data
 * @param {Object} data - User data to validate
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
 * Prepare user data for creation
 * Adds timestamps
 * @param {Object} data - Raw user data
 * @returns {Object} User data ready for DynamoDB
 */
const prepareForCreation = (data) => {
  const now = new Date().toISOString();

  return {
    ...data,
    role: data.role || 'user',
    isActive: data.isActive !== undefined ? data.isActive : true,
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Prepare user data for update
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
 * Get user's full name
 * @param {Object} user - User object
 * @returns {string} Full name or username if name not available
 */
const getFullName = (user) => {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) return user.firstName;
  if (user.lastName) return user.lastName;
  return user.username;
};

/**
 * Check if user is admin
 * @param {Object} user - User object
 * @returns {boolean} True if user is admin
 */
const isAdmin = (user) => {
  return user.role === 'admin';
};

/**
 * Check if user is organizer
 * @param {Object} user - User object
 * @returns {boolean} True if user is organizer
 */
const isOrganizer = (user) => {
  return user.role === 'organizer' || user.role === 'admin';
};

module.exports = {
  tableName,
  tableSchema,
  validationSchema,
  validate,
  prepareForCreation,
  prepareForUpdate,
  getFullName,
  isAdmin,
  isOrganizer,
};
