const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const {
  PutCommand,
  GetCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const { UserModel } = require('../models');
const snsService = require('./sns.service');

// Create Cognito client configuration
const cognitoClientConfig = {
  region: env.aws.region,
};

// Only set credentials if they are non-empty strings (for local dev)
// In ECS, credentials will be undefined and IAM role will be used
const accessKeyId = env.aws.awsAccessKeyId;
const secretAccessKey = env.aws.awsSecretAccessKey;
const sessionToken = env.aws.awsSessionToken;

if (
  accessKeyId &&
  secretAccessKey &&
  accessKeyId.trim() &&
  secretAccessKey.trim()
) {
  cognitoClientConfig.credentials = {
    accessKeyId,
    secretAccessKey,
  };

  // Add session token if provided (for temporary credentials)
  if (sessionToken && sessionToken.trim()) {
    cognitoClientConfig.credentials.sessionToken = sessionToken;
  }

  console.log('Cognito client using explicit credentials');
} else {
  console.log(
    'Cognito client using IAM role credentials (no explicit credentials provided)'
  );
}

const cognitoClient = new CognitoIdentityProviderClient(cognitoClientConfig);

/**
 * Calculate SECRET_HASH for Cognito requests
 */
const calculateSecretHash = (username) => {
  if (!env.aws.cognitoClientSecret) {
    return undefined; // Return undefined if no client secret is configured
  }

  return crypto
    .createHmac('SHA256', env.aws.cognitoClientSecret)
    .update(username + env.aws.cognitoClientId)
    .digest('base64');
};

/**
 * Register a new user with Cognito and create a user record in DynamoDB
 */
const register = async (userData, dynamoClient) => {
  const { username, email, password, name, phoneNumber } = userData;

  try {
    // Step 1: Register user in Cognito
    const signUpParams = {
      ClientId: env.aws.cognitoClientId,
      Username: username,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name },
        { Name: 'phone_number', Value: phoneNumber },
        // Don't send preferred_username - Cognito will set it from Username after confirmation
      ],
    };

    // Add SECRET_HASH if client secret is configured
    const secretHash = calculateSecretHash(username);
    if (secretHash) {
      signUpParams.SecretHash = secretHash;
    }

    const signUpCommand = new SignUpCommand(signUpParams);

    const cognitoResponse = await cognitoClient.send(signUpCommand);
    const cognitoId = cognitoResponse.UserSub; // This is the Cognito sub

    // Step 2: Create user record in DynamoDB using model
    const userToCreate = {
      cognitoId,
      username,
      email,
      name: name,
      phoneNumber: phoneNumber || undefined,
      role: 'user',
    };

    // Validate user data
    const validatedUser = UserModel.validate(userToCreate);

    // Prepare for creation (adds timestamps and ticketIds)
    const userItem = UserModel.prepareForCreation(validatedUser);

    await dynamoClient.send(
      new PutCommand({
        TableName: UserModel.tableName,
        Item: userItem,
        ConditionExpression: 'attribute_not_exists(cognitoId)',
      })
    );

    // Step 3: Subscribe user's email to SNS topic for notifications (non-blocking)
    // This happens in the background and won't fail the registration
    snsService
      .subscribeEmail(email)
      .then((subscriptionResult) => {
        if (subscriptionResult?.success) {
          console.log(
            `[AuthService] User ${email} subscribed to SNS notifications`
          );
        } else {
          console.warn(
            `[AuthService] Failed to subscribe ${email} to SNS:`,
            subscriptionResult?.error
          );
        }
      })
      .catch((err) => {
        console.error(`[AuthService] Error subscribing ${email} to SNS:`, err);
      });

    return {
      success: true,
      message:
        'User registered successfully. Please check your email to verify your account and confirm your notification subscription.',
      data: {
        cognitoId,
        username,
        email,
        userConfirmed: cognitoResponse.UserConfirmed,
      },
    };
  } catch (error) {
    if (error.name === 'UsernameExistsException') {
      throw new Error('Username already exists');
    }
    if (error.name === 'InvalidPasswordException') {
      throw new Error('Password does not meet requirements');
    }
    if (error.name === 'InvalidParameterException') {
      throw new Error('Invalid parameters provided');
    }

    throw new Error(error.message || error.code || 'Registration failed');
  }
};

