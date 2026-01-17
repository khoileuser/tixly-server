const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const env = require('../config/env');
const { BookingModel, EventModel } = require('../models');
const notificationService = require('./notification.service');

let dynamoDb = null;

const initDynamoDB = () => {
  if (!dynamoDb) {
    const clientConfig = {
      region: env.aws.region,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000,
        socketTimeout: 5000,
      }),
    };

    if (env.aws.dynamodbEndpoint) {
      clientConfig.endpoint = env.aws.dynamodbEndpoint;
    }

    if (env.aws.awsAccessKeyId && env.aws.awsSecretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: env.aws.awsAccessKeyId,
        secretAccessKey: env.aws.awsSecretAccessKey,
      };
    }

    const client = new DynamoDBClient(clientConfig);
    dynamoDb = DynamoDBDocumentClient.from(client);
  }
  return dynamoDb;
};

// Create a booking (ticket with PENDING status)
const createBooking = async (bookingData) => {
  const db = initDynamoDB();

  try {
    // Prepare booking data with validation
    const bookingToCreate = {
      eventId: bookingData.eventId,
      pricePerSeat: bookingData.pricePerSeat || 0,
      takenSeats: bookingData.seats, // Array of seat identifiers
      userId: bookingData.userId,
      name: bookingData.name || '',
      email: bookingData.email || '',
      phoneNumber: bookingData.phoneNumber || '',
      status: 'PENDING',
      purchaseDate: new Date().toISOString(),
    };

    // Validate using model
    const validatedBooking = BookingModel.validate(bookingToCreate);

    // Prepare for creation (adds id, bookingCode, timestamps, expiration)
    const booking = BookingModel.prepareForCreation(validatedBooking);

    const params = {
      TableName: BookingModel.tableName,
      Item: booking,
    };

    await db.send(new PutCommand(params));
    return booking;
  } catch (error) {
    console.error('Booking creation error:', error);
    if (error.message.includes('Validation failed')) {
      throw new Error(`Invalid booking data: ${error.message}`);
    }
    throw error;
  }
};

// Get booking by ID
const getBookingById = async (ticketId) => {
  const db = initDynamoDB();

  const params = {
    TableName: BookingModel.tableName,
    Key: { id: ticketId },
  };

  const result = await db.send(new GetCommand(params));
  return result.Item;
};

// Update booking payment info and confirm
const confirmBooking = async (ticketId, paymentInfo) => {
  const db = initDynamoDB();

  // Get the booking first to validate and get event info
  const booking = await getBookingById(ticketId);
  if (!booking) {
    throw new Error('Booking not found');
  }

  // Check if booking can be confirmed using model helper
  if (!BookingModel.canBeConfirmed(booking)) {
    throw new Error(
      'Booking cannot be confirmed (either not pending or expired)'
    );
  }

  // Prepare confirmation data using model
  const confirmationData = BookingModel.prepareForConfirmation(booking);

  // Update ticket status to CONFIRMED
  const ticketParams = {
    TableName: BookingModel.tableName,
    Key: { id: ticketId },
    UpdateExpression:
      'SET #status = :status, updatedAt = :updatedAt, paymentInfo = :paymentInfo, purchaseDate = :purchaseDate, expiresAt = :expiresAt',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':status': confirmationData.status,
      ':updatedAt': confirmationData.updatedAt,
      ':purchaseDate': confirmationData.purchaseDate,
      ':expiresAt': null,
      ':paymentInfo': paymentInfo,
    },
    ReturnValues: 'ALL_NEW',
  };

  // Update event's takenSeats array
  const eventParams = {
    TableName: EventModel.tableName,
    Key: { id: booking.eventId },
    UpdateExpression:
      'SET takenSeats = list_append(if_not_exists(takenSeats, :emptyList), :seats), updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':seats': booking.takenSeats,
      ':emptyList': [],
      ':updatedAt': confirmationData.updatedAt,
    },
  };

  // Execute both updates
  await Promise.all([
    db.send(new UpdateCommand(ticketParams)),
    db.send(new UpdateCommand(eventParams)),
  ]);

  const result = await db.send(new UpdateCommand(ticketParams));
  const confirmedBooking = result.Attributes;

  // Send booking confirmation email notification (async, non-blocking)
  try {
    // Fetch event details for the notification
    const eventResult = await db.send(
      new GetCommand({
        TableName: EventModel.tableName,
        Key: { id: booking.eventId },
      })
    );
    const event = eventResult.Item;

    // Send notification to SQS (fire and forget)
    notificationService
      .sendBookingConfirmation(confirmedBooking, event, booking.email)
      .catch((err) =>
        console.error(
          '[BookingService] Failed to queue confirmation notification:',
          err
        )
      );
  } catch (notificationError) {
    // Log but don't fail the booking confirmation
    console.error(
      '[BookingService] Error preparing confirmation notification:',
      notificationError
    );
  }

  return confirmedBooking;
};

