const { SNSClient, SubscribeCommand } = require('@aws-sdk/client-sns');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const env = require('../config/env');

let snsClient = null;

/**
 * Initialize SNS client
 */
const initSNS = () => {
  if (!snsClient) {
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

    snsClient = new SNSClient(clientConfig);
  }
  return snsClient;
};

/**
 * Subscribe an email address to the SNS topic
 * @param {string} email - Email address to subscribe
 * @returns {Promise<Object>} Subscription result with subscriptionArn
 */
const subscribeEmail = async (email) => {
  // Skip if SNS topic ARN is not configured
  if (!env.aws.snsTopicArn) {
    console.log(
      '[SNSService] SNS Topic ARN not configured, skipping email subscription'
    );
    return null;
  }

  if (!email) {
    throw new Error('Email address is required for SNS subscription');
  }

  const sns = initSNS();

  const params = {
    Protocol: 'email',
    TopicArn: env.aws.snsTopicArn,
    Endpoint: email,
  };

  try {
    const command = new SubscribeCommand(params);
    const result = await sns.send(command);

    console.log(`[SNSService] Email subscription created for ${email}`, {
      subscriptionArn: result.SubscriptionArn,
    });

    return {
      success: true,
      subscriptionArn: result.SubscriptionArn,
      message:
        'Subscription created. Please check your email to confirm the subscription.',
    };
  } catch (error) {
    console.error('[SNSService] Failed to subscribe email to SNS:', error);
    // Don't throw - we don't want to fail registration if SNS subscription fails
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  subscribeEmail,
};
