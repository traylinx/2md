const fs = require("fs");
const path = require("path");
const { JOBS_DIR } = require("./config");

// Default TTLs in hours based on URL patterns
const CACHE_TTLS = {
  dynamic: 1, // /dashboard, /api/
  landing: 24, // /, /about, /pricing
  blog: 48, // /blog/, /post/, /article/
  docs: 72, // /docs/, /api-docs/
  default: 24,
};

function getTtlForUrl(urlObj) {
  if (!urlObj) return CACHE_TTLS.default;
  const path = urlObj.pathname.toLowerCase();

  if (path.includes("/dashboard") || path.includes("/api/"))
    return CACHE_TTLS.dynamic;
  if (path.includes("/docs") || path.includes("/guide")) return CACHE_TTLS.docs;
  if (
    path.includes("/blog") ||
    path.includes("/post") ||
    path.includes("/article")
  )
    return CACHE_TTLS.blog;
  if (path === "/" || path === "/about" || path === "/pricing")
    return CACHE_TTLS.landing;

  return CACHE_TTLS.default;
}

function getSlug(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const p = parsed.pathname;
    if (!p || p === "/") return "_root";
    let slug = p.replace(/^\//, "").replace(/\/$/, "");
    slug = slug.replace(/\//g, "--");
    slug = slug.replace(/[^a-z0-9\-]/gi, "-").toLowerCase();
    return slug || "_root";
  } catch (e) {
    return urlStr.replace(/[^a-z0-9]/gi, "-").substring(0, 30);
  }
}

function getCachePaths(hostname, slug) {
  const pageDir = path.join(JOBS_DIR, hostname, "pages", slug);
  return {
    dir: pageDir,
    outputDir: path.join(pageDir, "output"),
    mdPath: path.join(pageDir, "output", "page.md"),
    metaPath: path.join(pageDir, "output", "meta.json"),
  };
}

function isFresh(meta, overrideMaxAgeHours = null) {
  if (!meta || !meta.crawledAt) return false;

  const crawledTime = new Date(meta.crawledAt).getTime();
  const now = Date.now();

  // Use override if provided, otherwise use the stored TTL
  const ttlHours =
    overrideMaxAgeHours !== null && !isNaN(overrideMaxAgeHours)
      ? Number(overrideMaxAgeHours)
      : meta.ttlHours || CACHE_TTLS.default;

  const maxAgeMs = ttlHours * 60 * 60 * 1000;

  return now - crawledTime < maxAgeMs;
}

function getCachedPage(urlStr, overrideMaxAgeHours = null, force = false) {
  if (force === true || force === "true") return null; // Bypass cache

  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname;
    const slug = getSlug(urlStr);
    const paths = getCachePaths(hostname, slug);

    if (!fs.existsSync(paths.metaPath) || !fs.existsSync(paths.mdPath)) {
      return null; // Cache miss
    }

    const meta = JSON.parse(fs.readFileSync(paths.metaPath, "utf8"));

    // Verify freshness
    if (!isFresh(meta, overrideMaxAgeHours)) {
      return null; // Stale cache
    }

    const markdown = fs.readFileSync(paths.mdPath, "utf8");
    return { markdown, meta, slug, hostname };
  } catch (error) {
    return null; // Fallback to crawl on error
  }
}

function writeMeta(
  urlStr,
  inlineResult,
  httpStatus = 200,
  executionTimeMs = 0,
) {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname;
    const slug = getSlug(urlStr);
    const paths = getCachePaths(hostname, slug);

    // Calculate content hash
    const crypto = require("crypto");
    const hash = crypto
      .createHash("sha256")
      .update(inlineResult.markdown || "")
      .digest("hex");

    const meta = {
      url: urlStr,
      crawledAt: new Date().toISOString(),
      httpStatus,
      contentHash: `sha256:${hash}`,
      ttlHours: getTtlForUrl(parsed),
      executionTimeMs,
      htmlTokens: inlineResult.tokens?.html || inlineResult.htmlTokens || 0,
      mdTokens: inlineResult.tokens?.md || inlineResult.mdTokens || 0,
      wordCount: inlineResult.quality?.wordCount || inlineResult.tokens?.wordCount || 0,
    };

    if (!fs.existsSync(paths.outputDir)) {
      fs.mkdirSync(paths.outputDir, { recursive: true });
    }

    fs.writeFileSync(paths.metaPath, JSON.stringify(meta, null, 2));

    // Also save the markdown itself so cache logic can read it later
    // (the CLI bin already does this, but we do it as a safety net for single converts)
    if (!fs.existsSync(paths.mdPath)) {
      fs.writeFileSync(paths.mdPath, inlineResult.markdown || "");
    }

    return meta;
  } catch (error) {
    console.error(`[Cache] Failed to write meta for ${urlStr}:`, error.message);
    return null;
  }
}

function purgeHost(hostname) {
  const hostDir = path.join(JOBS_DIR, hostname);
  if (fs.existsSync(hostDir)) {
    // Only delete the pages directory to keep site.json and other metadata
    const pagesDir = path.join(hostDir, "pages");
    if (fs.existsSync(pagesDir)) {
      fs.rmSync(pagesDir, { recursive: true, force: true });
      return true;
    }
  }
  return false;
}

module.exports = {
  getSlug,
  getCachedPage,
  writeMeta,
  isFresh,
  purgeHost,
  CACHE_TTLS,
};
