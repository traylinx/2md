const crypto = require('crypto');
const { JOB_DOWNLOAD_SECRET, JOB_TTL_HOURS } = require('../config');

// Signature payload format: jobId|expiresAt
// Returns an object with the signed token string: { token, expiresAt }
function generateDownloadToken(jobId) {
  const expiresAt = new Date(Date.now() + JOB_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const payload = `${jobId}|${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', JOB_DOWNLOAD_SECRET)
    .update(payload)
    .digest('hex');
  
  // URL-safe base64 encode the payload and signature
  const token = Buffer.from(`${payload}|${signature}`).toString('base64url');
  
  return { token, expiresAt };
}

function verifyDownloadToken(jobId, token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [tokenJobId, expiresAt, providedSignature] = decoded.split('|');
    
    if (tokenJobId !== jobId) {
      return { valid: false, reason: 'Job ID mismatch' };
    }
    
    if (new Date() > new Date(expiresAt)) {
      return { valid: false, reason: 'Token expired' };
    }
    
    const expectedPayload = `${jobId}|${expiresAt}`;
    const expectedSignature = crypto
      .createHmac('sha256', JOB_DOWNLOAD_SECRET)
      .update(expectedPayload)
      .digest('hex');
      
    if (providedSignature !== expectedSignature) {
      return { valid: false, reason: 'Invalid signature' };
    }
    
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: 'Malformed token' };
  }
}

module.exports = {
  generateDownloadToken,
  verifyDownloadToken
};
