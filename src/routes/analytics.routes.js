const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const authService = require('../services/auth.service');

/**
 * GET /api/v1/analytics
 * Get platform analytics (admin only)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const dynamoClient = req.app.locals.dynamoClient;

    // Check if user is admin
    const userProfile = await authService.getUserProfile(
      req.user.cognitoId,
      dynamoClient
    );

    if (!userProfile.success || userProfile.data.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
    }

    // Get analytics data
    const { ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

    // Count total users
    const usersResult = await dynamoClient.send(
      new ScanCommand({
        TableName: 'Users',
        Select: 'COUNT',
      })
    );
    const totalUsers = usersResult.Count || 0;

    // Count total events
    const eventsResult = await dynamoClient.send(
      new ScanCommand({
        TableName: 'Events',
        Select: 'COUNT',
      })
    );
    const totalEvents = eventsResult.Count || 0;

    // Get all tickets data
    const ticketsResult = await dynamoClient.send(
      new ScanCommand({
        TableName: 'Tickets',
      })
    );
    const tickets = ticketsResult.Items || [];

    // Calculate statistics
    const confirmedTickets = tickets.filter((t) => t.status === 'CONFIRMED');
    const pendingTickets = tickets.filter((t) => t.status === 'PENDING');

    const totalTicketsSold = confirmedTickets.length;
    const totalRevenue = confirmedTickets.reduce((sum, ticket) => {
      const ticketRevenue =
        ticket.pricePerSeat * (ticket.takenSeats?.length || 0);
      return sum + ticketRevenue;
    }, 0);
    const pendingBookings = pendingTickets.length;
    const averageOrderValue =
      totalTicketsSold > 0 ? totalRevenue / totalTicketsSold : 0;

    // Get recent activity (last 10 bookings/transactions)
    // Sort by the most recent action (created, confirmed, or refunded)
    const recentTickets = tickets
      .map((ticket) => {
        // Determine the most recent timestamp for this ticket
        const timestamps = [
          new Date(ticket.createdAt || 0).getTime(),
          new Date(ticket.updatedAt || 0).getTime(),
        ];
        if (ticket.refundedAt) {
          timestamps.push(new Date(ticket.refundedAt).getTime());
        }
        return {
          ...ticket,
          mostRecentTimestamp: Math.max(...timestamps),
        };
      })
      .sort((a, b) => b.mostRecentTimestamp - a.mostRecentTimestamp)
      .slice(0, 10);

    const recentActivity = recentTickets.map((ticket) => {
      const ticketValue = (
        ticket.pricePerSeat * (ticket.takenSeats?.length || 0)
      ).toFixed(2);

      // Determine activity type and description based on status
      if (ticket.status === 'REFUNDED') {
        return {
          type: 'Ticket Refunded',
          description: `${ticket.name || 'User'} refunded ${
            ticket.takenSeats?.length || 0
          } seat(s) - $${ticketValue}`,
          timestamp: ticket.refundedAt || ticket.updatedAt || ticket.createdAt,
        };
      } else if (ticket.status === 'CONFIRMED') {
        return {
          type: 'Ticket Purchased',
          description: `${ticket.name || 'User'} purchased ${
            ticket.takenSeats?.length || 0
          } seat(s) - $${ticketValue}`,
          timestamp:
            ticket.purchaseDate || ticket.updatedAt || ticket.createdAt,
        };
      } else {
        return {
          type: 'Booking Created',
          description: `${ticket.name || 'User'} created booking for ${
            ticket.takenSeats?.length || 0
          } seat(s) - $${ticketValue}`,
          timestamp: ticket.createdAt,
        };
      }
    });

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalEvents,
        totalTicketsSold,
        totalRevenue,
        pendingBookings,
        averageOrderValue,
        recentActivity,
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch analytics',
    });
  }
});

module.exports = router;
