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
    console.log('Using DynamoDB endpoint:', endpoint);
  } else {
    console.log('Using AWS DynamoDB in region:', region);
  }

  // Only set explicit credentials if BOTH are provided and not empty
  // In ECS, credentials will be automatically obtained from IAM role
  if (
    accessKeyId &&
    secretAccessKey &&
    accessKeyId.trim() &&
    secretAccessKey.trim()
  ) {
    console.log('Using explicit credentials');
    config.credentials = {
      accessKeyId,
      secretAccessKey,
    };
  } else {
    console.log(
      'Using IAM role credentials (no explicit credentials provided)'
    );
  }

  return new DynamoDBClient(config);
};

module.exports = connectDB;
