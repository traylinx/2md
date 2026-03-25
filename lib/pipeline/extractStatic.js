const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const TurndownService = require('turndown');
const turndownPluginGfm = require('turndown-plugin-gfm');
const { sanitizeHtml } = require('../sanitize');

function createTurndownService(sourceUrl) {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full',
  });

  turndownService.use(turndownPluginGfm.gfm);

  // Defense-in-depth: remove noisy tags even if sanitizeHtml missed them
  turndownService.remove(['script', 'noscript', 'style', 'iframe', 'svg']);

  turndownService.addRule('fencedCodeBlockWithLanguage', {
    filter(node) {
      return node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
    },
    replacement(_content, node) {
      const codeNode = node.firstChild;
      const className = codeNode.getAttribute('class') || '';
      let language = '';
      const langMatch = className.match(/(?:language-|lang-|highlight-|brush:\s*)(\w+)/i);
      if (langMatch) language = langMatch[1];
      const code = codeNode.textContent || '';
      return `\n\n\`\`\`${language}\n${code.replace(/\n$/, '')}\n\`\`\`\n\n`;
    },
  });

  turndownService.addRule('videoEmbed', {
    filter(node) {
      if (node.nodeName !== 'IFRAME') return false;
      const src = node.getAttribute('src') || '';
      return src.includes('youtube.com') || src.includes('youtu.be') || src.includes('vimeo.com');
    },
    replacement(_content, node) {
      const src = node.getAttribute('src') || '';
      let videoUrl = src;
      let videoId = '';
      if (src.includes('youtube.com/embed/')) {
        videoId = src.split('youtube.com/embed/')[1]?.split('?')[0] || '';
        videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      } else if (src.includes('vimeo.com/video/')) {
        videoId = src.split('vimeo.com/video/')[1]?.split('?')[0] || '';
        videoUrl = `https://vimeo.com/${videoId}`;
      }
      const title = node.getAttribute('title') || 'Video';
      if (videoId && src.includes('youtube')) {
        const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        return `\n\n[![${title}](${thumbnail})](${videoUrl})\n\n`;
      }
      return `\n\n[▶ ${title}](${videoUrl})\n\n`;
    },
  });

  if (sourceUrl) {
    turndownService.addRule('absoluteLinks', {
      filter(node) { return node.nodeName === 'A' && node.getAttribute('href'); },
      replacement(content, node) {
        let href = node.getAttribute('href') || '';
        const title = node.getAttribute('title');
        if (href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('#')) {
          try { href = new URL(href, sourceUrl).toString(); } catch { /* keep original */ }
        }
        if (!content.trim()) return '';
        const titlePart = title ? ` "${title}"` : '';
        return `[${content}](${href}${titlePart})`;
      },
    });

    turndownService.addRule('absoluteImages', {
      filter(node) { return node.nodeName === 'IMG' && node.getAttribute('src'); },
      replacement(_content, node) {
        let src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || '';
        const title = node.getAttribute('title');
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
          try { src = new URL(src, sourceUrl).toString(); } catch { /* keep original */ }
        }
        const titlePart = title ? ` "${title}"` : '';
        return `![${alt}](${src}${titlePart})`;
      },
    });
  }

  return turndownService;
}

function countStructure(htmlStr) {
  const dom = new JSDOM(htmlStr);
  const doc = dom.window.document;
  return {
    headings: doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
    tables: doc.querySelectorAll('table').length,
    images: doc.querySelectorAll('img').length,
    lists: doc.querySelectorAll('ul, ol').length,
    codeBlocks: doc.querySelectorAll('pre, code').length,
    links: doc.querySelectorAll('a[href]').length,
  };
}

function extractStatic(html, sourceUrl) {
  // Pre-sanitize raw HTML to strip <style> and <script> before Readability even sees them
  // This prevents Readability from embedding CSS directly into article.content
  const preSanitizedHtml = sanitizeHtml(html);

  const dom = new JSDOM(preSanitizedHtml, { url: sourceUrl });
  const document = dom.window.document;

  const reader = new Readability(document, { charThreshold: 50, keepClasses: false });
  const article = reader.parse();

  let extractedHtml;
  let title = '';
  let metadata = {};

  if (article && article.content && article.content.length > 100) {
    const originalStructure = countStructure(html);
    const extractedStructure = countStructure(article.content);

    const preservedHeadings = originalStructure.headings === 0 || extractedStructure.headings >= originalStructure.headings * 0.3;
    const preservedTables = originalStructure.tables === 0 || extractedStructure.tables >= originalStructure.tables * 0.5;
    const preservedImages = originalStructure.images === 0 || extractedStructure.images >= originalStructure.images * 0.3;
    const preservedLists = originalStructure.lists === 0 || extractedStructure.lists >= originalStructure.lists * 0.3;

    if (preservedHeadings && preservedTables && preservedImages && preservedLists) {
      extractedHtml = article.content;
      title = article.title || '';
      metadata = {
        title: article.title || null,
        byline: article.byline || null,
        excerpt: article.excerpt || null,
      };
    }
  }

  if (!extractedHtml) {
    const fallbackDom = new JSDOM(html, { url: sourceUrl });
    const doc = fallbackDom.window.document;

    const removeSelectors = [
      'script', 'style', 'noscript', 'nav', 'footer', 'header', 'aside',
      '.advertisement', '.ad', '.ads', '#cookie-banner', '.cookie-consent',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[aria-hidden="true"]',
    ];
    removeSelectors.forEach((sel) => {
      try { doc.querySelectorAll(sel).forEach((el) => el.remove()); } catch { /* skip */ }
    });

    doc.querySelectorAll('[style]').forEach((el) => {
      const style = el.getAttribute('style') || '';
      if (style.includes('display:none') || style.includes('display: none') ||
          style.includes('visibility:hidden') || style.includes('visibility: hidden')) {
        el.remove();
      }
    });

    title = doc.title || '';
    extractedHtml = doc.body ? doc.body.innerHTML : html;
    metadata = { title: title || null };
  }

  // Universal pre-Turndown sanitization
  extractedHtml = sanitizeHtml(extractedHtml);

  const turndownService = createTurndownService(sourceUrl);
  const markdown = turndownService.turndown(extractedHtml);

  const htmlTokens = Math.ceil(html.length / 3.7);
  const mdTokens = Math.ceil(markdown.length / 3.7);
  const words = markdown.split(/\s+/).filter(Boolean);

  const quality = countStructure(extractedHtml);
  quality.wordCount = words.length;

  return {
    markdown,
    metadata,
    tokens: { html: htmlTokens, md: mdTokens },
    quality,
  };
}

module.exports = { extractStatic, createTurndownService };
