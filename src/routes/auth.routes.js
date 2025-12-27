const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * POST /api/v1/auth/register
 * Register a new user
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, name, phoneNumber } = req.body;

    // Validation
    if (!username || !email || !password || !name || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message:
          'Username, email, password, name, and phone number are required',
      });
    }

    const dynamoClient = req.app.locals.dynamoClient;
    const result = await authService.register(
      { username, email, password, name, phoneNumber },
      dynamoClient
    );

    res.status(201).json(result);
  } catch (error) {
    console.error('Register route error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Registration failed',
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Login user
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    const dynamoClient = req.app.locals.dynamoClient;
    const result = await authService.login(username, password, dynamoClient);

    res.status(200).json(result);
  } catch (error) {
    console.error('Login route error:', error);
    res.status(401).json({
      success: false,
      message: error.message || 'Login failed',
    });
  }
});

/**
 * POST /api/v1/auth/confirm
 * Confirm user registration with verification code
 */
router.post('/confirm', async (req, res) => {
  try {
    const { username, code } = req.body;

    // Validation
    if (!username || !code) {
      return res.status(400).json({
        success: false,
        message: 'Username and verification code are required',
      });
    }

    const result = await authService.confirmSignUp(username, code);

    res.status(200).json(result);
  } catch (error) {
    console.error('Confirm route error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Verification failed',
    });
  }
});

/**
 * POST /api/v1/auth/resend-code
 * Resend verification code
 */
router.post('/resend-code', async (req, res) => {
  try {
    const { username } = req.body;

    // Validation
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required',
      });
    }

    const result = await authService.resendConfirmationCode(username);

    res.status(200).json(result);
  } catch (error) {
    console.error('Resend code route error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to resend code',
    });
  }
});

/**
 * POST /api/v1/auth/forgot-password
 * Initiate forgot password flow
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { username } = req.body;

    // Validation
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required',
      });
    }

    const result = await authService.forgotPassword(username);

    res.status(200).json(result);
  } catch (error) {
    console.error('Forgot password route error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to initiate password reset',
    });
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Reset password with verification code
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { username, code, newPassword } = req.body;

    // Validation
    if (!username || !code || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Username, code, and new password are required',
      });
    }

    const result = await authService.confirmForgotPassword(
      username,
      code,
      newPassword
    );

    res.status(200).json(result);
  } catch (error) {
    console.error('Reset password route error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Password reset failed',
    });
  }
});

/**
 * GET /api/v1/auth/profile
 * Get user profile (protected route)
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    const dynamoClient = req.app.locals.dynamoClient;
    const bookingService = require('../services/booking.service');

    // Get user profile
    const result = await authService.getUserProfile(
      req.user.cognitoId,
      dynamoClient
    );

    // Get user's bookings/tickets
    const userTickets = await bookingService.getUserBookings(
      req.user.cognitoId
    );

    // Add tickets to profile data
    result.data.tickets = userTickets;

    res.status(200).json(result);
  } catch (error) {
    console.error('Get profile route error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to get profile',
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current authenticated user info from token
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: req.user,
    });
  } catch (error) {
    console.error('Get me route error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to get user info',
    });
  }
});

module.exports = router;
