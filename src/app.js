const express = require('express');

const connectDB = require('./config/db');
const env = require('./config/env');
const routes = require('./routes');
const { ListTablesCommand } = require('@aws-sdk/client-dynamodb');

const app = express();

const dynamoClient = connectDB({
  region: env.aws.region || 'us-east-1',
  endpoint: env.aws.dynamodbEndpoint,
  accessKeyId: env.aws.awsAccessKeyId,
  secretAccessKey: env.aws.awsSecretAccessKey,
});

dynamoClient
  .send(new ListTablesCommand({}))
  .then((data) => {
    console.log('Test DB Connection Success');
  })
  .catch((err) => {
    console.error('Error connecting to DynamoDB:', err);
  });

app.locals.dynamoClient = dynamoClient;

app.use(express.json());

app.use('/api/v1', routes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
});
