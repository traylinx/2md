/**
 * SSRF guard for POST /api/video2md (defense-in-depth).
 *
 * IMPORTANT — the authoritative boundary is OS-level egress restriction on the
 * droplet. `yt-dlp` does its OWN DNS resolution and follows redirects across its
 * 1000+ extractors, so an app-layer pre-check is necessarily TOCTOU-vulnerable
 * (the address we resolve here is not the one yt-dlp will connect to). The host
 * allowlist below IS a strong control *as long as it only ever contains domains
 * whose DNS we trust* (youtube/youtu.be/...) — never user-supplied or attacker-
 * registrable — because an attacker cannot rebind youtube.com's DNS. Widening
 * the allowlist to untrusted domains REQUIRES egress-level controls (iptables /
 * egress proxy). Note: html2md has NO SSRF guard on convert/crawl/file2md today,
 * so droplet egress rules are the product-wide fix. See docs/video2md-sprint.md.
 */
const dns = require('dns').promises;
const net = require('net');

// Base registrable domains we will hand to yt-dlp. Subdomains (m./www./music.)
// are accepted; look-alikes (attacker-youtube.com) are not.
const DEFAULT_ALLOWED_HOSTS = ['youtube.com', 'youtu.be'];

function parseAllowedHosts(envValue) {
  if (!envValue) return DEFAULT_ALLOWED_HOSTS;
  const hosts = envValue.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return hosts.length ? hosts : DEFAULT_ALLOWED_HOSTS;
}

/** Exact host or a subdomain of an allowed base. Never substring. */
function hostAllowed(hostname, allowedHosts) {
  const h = (hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  return allowedHosts.some((base) => h === base || h.endsWith('.' + base));
}

/** RFC1918 + loopback + link-local + metadata + CGNAT + ULA + test-nets +
 * benchmark + multicast/reserved + unspecified. Defense-in-depth (lope review). */
function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const o = ip.split('.').map(Number);
    if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    if (o[0] === 0) return true; // 0.0.0.0/8 (unspecified)
    if (o[0] === 10) return true; // 10/8
    if (o[0] === 127) return true; // loopback
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT 100.64/10
    if (o[0] === 169 && o[1] === 254) return true; // link-local + 169.254.169.254 metadata
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true; // 172.16/12
    if (o[0] === 192 && o[1] === 0 && (o[2] === 0 || o[2] === 2)) return true; // 192.0.0/24 IETF + 192.0.2/24 TEST-NET-1
    if (o[0] === 192 && o[1] === 168) return true; // 192.168/16
    if (o[0] === 198 && (o[1] === 18 || o[1] === 19)) return true; // 198.18/15 benchmark
    if (o[0] === 198 && o[1] === 51 && o[2] === 100) return true; // 198.51.100/24 TEST-NET-2
    if (o[0] === 203 && o[1] === 0 && o[2] === 113) return true; // 203.0.113/24 TEST-NET-3
    if (o[0] >= 224) return true; // 224/4 multicast + 240/4 reserved + 255.255.255.255
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.replace('::ffff:', '')); // IPv4-mapped (dotted); hex form → unsafe below
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
    if (/^f[cd]/.test(lower)) return true; // fc00::/7 ULA
    if (lower.startsWith('ff')) return true; // ff00::/8 multicast
    return false;
  }
  return true; // not a parseable IP → unsafe
}

/**
 * Validate a user-supplied video URL. Resolves {ok:true, url, hostname} or
 * {ok:false, reason}. Never throws. `opts.resolver` is injectable for tests
 * (signature: (hostname, {all:true}) => Promise<Array<{address}>|string[]>).
 */
async function validateVideoUrl(rawUrl, allowedHosts, opts = {}) {
  const resolver = opts.resolver || ((h) => dns.lookup(h, { all: true }));
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'bad-protocol' };
  }
  if (!hostAllowed(parsed.hostname, allowedHosts)) {
    return { ok: false, reason: 'host-not-allowed' };
  }
  // Defense-in-depth: refuse if the trusted host resolves to a private/metadata
  // address (poisoned allowlist or DNS misconfig). The real control is egress.
  try {
    const results = await resolver(parsed.hostname, { all: true });
    const addrs = Array.isArray(results) ? results : [results];
    if (!addrs.length) return { ok: false, reason: 'dns-empty' };
    for (const a of addrs) {
      const ip = typeof a === 'string' ? a : a && a.address;
      if (isPrivateIp(ip)) return { ok: false, reason: 'resolves-to-private-ip' };
    }
  } catch {
    return { ok: false, reason: 'dns-failed' };
  }
  return { ok: true, url: parsed.toString(), hostname: parsed.hostname };
}

module.exports = {
  validateVideoUrl,
  hostAllowed,
  isPrivateIp,
  parseAllowedHosts,
  DEFAULT_ALLOWED_HOSTS,
};
