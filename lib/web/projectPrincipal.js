'use strict';
const { Deadline } = require('../capture/deadline');
const { WebBoundaryError, deny, identifier, principal } = require('./contracts');

function createProjectPrincipalResolver({ endpoint, fetchImpl = fetch } = {}) {
  let url;
  try { url = new URL(endpoint); } catch { deny('UNAVAILABLE'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) deny('UNAVAILABLE');
  const fixedEndpoint = url.href;
  return async function resolve({ authorization, organizationId, projectId, signal } = {}) {
    identifier(organizationId); identifier(projectId);
    if (typeof authorization !== 'string' || !/^Bearer [^\s]{1,8192}$/.test(authorization)) deny('UNAUTHENTICATED');
    const deadline = new Deadline(5000, signal);
    try {
      const target = new URL(fixedEndpoint);
      target.searchParams.set('organization_id', organizationId);
      target.searchParams.set('project_id', projectId);
      const response = await deadline.run(() => fetchImpl(target.href, {
        method: 'GET', redirect: 'error', cache: 'no-store', signal: deadline.signal,
        headers: { Authorization: authorization, Accept: 'application/json' },
      }));
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        deny(response.status === 401 ? 'UNAUTHENTICATED' : [403, 404].includes(response.status) ? 'FORBIDDEN' : 'UNAVAILABLE');
      }
      if (response.redirected || (response.url && response.url !== target.href) ||
          response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' ||
          response.headers.get('cache-control') !== 'no-store') {
        void response.body?.cancel().catch(() => {}); deny('UNAVAILABLE');
      }
      if (!response.body) deny('UNAVAILABLE');
      const reader = response.body.getReader(); const chunks = []; let size = 0;
      let body;
      try {
        for (;;) {
          const { done, value } = await deadline.run(() => reader.read());
          if (done) break;
          size += value.length;
          if (size > 4096) deny('UNAVAILABLE');
          chunks.push(Buffer.from(value));
        }
        body = Buffer.concat(chunks).toString('utf8');
      } finally { void reader.cancel().catch(() => {}); }
      if (body.includes(authorization.slice(7))) deny('UNAVAILABLE');
      const result = principal(JSON.parse(body));
      if (result.organizationId !== organizationId || result.projectId !== projectId) deny('FORBIDDEN');
      deadline.remaining();
      return result;
    } catch (error) {
      if (signal?.aborted) deny('CANCELLED');
      if (error instanceof WebBoundaryError) throw error;
      deny('UNAVAILABLE');
    } finally { deadline.close(); }
  };
}
module.exports = { createProjectPrincipalResolver };
