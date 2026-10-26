'use strict';
// Isolated lifecycle test double, never shipped in the capture image.
const fs = require('node:fs');
process.once('message', message => {
  fs.writeFileSync(`${message.profile}/synthetic-cookie`, 'synthetic-secret-canary');
  const mode = new URL(message.request.url).pathname;
  if (mode === '/crash') return process.exit(7);
  if (mode === '/hang') return setInterval(() => {}, 1000);
  if (mode === '/error') return process.send({ type: 'error', code: 'AUTH_FAILED' }, () => process.exit(0));
  process.send({ type: 'result', result: { success: true, markdown: 'Owned fixture content' } }, () => process.exit(0));
});
