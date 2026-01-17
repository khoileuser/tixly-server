/**
 * Tixly Email Notification Lambda Function
 *
 * This Lambda function is triggered by SQS messages and sends email notifications
 * via AWS SNS for booking confirmations and refund acceptances.
 *
 * Flow: ECS App -> SQS -> Lambda -> SNS -> Email
 */

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Generate booking confirmation email content
 */
const generateBookingConfirmationEmail = (data) => {
  const { booking, event, recipient } = data;

  const totalAmount =
    booking.totalAmount || booking.pricePerSeat * booking.seats?.length || 0;
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(totalAmount);

  const seatsDisplay = Array.isArray(booking.seats)
    ? booking.seats.join(', ')
    : booking.seats || 'N/A';

  const subject = `Booking Confirmed - ${event?.title || 'Your Event'}`;

  const message = `
Dear ${recipient.name || 'Valued Customer'},

Great news! Your booking has been confirmed!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BOOKING CONFIRMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Booking Details:
   • Booking Code: ${booking.bookingCode || booking.id}
   • Status: CONFIRMED

Event Information:
   • Event: ${event?.title || 'N/A'}
   • Date: ${event?.date || 'N/A'}
   • Time: ${event?.time || 'N/A'}
   • Venue: ${event?.venue || 'N/A'}
   • Location: ${event?.location || 'N/A'}

Ticket Details:
   • Seats: ${seatsDisplay}
   • Number of Tickets: ${booking.seats?.length || 1}
   • Price per Seat: $${booking.pricePerSeat || 0}
   • Total Amount: ${formattedAmount}

Customer Information:
   • Name: ${booking.customerName || recipient.name || 'N/A'}
   • Email: ${booking.customerEmail || recipient.email || 'N/A'}
   • Phone: ${booking.customerPhone || 'N/A'}

Purchase Date: ${
    booking.purchaseDate
      ? new Date(booking.purchaseDate).toLocaleString()
      : 'N/A'
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please save this email for your records. You may be required to show your booking code at the venue.

If you have any questions, please don't hesitate to contact us.

Thank you for choosing Tixly!

Best regards,
The Tixly Team

--
This is an automated message. Please do not reply directly to this email.
  `.trim();

  return { subject, message };
};

/**
 * Generate refund acceptance email content
 */
const generateRefundEmail = (data) => {
  const { booking, event, recipient } = data;

  const totalAmount =
    booking.totalAmount || booking.pricePerSeat * booking.seats?.length || 0;
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(totalAmount);

  const seatsDisplay = Array.isArray(booking.seats)
    ? booking.seats.join(', ')
    : booking.seats || 'N/A';

  const subject = `Refund Processed - ${event?.title || 'Your Event'}`;

  const message = `
Dear ${recipient.name || 'Valued Customer'},

Your refund request has been processed successfully.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REFUND CONFIRMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Refund Details:
   • Original Booking Code: ${booking.bookingCode || booking.id}
   • Status: REFUNDED
   • Refund Amount: ${formattedAmount}
   • Refund Date: ${
     booking.refundedAt
       ? new Date(booking.refundedAt).toLocaleString()
       : new Date().toLocaleString()
   }

Original Event:
   • Event: ${event?.title || 'N/A'}
   • Date: ${event?.date || 'N/A'}
   • Venue: ${event?.venue || 'N/A'}

Cancelled Tickets:
   • Seats: ${seatsDisplay}
   • Number of Tickets: ${booking.seats?.length || 1}

Refund Information:
   The refund will be processed to your original payment method.
   Please allow 5-10 business days for the refund to appear in your account.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

We're sorry to see you cancel your booking. We hope to see you at future events!

If you have any questions about your refund, please contact our support team.

Thank you for using Tixly!

Best regards,
The Tixly Team

--
This is an automated message. Please do not reply directly to this email.
  `.trim();

  return { subject, message };
};

/**
 * Send email via SNS
 */
const sendEmail = async (emailContent, recipientEmail) => {
  const snsTopicArn = process.env.SNS_TOPIC_ARN;

  if (!snsTopicArn) {
    console.error('SNS_TOPIC_ARN environment variable is not set');
    throw new Error('SNS_TOPIC_ARN not configured');
  }

  const params = {
    TopicArn: snsTopicArn,
    Subject: emailContent.subject,
    Message: emailContent.message,
    MessageAttributes: {
      email: {
        DataType: 'String',
        StringValue: recipientEmail,
      },
    },
  };

  try {
    const command = new PublishCommand(params);
    const result = await snsClient.send(command);
    console.log(`Email sent successfully. MessageId: ${result.MessageId}`);
    return result;
  } catch (error) {
    console.error('Failed to send email via SNS:', error);
    throw error;
  }
};

/**
 * Process a single SQS message
 */
const processMessage = async (record) => {
  console.log('Processing SQS message:', record.messageId);

  let messageBody;
  try {
    messageBody = JSON.parse(record.body);
  } catch (parseError) {
    console.error('Failed to parse message body:', parseError);
    throw new Error('Invalid message format');
  }

  const { type, data } = messageBody;

  if (!type || !data) {
    console.error('Missing required fields in message:', {
      type,
      hasData: !!data,
    });
    throw new Error('Missing required fields: type or data');
  }

  const recipientEmail = data.recipient?.email || data.booking?.customerEmail;

  if (!recipientEmail) {
    console.error('No recipient email found in message');
    throw new Error('No recipient email provided');
  }

  let emailContent;

  switch (type) {
    case 'BOOKING_CONFIRMED':
      console.log('Generating booking confirmation email for:', recipientEmail);
      emailContent = generateBookingConfirmationEmail(data);
      break;

    case 'REFUND_ACCEPTED':
      console.log('Generating refund notification email for:', recipientEmail);
      emailContent = generateRefundEmail(data);
      break;

    default:
      console.warn('Unknown notification type:', type);
      throw new Error(`Unknown notification type: ${type}`);
  }

  await sendEmail(emailContent, recipientEmail);

  console.log(
    `Successfully processed ${type} notification for ${recipientEmail}`
  );
};

/**
 * Lambda handler - processes SQS events
 */
exports.handler = async (event) => {
  console.log('Lambda invoked with event:', JSON.stringify(event, null, 2));

  const records = event.Records || [];
  console.log(`Processing ${records.length} SQS message(s)`);

  const results = {
    successful: 0,
    failed: 0,
    errors: [],
  };

  // Process each message
  for (const record of records) {
    try {
      await processMessage(record);
      results.successful++;
    } catch (error) {
      console.error(`Failed to process message ${record.messageId}:`, error);
      results.failed++;
      results.errors.push({
        messageId: record.messageId,
        error: error.message,
      });
    }
  }

  console.log('Processing complete:', results);

  // If any messages failed, throw an error to trigger SQS retry
  // This allows failed messages to be retried or sent to DLQ
  if (results.failed > 0) {
    const errorMessage = `Failed to process ${results.failed} message(s)`;
    console.error(errorMessage);
    // Note: In production, you might want to use partial batch response
    // to only retry failed messages. For simplicity, we'll throw here.
    throw new Error(errorMessage);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully processed ${results.successful} notification(s)`,
      results,
    }),
  };
};
