const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

const connectDB = ({ region, endpoint, accessKeyId, secretAccessKey }) => {
  return new DynamoDBClient({
    region,
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    requestHandler: new NodeHttpHandler({
      http2: false,
    }),
  });
};

module.exports = connectDB;
