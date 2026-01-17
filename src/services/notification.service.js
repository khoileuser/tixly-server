const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const env = require('../config/env');

let sqsClient = null;

/**
 * Initialize SQS client
 */
const initSQS = () => {
  if (!sqsClient) {
    const clientConfig = {
      region: env.aws.region,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000,
        socketTimeout: 5000,
      }),
    };

    // Only set explicit credentials for local development
    if (env.aws.awsAccessKeyId && env.aws.awsSecretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: env.aws.awsAccessKeyId,
        secretAccessKey: env.aws.awsSecretAccessKey,
      };
    }

    sqsClient = new SQSClient(clientConfig);
  }
  return sqsClient;
};

/**
 * Notification types
 */
const NotificationType = {
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  REFUND_ACCEPTED: 'REFUND_ACCEPTED',
};

/**
 * Send a notification message to SQS queue
 * @param {Object} params - Notification parameters
 * @param {string} params.type - Notification type (BOOKING_CONFIRMED or REFUND_ACCEPTED)
 * @param {Object} params.booking - Booking data
 * @param {Object} params.event - Event data
 * @param {string} params.userEmail - User's email address
 */
const sendNotification = async ({ type, booking, event, userEmail }) => {
  // Skip if SQS queue URL is not configured
  if (!env.aws.sqsQueueUrl) {
    console.log(
      '[NotificationService] SQS Queue URL not configured, skipping notification'
    );
    return null;
  }

  const sqs = initSQS();

  const messageBody = {
    type,
    timestamp: new Date().toISOString(),
    data: {
      booking: {
        id: booking.id,
        bookingCode: booking.bookingCode,
        eventId: booking.eventId,
        seats: booking.takenSeats,
        totalAmount:
          (booking.pricePerSeat || 0) * (booking.takenSeats?.length || 0),
        pricePerSeat: booking.pricePerSeat,
        customerName: booking.name,
        customerEmail: booking.email || userEmail,
        customerPhone: booking.phoneNumber,
        status: booking.status,
        purchaseDate: booking.purchaseDate,
        refundedAt: booking.refundedAt,
      },
      event: event
        ? {
            id: event.id,
            title: event.title,
            date: event.date,
            time: event.time,
            location: event.location,
            venue: event.venue,
          }
        : null,
      recipient: {
        email: booking.email || userEmail,
        name: booking.name,
      },
    },
  };

  const params = {
    QueueUrl: env.aws.sqsQueueUrl,
    MessageBody: JSON.stringify(messageBody),
    MessageAttributes: {
      NotificationType: {
        DataType: 'String',
        StringValue: type,
      },
    },
  };

  try {
    const command = new SendMessageCommand(params);
    const result = await sqs.send(command);
    console.log(
      `[NotificationService] Message sent to SQS: ${result.MessageId}`,
      { type }
    );
    return result;
  } catch (error) {
    console.error(
      '[NotificationService] Failed to send message to SQS:',
      error
    );
    // Don't throw - we don't want to fail the booking if notification fails
    return null;
  }
};

/**
 * Send booking confirmation notification
 * @param {Object} booking - Booking data
 * @param {Object} event - Event data
 * @param {string} userEmail - User's email (fallback)
 */
const sendBookingConfirmation = async (booking, event, userEmail) => {
  return sendNotification({
    type: NotificationType.BOOKING_CONFIRMED,
    booking,
    event,
    userEmail,
  });
};

/**
 * Send refund acceptance notification
 * @param {Object} booking - Booking data
 * @param {Object} event - Event data
 * @param {string} userEmail - User's email (fallback)
 */
const sendRefundNotification = async (booking, event, userEmail) => {
  return sendNotification({
    type: NotificationType.REFUND_ACCEPTED,
    booking,
    event,
    userEmail,
  });
};

module.exports = {
  NotificationType,
  sendNotification,
  sendBookingConfirmation,
  sendRefundNotification,
};
