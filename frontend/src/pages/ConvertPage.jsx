import { useState, useEffect } from 'preact/hooks';
import InputBox from '../components/InputBox';
import OutputCard from '../components/OutputCard';
import { LoadingPanel, ErrorPanel } from '../components/StatePanel';
import { useStreamFetch } from '../hooks/useStreamFetch';
import LogOutput from '../components/LogOutput';
import DocSection from '../components/docs/DocSection';
import ApiReferenceCard from '../components/docs/ApiReferenceCard';
import ParameterTable from '../components/docs/ParameterTable';
import FaqSection from '../components/FaqSection';
import SwitchAICTA from '../components/SwitchAICTA';
import ClearJobButton from '../components/ClearJobButton';

const CONVERT_FAQS = [
  {
    q: 'Is this free to use?',
    a: 'Yes! Converting web pages to Markdown is completely free \u2014 no account or API key needed. Just paste a URL and click Convert.'
  },
  {
    q: 'Does it work with modern websites like React or Next.js?',
    a: 'Yes. We render every page in a real browser first, so even JavaScript-heavy sites, single-page apps, and dynamic dashboards are fully supported.'
  },
  {
    q: 'Some content is missing from my result \u2014 what can I do?',
    a: 'Some pages load content slowly (tabs, lazy widgets). Try again \u2014 the system automatically waits for content to render. If the issue persists, the content might be behind a login or paywall.'
  },
  {
    q: 'What is "Metadata" (front matter)?',
    a: 'When enabled, the result includes the page title, author, and date at the top of the Markdown file. This is useful when organizing many pages or feeding them to AI tools.'
  },
  {
    q: 'Can I convert a page without opening this website?',
    a: 'Yes! Just add "https://2md.traylinx.com/" before any URL in your browser. For example: https://2md.traylinx.com/https://example.com \u2014 and you will get the Markdown instantly.'
  },
  {
    q: 'Can I cancel while it is working?',
    a: 'Yes. Click the Cancel button at any time. The process stops immediately on our servers too \u2014 no wasted resources.'
  },
  {
    q: 'What is the difference between Convert and Crawl?',
    a: 'Convert is for a single page. Use Crawl when you want to extract multiple pages from the same website at once.'
  }
];

const CONVERT_PARAMS = [
  { name: 'url', type: 'string', defaultVal: '—', description: 'The URL of the page to convert.', required: true },
  { name: 'downloadImages', type: 'boolean', defaultVal: 'true', description: 'Download images locally and rewrite URLs in the Markdown output.' },
  { name: 'frontMatter', type: 'boolean', defaultVal: 'true', description: 'Extract title, author, date, and description into YAML front matter.' },
  { name: 'waitMs', type: 'number', defaultVal: '10000', description: 'How long (ms) to wait for the page to finish rendering (useful for SPAs).' },
  { name: 'maxImageSizeMb', type: 'number', defaultVal: '10', description: 'Maximum size (MB) for downloaded images. Larger images are skipped.' },
  { name: 'format', type: 'string', defaultVal: 'json', description: 'Response format: json (structured), markdown (raw text), or stream (NDJSON logs + __JSON__ result).' },
  { name: 'method', type: 'string', defaultVal: 'auto', description: 'Extraction engine: auto (selects best), native (fastest for text), static (standard HTML), or browser (loads full JS for dynamic React/Vue sites).' },
];

