const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// The SNS topic prefix is used to construct the full topic ARN.
// Expected format: notifications-production, notifications-development, etc.
const getTopicArn = () => {
  const prefix = process.env.SNS_TOPIC_PREFIX || 'notifications-development';
  // AWS_ACCOUNT_ID is implicitly available when publishing if we just use the name for the topic in the same account?
  // Wait, SNS requires the full ARN. Let's construct it.
  const region = process.env.S3_REGION || 'eu-west-1';
  // We need the account ID. Instead of hardcoding, we can fetch it via STS, or require it.
  // Wait, the aws-sdk allows publishing to a TopicArn.
  // We saw the topic ARN was: arn:aws:sns:eu-west-1:618255143280:notifications-production-setup_notification
  // Let's use the explicit ARN if provided, or build it.
  const accountId = process.env.AWS_ACCOUNT_ID || '618255143280';
  return `arn:aws:sns:${region}:${accountId}:${prefix}-setup_notification`;
};

const createClient = () => {
  return new SNSClient({
    region: process.env.S3_REGION || 'eu-west-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
};

/**
 * Publishes a job completion notification to the Traylinx SNS topic.
 * The notifications_ms microservice will pick this up and send an email via SES.
 * 
 * @param {Object} params
 * @param {string} params.jobId - The unique job ID
 * @param {string} params.email - The recipient email
 * @param {string} params.url - The URL that was crawled (used in body)
 * @param {string} params.downloadUrl - The secure download link
 * @param {number} params.pageCount - Number of pages converted
 * @returns {Promise<{published: boolean, error: string|null}>}
 */
async function publishJobNotification({ jobId, email, url, downloadUrl, pageCount }) {
  if (!email || !downloadUrl) {
    return { published: false, error: 'Missing email or downloadUrl' };
  }

  const client = createClient();
  const topicArn = getTopicArn();
  
  // Format matching the Traylinx notifications_ms spec
  const messagePayload = {
    message: {
      id: `html2md-job-${jobId}`,
      resource: {
        url: downloadUrl,
        title: "Your crawl results are ready",
        name: "2MD Crawl Results",
        body: `<p>Your crawl of <strong>${url}</strong> is complete. ${pageCount} pages were successfully converted.</p>`,
        subject: `Your 2MD crawl is ready — ${pageCount} pages converted`,
        txtBody: `Your crawl of ${url} is complete. ${pageCount} pages were successfully converted.`,
        resourceId: jobId,
        resourceType: "crawl_result",
        object: "job"
      },
      settings: {
        email: email,
        sender_email: "noreply@traylinx.com",
        sender_name: "2MD by Traylinx",
        sender_text: "Best regards,<br>The 2MD Team",
        logo_url: "https://public-uploads-ma-production.s3.eu-west-1.amazonaws.com/traylinx_icon_logo.png",
        product: "2MD by Traylinx",
        product_url: "2md.traylinx.com",
        product_text: "2MD converts websites to Markdown. For support, visit 2md.traylinx.com.",
        button_text: "Download Results",
        link_url: downloadUrl,
        title: "Hello!",
        body_content: `<p>Your crawl of <strong>${url}</strong> is complete.</p><p>Click below to download your results. This link expires in ${process.env.JOB_TTL_HOURS || 72} hours.</p>`,
        sendTo: ["email"]
      }
    }
  };

  try {
    const command = new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(messagePayload)
    });

    await client.send(command);
    console.log(`[SNS] Published notification for job ${jobId} to ${email}`);
    return { published: true, error: null };
  } catch (error) {
    console.error(`[SNS] Failed to publish notification for job ${jobId}:`, error);
    return { published: false, error: error.message };
  }
}

module.exports = {
  publishJobNotification
};
