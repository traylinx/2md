const http = require('http');
const https = require('https');
const { getRandomUA } = require('./userAgents');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 5000;

const robotsCache = new Map();

function fetchRobotsTxt(origin) {
  return new Promise((resolve, reject) => {
    const robotsUrl = `${origin}/robots.txt`;
    const client = robotsUrl.startsWith('https') ? https : http;

    const req = client.get(robotsUrl, {
      headers: { 'User-Agent': getRandomUA() },
      timeout: FETCH_TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function parseRobotsTxt(content, userAgent = '*') {
  if (!content) return { disallowed: [], crawlDelay: 0 };

  const lines = content.split('\n').map((l) => l.trim());
  let inRelevantBlock = false;
  let inWildcardBlock = false;
  const disallowed = [];
  let crawlDelay = 0;

  for (const line of lines) {
    if (line.startsWith('#') || line === '') continue;

    const [directive, ...rest] = line.split(':');
    const key = directive.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      const agent = value.toLowerCase();
      inRelevantBlock = agent === userAgent.toLowerCase() || agent === '*';
      inWildcardBlock = agent === '*';
    } else if (inRelevantBlock || inWildcardBlock) {
      if (key === 'disallow' && value) {
        disallowed.push(value);
      } else if (key === 'crawl-delay') {
        const delay = parseFloat(value);
        if (!isNaN(delay) && delay > 0) {
          crawlDelay = delay;
        }
      }
    }
  }

  return { disallowed, crawlDelay };
}

function isPathDisallowed(pathname, disallowed) {
  for (const rule of disallowed) {
    if (rule === '/') return true;
    if (pathname.startsWith(rule)) return true;
    if (rule.endsWith('*')) {
      const prefix = rule.slice(0, -1);
      if (pathname.startsWith(prefix)) return true;
    }
  }
  return false;
}

async function getRobotsRules(origin, userAgent) {
  const cacheKey = `${origin}::${userAgent}`;
  const cached = robotsCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rules;
  }

  const content = await fetchRobotsTxt(origin);
  const rules = parseRobotsTxt(content, userAgent);
  robotsCache.set(cacheKey, { rules, fetchedAt: Date.now() });
  return rules;
}

async function isUrlAllowed(url, userAgent = 'html2md') {
  try {
    const parsed = new URL(url);
    const rules = await getRobotsRules(parsed.origin, userAgent);
    return !isPathDisallowed(parsed.pathname, rules.disallowed);
  } catch {
    return true;
  }
}

async function getCrawlDelay(url, userAgent = 'html2md') {
  try {
    const parsed = new URL(url);
    const rules = await getRobotsRules(parsed.origin, userAgent);
    return rules.crawlDelay;
  } catch {
    return 0;
  }
}

function clearCache() {
  robotsCache.clear();
}

module.exports = {
  isUrlAllowed,
  getCrawlDelay,
  clearCache,
  parseRobotsTxt,
  isPathDisallowed,
};
