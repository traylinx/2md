'use strict';
const { CaptureError } = require('./errors');
const { parseTarget } = require('./targetPolicy');

// Operator-owned resource permission, never a caller request field or navigation
// grant. Exact public HTTPS origins only; DNS is still checked per request.
function resourceOrigins(grant) {
  if (grant.resourceOrigins === undefined) return [];
  const values = grant.resourceOrigins;
  if (!Array.isArray(values) || values.length > 16) throw new CaptureError('FORBIDDEN');
  return values.map(value => {
    try {
      const url = parseTarget(value);
      if (url.protocol !== 'https:' || url.origin !== value) throw new Error();
      return value;
    } catch { throw new CaptureError('FORBIDDEN'); }
  });
}
function resourceGrant(grant) {
  const origins = resourceOrigins(grant);
  return grant.resourceOrigins === undefined ? {} : { resourceOrigins: origins };
}
module.exports = { resourceOrigins, resourceGrant };
