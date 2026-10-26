'use strict';
const { CaptureError } = require('./errors');

async function readBody(req, maximum, deadline) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] || '') ||
      req.headers['content-encoding']) throw new CaptureError('INVALID_INPUT');
  if (Number(req.headers['content-length'] || 0) > maximum) throw new CaptureError('LIMIT_EXCEEDED');
  const chunks = []; let size = 0;
  const abort = () => req.destroy();
  deadline.signal.addEventListener('abort', abort, { once: true });
  try {
    return await deadline.run(async () => {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maximum) throw new CaptureError('LIMIT_EXCEEDED');
        chunks.push(chunk);
      }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new CaptureError('INVALID_INPUT'); }
    });
  } finally {
    deadline.signal.removeEventListener('abort', abort);
    for (const chunk of chunks) chunk.fill(0);
  }
}

module.exports = { readBody };
