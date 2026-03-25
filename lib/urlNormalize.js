function normalizeForDedup(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';

    // Normalize hostname: strip www.
    let hostname = u.hostname.replace(/^www\./, '');

    // Normalize protocol to https
    const protocol = 'https:';

    // Normalize path: strip trailing slash, strip index files
    let pathname = u.pathname.replace(/\/+$/, '') || '/';
    pathname = pathname.replace(/\/(index\.(html?|php|asp|aspx|jsp))$/i, '');
    if (pathname === '') pathname = '/';

    return `${protocol}//${hostname}${pathname}`;
  } catch {
    return null;
  }
}

function generateUrlPermutations(url) {
  try {
    const canonical = normalizeForDedup(url);
    if (!canonical) return [];

    const u = new URL(canonical);
    const hostname = u.hostname;
    const pathname = u.pathname;

    const hostVariants = [hostname, `www.${hostname}`];
    const protoVariants = ['https:', 'http:'];
    const pathVariants = [pathname];
    if (pathname !== '/') {
      pathVariants.push(`${pathname}/`);
      pathVariants.push(`${pathname}/index.html`);
    }

    const permutations = new Set();
    for (const proto of protoVariants) {
      for (const host of hostVariants) {
        for (const path of pathVariants) {
          permutations.add(`${proto}//${host}${path}`);
        }
      }
    }

    return [...permutations];
  } catch {
    return [];
  }
}

module.exports = { normalizeForDedup, generateUrlPermutations };