/**
 * Login user with Cognito
 */
const login = async (username, password, dynamoClient) => {
  try {
    const authParams = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: env.aws.cognitoClientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    };

    // Add SECRET_HASH if client secret is configured
    const secretHash = calculateSecretHash(username);
    if (secretHash) {
      authParams.AuthParameters.SECRET_HASH = secretHash;
    }

    const authCommand = new InitiateAuthCommand(authParams);

    const response = await cognitoClient.send(authCommand);

    if (!response.AuthenticationResult) {
      throw new Error('Authentication failed');
    }

    const { IdToken, AccessToken, RefreshToken, ExpiresIn } =
      response.AuthenticationResult;

    // Decode the ID token to get user information and groups
    const decodedToken = jwt.decode(IdToken);
    const groups = getUserGroupsFromToken(IdToken);
    const roleFromGroups = determineRoleFromGroups(groups);

    // Sync role to DynamoDB if dynamoClient is provided
    if (dynamoClient) {
      try {
        const updateData = UserModel.prepareForUpdate({ role: roleFromGroups });

        await dynamoClient.send(
          new UpdateCommand({
            TableName: UserModel.tableName,
            Key: { cognitoId: decodedToken.sub },
            UpdateExpression: 'SET #role = :role, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#role': 'role',
            },
            ExpressionAttributeValues: {
              ':role': roleFromGroups,
              ':updatedAt': updateData.updatedAt,
            },
          })
        );
      } catch (dbError) {
        console.error('Failed to sync role to DynamoDB:', dbError);
        // Don't fail login if role sync fails
      }
    }

    return {
      success: true,
      message: 'Login successful',
      data: {
        idToken: IdToken,
        accessToken: AccessToken,
        refreshToken: RefreshToken,
        expiresIn: ExpiresIn,
        user: {
          cognitoId: decodedToken.sub,
          email: decodedToken.email,
          username: decodedToken['cognito:username'],
          emailVerified: decodedToken.email_verified,
        },
      },
    };
  } catch (error) {
    console.error('Login error:', error);

    if (error.name === 'NotAuthorizedException') {
      throw new Error('Incorrect username or password');
    }
    if (error.name === 'UserNotConfirmedException') {
      throw new Error('User is not confirmed. Please verify your email.');
    }
    if (error.name === 'UserNotFoundException') {
      throw new Error('User not found');
    }

    throw new Error(error.message || 'Login failed');
  }
};

/**
 * Confirm user registration with verification code
 */
const confirmSignUp = async (username, code) => {
  try {
    const confirmParams = {
      ClientId: env.aws.cognitoClientId,
      Username: username,
      ConfirmationCode: code,
    };

    // Add SECRET_HASH if client secret is configured
    const secretHash = calculateSecretHash(username);
    if (secretHash) {
      confirmParams.SecretHash = secretHash;
    }

    const confirmCommand = new ConfirmSignUpCommand(confirmParams);

    await cognitoClient.send(confirmCommand);

    return {
      success: true,
      message: 'Email verified successfully. You can now login.',
    };
  } catch (error) {
    console.error('Confirmation error:', error);

    if (error.name === 'CodeMismatchException') {
      throw new Error('Invalid verification code');
    }
    if (error.name === 'ExpiredCodeException') {
      throw new Error('Verification code has expired');
    }

    throw new Error(error.message || 'Verification failed');
  }
};

/**
 * Resend confirmation code
 */
const resendConfirmationCode = async (username) => {
  try {
    const resendParams = {
      ClientId: env.aws.cognitoClientId,
      Username: username,
    };

    // Add SECRET_HASH if client secret is configured
    const secretHash = calculateSecretHash(username);
    if (secretHash) {
      resendParams.SecretHash = secretHash;
    }

    const resendCommand = new ResendConfirmationCodeCommand(resendParams);

    await cognitoClient.send(resendCommand);

    return {
      success: true,
      message: 'Verification code sent successfully',
    };
  } catch (error) {
    console.error('Resend confirmation error:', error);
    throw new Error(error.message || 'Failed to resend confirmation code');
  }
};

