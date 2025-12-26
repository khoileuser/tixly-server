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
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');

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
  const bookingId = uuidv4();
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + env.bookingTimeoutMinutes * 60 * 1000
  ).toISOString();

  const booking = {
    ticketId: bookingId,
    eventId: bookingData.eventId,
    userId: bookingData.userId,
    takenSeats: bookingData.seats, // Array of seat IDs
    status: 'PENDING',
    pricePerSeat: bookingData.pricePerSeat,
    purchaseDate: now,
    createdAt: now,
    updatedAt: now,
    expiresAt: expiresAt,
    // User info fields (can be updated later)
    name: bookingData.name || '',
    email: bookingData.email || '',
    phone: bookingData.phone || '',
  };

  const params = {
    TableName: 'Tickets',
    Item: booking,
  };

  await db.send(new PutCommand(params));
  return booking;
};

// Get booking by ID
const getBookingById = async (ticketId) => {
  const db = initDynamoDB();

  const params = {
    TableName: 'Tickets',
    Key: { ticketId },
  };

  const result = await db.send(new GetCommand(params));
  return result.Item;
};

// Update booking payment info and confirm
const confirmBooking = async (ticketId, paymentInfo) => {
  const db = initDynamoDB();
  const now = new Date().toISOString();

  // Get the booking first to get event and seats info
  const booking = await getBookingById(ticketId);
  if (!booking) {
    throw new Error('Booking not found');
  }

  // Update ticket status to CONFIRMED
  const ticketParams = {
    TableName: 'Tickets',
    Key: { ticketId },
    UpdateExpression:
      'SET #status = :status, updatedAt = :updatedAt, paymentInfo = :paymentInfo, confirmedAt = :confirmedAt',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':status': 'CONFIRMED',
      ':updatedAt': now,
      ':paymentInfo': paymentInfo,
      ':confirmedAt': now,
    },
    ReturnValues: 'ALL_NEW',
  };

  // Update event's takenSeats array
  const eventParams = {
    TableName: 'Events',
    Key: { id: booking.eventId },
    UpdateExpression:
      'SET takenSeats = list_append(if_not_exists(takenSeats, :emptyList), :seats), updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':seats': booking.takenSeats,
      ':emptyList': [],
      ':updatedAt': now,
    },
  };

  // Execute both updates
  await Promise.all([
    db.send(new UpdateCommand(ticketParams)),
    db.send(new UpdateCommand(eventParams)),
  ]);

  const result = await db.send(new UpdateCommand(ticketParams));
  return result.Attributes;
};

// Update customer info on ticket
const updateCustomerInfo = async (ticketId, customerInfo) => {
  const db = initDynamoDB();
  const now = new Date().toISOString();

  const params = {
    TableName: 'Tickets',
    Key: { ticketId },
    UpdateExpression:
      'SET #name = :name, email = :email, phone = :phone, updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#name': 'name',
    },
    ExpressionAttributeValues: {
      ':name': customerInfo.name,
      ':email': customerInfo.email,
      ':phone': customerInfo.phone,
      ':updatedAt': now,
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

  // Only remove seats from event if booking was CONFIRMED
  if (booking.status === 'CONFIRMED') {
    // Get current event data
    const eventResult = await db.send(
      new GetCommand({
        TableName: 'Events',
        Key: { id: booking.eventId },
      })
    );

    if (eventResult.Item) {
      const event = eventResult.Item;
      const updatedTakenSeats = (event.takenSeats || []).filter(
        (seat) => !booking.takenSeats.includes(seat)
      );

      // Update event's takenSeats array
      await db.send(
        new UpdateCommand({
          TableName: 'Events',
          Key: { id: booking.eventId },
          UpdateExpression: 'SET takenSeats = :seats, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':seats': updatedTakenSeats,
            ':updatedAt': new Date().toISOString(),
          },
        })
      );
    }
  }

  // Delete the ticket
  const params = {
    TableName: 'Tickets',
    Key: { ticketId },
  };

  await db.send(new DeleteCommand(params));
  return { success: true, message: 'Booking cancelled' };
};

// Get booked seats for an event (from event's takenSeats array)
const getBookedSeats = async (eventId) => {
  const db = initDynamoDB();

  const params = {
    TableName: 'Events',
    Key: { id: eventId },
  };

  const result = await db.send(new GetCommand(params));

  if (!result.Item) {
    return [];
  }

  // Also get pending bookings to include temporarily reserved seats
  const ticketsParams = {
    TableName: 'Tickets',
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
    TableName: 'Tickets',
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

  // Delete expired bookings
  const deletePromises = result.Items.map((ticket) =>
    db.send(
      new DeleteCommand({
        TableName: 'Tickets',
        Key: { ticketId: ticket.ticketId },
      })
    )
  );

  await Promise.all(deletePromises);
  return { deleted: result.Items.length };
};

// Get user's bookings
const getUserBookings = async (userId) => {
  const db = initDynamoDB();

  const params = {
    TableName: 'Tickets',
    FilterExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
  };

  const result = await db.send(new ScanCommand(params));
  return result.Items || [];
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
};
