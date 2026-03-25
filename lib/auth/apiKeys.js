const crypto = require('crypto');

/**
 * Validates a Bearer token API key against environment configuration.
 * 
 * Supports two formats in process.env.API_KEYS:
 * 1. Simple comma-separated list: "key1,key2" -> all keys get 'pro' tier
 * 2. Tiered JSON format: {"pro": ["key1"], "enterprise": ["key2"]}
 * 
 * @param {string} authorizationHeader - The raw "Authorization: Bearer <key>" header
 * @returns {Object|null} - Returns { tier, keyHash } if valid, null if invalid
 */
function validateApiKey(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return null;
  }

  const key = authorizationHeader.substring(7).trim();
  if (!key) return null;

  const rawKeysEnv = process.env.API_KEYS;
  if (!rawKeysEnv) return null;

  let isValid = false;
  let tier = 'pro'; // Default tier

  try {
    // Try to parse as structured tiered JSON configuration first
    if (rawKeysEnv.startsWith('{')) {
      const tieredConfig = JSON.parse(rawKeysEnv);
      for (const [tierName, keys] of Object.entries(tieredConfig)) {
        if (Array.isArray(keys) && keys.includes(key)) {
          isValid = true;
          tier = tierName;
          break;
        }
      }
    } else {
      // Fallback to simple comma-separated list
      const validKeys = rawKeysEnv.split(',').map(k => k.trim()).filter(Boolean);
      if (validKeys.includes(key)) {
        isValid = true;
      }
    }
  } catch (err) {
    // If JSON parsing fails but it wasn't valid JSON, fallback to CSV check
    const validKeys = rawKeysEnv.split(',').map(k => k.trim()).filter(Boolean);
    if (validKeys.includes(key)) {
      isValid = true;
    }
  }

  if (isValid) {
    // Return a hash of the key for logging/tracking purposes without exposing the actual key
    const keyHash = crypto.createHash('sha256').update(key).digest('hex').substring(0, 8);
    return { tier, keyHash };
  }

  return null;
}

module.exports = { validateApiKey };
