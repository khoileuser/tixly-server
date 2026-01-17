# Tixly Server

Backend API for the Tixly Event Ticketing Platform.

## Architecture

The Tixly backend is built with Node.js/Express and deployed on AWS using the following services:

### Core Services

- **ECS Fargate** - Container orchestration for running the backend application
- **ECR** - Elastic Container Registry for Docker images
- **DynamoDB** - NoSQL database for events, bookings, users, and categories
- **ElastiCache (Redis)** - In-memory caching layer for performance optimization
- **Cognito** - User authentication and authorization
- **S3** - Static file storage and frontend hosting
- **API Gateway** - HTTP API management and routing
- **Application Load Balancer (ALB)** - Load balancing and health checks for ECS tasks

### Networking & Security

- **VPC** - Virtual Private Cloud with public and private subnets
- **Internet Gateway** - Internet access for public subnets
- **Security Groups** - Firewall rules for ALB, ECS, Lambda, ElastiCache, and VPC endpoints
- **VPC Endpoints** - Private access to AWS services (S3, DynamoDB, SQS, SNS, ECR, CloudWatch, Cognito)

### Notification Services

- **SQS** - Message queue for asynchronous email notifications
- **Lambda** - Serverless email notification processor
- **SNS** - Simple Notification Service for email delivery

### Monitoring & Logging

- **CloudWatch Logs** - Centralized logging for ECS and Lambda functions
- **CloudWatch Container Insights** - ECS cluster monitoring

### DNS & Routing

- **Route 53** - DNS management and domain routing (optional)

### Auto Scaling

- **Application Auto Scaling** - Automatic scaling of ECS tasks based on CPU utilization

## Environment Variables

| Variable                  | Description                           |
| ------------------------- | ------------------------------------- |
| `PORT`                    | Server port (default: 8080)           |
| `NODE_ENV`                | Environment (development/production)  |
| `CLIENT_URL`              | Frontend URL for CORS                 |
| `BOOKING_TIMEOUT_MINUTES` | Booking expiration time               |
| `AWS_REGION`              | AWS region                            |
| `COGNITO_USER_POOL_ID`    | Cognito User Pool ID                  |
| `COGNITO_CLIENT_ID`       | Cognito App Client ID                 |
| `COGNITO_CLIENT_SECRET`   | Cognito App Client Secret             |
| `S3_BUCKET_NAME`          | S3 bucket for file uploads            |
| `REDIS_HOST`              | ElastiCache Redis endpoint            |
| `REDIS_PORT`              | Redis port (default: 6379)            |
| `SQS_QUEUE_URL`           | SQS queue URL for email notifications |
| `SNS_TOPIC_ARN`           | SNS topic ARN for email delivery      |
| `JWT_SECRET`              | Secret for JWT token generation       |

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run in production mode
npm start

# Seed sample data
npm run seed
```

## Deployment

See `cloudformation/` folder for AWS infrastructure templates and deployment scripts.

## Project Structure

```
tixly-server/
├── .dockerignore
├── .env.example        # Example environment variables
├── .github/            # GitHub workflows and configs
├── .gitignore
├── .prettierrc         # Code formatting configuration
├── Dockerfile          # Docker container configuration
├── package.json        # Node.js dependencies
├── README.md           # This file
├── cloudformation/
│   ├── deploy.sh       # Deployment script
│   └── tixly-infrastructure.yaml  # AWS CloudFormation template
├── lambda/
│   └── email-notification/  # Lambda function for email processing
│       ├── index.js         # Lambda handler
│       ├── package.json     # Lambda dependencies
│       └── README.md        # Lambda documentation
└── src/
    ├── app.js                # Express application entry point
    ├── seedData.js           # Database seeding script
    ├── config/               # Configuration files
    │   ├── db.js             # Database configuration
    │   ├── env.js            # Environment variables
    │   ├── initDB.js         # Database initialization
    │   └── redis.js          # Redis configuration
    ├── jobs/                 # Background jobs
    │   └── cleanupBookings.js  # Expired booking cleanup
    ├── middleware/           # Express middleware
    │   └── auth.middleware.js  # Authentication middleware
    ├── models/               # Data models
    │   ├── index.js          # Model exports
    │   ├── booking.model.js  # Booking/Ticket model
    │   ├── category.model.js # Event category model
    │   ├── event.model.js    # Event model
    │   └── user.model.js     # User model
    ├── routes/               # API routes
    │   ├── index.js          # Route aggregator
    │   ├── admin.routes.js   # Admin endpoints
    │   ├── analytics.routes.js  # Analytics endpoints
    │   ├── auth.routes.js    # Authentication endpoints
    │   ├── booking.routes.js # Booking/Ticket endpoints
    │   ├── category.routes.js  # Category endpoints
    │   ├── event.routes.js   # Event endpoints
    │   └── hello.routes.js   # Health check endpoint
    └── services/             # Business logic layer
        ├── auth.service.js   # Authentication logic
        ├── booking.service.js  # Booking/Ticket logic
        ├── category.service.js # Category logic
        ├── event.service.js  # Event logic
        ├── hello.service.js  # Health check logic
        ├── notification.service.js  # SQS notification sender
        ├── sns.service.js    # SNS email subscription
        └── s3.service.js     # S3 file upload logic
```
