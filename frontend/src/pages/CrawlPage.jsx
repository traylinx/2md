import { useState, useEffect } from 'preact/hooks';
import InputBox from '../components/InputBox';
import OutputCard from '../components/OutputCard';
import PdfViewerDialog from '../components/PdfViewerDialog';
import { LoadingPanel, ErrorPanel } from '../components/StatePanel';
import { useStreamFetch } from '../hooks/useStreamFetch';
import { useAsyncJob } from '../hooks/useAsyncJob';
import { API_BASE, formatTokens, slugFromUrl, urlToPageSlug, saveUserPages, getUserPages, getClientId } from '../utils';
import LogOutput from '../components/LogOutput';
import DocSection from '../components/docs/DocSection';
import ApiReferenceCard from '../components/docs/ApiReferenceCard';
import ParameterTable from '../components/docs/ParameterTable';
import FaqSection from '../components/FaqSection';
import SwitchAICTA from '../components/SwitchAICTA';
import ClearJobButton from '../components/ClearJobButton';
import AsyncJobCard from '../components/AsyncJobCard';

const CRAWL_FAQS = [
  {
    q: 'Is crawling free?',
    a: 'Yes! You can crawl up to 50 pages per site for free, with a depth of 3 levels. No account or API key needed.'
  },
  {
    q: 'Why does it show me the pages first instead of converting everything?',
    a: 'So you stay in control. You can review the discovered pages and pick only the ones you actually need \u2014 no wasted time converting pages you do not want.'
  },
  {
    q: 'What is the difference between Crawl and Map?',
    a: 'Map only discovers the page structure (like a sitemap). Crawl goes further \u2014 it discovers pages AND converts them to Markdown.'
  },
  {
    q: 'How do I choose the right depth?',
    a: 'Start with 1 or 2 for most sites. Depth 0 means only the page you entered. Depth 1 adds all pages linked from it. Depth 2 goes one level deeper, and so on.'
  },
  {
    q: 'Can I get the results by email?',
    a: 'Yes! Enter your email address next to the "Convert Selected" button. When the job finishes, you will receive an email with a secure download link for your ZIP file. The link is valid for 72 hours.'
  },
  {
    q: 'Do I have to download everything at once?',
    a: 'No. You can download individual page results, all Markdown files as a ZIP, or the full archive with images.'
  },
  {
    q: 'Can I convert the pages without opening this website?',
    a: 'For a single page, yes! Just add "https://2md.traylinx.com/" before any URL in your browser. For multi-page crawls, use this page or the API.'
  },
  {
    q: 'What are the limits?',
    a: 'Free tier: up to 50 pages per crawl, depth 3, and 3 pages processed at a time. Download links expire after 72 hours. Need more? Contact us about Pro and Enterprise plans.'
  },
  {
    q: 'Can I use this to prepare content for AI tools or RAG?',
    a: 'Absolutely. Crawl is designed for exactly this \u2014 build a clean Markdown knowledge base from any documentation site, then feed it into your AI pipeline.'
  }
];

const CRAWL_PARAMS = [
  { name: 'url', type: 'string', defaultVal: '—', description: 'The root URL to start crawling from.', required: true },
  { name: 'depth', type: 'number', defaultVal: '3', description: 'How many levels deep to follow links. 0 = single page only.' },
  { name: 'maxPages', type: 'number', defaultVal: '50', description: 'Maximum number of pages to discover. Prevents runaway crawls on large sites.' },
  { name: 'treeOnly', type: 'boolean', defaultVal: 'false', description: 'When true, only discover and return the site tree — skip content conversion.' },
];

const BATCH_PARAMS = [
  { name: 'urls', type: 'string[]', defaultVal: '—', description: 'Array of URLs to convert in a single batch operation.', required: true },
  { name: 'downloadImages', type: 'boolean', defaultVal: 'true', description: 'Download images locally for each page.' },
  { name: 'frontMatter', type: 'boolean', defaultVal: 'true', description: 'Include YAML front matter (title, author, date) in each result.' },
  { name: 'screenshot', type: 'boolean', defaultVal: 'false', description: 'Capture a screenshot of each page. Results include a screenshotUrl field.' },
  { name: 'method', type: 'string', defaultVal: 'auto', description: 'Extraction engine: auto (selects best), native (fastest for text), static (standard HTML), or browser (loads full JS for dynamic React/Vue sites).' },
  { name: 'preset', type: 'string', defaultVal: 'full', description: 'Output mode: full, compact (no images), or chunks (RAG-ready heading splits).' },
  { name: 'format', type: 'string', defaultVal: 'json', description: 'Response format: json (structured) or stream (NDJSON logs + __JSON__ result).' },
  { name: 'async', type: 'boolean', defaultVal: 'false', description: 'Return 202 immediately with a job_id. Poll /api/jobs/:id for status.' },
  { name: 'email', type: 'string', defaultVal: '—', description: 'Email address to notify when the job completes. Includes a secure download link valid for 72 hours.' },
  { name: 'webhook_url', type: 'string', defaultVal: '—', description: 'URL to receive an HTTP POST callback when the job finishes.' },
];

