const AD_DOMAINS = [
  'doubleclick.net',
  'adservice.google.com',
  'googlesyndication.com',
  'googletagmanager.com',
  'google-analytics.com',
  'adnxs.com',
  'facebook.net',
  'analytics.tiktok.com',
  'hotjar.com',
  'clarity.ms',
  'newrelic.com',
  'sentry.io',
  'segment.io',
  'mixpanel.com',
  'optimizely.com',
];

function isAdDomain(hostname) {
  return AD_DOMAINS.some((ad) => hostname.includes(ad));
}

module.exports = { AD_DOMAINS, isAdDomain };
