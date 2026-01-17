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

### Prerequisites

Before deploying, ensure you have:

1. **AWS Account** with appropriate permissions
2. **GitHub Repository** for the project
3. **Domain Name** (optional, for custom domain setup)

### Step 1: Configure GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add the following secrets:

| Secret Name             | Description                             | How to Get                                    |
| ----------------------- | --------------------------------------- | --------------------------------------------- |
| `AWS_ACCESS_KEY_ID`     | AWS temporary access key                | AWS Console → IAM → Security Credentials      |
| `AWS_SECRET_ACCESS_KEY` | AWS temporary secret key                | AWS Console → IAM → Security Credentials      |
| `AWS_SESSION_TOKEN`     | AWS temporary session token             | AWS Console → IAM → Security Credentials      |
| `JWT_SECRET`            | Secret for JWT token generation         | Generate: `openssl rand -base64 32`           |
| `CLIENT_REPO_GH_TOKEN`  | GitHub Personal Access Token (optional) | GitHub Settings → Developer settings → Tokens |

**Note**: For `CLIENT_REPO_GH_TOKEN`, create a token with `repo` and `workflow` permissions to trigger client deployments.

### Step 2: Configure GitHub Variables

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**

Add the following variables:

| Variable Name | Description                       | Example                     |
| ------------- | --------------------------------- | --------------------------- |
| `CLIENT_URL`  | Frontend URL for CORS             | `https://tixly.example.com` |
| `CLIENT_REPO` | Client repository name (optional) | `khoileuser/tixly-client`   |

**Note**: `S3_BUCKET_NAME` is automatically populated from the CloudFormation stack outputs after first deployment. The S3 bucket name will be the same as your `DomainName` parameter.

### Step 3: Configure CloudFormation Template

Edit `cloudformation/tixly-infrastructure.yaml` and update the following parameters:

```yaml
Parameters:
  ProjectName:
    Type: String
    Default: tixly # Change to your project name

  # Domain Configuration (REQUIRED for S3 bucket)
  DomainName:
    Type: String
    Default: '' # REQUIRED: e.g., "tixly.example.com"
    # Used as S3 bucket name (must be a valid domain)

  ExistingHostedZoneId:
    Type: String
    Default: '' # Route 53 Hosted Zone ID if you have one, or leave empty
```

**Important Notes:**

- **DomainName is REQUIRED**: The S3 bucket will be created with this name (e.g., `tixly.example.com`)
- S3 bucket naming requires the domain name for website hosting
- If you don't have a domain yet, you can use a format like `tixly-yourname.com` as a placeholder
- The bucket name must be globally unique across all AWS accounts

**To find your Hosted Zone ID** (if you have a domain in Route 53):

1. Go to AWS Console → Route 53 → Hosted zones
2. Click on your domain
3. Copy the **Hosted zone ID** (e.g., `Z1234567890ABC`)
4. If you don't have a hosted zone, leave this empty and CloudFormation will create one

### Step 4: Deploy to AWS

#### Option 1: Automatic Deployment (Recommended)

Push your changes to trigger automatic deployment:

```bash
git add .
git commit -m "Configure deployment settings"
git push origin main
```

The **Deploy Full Stack** workflow will automatically:

1. Create CloudFormation stack (VPC, ECS, Lambda, DynamoDB, etc.)
2. Build and push Docker image to ECR
3. Deploy backend to ECS Fargate
4. Deploy Lambda email notification function

#### Option 2: Manual Deployment

1. Go to **Actions** tab in GitHub
2. Select **Deploy Full Stack** workflow
3. Click **Run workflow**
4. Select `main` branch
5. Click **Run workflow** button

### Step 5: Monitor Deployment

Monitor the deployment progress:

1. **GitHub Actions**: Watch the workflow logs in the Actions tab
2. **AWS CloudFormation**: Check stack creation progress in AWS Console
3. **Expected Duration**: 20-30 minutes for first deployment

### Step 6: Get API Endpoint

After successful deployment, retrieve the API endpoint:

**Option 1: From GitHub Actions**

- Go to the completed workflow run
- Check the "Setup Infrastructure" job logs
- Look for "CloudFormation Stack Outputs"

**Option 2: From AWS Console**

- Go to CloudFormation → Stacks → `tixly-infrastructure`
- Click **Outputs** tab
- Copy the `ApiGatewayEndpoint` value

### Step 7: Update Client Configuration

Using [tixly-client](https://github.com/khoileuser/tixly-client):

1. The client repository will be automatically triggered (if `CLIENT_REPO_GH_TOKEN` is set)
2. Or manually update `NEXT_PUBLIC_API_URL` in your client with: `{ApiGatewayEndpoint}/api/v1`

### Deployment Architecture

```
GitHub Push (main branch)
    ↓
Deploy Full Stack Workflow
    ↓
├── Setup Infrastructure
│   ├── Create CloudFormation stack
│   └── Trigger client workflow
    ↓
├── Build Backend (Docker)
│   ├── Create production .env
│   ├── Build Docker image
│   └── Push to Amazon ECR
    ↓
├── Deploy Backend (ECS)
│   ├── Update task definition
│   ├── Deploy 2 Fargate tasks
│   └── Configure load balancer
    ↓
└── Deploy Lambda
    ├── Install dependencies
    ├── Create deployment package
    └── Update function code
```

### Subsequent Deployments

For updates after initial deployment:

**Backend Code Changes:**

```bash
git add src/
git commit -m "Update backend logic"
git push origin main
```

→ Triggers full stack deployment (~10-15 minutes)

**Lambda Code Only:**

```bash
git add lambda/
git commit -m "Update email templates"
git push origin main
```

→ Triggers full stack deployment, but can also use manual Lambda deployment for faster updates

### Troubleshooting

#### View Application Logs

**ECS Backend Logs:**

```bash
AWS Console → CloudWatch → Log groups → /aws/ecs/tixly-service
```

**Lambda Function Logs:**

```bash
AWS Console → CloudWatch → Log groups → /aws/lambda/tixly-email-processor
```

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
