'use strict';
const { isIP, BlockList } = require('node:net');
const dns = require('node:dns').promises;
const { CaptureError } = require('./errors');

// Keep deployment egress exclusions synchronized with these non-public ranges.
const V4_DENY = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
  '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
  '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
  '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'];
const denied = new BlockList();
for (const range of V4_DENY) {
  const [address, prefix] = range.split('/');
  denied.addSubnet(address, Number(prefix), 'ipv4');
}
const global6 = new BlockList();
global6.addSubnet('2000::', 3, 'ipv6');
for (const range of ['2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20']) {
  const [address, prefix] = range.split('/');
  denied.addSubnet(address, Number(prefix), 'ipv6');
}

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !denied.check(address, 'ipv4');
  if (family === 6) return global6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
  return false;
}

const SECRET_KEY = /(?:pass(?:word|wd)?|secret|token|api[-_]?key|authorization|cookie|session|credential|signature|^sig$|^code$|^auth$)/i;
function parseTarget(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x20\x7f]/.test(value)) {
    throw new CaptureError('INVALID_INPUT');
  }
  let url;
  try { url = new URL(value); } catch { throw new CaptureError('INVALID_INPUT'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.hash || (url.port && !['80', '443'].includes(url.port))) {
    throw new CaptureError('TARGET_DENIED');
  }
  if ([...url.searchParams.keys()].some(key => SECRET_KEY.test(key))) {
    throw new CaptureError('TARGET_DENIED');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(?:localhost|local|internal|home|lan|test|invalid)\.?$/.test(host) ||
      (!host.includes('.') && !isIP(host)) || (isIP(host) && !isPublicAddress(host))) {
    throw new CaptureError('TARGET_DENIED');
  }
  return url;
}

async function resolveTarget(value, { lookup = dns.lookup, deadline } = {}) {
  const url = parseTarget(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let records;
  try {
    const resolve = () => isIP(host) ? [{ address: host, family: isIP(host) }] : lookup(host, { all: true, verbatim: true });
    records = deadline ? await deadline.run(resolve) : await resolve();
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError('TARGET_DENIED');
  }
  if (!records.length || records.some(record => !isPublicAddress(record.address))) {
    throw new CaptureError('TARGET_DENIED');
  }
  return { url, addresses: records };
}

module.exports = { parseTarget, resolveTarget, isPublicAddress, V4_DENY, SECRET_KEY };
