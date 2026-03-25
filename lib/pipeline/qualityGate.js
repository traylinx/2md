const { JSDOM } = require('jsdom');

const SHELL_APP_SELECTORS = ['#__next', '#app', '#root', '#__nuxt', '#svelte'];
const MIN_WORD_COUNT = 50;
const MAX_SCRIPT_TO_TEXT_RATIO = 3;

function isStaticQualityAcceptable(html, extractionResult) {
  if (!extractionResult || !extractionResult.markdown) {
    return false;
  }

  const wordCount = extractionResult.quality?.wordCount || 0;
  if (wordCount < MIN_WORD_COUNT) {
    return false;
  }

  if (isShellApp(html)) {
    return false;
  }

  return true;
}

function isShellApp(html) {
  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    for (const selector of SHELL_APP_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) {
        const textContent = (el.textContent || '').trim();
        if (textContent.length < 100) {
          return true;
        }
      }
    }

    const scripts = document.querySelectorAll('script');
    const scriptBytes = Array.from(scripts).reduce((sum, s) => sum + (s.textContent || '').length, 0);

    // Strip scripts before counting visible text to avoid double-counting
    scripts.forEach((s) => s.remove());
    const bodyText = (document.body?.textContent || '').trim();

    if (bodyText.length > 0 && scriptBytes / bodyText.length > MAX_SCRIPT_TO_TEXT_RATIO) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

module.exports = { isStaticQualityAcceptable, isShellApp };