export default function ConvertPage({ recoveredJob }) {
  const [result, setResult] = useState(null);
  const { log, loading, error, streamFetch, abort } = useStreamFetch();

  const [recoveredUrl, setRecoveredUrl] = useState('');
  const [recoveredLog, setRecoveredLog] = useState('');

  useEffect(() => {
    if (recoveredJob && recoveredJob.type === 'convert' && recoveredJob.resultData) {
      setResult(recoveredJob.resultData.result || recoveredJob.resultData);
      setRecoveredUrl(recoveredJob.url || '');
      setRecoveredLog(recoveredJob.resultData.log || '');
    }
  }, [recoveredJob]);

  function handleNewJob() {
    setResult(null);
    setRecoveredUrl('');
    setRecoveredLog('');
    localStorage.removeItem('html2md_active_job');
  }

  function handleSubmit({ url, downloadImages, frontMatter, screenshot }) {
    setResult(null);
    setRecoveredLog('');
    streamFetch('/api/convert', { url, downloadImages, frontMatter, screenshot }, (data) => {
      setResult(data);
      if (data.jobId) {
        localStorage.setItem('html2md_active_job', JSON.stringify({
          jobId: data.jobId,
          product: 'html2md',
          endpoint: 'convert'
        }));
      }
    });
  }

  return (
    <div id="convert-panel" class="mode-panel">
      <p class="mode-description">Extract and convert a <strong>single URL</strong> directly into Markdown.</p>

      <InputBox
        urlId="url-input"
        btnId="convert-btn"
        btnText="Convert"
        placeholder="Paste any URL (e.g., https://docs.traylinx.com/...)"
        showDepth={false}
        optPrefix=""
        onSubmit={handleSubmit}
        disabled={loading}
        defaultUrl={recoveredUrl}
      />

      <div class="prepend-hero-banner" style={{ marginTop: '2rem', marginBottom: '1.5rem', textAlign: 'left' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span class="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '20px' }}>bolt</span>
          Zero-Friction: URL-Prepend Conversion
        </h3>
        <p style={{ margin: '0 0 1rem 0', color: 'var(--text-dim)', fontSize: '0.95rem', lineHeight: '1.5' }}>
          Prepend <code>https://2md.traylinx.com/</code> to any URL to instantly get clean Markdown — no API call, no POST body, no configuration needed.
        </p>
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            const targetUrl = e.target.elements.urlInput.value;
            if (targetUrl) {
              window.open(`https://2md.traylinx.com/${targetUrl}`, '_blank');
            }
          }}
          style={{ 
            display: 'inline-flex', 
            alignItems: 'stretch', 
            background: 'var(--flat-box-bg)', 
            borderRadius: '4px', 
            border: '1px solid var(--primary)', 
            overflow: 'hidden',
            boxShadow: 'none',
            margin: '0'
          }}
        >
          <div style={{ 
            padding: '6px 0 6px 12px', 
            fontFamily: 'var(--font-sans)', 
            fontSize: '0.85rem', 
            display: 'flex', 
            alignItems: 'center', 
            userSelect: 'none',
            whiteSpace: 'nowrap',
            fontWeight: '500'
          }}>
            <span class="gradient-text">GET</span>&nbsp;&nbsp;<span style={{ color: 'var(--text-dim)' }}>https://2md.traylinx.com/</span>
          </div>
          <input 
            name="urlInput"
            type="text"
            defaultValue="https://2md.traylinx.com/docs/web-ui/convert"
            placeholder="https://example.com/article"
            required
            spellCheck="false"
            style={{ 
              flex: 1, 
              background: 'transparent', 
              border: 'none', 
              padding: '6px 12px 6px 0', 
              color: 'var(--text-primary)', 
              fontFamily: 'monospace', 
              fontSize: '0.85rem', 
              outline: 'none', 
              minWidth: '220px' 
            }}
          />
          <button 
            type="submit"
            style={{ 
              padding: '0 12px', 
              background: 'var(--bg-secondary)', 
              color: 'var(--text-primary)', 
              border: 'none', 
              borderLeft: '1px solid var(--border)',
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px',
              fontSize: '0.85rem',
              fontWeight: '500',
              fontFamily: 'var(--font-sans)',
              transition: 'color 0.2s',
              whiteSpace: 'nowrap'
            }}
            onMouseOver={(e) => e.currentTarget.style.color = 'var(--primary)'}
            onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
          >
            Markdown
            <span class="material-symbols-outlined" style={{ fontSize: '14px' }}>open_in_new</span>
          </button>
        </form>
      </div>

      {loading && (
        <LoadingPanel message="Rendering and extracting page content..." log={log} onCancel={abort} />
      )}

      {error && !loading && (
        <ErrorPanel title="Conversion Failed" message={error} />
      )}

      {result && !loading && (
        <div id="result-screen">
          <ClearJobButton onClick={handleNewJob} />
          {recoveredLog && (
            <details class="recovered-log-details" style={{ marginBottom: '1rem' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.85rem', padding: '8px 0' }}>
                <span class="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>terminal</span>
                Process Log
              </summary>
              <LogOutput log={recoveredLog} />
            </details>
          )}
          <OutputCard result={result} />
        </div>
      )}

      <hr class="doc-divider" />

      <DocSection title="Convert Any Web Page Into Clean Markdown">
        <p class="doc-text">
          Paste a URL and extract the content that actually matters. <strong>Convert</strong> is the fastest way to turn one article, one documentation page, or one JavaScript-heavy view into readable Markdown you can save, search, or pass to an AI workflow.
        </p>
        <p class="doc-text"><strong>Best when you already know the exact page you want.</strong></p>
      </DocSection>

      <DocSection title="How It Works">
        <ol class="doc-text" style={{ paddingLeft: '20px', marginBottom: '0' }}>
          <li>Paste a single page URL.</li>
          <li>Choose whether to download images and include front matter.</li>
          <li>Run the conversion.</li>
          <li>Review the Markdown, metadata, and quality summary.</li>
        </ol>
      </DocSection>

      <DocSection title="When To Use This Mode">
        <p class="doc-text"><strong>Best for:</strong> Single articles, blog posts, release notes, docs pages, and app views that need one-page extraction.</p>
        <p class="doc-text" style={{ marginBottom: '0' }}><strong>Not for:</strong> Multi-page site extraction, sitemap discovery, or non-HTML file OCR.</p>
      </DocSection>

      <DocSection title="Output You Will Get">
        <p class="doc-text">
          You get one cleaned Markdown result plus the metadata and quality signals needed to judge extraction quality quickly. If image download is enabled, referenced images are also pulled into the result set.
        </p>
        <ul class="doc-text" style={{ paddingLeft: '20px', marginBottom: '0' }}>
          <li>Markdown for the target page</li>
          <li>Metadata such as title, byline, and excerpt when available</li>
          <li>Quality details such as headings, links, images, and lists</li>
          <li>Optional downloaded images</li>
        </ul>
      </DocSection>

      <DocSection title="Zero-Friction: URL-Prepend Conversion">
        <p class="doc-text">
          Prepend <code>https://2md.traylinx.com/</code> to <strong>any URL</strong> to instantly get clean Markdown — no API call, no POST body, no configuration needed.
        </p>
        <pre class="doc-code">https://2md.traylinx.com/https://example.com/article</pre>

        <h3 class="api-ref-subheader">Query Parameters</h3>
        <div class="param-table-wrap">
          <table class="param-table">
            <thead><tr><th>Param</th><th>Default</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>format</code></td><td><code>markdown</code></td><td>Set <code>json</code> for structured JSON response with metadata and tokens.</td></tr>
              <tr><td><code>method</code></td><td><code>auto</code></td><td>Extraction engine. <code>auto</code> (default), <code>native</code> (fastest text), <code>static</code> (standard HTML), or <code>browser</code> (for JS-heavy React/Vue sites).</td></tr>
              <tr><td><code>maxAge</code></td><td>—</td><td>Serve from cache only if fresher than N seconds.</td></tr>
              <tr><td><code>force</code></td><td><code>false</code></td><td>Set <code>true</code> to bypass cache entirely.</td></tr>
            </tbody>
          </table>
        </div>

        <h3 class="api-ref-subheader">Use in Your Browser</h3>
        <pre class="doc-code">{`https://2md.traylinx.com/https://example.com
https://2md.traylinx.com/https://example.com?format=json
https://2md.traylinx.com/https://example.com?method=browser`}</pre>

        <h3 class="api-ref-subheader">Use with curl</h3>
        <ApiReferenceCard
          endpoint="/"
          method="GET"
          curlTemplate={(origin) => `# Raw Markdown
curl ${origin}/https://example.com/article

# JSON with metadata
curl "${origin}/https://example.com/article?format=json"

# Force browser rendering
curl "${origin}/https://example.com/spa-app?method=browser"`}
          responseJson={`# Example Domain

This domain is for use in illustrative examples in documents.

You may use this domain in literature without prior coordination...`}
          description="Returns raw Markdown by default. Add ?format=json for structured output."
        />

        <h3 class="api-ref-subheader">Embed in Your HTML</h3>
        <p class="doc-text">
          Add a <strong>"View as Markdown"</strong> link to any webpage, README, or documentation:
        </p>
        <ApiReferenceCard
          endpoint="HTML embed"
          method="GET"
          curlTemplate={() => `<!-- Simple link -->
<a href="https://2md.traylinx.com/https://example.com/docs">
  View as Markdown
</a>

<!-- Markdown badge (for README files) -->
[![View as Markdown](https://img.shields.io/badge/View-Markdown-8B5CF6)](https://2md.traylinx.com/https://example.com/docs)

<!-- HTML badge -->
<a href="https://2md.traylinx.com/https://example.com/docs">
  <img src="https://img.shields.io/badge/View-Markdown-8B5CF6" alt="View as Markdown" />
</a>`}
          responseJson="Clicking any of these links takes the user directly to the Markdown version of the target page."
          description="Works in HTML pages, GitHub READMEs, documentation portals, and any context that renders links."
        />
      </DocSection>

      <DocSection title="API Reference: Convert">
        <p class="doc-text">
          Use <code>POST /api/convert</code> when your automation already knows the exact page it wants. The server intelligently selects the best extraction method and responds with polished Markdown.
        </p>

        <div class="doc-note">
          <strong>Response Modes:</strong> Use <code>format=json</code> for structured JSON (default), <code>format=markdown</code> for raw text, or <code>format=stream</code> for live NDJSON logs with <code>__JSON__</code> result. If the client disconnects, the server terminates any running browser process immediately.
        </div>

        <div class="doc-note">
          <strong>Conversion Methods:</strong> <code>auto</code> (default) tries native→static→browser in order. Use <code>native</code> for HTTP content negotiation, <code>static</code> for cheerio/Readability without a browser, or <code>browser</code> for full Puppeteer rendering of JS-heavy SPAs.
        </div>

        <div class="doc-note">
          <strong>Cache Control:</strong> Append <code>?maxAge=3600</code> to only serve cached results fresher than N seconds, or <code>?force=true</code> to bypass cache entirely.
        </div>

        <h3 class="api-ref-subheader">Parameters</h3>
        <ParameterTable params={CONVERT_PARAMS} />

        <h3 class="api-ref-subheader">Example: Basic Conversion</h3>
        <ApiReferenceCard
          endpoint="/api/convert"
          curlTemplate={(origin) => `curl -X POST ${origin}/api/convert \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/article",
    "downloadImages": true,
    "frontMatter": true
  }'`}
          responseJson={`{
  "success": true,
  "url": "https://example.com/article",
  "markdown": "---\\ntitle: Example Domain\\n---\\n\\n# Example Domain\\n\\nThis domain is for use in illustrative examples...",
  "cache": "miss",
  "method": "static",
  "tokens": { "html": 4200, "md": 890 },
  "metadata": { "title": "Example Domain", "byline": null, "excerpt": null },
  "quality": { "headings": 1, "links": 1, "images": 0, "lists": 0 }
}`}
          description="Use this for a normal article or docs page where the default rendering wait is enough."
        />

        <h3 class="api-ref-subheader">Example: SPA with Extended Wait</h3>
        <ApiReferenceCard
          endpoint="/api/convert"
          curlTemplate={(origin) => `curl -X POST ${origin}/api/convert \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://app.example.com/dashboard",
    "waitMs": 20000,
    "method": "browser",
    "downloadImages": false,
    "frontMatter": false
  }'`}
          responseJson={`{
  "success": true,
  "url": "https://app.example.com/dashboard",
  "markdown": "# Dashboard\\n\\n## Recent Activity\\n...",
  "cache": "miss",
  "method": "browser",
  "tokens": { "html": 18000, "md": 3200 }
}`}
          description="Use method=browser and a higher waitMs when the page relies on client-side rendering."
        />

        <h3 class="api-ref-subheader">Integrate into Your Code</h3>
        <ApiReferenceCard
          endpoint="/api/convert"
          method="POST"
          curlTemplate={(origin) => `// JavaScript
const res = await fetch('${origin}/api/convert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com/article',
    format: 'json',
    method: 'auto'
  })
});
const { markdown, tokens, method } = await res.json();
console.log(\`Converted via \${method} — \${tokens.md} tokens\`);`}
          responseJson={`# Python
import requests

res = requests.post('${"https://2md.traylinx.com"}/api/convert', json={
    'url': 'https://example.com/article',
    'format': 'json',
    'method': 'auto'
})
data = res.json()
print(f"Converted via {data['method']} — {data['tokens']['md']} tokens")`}
          description="Drop-in code snippets for JavaScript (fetch) and Python (requests)."
        />
      </DocSection>

      <SwitchAICTA />
      <FaqSection faqs={CONVERT_FAQS} subtitle="Common questions about single-page conversion." />
    </div>
  );
}
