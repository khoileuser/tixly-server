const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const { CategoryModel } = require('../models');

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
 * Get category by ID
 */
const getCategoryById = async (categoryId) => {
  try {
    const command = new GetCommand({
      TableName: CategoryModel.tableName,
      Key: {
        id: categoryId,
      },
    });

    const response = await dynamoDb.send(command);

    if (!response.Item) {
      return {
        success: false,
        message: 'Category not found',
      };
    }

    return {
      success: true,
      data: response.Item,
    };
  } catch (error) {
    console.error('Error getting category:', error);
    throw new Error('Failed to retrieve category');
  }
};

/**
 * Get all categories
 */
const getAllCategories = async () => {
  try {
    const command = new ScanCommand({
      TableName: CategoryModel.tableName,
    });

    const response = await dynamoDb.send(command);

    const categories = response.Items || [];

    // Sort alphabetically by name
    categories.sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      data: categories,
      count: categories.length,
    };
  } catch (error) {
    console.error('Error getting categories:', error);
    throw new Error('Failed to retrieve categories');
  }
};

module.exports = {
  initDynamoDB,
  getCategoryById,
  getAllCategories,
};
