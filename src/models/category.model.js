const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');

/**
 * Category Model
 * Defines the structure and validation for Category items in DynamoDB
 */

const tableName = 'Categories';

// DynamoDB Table Schema (for table creation)
const tableSchema = {
  TableName: tableName,
  KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
  AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
  BillingMode: 'PAY_PER_REQUEST',
};

// Validation Schema
const validationSchema = Joi.object({
  id: Joi.string().uuid().optional(),
  name: Joi.string().required().min(2).max(50),
  description: Joi.string().optional().max(200),
  createdAt: Joi.string().isoDate().optional(),
  updatedAt: Joi.string().isoDate().optional(),
});

/**
 * Validate category data
 * @param {Object} data - Category data to validate
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
 * Prepare category data for creation
 * @param {Object} data - Raw category data
 * @returns {Object} Category data ready for DynamoDB
 */
const prepareForCreation = (data) => {
  const now = new Date().toISOString();

  return {
    ...data,
    id: data.id || uuidv4(),
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Prepare category data for update
 * @param {Object} data - Update data
 * @returns {Object} Update data with timestamp
 */
const prepareForUpdate = (data) => {
  return {
    ...data,
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
};
