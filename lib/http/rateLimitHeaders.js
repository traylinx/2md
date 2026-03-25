const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { validateApiKey } = require('../auth/apiKeys');

// Define rate limits per tier
const TIER_LIMITS = {
  free: { windowMs: 60 * 60 * 1000, max: 20 },      // 20 requests per hour per IP (free)
  pro: { windowMs: 60 * 60 * 1000, max: 1000 },     // 1000 requests per hour (basic auth)
  enterprise: { windowMs: 60 * 60 * 1000, max: 10000 } // 10000 requests per hour (enterprise)
};

/**
 * Creates a tiered rate limiter middleware.
 * - Extracts Bearer token to determine tier.
 * - Falls back to IP-based 'free' tier if no/invalid token.
 * - Returns standard RateLimit headers.
 */
function createTieredLimiter() {
  return rateLimit({
    // Standard hour window
    windowMs: 60 * 60 * 1000,
    
    // Dynamic max based on authentication state
    max: (req, res) => {
      const authHeader = req.headers.authorization;
      const keyInfo = validateApiKey(authHeader);
      
      if (keyInfo && TIER_LIMITS[keyInfo.tier]) {
        // Attach key info to request for later logging
        req.apiAuth = keyInfo;
        return TIER_LIMITS[keyInfo.tier].max;
      }
      
      req.apiAuth = { tier: 'free', keyHash: 'ip' };
      return TIER_LIMITS.free.max;
    },
    
    // Use the API key as the identifier if present, otherwise fallback to IP
    keyGenerator: (req, res) => {
      if (req.apiAuth && req.apiAuth.keyHash !== 'ip') {
        return `api_key_${req.apiAuth.keyHash}`;
      }
      return ipKeyGenerator(req, res);
    },
    
    // Disable automatic IP validation to avoid ERR_ERL_KEY_GEN_IPV6 crash
    validate: { ip: false, xForwardedForHeader: false },
    
    // Standard headers (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset)
    standardHeaders: true,
    legacyHeaders: false,
    
    // Structured error response when rate limit is exceeded
    handler: (req, res, next, options) => {
      const { sendError, ERROR_CODES } = require('./errorResponse');
      const tierMsg = req.apiAuth.tier === 'free' 
        ? 'IP rate limit exceeded. Provide an API key via Authorization: Bearer header for higher limits.'
        : `${req.apiAuth.tier} tier rate limit exceeded.`;
        
      sendError(res, options.statusCode, tierMsg, ERROR_CODES.RATE_LIMITED);
    }
  });
}

// Create a singleton instance to use across all routes
const tieredApiLimiter = createTieredLimiter();

module.exports = {
  tieredApiLimiter,
  TIER_LIMITS
};
