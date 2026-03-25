/**
 * memoryGC.js — Proactive memory management
 *
 * Provides manual GC triggers and a periodic memory watchdog
 * to keep the server healthy between heavy Puppeteer jobs.
 */

const RSS_CEILING_MB = parseInt(process.env.RSS_CEILING_MB, 10) || 768;
const GC_INTERVAL_MS = 60_000; // Check every 60 seconds

/**
 * Trigger manual garbage collection if --expose-gc was passed to Node.
 * Returns true if GC was actually run.
 */
function tryGC() {
  if (typeof global.gc === 'function') {
    global.gc();
    return true;
  }
  return false;
}

/**
 * Get current memory stats in MB.
 */
function getMemoryMB() {
  const mem = process.memoryUsage();
  return {
    rss: Math.round(mem.rss / 1024 / 1024),
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    external: Math.round(mem.external / 1024 / 1024),
  };
}

/**
 * Start a periodic memory watchdog. When RSS exceeds the threshold,
 * it triggers GC and logs the result.
 */
let watchdogTimer = null;

function startMemoryWatchdog() {
  if (watchdogTimer) return; // Already running

  watchdogTimer = setInterval(() => {
    const mem = getMemoryMB();

    if (mem.rss > RSS_CEILING_MB * 0.7) {
      const didGC = tryGC();
      if (didGC) {
        const after = getMemoryMB();
        const freed = mem.rss - after.rss;
        if (freed > 5) { // Only log if meaningful cleanup happened
          console.log(`[MemGC] Proactive GC: ${mem.rss}MB → ${after.rss}MB (freed ${freed}MB)`);
        }
      }
    }
  }, GC_INTERVAL_MS);

  // Don't let the watchdog prevent process exit
  watchdogTimer.unref();
}

function stopMemoryWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

module.exports = { tryGC, getMemoryMB, startMemoryWatchdog, stopMemoryWatchdog, RSS_CEILING_MB };
