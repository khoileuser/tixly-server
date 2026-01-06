const express = require('express');
const cors = require('cors');

const connectDB = require('./config/db');
const env = require('./config/env');
const routes = require('./routes');
const initializeTables = require('./config/initDB');
const eventService = require('./services/event.service');
const bookingService = require('./services/booking.service');
const categoryService = require('./services/category.service');
const s3Service = require('./services/s3.service');
const { startCleanupScheduler } = require('./jobs/cleanupBookings');

const app = express();

const dynamoClient = connectDB({
  region: env.aws.region || 'us-east-1',
  endpoint: env.aws.dynamodbEndpoint,
  accessKeyId: env.aws.awsAccessKeyId,
  secretAccessKey: env.aws.awsSecretAccessKey,
});

// Initialize event service with DynamoDB client
eventService.initDynamoDB({
  region: env.aws.region || 'us-east-1',
  endpoint: env.aws.dynamodbEndpoint,
  accessKeyId: env.aws.awsAccessKeyId,
  secretAccessKey: env.aws.awsSecretAccessKey,
});

// Initialize booking service with DynamoDB client
bookingService.initDynamoDB();

// Initialize category service with DynamoDB client
categoryService.initDynamoDB({
  region: env.aws.region || 'us-east-1',
  endpoint: env.aws.dynamodbEndpoint,
  accessKeyId: env.aws.awsAccessKeyId,
  secretAccessKey: env.aws.awsSecretAccessKey,
});

// Initialize S3 service for image uploads
if (env.aws.s3BucketName) {
  const s3Config = {
    region: env.aws.region || 'us-east-1',
    accessKeyId: env.aws.awsAccessKeyId,
    secretAccessKey: env.aws.awsSecretAccessKey,
    s3BucketName: env.aws.s3BucketName,
  };

  // Add session token if provided (for temporary credentials)
  if (env.aws.awsSessionToken) {
    s3Config.sessionToken = env.aws.awsSessionToken;
  }

  s3Service.initS3(s3Config);
  console.log('S3 service initialized for bucket:', env.aws.s3BucketName);
} else {
  console.warn(
    'S3_BUCKET_NAME not configured - image uploads will be disabled'
  );
}

// Initialize DynamoDB tables on startup
const startServer = async () => {
  try {
    console.log('Connecting to DynamoDB...');
    await initializeTables(dynamoClient);
    console.log('Database initialization complete');

    app.locals.dynamoClient = dynamoClient;

    // Enable CORS for all routes
    // Allow S3 static website and localhost
    const allowedOrigins = ['http://localhost:3000', env.clientUrl].filter(
      Boolean
    );

    console.log('=== CORS Configuration ===');
    console.log('CLIENT_URL from env:', env.clientUrl);
    console.log('Allowed Origins:', allowedOrigins);
    console.log('========================');

    app.use(
      cors({
        origin: function (origin, callback) {
          console.log('Incoming request from origin:', origin);

          // Allow requests with no origin (like mobile apps, curl, postman)
          if (!origin) {
            console.log('No origin - allowing request');
            return callback(null, true);
          }

          if (
            allowedOrigins.indexOf(origin) !== -1 ||
            allowedOrigins.includes('*')
          ) {
            console.log('✓ Origin ALLOWED:', origin);
            callback(null, true);
          } else {
            console.log('✗ Origin BLOCKED:', origin);
            console.log('  Expected one of:', allowedOrigins);
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
    );

    app.use(express.json());

    app.use('/api/v1', routes);

    app.get('/health', (req, res) => {
      res.status(200).json({ status: 'OK' });
    });

    // Start booking cleanup scheduler
    startCleanupScheduler();

    const HOST = process.env.HOST || '0.0.0.0';
    app.listen(env.port, HOST, () => {
      console.log(`Server running on http://${HOST}:${env.port}`);
    });
  } catch (err) {
    console.error('Error initializing server:', err);
    process.exit(1);
  }
};

startServer();
