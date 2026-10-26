'use strict';
// TEST ONLY: unreachable from production entrypoints, not copied into the image.
// All networking stays in a --network=none container with owned TLS fixtures.
const Module = require('node:module');
const targetPolicy = require('/app/lib/capture/targetPolicy');
const original = Module._load;
Module._load = function (id, parent, main) {
  const loaded = original.call(this, id, parent, main);
  if (loaded === targetPolicy) return { ...loaded, resolveTarget: async value => {
    const url = new URL(value);
    if (url.origin !== 'https://capture.example.com') throw Object.assign(new Error('Fixture denied'), { code: 'TARGET_DENIED' });
    return { url, addresses: [{ address: '127.0.0.1', family: 4 }] };
  } };
  if (id === 'puppeteer') return { ...loaded, launch: options => loaded.launch({ ...options,
    args: [...options.args, '--ignore-certificate-errors'] }) };
  return loaded;
};
require('/app/scripts/capture-worker.js');
