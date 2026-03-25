const DEFAULT_THRESHOLD = 0.85;
const DEFAULT_RETRY_AFTER = 30;

function backPressureMiddleware(threshold, retryAfter) {
  const memThreshold = threshold || DEFAULT_THRESHOLD;
  const retrySecs = retryAfter || DEFAULT_RETRY_AFTER;

  return (req, res, next) => {
    // Endpoints that are lightweight and must remain accessible even under high load
    const exemptPaths = ['/download/', '/jobs/', '/health', '/upload-info'];
    const url = req.originalUrl || req.url || req.path || '';
    if (exemptPaths.some(p => url.includes(p))) {
      return next();
    }

    // Lazy-require to support test mocking
    const memGC = require('../memoryGC');

    // Use RSS (actual physical memory) for reliable pressure detection.
    // heapUsed/heapTotal is unreliable because V8 doesn't eagerly shrink heapTotal.
    const mem = memGC.getMemoryMB();
    const rssRatio = mem.rss / memGC.RSS_CEILING_MB;

    if (rssRatio > memThreshold) {
      // Attempt GC before rejecting — might free enough memory to proceed
      const didGC = memGC.tryGC();
      if (didGC) {
        const after = memGC.getMemoryMB();
        const newRatio = after.rss / memGC.RSS_CEILING_MB;
        if (newRatio <= memThreshold) {
          // GC freed enough memory, let the request through
          return next();
        }
      }

      res.set('Retry-After', String(retrySecs));
      return res.status(503).json({
        error: 'Server under high memory pressure. Please retry later.',
        retryAfter: retrySecs,
        memoryUsage: Math.round(rssRatio * 100),
      });
    }
    next();
  };
}

module.exports = { backPressureMiddleware, DEFAULT_THRESHOLD, DEFAULT_RETRY_AFTER };
