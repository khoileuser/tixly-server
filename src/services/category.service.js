const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  PutCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const { CategoryModel } = require('../models');

let dynamoDb;

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
    console.log('[CategoryService] Using DynamoDB endpoint:', config.endpoint);
  } else {
    console.log(
      '[CategoryService] Using AWS DynamoDB in region:',
      config.region
    );
  }

  // Only set explicit credentials if BOTH are provided and not empty
  // In ECS, credentials will be automatically obtained from IAM role
  if (
    config.accessKeyId &&
    config.secretAccessKey &&
    config.accessKeyId.trim() &&
    config.secretAccessKey.trim()
  ) {
    console.log('[CategoryService] Using explicit credentials');
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  } else {
    console.log('[CategoryService] Using IAM role credentials');
  }

  const client = new DynamoDBClient(clientConfig);
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

/**
 * Create a new category
 */
const createCategory = async (categoryData) => {
  try {
    // Validate category data
    const validatedData = CategoryModel.validate(categoryData);

    // Prepare for creation (adds id, timestamps)
    const category = CategoryModel.prepareForCreation(validatedData);

    const command = new PutCommand({
      TableName: CategoryModel.tableName,
      Item: category,
    });

    await dynamoDb.send(command);

    return {
      success: true,
      data: category,
      message: 'Category created successfully',
    };
  } catch (error) {
    console.error('Error creating category:', error);
    return {
      success: false,
      message: error.message || 'Failed to create category',
    };
  }
};

/**
 * Update an existing category
 */
const updateCategory = async (categoryId, updateData) => {
  try {
    // First, get the existing category
    const existingResult = await getCategoryById(categoryId);
    if (!existingResult.success) {
      return {
        success: false,
        message: 'Category not found',
      };
    }

    // Merge existing data with updates
    const existingCategory = existingResult.data;
    const mergedData = {
      ...existingCategory,
      ...updateData,
      id: categoryId, // Ensure ID doesn't change
      createdAt: existingCategory.createdAt, // Preserve created timestamp
    };

    // Validate merged data
    const validatedData = CategoryModel.validate(mergedData);

    // Prepare for update (adds updatedAt)
    const updatedCategory = CategoryModel.prepareForUpdate(validatedData);

    const command = new PutCommand({
      TableName: CategoryModel.tableName,
      Item: updatedCategory,
    });

    await dynamoDb.send(command);

    return {
      success: true,
      data: updatedCategory,
      message: 'Category updated successfully',
    };
  } catch (error) {
    console.error('Error updating category:', error);
    return {
      success: false,
      message: error.message || 'Failed to update category',
    };
  }
};

/**
 * Delete a category
 */
const deleteCategory = async (categoryId) => {
  try {
    // First, check if category exists
    const existingResult = await getCategoryById(categoryId);
    if (!existingResult.success) {
      return {
        success: false,
        message: 'Category not found',
      };
    }

    const command = new DeleteCommand({
      TableName: CategoryModel.tableName,
      Key: {
        id: categoryId,
      },
    });

    await dynamoDb.send(command);

    return {
      success: true,
      message: 'Category deleted successfully',
    };
  } catch (error) {
    console.error('Error deleting category:', error);
    return {
      success: false,
      message: error.message || 'Failed to delete category',
    };
  }
};

module.exports = {
  initDynamoDB,
  getCategoryById,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
