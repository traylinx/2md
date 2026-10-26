'use strict';
const { randomUUID } = require('node:crypto');
const { Deadline } = require('../lib/capture/deadline');
const { CaptureError, publicError } = require('../lib/capture/errors');
const { readBody } = require('../lib/capture/readBody');
const { validateRequest } = require('../lib/capture/requestContract');
const { assertScope } = require('../lib/capture/principal');
const { freezeRecipe } = require('../lib/capture/recipe');
const { Capacity } = require('../lib/capture/capacity');
const { captureCredentials } = require('../lib/capture/sentinelPrincipal');

// Register before legacy express.json(). Only these exact opt-in routes consume
// bodies here; legacy middleware, serializers and admission remain untouched.
function registerCapture(app, { publicEnabled = false, privateEnabled = false,
  verify, capture, capacity = new Capacity() } = {}) {
  function handler(privateMode) {
    return async (req, res) => {
      const requestId = randomUUID(), controller = new AbortController();
      const deadline = new Deadline(privateMode ? 60000 : 30000, controller.signal);
      const onClose = () => { if (!res.writableFinished) controller.abort(); };
      res.once('close', onClose);
      res.set('Cache-Control', 'no-store');
      let release, request, raw;
      try {
        if (!verify || !capture) throw new CaptureError('UNAVAILABLE');
        const credentials = captureCredentials(req);
        const principal = await verify(credentials.authorization, deadline, credentials);
        if (!principal.operations.includes(privateMode ? 'capture:authenticated' : 'capture:public')) throw new CaptureError('FORBIDDEN');
        // Private credentials are not read until an immediate slot is reserved.
        if (privateMode) release = await capacity.acquire(principal.id, deadline, true);
        raw = await readBody(req, privateMode ? 32768 : 16384, deadline);
        request = validateRequest(raw, privateMode);
        raw = null;
        deadline.tighten(request.budgetMs);
        assertScope(principal, request, privateMode);
        const recipe = privateMode ? freezeRecipe(request) : undefined;
        if (!release) release = await capacity.acquire(principal.id, deadline);
        const result = await capture(request, { deadline, recipe, requestId, allowedOrigins: principal.origins });
        const current = await verify(credentials.authorization, deadline, credentials);
        if (current.id !== principal.id) throw new CaptureError('FORBIDDEN');
        assertScope(current, request, privateMode);
        deadline.remaining();
        if (!res.destroyed) res.json(result);
      } catch (error) {
        const safe = publicError(error, requestId);
        if (!res.destroyed && !res.headersSent) res.status(safe.status).json(safe.body);
      } finally {
        try {
          for (const value of [request, raw]) {
            if (value?.auth && typeof value.auth === 'object') {
              value.auth.username = ''; value.auth.password = ''; value.auth = null;
            }
          }
        } catch { /* malformed input must never escape into Express error logs */ }
        finally {
          request = null; raw = null;
          try { release?.(); }
          finally { deadline.close(); res.removeListener('close', onClose); }
        }
      }
    };
  }
  if (publicEnabled) app.post('/api/capture/v1', handler(false));
  if (privateEnabled) app.post('/api/capture/v1/authenticated', handler(true));
  return { stop: () => capacity.stop(), capacity };
}

module.exports = registerCapture;
