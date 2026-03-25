const crypto = require('crypto');

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const TIMEOUT_MS = 10000;

function isValidWebhookUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function signPayload(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function deliverWebhook(webhookUrl, payload, { secret, jobId } = {}) {
  if (!isValidWebhookUrl(webhookUrl)) {
    console.error(`[Webhook] Invalid URL: ${webhookUrl}`);
    return { delivered: false, error: 'Invalid webhook URL' };
  }

  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'html2md-webhook/1.0',
  };

  if (secret) {
    headers['X-Webhook-Signature'] = `sha256=${signPayload(body, secret)}`;
  }
  if (jobId) {
    headers['X-Job-Id'] = jobId;
  }

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * Math.pow(4, attempt - 1);
      console.log(`[Webhook] Retry ${attempt}/${MAX_RETRIES} for ${webhookUrl} in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        console.log(`[Webhook] Delivered to ${webhookUrl} (attempt ${attempt + 1}, status ${response.status})`);
        return { delivered: true, status: response.status, attempts: attempt + 1 };
      }

      lastError = `HTTP ${response.status}`;
      console.warn(`[Webhook] Failed attempt ${attempt + 1} → ${lastError}`);

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        break;
      }
    } catch (err) {
      lastError = err.name === 'AbortError' ? 'Timeout' : err.message;
      console.warn(`[Webhook] Failed attempt ${attempt + 1} → ${lastError}`);
    }
  }

  console.error(`[Webhook] All attempts exhausted for ${webhookUrl}: ${lastError}`);
  return { delivered: false, error: lastError, attempts: MAX_RETRIES + 1 };
}

module.exports = { deliverWebhook, isValidWebhookUrl };