// Update customer info on ticket
const updateCustomerInfo = async (ticketId, customerInfo) => {
  const db = initDynamoDB();

  // Prepare update data with model
  const updateData = BookingModel.prepareForUpdate({
    name: customerInfo.name,
    email: customerInfo.email,
    phoneNumber: customerInfo.phoneNumber,
  });

  const params = {
    TableName: BookingModel.tableName,
    Key: { id: ticketId },
    UpdateExpression:
      'SET #name = :name, email = :email, phoneNumber = :phoneNumber, updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#name': 'name',
    },
    ExpressionAttributeValues: {
      ':name': customerInfo.name,
      ':email': customerInfo.email,
      ':phoneNumber': customerInfo.phoneNumber,
      ':updatedAt': updateData.updatedAt,
    },
    ReturnValues: 'ALL_NEW',
  };

  const result = await db.send(new UpdateCommand(params));
  return result.Attributes;
};

// Cancel booking (delete ticket and release seats from event)
const cancelBooking = async (ticketId) => {
  const db = initDynamoDB();

  // Get the booking first to get event and seats info
  const booking = await getBookingById(ticketId);
  if (!booking) {
    throw new Error('Booking not found');
  }

  // Check if booking can be cancelled using model helper
  if (!BookingModel.canBeCancelled(booking)) {
    throw new Error('Booking cannot be cancelled');
  }

  // Only remove seats from event if booking was CONFIRMED
  if (booking.status === 'CONFIRMED') {
    // Get current event data
    const eventResult = await db.send(
      new GetCommand({
        TableName: EventModel.tableName,
        Key: { id: booking.eventId },
      })
    );

    if (eventResult.Item) {
      const event = eventResult.Item;
      const updatedTakenSeats = (event.takenSeats || []).filter(
        (seat) => !booking.takenSeats.includes(seat)
      );

      // Update event's takenSeats array with model timestamp
      const updateData = EventModel.prepareForUpdate({
        takenSeats: updatedTakenSeats,
      });

      await db.send(
        new UpdateCommand({
          TableName: EventModel.tableName,
          Key: { id: booking.eventId },
          UpdateExpression: 'SET takenSeats = :seats, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':seats': updatedTakenSeats,
            ':updatedAt': updateData.updatedAt,
          },
        })
      );
    }
  }

  // Delete the ticket
  const params = {
    TableName: BookingModel.tableName,
    Key: { id: ticketId },
  };

  await db.send(new DeleteCommand(params));
  return { success: true, message: 'Booking cancelled' };
};

// Get booked seats for an event (from event's takenSeats array)
const getBookedSeats = async (eventId) => {
  const db = initDynamoDB();

  const params = {
    TableName: EventModel.tableName,
    Key: { id: eventId },
  };

  const result = await db.send(new GetCommand(params));

  if (!result.Item) {
    return [];
  }

  // Also get pending bookings to include temporarily reserved seats
  const ticketsParams = {
    TableName: BookingModel.tableName,
    FilterExpression: 'eventId = :eventId AND #status = :pending',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':eventId': eventId,
      ':pending': 'PENDING',
    },
  };

  const ticketsResult = await db.send(new ScanCommand(ticketsParams));

  // Combine confirmed seats (from event) with pending seats (from tickets)
  const confirmedSeats = result.Item.takenSeats || [];
  const pendingSeats = ticketsResult.Items.reduce((acc, ticket) => {
    return acc.concat(ticket.takenSeats || []);
  }, []);

  return [...new Set([...confirmedSeats, ...pendingSeats])]; // Remove duplicates
};

