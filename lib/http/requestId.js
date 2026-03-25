const crypto = require("crypto");

/**
 * Express middleware to attach a unique request ID to each request
 * and echo it back in the response headers.
 */
function requestIdMiddleware(req, res, next) {
  const reqId = req.headers["x-request-id"] || crypto.randomUUID();
  req.id = reqId;
  res.setHeader("X-Request-Id", reqId);
  next();
}

module.exports = {
  requestIdMiddleware,
};
