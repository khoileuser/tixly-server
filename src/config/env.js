require('dotenv').config();

const env = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  aws: {
    region: process.env.AWS_REGION || 'ap-southeast-1',
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

if (!env.aws.region) {
  throw new Error('AWS_REGION is not defined');
}

module.exports = env;