// Clean up expired bookings
const cleanupExpiredBookings = async () => {
  const db = initDynamoDB();
  const now = new Date().toISOString();

  const params = {
    TableName: BookingModel.tableName,
    FilterExpression: '#status = :pending AND expiresAt < :now',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':pending': 'PENDING',
      ':now': now,
    },
  };

  const result = await db.send(new ScanCommand(params));

  // Filter using model helper method for extra safety
  const expiredBookings = result.Items.filter((booking) =>
    BookingModel.isExpired(booking)
  );

  // Delete expired bookings
  const deletePromises = expiredBookings.map((ticket) =>
    db.send(
      new DeleteCommand({
        TableName: BookingModel.tableName,
        Key: { id: ticket.id },
      })
    )
  );

  await Promise.all(deletePromises);
  return { deleted: expiredBookings.length };
};

// Get user's bookings with event details
const getUserBookings = async (userId) => {
  const db = initDynamoDB();

  // Use UserIdIndex for better performance
  const params = {
    TableName: BookingModel.tableName,
    IndexName: 'UserIdIndex',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
  };

  const result = await db.send(new QueryCommand(params));
  const tickets = result.Items || [];

  // Fetch event details for each ticket
  const ticketsWithEvents = await Promise.all(
    tickets.map(async (ticket) => {
      try {
        const eventResult = await db.send(
          new GetCommand({
            TableName: EventModel.tableName,
            Key: { id: ticket.eventId },
          })
        );

        return {
          ...ticket,
          event: eventResult.Item || null,
        };
      } catch (error) {
        console.error(`Error fetching event ${ticket.eventId}:`, error);
        return {
          ...ticket,
          event: null,
        };
      }
    })
  );

  // Sort by purchase date, newest first
  return ticketsWithEvents.sort((a, b) => {
    return (
      new Date(b.purchaseDate || b.createdAt) -
      new Date(a.purchaseDate || a.createdAt)
    );
  });
};

// Refund a booking
const refundBooking = async (ticketId) => {
  const db = initDynamoDB();

  // Get the booking first
  const booking = await getBookingById(ticketId);

  if (!booking) {
    throw new Error('Booking not found');
  }

  // Check if booking can be refunded using model helper
  if (!BookingModel.canBeRefunded(booking)) {
    throw new Error(
      'Booking cannot be refunded. Refunds are only available within 24 hours of purchase for confirmed bookings.'
    );
  }

  // Prepare refund data
  const refundData = BookingModel.prepareForRefund(booking);

  // Update booking status
  await db.send(
    new UpdateCommand({
      TableName: BookingModel.tableName,
      Key: { id: ticketId },
      UpdateExpression:
        'SET #status = :status, refundedAt = :refundedAt, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': refundData.status,
        ':refundedAt': refundData.refundedAt,
        ':updatedAt': refundData.updatedAt,
      },
    })
  );

  // Release seats from event
  const eventResult = await db.send(
    new GetCommand({
      TableName: EventModel.tableName,
      Key: { id: booking.eventId },
    })
  );

  if (eventResult.Item) {
    const event = eventResult.Item;
    const updatedTakenSeats = (event.takenSeats || []).filter(
      (seat) => !booking.takenSeats.includes(seat)
    );

    // Update event's takenSeats array
    const updateData = EventModel.prepareForUpdate({
      takenSeats: updatedTakenSeats,
    });

    await db.send(
      new UpdateCommand({
        TableName: EventModel.tableName,
        Key: { id: booking.eventId },
        UpdateExpression: 'SET takenSeats = :seats, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':seats': updatedTakenSeats,
          ':updatedAt': updateData.updatedAt,
        },
      })
    );
  }

  const refundedBooking = { ...booking, ...refundData };

  // Send refund notification email (async, non-blocking)
  try {
    const event = eventResult?.Item || null;
    // Send notification to SQS (fire and forget)
    notificationService
      .sendRefundNotification(refundedBooking, event, booking.email)
      .catch((err) =>
        console.error(
          '[BookingService] Failed to queue refund notification:',
          err
        )
      );
  } catch (notificationError) {
    // Log but don't fail the refund
    console.error(
      '[BookingService] Error preparing refund notification:',
      notificationError
    );
  }

  return {
    success: true,
    message: 'Booking refunded successfully',
    data: refundedBooking,
  };
};

module.exports = {
  initDynamoDB,
  createBooking,
  getBookingById,
  confirmBooking,
  updateCustomerInfo,
  cancelBooking,
  getBookedSeats,
  cleanupExpiredBookings,
  getUserBookings,
  refundBooking,
};