/**
 * Initiate forgot password flow
 */
const forgotPassword = async (username) => {
  try {
    const forgotParams = {
      ClientId: env.aws.cognitoClientId,
      Username: username,
    };

    // Add SECRET_HASH if client secret is configured
    const secretHash = calculateSecretHash(username);
    if (secretHash) {
      forgotParams.SecretHash = secretHash;
    }

    const forgotCommand = new ForgotPasswordCommand(forgotParams);

    await cognitoClient.send(forgotCommand);

    return {
      success: true,
      message: 'Password reset code sent to your email',
    };
  } catch (error) {
    console.error('Forgot password error:', error);
    throw new Error(error.message || 'Failed to initiate password reset');
  }
};

/**
 * Confirm forgot password with code and new password
 */
const confirmForgotPassword = async (username, code, newPassword) => {
  try {
    const confirmParams = {
      ClientId: env.aws.cognitoClientId,
      Username: username,
      ConfirmationCode: code,
      Password: newPassword,
    };

    // Add SECRET_HASH if client secret is configured
    const secretHash = calculateSecretHash(username);
    if (secretHash) {
      confirmParams.SecretHash = secretHash;
    }

    const confirmCommand = new ConfirmForgotPasswordCommand(confirmParams);

    await cognitoClient.send(confirmCommand);

    return {
      success: true,
      message: 'Password reset successfully',
    };
  } catch (error) {
    console.error('Confirm forgot password error:', error);

    if (error.name === 'CodeMismatchException') {
      throw new Error('Invalid verification code');
    }
    if (error.name === 'ExpiredCodeException') {
      throw new Error('Verification code has expired');
    }
    if (error.name === 'InvalidPasswordException') {
      throw new Error('Password does not meet requirements');
    }

    throw new Error(error.message || 'Password reset failed');
  }
};

/**
 * Get user's Cognito groups from ID token
 */
const getUserGroupsFromToken = (idToken) => {
  try {
    const decodedToken = jwt.decode(idToken);
    // Cognito includes groups in the ID token as 'cognito:groups'
    return decodedToken['cognito:groups'] || [];
  } catch (error) {
    console.error('Error decoding token for groups:', error);
    return [];
  }
};

/**
 * Determine role from Cognito groups (admin takes precedence)
 */
const determineRoleFromGroups = (groups) => {
  if (groups.includes('admin')) {
    return 'admin';
  }
  return 'user';
};

/**
 * Get user profile from DynamoDB using Cognito ID
 */
const getUserProfile = async (cognitoId, dynamoClient) => {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: UserModel.tableName,
        Key: { cognitoId },
      })
    );

    if (!result.Item) {
      throw new Error('User not found');
    }

    return {
      success: true,
      data: result.Item,
    };
  } catch (error) {
    console.error('Get user profile error:', error);
    throw new Error(error.message || 'Failed to get user profile');
  }
};

/**
 * Verify access token and get user information from Cognito
 */
const verifyToken = async (accessToken) => {
  try {
    const getUserCommand = new GetUserCommand({
      AccessToken: accessToken,
    });

    const response = await cognitoClient.send(getUserCommand);

    // Parse user attributes
    const attributes = {};
    response.UserAttributes.forEach((attr) => {
      attributes[attr.Name] = attr.Value;
    });

    return {
      success: true,
      data: {
        cognitoId: attributes.sub,
        username: response.Username,
        email: attributes.email,
        emailVerified: attributes.email_verified === 'true',
        name: attributes.name,
        phoneNumber: attributes.phone_number,
      },
    };
  } catch (error) {
    console.error('Token verification error:', error);
    throw new Error('Invalid or expired token');
  }
};

module.exports = {
  register,
  login,
  confirmSignUp,
  resendConfirmationCode,
  forgotPassword,
  confirmForgotPassword,
  getUserProfile,
  verifyToken,
};
