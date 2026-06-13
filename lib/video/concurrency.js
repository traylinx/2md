/**
 * In-process concurrency limiter for the video2md route.
 *
 * yt-dlp forks are heavy (CPU + memory); a burst of concurrent caption requests
 * can OOM the 1 GB container. Rather than QUEUE held HTTP connections (itself a
 * resource problem), the route rejects past the cap with 429 + Retry-After — the
 * caller retries. (lope review: caption fetching is NOT resource-free.)
 */
let active = 0;

function maxConcurrency() {
  const n = parseInt(process.env.VIDEO2MD_MAX_CONCURRENCY, 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/** @returns {boolean} true if a slot was acquired, false if at capacity */
function tryAcquire() {
  if (active >= maxConcurrency()) return false;
  active += 1;
  return true;
}

function release() {
  if (active > 0) active -= 1;
}

function activeCount() {
  return active;
}

/** test-only */
function _reset() {
  active = 0;
}

module.exports = { tryAcquire, release, activeCount, maxConcurrency, _reset };
