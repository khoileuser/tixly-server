const express = require('express');
const router = express.Router();
const bookingService = require('../services/booking.service');
const { authenticate } = require('../middleware/auth.middleware');

// Get booked seats for an event
router.get('/events/:eventId/seats', async (req, res) => {
  try {
    const { eventId } = req.params;
    const bookedSeats = await bookingService.getBookedSeats(eventId);

    res.json({
      success: true,
      data: { bookedSeats },
    });
  } catch (error) {
    console.error('Error fetching booked seats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booked seats',
      error: error.message,
    });
  }
});

// Create a booking (requires auth)
router.post('/bookings', authenticate, async (req, res) => {
  try {
    const { eventId, seats, pricePerSeat, name, email, phone } = req.body;
    const userId = req.user.cognitoId; // From authenticated user

    if (!eventId || !seats || !Array.isArray(seats) || seats.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Event ID and seats are required',
      });
    }

    // Check if seats are already booked
    const bookedSeats = await bookingService.getBookedSeats(eventId);
    const conflictingSeats = seats.filter((seat) => bookedSeats.includes(seat));

    if (conflictingSeats.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Some seats are already booked',
        data: { conflictingSeats },
      });
    }

    const bookingData = {
      eventId,
      userId,
      seats,
      pricePerSeat,
      name,
      email,
      phone,
    };

    const booking = await bookingService.createBooking(bookingData);

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: booking,
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
      error: error.message,
    });
  }
});

// Get booking by ID (requires auth)
router.get('/bookings/:ticketId', authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const booking = await bookingService.getBookingById(ticketId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Check if user owns this booking
    if (booking.userId !== req.user.cognitoId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to booking',
      });
    }

    res.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message,
    });
  }
});

// Confirm booking with payment (requires auth)
router.post('/bookings/:ticketId/confirm', authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { cardNumber, expiryDate, cvv, cardholderName } = req.body;

    // Validate payment fields
    if (!cardNumber || !expiryDate || !cvv || !cardholderName) {
      return res.status(400).json({
        success: false,
        message: 'All payment fields are required',
      });
    }

    // Get booking first
    const booking = await bookingService.getBookingById(ticketId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Check if user owns this booking
    if (booking.userId !== req.user.cognitoId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to booking',
      });
    }

    // Check if booking is expired
    if (new Date(booking.expiresAt) < new Date()) {
      // Delete expired booking
      await bookingService.cancelBooking(ticketId);
      return res.status(410).json({
        success: false,
        message: 'Booking has expired',
      });
    }

    // Store last 4 digits only for security
    const paymentInfo = {
      cardLastFour: cardNumber.slice(-4),
      cardholderName,
      paymentDate: new Date().toISOString(),
    };

    const confirmedBooking = await bookingService.confirmBooking(
      ticketId,
      paymentInfo
    );

    res.json({
      success: true,
      message: 'Booking confirmed successfully',
      data: confirmedBooking,
    });
  } catch (error) {
    console.error('Error confirming booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm booking',
      error: error.message,
    });
  }
});

// Update customer info (requires auth)
router.put(
  '/bookings/:ticketId/customer-info',
  authenticate,
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { name, email, phone } = req.body;

      if (!name || !email || !phone) {
        return res.status(400).json({
          success: false,
          message: 'All customer fields are required',
        });
      }

      // Get booking first
      const booking = await bookingService.getBookingById(ticketId);

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found',
        });
      }

      // Check if user owns this booking
      if (booking.userId !== req.user.cognitoId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access to booking',
        });
      }

      const updatedBooking = await bookingService.updateCustomerInfo(ticketId, {
        name,
        email,
        phone,
      });

      res.json({
        success: true,
        message: 'Customer info updated successfully',
        data: updatedBooking,
      });
    } catch (error) {
      console.error('Error updating customer info:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update customer info',
        error: error.message,
      });
    }
  }
);

// Cancel booking (requires auth)
router.delete('/bookings/:ticketId', authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;

    // Get booking first
    const booking = await bookingService.getBookingById(ticketId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Check if user owns this booking
    if (booking.userId !== req.user.cognitoId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to booking',
      });
    }

    await bookingService.cancelBooking(ticketId);

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking',
      error: error.message,
    });
  }
});

// Get user's bookings (requires auth)
router.get('/my-bookings', authenticate, async (req, res) => {
  try {
    const userId = req.user.cognitoId;
    const bookings = await bookingService.getUserBookings(userId);

    res.json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message,
    });
  }
});

// Cleanup expired bookings (admin endpoint - no auth for simplicity)
router.post('/bookings/cleanup', async (req, res) => {
  try {
    const result = await bookingService.cleanupExpiredBookings();

    res.json({
      success: true,
      message: `Cleaned up ${result.deleted} expired bookings`,
      data: result,
    });
  } catch (error) {
    console.error('Error cleaning up bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup bookings',
      error: error.message,
    });
  }
});

module.exports = router;
