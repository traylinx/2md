const { negotiateMarkdown } = require('./negotiateMarkdown');
const { fetchStatic } = require('./fetchStatic');
const { extractStatic } = require('./extractStatic');
const { isStaticQualityAcceptable } = require('./qualityGate');

const VALID_METHODS = ['auto', 'native', 'static', 'browser'];

function validateMethod(method) {
  if (!method) return 'auto';
  const normalized = method.toLowerCase().trim();
  if (!VALID_METHODS.includes(normalized)) return null;
  return normalized;
}

async function selectMethod(url, requestedMethod, options = {}) {
  const method = validateMethod(requestedMethod);

  if (method === null) {
    return {
      ok: false,
      error: `Invalid method "${requestedMethod}". Valid: ${VALID_METHODS.join(', ')}`,
      statusCode: 400,
    };
  }

  if (method === 'browser') {
    return { ok: false, useBrowser: true, reason: 'Explicitly requested browser method' };
  }

  if (method === 'native') {
    const result = await negotiateMarkdown(url);
    if (result.ok) {
      return { ok: true, ...result, cache: 'miss', fallbackReason: null };
    }
    return {
      ok: false,
      error: `Target did not provide a markdown representation for Accept: text/markdown. ${result.reason}`,
      statusCode: 422,
    };
  }

  if (method === 'static') {
    const fetchResult = await fetchStatic(url);
    if (!fetchResult.ok) {
      return {
        ok: false,
        error: `Static fetch failed: ${fetchResult.reason}`,
        statusCode: 502,
      };
    }

    const extraction = extractStatic(fetchResult.html, url);
    return {
      ok: true,
      method: 'static',
      markdown: extraction.markdown,
      metadata: extraction.metadata,
      tokens: extraction.tokens,
      quality: extraction.quality,
      cache: 'miss',
      fallbackReason: null,
    };
  }

  // method === 'auto': try native → static → browser
  console.log(`[Pipeline] Auto: trying native negotiation for ${url}`);
  const nativeResult = await negotiateMarkdown(url);
  if (nativeResult.ok) {
    console.log(`[Pipeline] Native markdown hit for ${url}`);
    return { ok: true, ...nativeResult, cache: 'miss', fallbackReason: null };
  }
  console.log(`[Pipeline] Native miss: ${nativeResult.reason}`);

  console.log(`[Pipeline] Auto: trying static fetch for ${url}`);
  const fetchResult = await fetchStatic(url);
  if (fetchResult.ok) {
    const extraction = extractStatic(fetchResult.html, url);
    const qualityOk = isStaticQualityAcceptable(fetchResult.html, extraction);

    if (qualityOk) {
      console.log(`[Pipeline] Static extraction accepted for ${url} (${extraction.quality.wordCount} words)`);
      return {
        ok: true,
        method: 'static',
        markdown: extraction.markdown,
        metadata: extraction.metadata,
        tokens: extraction.tokens,
        quality: extraction.quality,
        cache: 'miss',
        fallbackReason: null,
      };
    }
    console.log(`[Pipeline] Static quality too low for ${url}, escalating to browser`);
  } else {
    console.log(`[Pipeline] Static fetch failed: ${fetchResult.reason}`);
  }

  return { ok: false, useBrowser: true, reason: 'Auto pipeline: native and static paths insufficient, using browser' };
}

module.exports = { selectMethod, validateMethod, VALID_METHODS };
