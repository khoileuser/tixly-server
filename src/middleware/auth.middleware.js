const authService = require('../services/auth.service');

/**
 * Middleware to authenticate requests using Cognito access token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const accessToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Cognito
    const result = await authService.verifyToken(accessToken);

    if (!result.success) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
      });
    }

    // Attach user information to request
    req.user = result.data;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({
      success: false,
      message: error.message || 'Authentication failed',
    });
  }
};

/**
 * Middleware to check if user has specific role
 */
const authorize = (...roles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Not authenticated',
        });
      }

      // Get user profile from DynamoDB to check role
      const dynamoClient = req.app.locals.dynamoClient;
      const userProfile = await authService.getUserProfile(
        req.user.cognitoId,
        dynamoClient
      );

      if (!userProfile.success) {
        return res.status(403).json({
          success: false,
          message: 'User not found',
        });
      }

      const userRole = userProfile.data.role;

      if (!roles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
        });
      }

      // Attach full user profile to request
      req.userProfile = userProfile.data;
      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(403).json({
        success: false,
        message: error.message || 'Authorization failed',
      });
    }
  };
};

module.exports = {
  authenticate,
  authorize,
};
