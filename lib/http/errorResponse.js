/**
 * Creates a structured JSON error response
 * @param {Object} res - Express response object
 * @param {number} status - HTTP status code
 * @param {string} error - Human readable error message
 * @param {string} code - Machine readable uppercase error code
 * @param {string} method - The conversion method context (e.g., 'browser', 'auto', 'native', none)
 * @returns {Object} The Express response object (for chaining/returning)
 */
function sendError(res, status, error, code = 'INTERNAL_ERROR', method = 'unknown') {
  // Try to use a custom header to track request ID if available
  const requestId = res.req && res.req.id ? res.req.id : undefined;
  
  const payload = {
    success: false,
    error,
    code,
    method
  };

  if (requestId) {
    payload.requestId = requestId;
  }

  return res.status(status).json(payload);
}

const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  METHOD_NOT_SUPPORTED: 'METHOD_NOT_SUPPORTED',
  TIMEOUT: 'TIMEOUT',
  BROWSER_ERROR: 'BROWSER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR'
};

module.exports = {
  sendError,
  ERROR_CODES
};