const ASYNC_THRESHOLD = 15;

export default function CrawlPage({ recoveredJob }) {
  const [treeData, setTreeData] = useState(null);
  const [discoveredUrls, setDiscoveredUrls] = useState([]);
  const [selectedUrls, setSelectedUrls] = useState(new Set());
  const [batchResults, setBatchResults] = useState(null);
  const [crawlOptions, setCrawlOptions] = useState(null);
  const [batchViewerOpen, setBatchViewerOpen] = useState(false);
  const [email, setEmail] = useState('');

  const [recoveredUrl, setRecoveredUrl] = useState('');
  const [recoveredLog, setRecoveredLog] = useState('');

  const discovery = useStreamFetch();
  const batch = useStreamFetch();
  const asyncJob = useAsyncJob();

  // Phase 3: Result Recovery from History
  useEffect(() => {
    if (!recoveredJob) return;
    if (recoveredJob.type === 'crawl' && recoveredJob.resultData) {
      const data = recoveredJob.resultData.result || recoveredJob.resultData;
      if (data.tree) setTreeData(data.tree);
      if (data.urls) {
        setDiscoveredUrls(data.urls);
        setSelectedUrls(new Set(data.urls));
      }
      setRecoveredUrl(recoveredJob.url || '');
      setRecoveredLog(recoveredJob.resultData.log || '');
    }
    if (recoveredJob.type === 'batch' && recoveredJob.resultData) {
      const data = recoveredJob.resultData.result || recoveredJob.resultData;
      if (data.results) setBatchResults(data.results);
      setRecoveredUrl(recoveredJob.url || '');
      setRecoveredLog(recoveredJob.resultData.log || '');
    }
  }, [recoveredJob]);

  function handleNewJob() {
    setTreeData(null);
    setDiscoveredUrls([]);
    setSelectedUrls(new Set());
    setBatchResults(null);
    setCrawlOptions(null);
    setEmail('');
    setRecoveredUrl('');
    setRecoveredLog('');
    asyncJob.reset();
    localStorage.removeItem('html2md_active_job');
  }

  function handleDiscover({ url, depth, maxPages, downloadImages, frontMatter, screenshot }) {
    setTreeData(null);
    setDiscoveredUrls([]);
    setSelectedUrls(new Set());
    setBatchResults(null);
    setCrawlOptions({ downloadImages, frontMatter, screenshot });

    discovery.streamFetch('/api/crawl', { url, depth, maxPages, treeOnly: true }, (data) => {
      setTreeData(data.tree || '(No tree data returned)');
      const urls = data.urls || [];
      setDiscoveredUrls(urls);
      setSelectedUrls(new Set(urls));
    });
  }

  function toggleUrl(url) {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function selectAll() { setSelectedUrls(new Set(discoveredUrls)); }
  function deselectAll() { setSelectedUrls(new Set()); }

  function handleConvertSelected() {
    const urls = Array.from(selectedUrls);
    if (urls.length === 0) return;
    setBatchResults(null);

    if (urls.length > ASYNC_THRESHOLD) {
      // Large batch → async mode
      fetch(`${API_BASE}/api/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-ID': getClientId() },
        body: JSON.stringify({
          urls,
          downloadImages: crawlOptions?.downloadImages ?? false,
          frontMatter: crawlOptions?.frontMatter ?? true,
          screenshot: crawlOptions?.screenshot ?? false,
          async: true,
          ...(email.trim() ? { email: email.trim() } : {})
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.job_id) {
            asyncJob.startPolling(data.job_id);
            localStorage.setItem('html2md_active_job', JSON.stringify({
              jobId: data.job_id,
              product: 'html2md',
              endpoint: 'crawl',
            }));
          }
        })
        .catch((err) => console.error('Failed to start async batch:', err));
      return;
    }

    // Small batch → live streaming (existing behavior)
    batch.streamFetch('/api/batch', {
      urls,
      downloadImages: crawlOptions?.downloadImages ?? false,
      frontMatter: crawlOptions?.frontMatter ?? true,
      screenshot: crawlOptions?.screenshot ?? false
    }, (data) => {
      setBatchResults(data.results || []);

      let hostname = '';
      try { hostname = new URL(urls[0]).hostname; } catch (_e) { /* noop */ }
      if (hostname) {
        const slugs = urls.map(u => urlToPageSlug(u));
        saveUserPages(hostname, slugs);
      }

      if (data.jobId) {
        localStorage.setItem('html2md_active_job', JSON.stringify({
          jobId: data.jobId,
          product: 'html2md',
          endpoint: 'crawl'
        }));
      }
    });
  }

  function handleLoadAsyncResults() {
    if (!asyncJob.result) return;
    const data = asyncJob.result;
    const results = data.results || data.result?.results || [];
    setBatchResults(results);

    if (results.length > 0) {
      let hostname = '';
      try { hostname = new URL(results[0].url).hostname; } catch (_e) { /* noop */ }
      if (hostname) {
        const slugs = results.filter(r => r.success).map(r => urlToPageSlug(r.url));
        saveUserPages(hostname, slugs);
      }
    }

    asyncJob.reset();
  }

  async function handleDownloadAllMd() {
    if (!batchResults) return;
    const zip = new window.JSZip();
    batchResults.filter(r => r.success).forEach(r => {
      const filename = slugFromUrl(r.url) + '.md';
      zip.file(filename, r.markdown);
    });
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    const firstUrl = discoveredUrls[0];
    let siteName = 'markdown';
    try { siteName = new URL(firstUrl).hostname.replace(/[^a-z0-9.\-]/gi, ''); } catch (_e) { /* noop */ }
    a.download = siteName + '-md.zip';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleDownloadAllFiles() {
    if (!discoveredUrls.length) return;
    let siteName = '';
    try { siteName = new URL(discoveredUrls[0]).hostname.replace(/[^a-z0-9.\-]/gi, ''); } catch (_e) { /* noop */ }
    if (siteName) {
      const slugs = getUserPages(siteName);
      const slugsParam = slugs.length > 0 ? `?slugs=${slugs.map(encodeURIComponent).join(',')}` : '';
      window.location.href = `${API_BASE}/api/download/${encodeURIComponent(siteName)}${slugsParam}`;
    }
  }

  const successResults = batchResults ? batchResults.filter(r => r.success) : [];
  const failedResults = batchResults ? batchResults.filter(r => !r.success) : [];

  return (
    <div id="crawl-panel" class="mode-panel">
      <p class="mode-description">Discover a site from a root URL, then batch-convert the selected pages into <strong>Markdown</strong>.</p>

      <InputBox
        urlId="crawl-url-input"
        btnId="discover-btn"
        btnText="Discover"
        placeholder="Enter root URL to crawl (e.g., https://docs.traylinx.com)"
        showDepth={true}
        optPrefix="crawl-"
        onSubmit={handleDiscover}
        disabled={discovery.loading}
        defaultUrl={recoveredUrl}
      />

      {discovery.loading && (
        <LoadingPanel message="Discovering pages on the site..." log={discovery.log} onCancel={discovery.abort} />
      )}

      {discovery.error && !discovery.loading && (
        <ErrorPanel title="Discovery Failed" message={discovery.error} />
      )}

      {treeData && !discovery.loading && (
        <div id="tree-panel">
          {!batchResults && <ClearJobButton onClick={handleNewJob} />}
          <div class="tree-section flat-box">
            <div class="tree-header"><h3>Site Structure</h3></div>
            <pre class="tree-display">{treeData}</pre>
          </div>

          <div class="url-section flat-box">
            <div class="url-section-header">
              <h3>Discovered Pages <span class="url-count-badge">{discoveredUrls.length}</span></h3>
              <div class="url-actions">
                <button class="outline-button small" onClick={selectAll}>
                  <span class="material-symbols-outlined" style={{ fontSize: '14px', marginRight: '4px' }}>select_all</span>
                  Select All
                </button>
                <button class="outline-button small" onClick={deselectAll}>
                  <span class="material-symbols-outlined" style={{ fontSize: '14px', marginRight: '4px' }}>deselect</span>
                  Deselect All
                </button>
              </div>
            </div>
            <div class="url-checklist">
              {discoveredUrls.map(pageUrl => (
                <label key={pageUrl} class="url-check-item">
                  <input
                    type="checkbox"
                    class="url-checkbox"
                    checked={selectedUrls.has(pageUrl)}
                    onChange={() => toggleUrl(pageUrl)}
                  />
                  <span class="url-check-label">{pageUrl}</span>
                </label>
              ))}
            </div>
            <div class="convert-selected-bar" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input
                type="email"
                placeholder="Notify me at (optional email)"
                value={email}
                onInput={(e) => setEmail(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '4px',
                  fontSize: '13px', fontFamily: 'var(--font-mono)', minWidth: '220px'
                }}
              />
              <button
                class="outline-button action-btn"
                onClick={handleConvertSelected}
                disabled={selectedUrls.size === 0 || batch.loading}
              >
                Convert Selected ({selectedUrls.size} pages)
              </button>
            </div>
          </div>
        </div>
      )}

      {batch.loading && (
        <LoadingPanel message={`Converting ${selectedUrls.size} pages...`} log={batch.log} onCancel={batch.abort} />
      )}

      {batch.error && !batch.loading && (
        <ErrorPanel title="Batch Conversion Failed" message={batch.error} />
      )}

      {asyncJob.status && !batchResults && (
        <AsyncJobCard
          jobId={asyncJob.jobId}
          status={asyncJob.status}
          error={asyncJob.error}
          pageCount={selectedUrls.size}
          onLoadResults={handleLoadAsyncResults}
          onCancel={() => asyncJob.reset()}
        />
      )}

      {batchResults && !batch.loading && (
        <div id="batch-results">
          <ClearJobButton onClick={handleNewJob} />
          <div class="output-card">
            <div class="result-status-bar">
              <span class="result-converted-label"><span class="checkmark">✓</span> Batch Complete</span>
              <div class="result-actions">
                <button class="outline-button" onClick={() => setBatchViewerOpen(true)} disabled={!successResults.length} title="Open fullscreen preview of all results">
                  <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>open_in_full</span>
                  Full Screen
                </button>
                <button class="outline-button" onClick={handleDownloadAllMd} disabled={!successResults.length}>
                  <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>description</span>
                  Download All MD
                </button>
                <button class="outline-button" onClick={handleDownloadAllFiles}>
                  <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>folder_zip</span>
                  Download All (.zip)
                </button>
              </div>
            </div>

            {recoveredLog && (
              <details class="recovered-log-details" style={{ padding: '0 24px 16px', borderBottom: '1px solid var(--border-color)' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.85rem', padding: '8px 0' }}>
                  <span class="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>terminal</span>
                  Process Log
                </summary>
                <LogOutput log={recoveredLog} />
              </details>
            )}
            <div class="result-meta-grid">
              <div class="meta-item">
                <span class="meta-label">TOTAL</span>
                <span class="meta-value">{batchResults.length}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">SUCCESS</span>
                <span class="meta-value batch-success-value">{successResults.length}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">FAILED</span>
                <span class="meta-value batch-failed-value">{failedResults.length}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">TOKENS (HTML → MD)</span>
                <span class="meta-value">
                  {formatTokens(successResults.reduce((sum, r) => sum + (r.htmlTokens || r.tokens?.html || 0), 0))}
                  {' → '}
                  {formatTokens(successResults.reduce((sum, r) => sum + (r.mdTokens || r.tokens?.md || 0), 0))}
                </span>
              </div>
            </div>
          </div>

          <div class="batch-result-list">
            {batchResults.map((result, idx) => (
              <OutputCard key={idx} result={result} isBatch={true} idx={idx} allResults={batchResults} />
            ))}
          </div>

          {batchViewerOpen && (
            <PdfViewerDialog
              file={null}
              imageUrls={batchResults.map(r => r.screenshotUrl ? `${API_BASE}${r.screenshotUrl}` : null).filter(Boolean)}
              markdownPages={batchResults.map(r => r.markdown || 'Failed to convert')}
              initialPage={1}
              onClose={() => setBatchViewerOpen(false)}
            />
          )}
        </div>
      )}

      <hr class="doc-divider" />

      <DocSection title="Crawl Whole Sites Without Converting Blindly">
        <p class="doc-text">
          <strong>Crawl</strong> is built for multi-page extraction. First discover the reachable structure of a site, then batch-convert only the pages you actually want. This gives you control, reduces waste, and makes large documentation or knowledge-base workflows manageable.
        </p>
        <p class="doc-text"><strong>Best when you need structure first and conversion second.</strong></p>
      </DocSection>

      <DocSection title="How It Works">
        <ol class="doc-text" style={{ paddingLeft: '20px', marginBottom: '0' }}>
          <li>Enter the root URL, crawl depth, and max page limit.</li>
          <li>Run discovery to build the site tree and URL list.</li>
          <li>Review the discovered pages and choose the ones you want.</li>
          <li>Convert the selected pages in batch.</li>
          <li>Download the archive or receive an email when it's ready.</li>
        </ol>
      </DocSection>

      <DocSection title="When To Use This Mode">
        <p class="doc-text"><strong>Best for:</strong> Documentation portals, knowledge bases, support centers, and any multi-page site where page selection matters.</p>
        <p class="doc-text" style={{ marginBottom: '0' }}><strong>Not for:</strong> One-off article extraction, sitemap-only exports, or PDF and image processing.</p>
      </DocSection>

      <DocSection title="Output You Will Get">
        <p class="doc-text">
          This mode produces both site-level discovery data and page-level conversion results. You can inspect the tree before conversion, review success or failure per page, and download the generated archive.
        </p>
        <ul class="doc-text" style={{ paddingLeft: '20px', marginBottom: '0' }}>
          <li>Site tree</li>
          <li>Discovered URL list</li>
          <li>Batch conversion results per page</li>
          <li>Downloadable ZIP archive</li>
          <li>Optional email notification with a secure download link</li>
        </ul>
      </DocSection>

      <DocSection title="Quick Convert via URL-Prepend">
        <p class="doc-text">
          Need just <strong>one page</strong> from a site? Skip the UI entirely — prepend <code>https://2md.traylinx.com/</code> to any URL:
        </p>
        <pre class="doc-code">{`https://2md.traylinx.com/https://docs.traylinx.com
https://2md.traylinx.com/https://docs.traylinx.com?format=json`}</pre>
        <p class="doc-text">
          For full multi-page extraction with page selection, use the Crawl workflow above.
        </p>
      </DocSection>

      <DocSection title="🚀 Crawl via URL-Prepend">
        <p class="doc-text">
          Need to crawl an <strong>entire site</strong> without opening the UI? Prepend <code>https://2md.traylinx.com/crawl/</code> to any URL:
        </p>
        <pre class="doc-code">{`https://2md.traylinx.com/crawl/https://docs.traylinx.com
https://2md.traylinx.com/crawl/https://docs.traylinx.com?depth=2&maxPages=30
https://2md.traylinx.com/crawl/https://docs.traylinx.com?depth=1&email=you@example.com`}</pre>

        <p class="doc-text">
          This always runs in <strong>async mode</strong> — the response returns immediately with a <code>job_id</code>. Poll <code>/api/jobs/:id</code> for status, or add an <code>email</code> / <code>webhook_url</code> to get notified when it finishes.
        </p>

        <div class="param-table-wrap">
          <table class="param-table">
            <thead><tr><th>Parameter</th><th>Default</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>depth</code></td><td><code>3</code></td><td>How many link-levels deep to crawl from the root URL.</td></tr>
              <tr><td><code>maxPages</code></td><td><code>50</code></td><td>Maximum number of pages to discover and convert.</td></tr>
              <tr><td><code>email</code></td><td>—</td><td>Email address to receive a secure download link when the job completes.</td></tr>
              <tr><td><code>apiKey</code></td><td>—</td><td>Your SwitchAI API key (required only for premium features like image OCR).</td></tr>
              <tr><td><code>webhook_url</code></td><td>—</td><td>URL to receive an HTTP POST callback with the full result payload.</td></tr>
            </tbody>
          </table>
        </div>

        <p class="doc-text" style={{ marginBottom: '0' }}>
          <strong>Example response:</strong>
        </p>
        <pre class="doc-code">{`{
  "success": true,
  "job_id": "j_abc123",
  "status": "running",
  "status_url": "/api/jobs/j_abc123",
  "result_url": "/api/jobs/j_abc123/result"
}`}</pre>
      </DocSection>

      <DocSection title="📬 Email Notifications & Secure Downloads">
        <p class="doc-text">
          <strong>Fire-and-forget large crawls</strong> — add your email address and walk away. When the job finishes, you'll receive a branded email from <code>noreply@traylinx.com</code> with a <strong>secure, time-limited download link</strong> for your ZIP archive.
        </p>

        <div style={{ marginTop: '16px', marginBottom: '24px', padding: '20px', background: 'rgba(136, 0, 255, 0.08)', borderLeft: '4px solid var(--primary-color)', borderRadius: '4px' }}>
          <strong style={{ display: 'flex', alignItems: 'center', color: 'var(--primary-color)', marginBottom: '12px' }}>
            <span class="material-symbols-outlined" style={{ fontSize: '20px', marginRight: '8px' }}>mail</span>
            How It Works
          </strong>
          <ol style={{ margin: '0', paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--text-color)', lineHeight: '1.8' }}>
            <li>Enter an email address in the <strong>"Notify me at"</strong> field next to "Convert Selected"</li>
            <li>Select your pages and click <strong>Convert</strong> — the job runs in the background</li>
            <li>When the job finishes, you receive an email with a <strong>signed download link</strong></li>
            <li>Click the link to download your complete ZIP archive (valid for <strong>72 hours</strong>)</li>
          </ol>
        </div>

        <p class="doc-text"><strong>API equivalent:</strong></p>
        <pre class="doc-code">{`curl -X POST https://2md.traylinx.com/api/batch \\
  -H "Content-Type: application/json" \\
  -d '{
    "urls": ["https://docs.example.com/page1", "https://docs.example.com/page2"],
    "async": true,
    "email": "you@example.com"
  }'`}</pre>
        <p class="doc-text">
          The response returns immediately with a <code>job_id</code>. You can also poll the status at <code>/api/jobs/:id</code> — or just wait for the email.
        </p>

        <div style={{ marginTop: '16px', marginBottom: '24px', padding: '16px', background: 'rgba(255, 171, 0, 0.1)', borderLeft: '4px solid #ffab00', borderRadius: '4px' }}>
          <strong style={{ display: 'flex', alignItems: 'center', color: '#ffab00' }}>
            <span class="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>shield</span>
            Secure by Default
          </strong>
          <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', color: 'var(--text-color)' }}>
            Download links are <strong>cryptographically signed</strong> and expire after <strong>72 hours</strong>. They cannot be guessed, reused, or extended. Each email notification includes exactly one link tied to one job.
          </p>
        </div>
      </DocSection>

      <DocSection title="🔗 Webhook Integration">
        <p class="doc-text">
          Prefer machine-to-machine delivery? Pass a <code>webhook_url</code> instead of (or alongside) an email. When the job finishes, we send a <code>POST</code> with the full result payload to your endpoint.
        </p>
        <pre class="doc-code">{`curl -X POST https://2md.traylinx.com/api/batch \\
  -H "Content-Type: application/json" \\
  -d '{
    "urls": ["https://docs.example.com/page1"],
    "async": true,
    "webhook_url": "https://your-server.com/webhook/html2md"
  }'`}</pre>
      </DocSection>

      <DocSection title="Platform Limits & Defaults">
        <div class="param-table-wrap">
          <table class="param-table">
            <thead><tr><th>Setting</th><th>Default</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td>Max pages per crawl</td><td><code>50</code></td><td>Hard cap on discovered pages to prevent runaway crawls.</td></tr>
              <tr><td>Crawl depth</td><td><code>3</code></td><td>How many link-levels deep to follow from the root URL.</td></tr>
              <tr><td>Concurrency</td><td><code>3</code></td><td>Number of pages fetched and rendered in parallel.</td></tr>
              <tr><td>Download link TTL</td><td><code>72 hours</code></td><td>Signed ZIP download links expire after 3 days.</td></tr>
              <tr><td>Image download</td><td><code>off</code></td><td>Toggle on to include referenced images in the archive.</td></tr>
              <tr><td>Screenshots</td><td><code>off</code></td><td>Capture a full-page screenshot per page.</td></tr>
              <tr><td>Front matter</td><td><code>on</code></td><td>YAML metadata (title, author, date) at the top of each file.</td></tr>
              <tr><td>Async threshold (UI)</td><td><code>15 pages</code></td><td>The web UI automatically switches to async mode for batches above this size.</td></tr>
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection title="API Reference: Crawl & Batch">
        <p class="doc-text">
          <code>Crawl</code> is a two-step automation flow. Use <code>POST /api/crawl</code> with <code>treeOnly: true</code> to discover pages, then send the selected URLs to <code>POST /api/batch</code> for conversion.
        </p>

        <div class="doc-note">
          <strong>Streaming & Cancellation:</strong> All endpoints stream plain-text logs in real time. If you disconnect or click Cancel, the underlying crawling processes are stopped immediately using tree-kill. The final JSON payload is appended after a <code>__JSON__</code> marker.
        </div>
        <p class="doc-text"><strong>Depth:</strong> <code>0</code> means only the root page. <code>1</code> includes links found on the root page. <code>2</code> goes one level deeper, and so on.</p>
        <p class="doc-text"><strong>Max pages:</strong> <code>maxPages</code> is a hard safety cap that prevents runaway crawls on large sites.</p>
        <p class="doc-text"><strong>Timeouts:</strong> Crawl discovery times out after 10 minutes. Batch conversion times out after 5 minutes.</p>

        <h3 class="api-ref-subheader">Step 1: Site Discovery</h3>
        <ParameterTable params={CRAWL_PARAMS} />
        <ApiReferenceCard
          endpoint="/api/crawl"
          curlTemplate={(origin) => `curl -X POST ${origin}/api/crawl \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://docs.traylinx.com",
    "depth": 2,
    "maxPages": 50,
    "treeOnly": true
  }'`}
          responseJson={`{
  "success": true,
  "tree": "docs.traylinx.com/\\n├── getting-started/\\n├── api-reference/\\n│   ├── authentication/\\n│   └── endpoints/\\n└── changelog/",
  "urls": [
    "https://docs.traylinx.com",
    "https://docs.traylinx.com/getting-started",
    "https://docs.traylinx.com/api-reference",
    "https://docs.traylinx.com/api-reference/authentication",
    "https://docs.traylinx.com/api-reference/endpoints",
    "https://docs.traylinx.com/changelog"
  ],
  "stats": { "depth": 2, "maxPages": 50 }
}`}
          description="Returns a visual tree and an array of all discovered URLs. Use treeOnly: true for fast discovery without conversion."
        />

        <h3 class="api-ref-subheader">Step 2: Batch Conversion</h3>
        <ParameterTable params={BATCH_PARAMS} />
        <ApiReferenceCard
          endpoint="/api/batch"
          curlTemplate={(origin) => `curl -X POST ${origin}/api/batch \\
  -H "Content-Type: application/json" \\
  -d '{
    "urls": [
      "https://docs.traylinx.com/getting-started",
      "https://docs.traylinx.com/api-reference"
    ],
    "downloadImages": true,
    "frontMatter": true
  }'`}
          responseJson={`{
  "success": true,
  "results": [
    {
      "url": "https://docs.traylinx.com/getting-started",
      "success": true,
      "markdown": "---\\ntitle: Getting Started\\n---\\n\\n# Getting Started\\n...",
      "htmlTokens": 12000,
      "mdTokens": 2800
    },
    {
      "url": "https://docs.traylinx.com/api-reference",
      "success": true,
      "markdown": "---\\ntitle: API Reference\\n---\\n\\n# API Reference\\n...",
      "htmlTokens": 24000,
      "mdTokens": 5200
    }
  ]
}`}
          description="Pass the URLs array from Step 1 to convert all pages. Each result includes independent success status and token counts."
        />

        <h3 class="api-ref-subheader">Step 3: Download Archive</h3>
        <ApiReferenceCard
          endpoint="/api/download/:site"
          method="GET"
          curlTemplate={(origin) => `curl -O ${origin}/api/download/docs.traylinx.com`}
          responseJson={`Binary response: application/zip
Content-Disposition: attachment; filename="docs.traylinx.com.zip"

Archive contains the full site directory structure:
  docs.traylinx.com/
  ├── pages/
  │   ├── getting-started/
  │   │   ├── input/rendered.html
  │   │   └── output/page.md
  │   └── api-reference/
  │       ├── input/rendered.html
  │       └── output/page.md
  └── site.json`}
          description="Download the entire crawled site directory as a ZIP archive. Use ?slugs=page-slug1,page-slug2 when you only want a scoped subset."
        />
        <h3 class="api-ref-subheader">Full Workflow: curl</h3>
        <ApiReferenceCard
          endpoint="/api/crawl + /api/batch"
          method="POST"
          curlTemplate={(origin) => `# Step 1: Discover pages
curl -X POST ${origin}/api/crawl \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://docs.example.com", "depth": 2, "maxPages": 50, "treeOnly": true}'

# Step 2: Batch convert selected URLs
curl -X POST ${origin}/api/batch \\
  -H "Content-Type: application/json" \\
  -d '{"urls": ["https://docs.example.com/getting-started", "https://docs.example.com/api"], "downloadImages": true}'

# Step 3: Download the archive
curl -O ${origin}/api/download/docs.example.com`}
          responseJson={`Step 1 returns: { "tree": "...", "urls": [...], "stats": {...} }
Step 2 returns: { "results": [{ "url": "...", "success": true, "markdown": "..." }] }
Step 3 returns: Binary ZIP archive`}
          description="The full three-step crawl workflow in curl. Discover → Select → Download."
        />

        <h3 class="api-ref-subheader">Async with Email Notification</h3>
        <ApiReferenceCard
          endpoint="/api/batch"
          method="POST"
          curlTemplate={(origin) => `# Fire-and-forget — receive a download link by email
curl -X POST ${origin}/api/batch \\
  -H "Content-Type: application/json" \\
  -d '{
    "urls": ["https://docs.example.com/page1", "https://docs.example.com/page2"],
    "async": true,
    "email": "you@example.com"
  }'`}
          responseJson={`{
  "success": true,
  "job_id": "j_abc123",
  "status": "running",
  "status_url": "/api/jobs/j_abc123",
  "result_url": "/api/jobs/j_abc123/result"
}

// When the job completes, you'll receive an email
// with a signed download link valid for 72 hours.
// emailStatus is tracked on the job object.`}
          description="Returns immediately with a job ID. You'll receive a branded email from noreply@traylinx.com with a secure, time-limited download link as soon as the job finishes."
        />

        <h3 class="api-ref-subheader">Async with Webhook</h3>
        <ApiReferenceCard
          endpoint="/api/batch"
          method="POST"
          curlTemplate={(origin) => `# Fire-and-forget batch with webhook callback
curl -X POST ${origin}/api/batch \\
  -H "Content-Type: application/json" \\
  -d '{
    "urls": ["https://docs.example.com/page1", "https://docs.example.com/page2"],
    "async": true,
    "webhook_url": "https://your-server.com/webhook/html2md"
  }'`}
          responseJson={`{
  "success": true,
  "job_id": "j_abc123",
  "status": "running",
  "status_url": "/api/jobs/j_abc123",
  "result_url": "/api/jobs/j_abc123/result"
}`}
          description="Returns immediately with a job ID. The webhook receives the full result when the job completes."
        />

        <h3 class="api-ref-subheader">Integrate: JavaScript</h3>
        <ApiReferenceCard
          endpoint="/api/crawl + /api/batch"
          method="POST"
          curlTemplate={(origin) => `// JavaScript — Full crawl-then-batch workflow
const BASE = '${origin}';

// Step 1: Discover
const disc = await fetch(BASE + '/api/crawl', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://docs.example.com', depth: 2, treeOnly: true })
}).then(r => r.json());

console.log('Found', disc.urls.length, 'pages');

// Step 2: Batch convert
const batch = await fetch(BASE + '/api/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ urls: disc.urls.slice(0, 10), format: 'json' })
}).then(r => r.json());

batch.results.forEach(r => console.log(r.url, r.success ? '✓' : '✗'));`}
          responseJson={`# Python — Full crawl-then-batch workflow
import requests

BASE = '${`https://2md.traylinx.com`}'

# Step 1: Discover
disc = requests.post(f'{BASE}/api/crawl', json={
    'url': 'https://docs.example.com', 'depth': 2, 'treeOnly': True
}).json()

print(f"Found {len(disc['urls'])} pages")

# Step 2: Batch convert
batch = requests.post(f'{BASE}/api/batch', json={
    'urls': disc['urls'][:10], 'format': 'json'
}).json()

for r in batch['results']:
    print(r['url'], '✓' if r['success'] else '✗')`}
          description="Complete crawl-then-batch workflow in JavaScript and Python."
        />
      </DocSection>

      <SwitchAICTA />
      <FaqSection faqs={CRAWL_FAQS} subtitle="Common questions about multi-page site crawling and batch conversion." />
    </div>
  );
}
