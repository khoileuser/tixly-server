require('dotenv').config();

const env = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  bookingTimeoutMinutes: parseInt(process.env.BOOKING_TIMEOUT_MINUTES) || 30,
  clientUrl: process.env.CLIENT_URL,

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT,
    // Only set credentials if they exist (for local dev)
    // In ECS, these will be undefined and IAM role will be used
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || undefined,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || undefined,
    awsSessionToken: process.env.AWS_SESSION_TOKEN || undefined,
    cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
    cognitoClientId: process.env.COGNITO_CLIENT_ID,
    cognitoClientSecret: process.env.COGNITO_CLIENT_SECRET,
    s3BucketName: process.env.S3_BUCKET_NAME,
  },

  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT) || 6379,
  },
};

if (!env.aws.region) {
  throw new Error('AWS_REGION is not defined');
}

if (!env.aws.cognitoUserPoolId) {
  throw new Error('COGNITO_USER_POOL_ID is not defined');
}

if (!env.aws.cognitoClientId) {
  throw new Error('COGNITO_CLIENT_ID is not defined');
}

module.exports = env;
