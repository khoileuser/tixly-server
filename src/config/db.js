const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

const connectDB = ({ region, endpoint, accessKeyId, secretAccessKey }) => {
  const config = {
    region,
    requestHandler: new NodeHttpHandler({
      http2: false,
    }),
  };

  // Only set endpoint if provided (for local development)
  if (endpoint) {
    config.endpoint = endpoint;
  }

  // Only set explicit credentials if both are provided
  // In ECS, credentials will be automatically obtained from IAM role
  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey,
    };
  }

  return new DynamoDBClient(config);
};

module.exports = connectDB;
