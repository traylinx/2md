'use strict';

// Public errors are an allowlist. Never serialize browser/provider messages.
const DEFINITIONS = Object.freeze({
  INVALID_INPUT: [400, 'Invalid capture request.'],
  UNAUTHENTICATED: [401, 'Caller authentication required.'],
  FORBIDDEN: [403, 'Capture scope denied.'],
  LIMIT_EXCEEDED: [413, 'Capture limit exceeded.'],
  TARGET_DENIED: [422, 'Target is not permitted.'],
  EMPTY_CONTENT: [422, 'No usable page content.'],
  AUTH_REQUIRED: [422, 'Website login required.'],
  AUTH_FAILED: [422, 'Website login failed.'],
  HUMAN_REQUIRED: [422, 'Human interaction required.'],
  TARGET_UNVERIFIED: [422, 'Authenticated target could not be verified.'],
  CAPACITY: [429, 'Capture capacity reached.'],
  UPSTREAM_FAILED: [502, 'Page capture failed.'],
  UNAVAILABLE: [503, 'Capture service unavailable.'],
  CLEANUP_FAILED: [503, 'Capture cleanup failed.'],
  DEADLINE: [504, 'Capture deadline exceeded.'],
  CANCELLED: [499, 'Capture cancelled.'],
});

class CaptureError extends Error {
  constructor(code) {
    const [status, message] = DEFINITIONS[code] || DEFINITIONS.UPSTREAM_FAILED;
    super(message);
    this.name = 'CaptureError';
    this.code = Object.hasOwn(DEFINITIONS, code) ? code : 'UPSTREAM_FAILED';
    this.status = status;
  }
}

function publicError(error, requestId) {
  const safe = error instanceof CaptureError ? error : new CaptureError('UPSTREAM_FAILED');
  return { status: safe.status, body: { success: false, error: safe.message,
    code: safe.code, requestId } };
}

module.exports = { CaptureError, publicError, DEFINITIONS };
