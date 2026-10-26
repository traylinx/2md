'use strict';
const { CaptureError } = require('./errors');

async function settle(page, deadline) {
  const warnings = [];
  try {
    await deadline.run(() => page.waitForNetworkIdle({ idleTime: 500,
      timeout: Math.min(5000, deadline.remaining(1200)) }));
  } catch (error) {
    deadline.remaining(1200);
    if (error instanceof CaptureError || error.name !== 'TimeoutError') throw error;
    warnings.push('NETWORK_NOT_IDLE');
  }
  await deadline.sleep(Math.min(1000, deadline.remaining(200)));
  return warnings;
}

module.exports = { settle };
