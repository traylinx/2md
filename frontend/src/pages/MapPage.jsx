import { useState } from 'preact/hooks';
import InputBox from '../components/InputBox';
import { LoadingPanel, ErrorPanel } from '../components/StatePanel';
import { useStreamFetch } from '../hooks/useStreamFetch';
import { slugFromUrl } from '../utils';
import DocSection from '../components/docs/DocSection';
import ApiReferenceCard from '../components/docs/ApiReferenceCard';
import ParameterTable from '../components/docs/ParameterTable';
import FaqSection from '../components/FaqSection';
import SwitchAICTA from '../components/SwitchAICTA';
import ClearJobButton from '../components/ClearJobButton';

const MAP_FAQS = [
  {
    q: 'What does Map actually do?',
    a: 'Map scans a website and builds a visual tree showing every page it finds \u2014 like a table of contents for the entire site. It does NOT convert any content to Markdown.'
  },
  {
    q: 'How is Map different from Crawl?',
    a: 'Map only discovers the structure. Crawl discovers the structure AND converts the pages you select into Markdown. Use Map when you just want to see what is on a site before deciding what to extract.'
  },
  {
    q: 'Is this free?',
    a: 'Yes, completely free. No API key or account needed.'
  },
  {
    q: 'What can I do with the map after it is generated?',
    a: 'You can download it as a text file (.txt), Markdown file (.md), or JSON file (.json). Great for documentation audits, planning crawls, or sharing site structure with your team.'
  },
  {
    q: 'What settings should I start with?',
    a: 'For most websites, start with depth 2 and max pages 50. This covers the main pages without going too deep. Increase later if the site has more to explore.'
  },
  {
    q: 'Why are some pages not showing up?',
    a: 'Map only finds pages that are linked from other pages on the site. If a page has no links pointing to it, it will not be discovered. Try increasing the depth to find deeper pages.'
  }
];

const MAP_PARAMS = [
  { name: 'url', type: 'string', defaultVal: '—', description: 'The root URL to start mapping from.', required: true },
  { name: 'depth', type: 'number', defaultVal: '3', description: 'How many levels deep to follow links. 0 = single page only.' },
  { name: 'maxPages', type: 'number', defaultVal: '50', description: 'Maximum number of pages to discover. Prevents runaway crawls on large sites.' },
];

export default function MapPage() {
  const [treeData, setTreeData] = useState(null);
  const [discoveredUrls, setDiscoveredUrls] = useState([]);
  const [copied, setCopied] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const { log, loading, error, streamFetch, abort } = useStreamFetch();

  function handleNewJob() {
    setTreeData(null);
    setDiscoveredUrls([]);
    setSourceUrl('');
    setCopied(false);
    localStorage.removeItem('html2md_active_job');
  }

  function getHostname(url) {
    try { return new URL(url).hostname; } catch { return 'site'; }
  }

  function handleDiscover({ url, depth, maxPages }) {
    setTreeData(null);
    setDiscoveredUrls([]);
    setCopied(false);
    setSourceUrl(url);
    streamFetch('/api/crawl', { url, depth, maxPages, treeOnly: true }, (data) => {
      setTreeData(data.tree || '(No tree data returned)');
      setDiscoveredUrls(data.urls || []);
    });
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleDownloadTree() {
    if (!treeData) return;
    const cleanName = getHostname(sourceUrl).replace(/[^a-z0-9\-]/gi, '-').replace(/-+/g, '-');
    downloadFile(treeData, `${cleanName}-tree.txt`, 'text/plain');
  }

  function handleDownloadMd() {
    if (!discoveredUrls.length) return;
    const host = getHostname(sourceUrl);
    const cleanName = host.replace(/[^a-z0-9\-]/gi, '-').replace(/-+/g, '-');
    const lines = [
      `# Sitemap: ${host}`,
      ``,
      `> Discovered **${discoveredUrls.length}** pages`,
      `> Generated: ${new Date().toISOString().split('T')[0]}`,
      ``,
      `## Pages`,
      ``,
      ...discoveredUrls.map(u => `- [${u}](${u})`),
      ``,
      `## Tree`,
      ``,
      '```',
      treeData || '',
      '```',
    ];
    downloadFile(lines.join('\n'), `${cleanName}-sitemap.md`, 'text/markdown');
  }

  function handleDownloadJson() {
    if (!discoveredUrls.length) return;
    const host = getHostname(sourceUrl);
    const cleanName = host.replace(/[^a-z0-9\-]/gi, '-').replace(/-+/g, '-');
    const json = JSON.stringify({
      hostname: host,
      generatedAt: new Date().toISOString(),
      pageCount: discoveredUrls.length,
      tree: treeData || '',
      urls: discoveredUrls,
    }, null, 2);
    downloadFile(json, `${cleanName}-sitemap.json`, 'application/json');
  }

  function handleCopyUrls() {
    if (!discoveredUrls.length) return;
    navigator.clipboard.writeText(discoveredUrls.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div id="map-panel" class="mode-panel">
      <p class="mode-description">Discover and visualize the <strong>complete site structure</strong> as a tree — no content conversion.</p>

      <InputBox
        urlId="map-url-input"
        btnId="map-btn"
        btnText="Discover"
        placeholder="Enter root URL to map (e.g., https://docs.traylinx.com)"
        showDepth={true}
        showToggles={false}
        optPrefix="map-"
        onSubmit={handleDiscover}
        disabled={loading}
      />

      {loading && (
        <LoadingPanel message="Mapping site structure..." log={log} onCancel={abort} />
      )}

      {error && !loading && (
        <ErrorPanel title="Mapping Failed" message={error} />
      )}

      {treeData && !loading && (
        <div id="map-results">
          <ClearJobButton onClick={handleNewJob} />
          <div class="tree-section flat-box">
            <div class="tree-header">
              <h3>Site Tree</h3>
              <div class="result-actions">
                <button class="outline-button" onClick={handleDownloadTree}>
                  <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>account_tree</span>
                  Download .txt
                </button>
                <button class="outline-button" onClick={handleDownloadMd}>
                  <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>description</span>
                  Download .md
                </button>
                <button class="outline-button" onClick={handleDownloadJson}>
                  <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>data_object</span>
                  Download .json
                </button>
                <button class="outline-button" onClick={handleCopyUrls}>
                  <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>{copied ? 'check' : 'content_copy'}</span>
                  {copied ? 'Copied!' : 'Copy URLs'}
                </button>
              </div>
            </div>
            <pre class="tree-display">{treeData}</pre>
          </div>

          <div class="url-section flat-box">
            <div class="url-section-header">
              <h3>Discovered URLs <span class="url-count-badge">{discoveredUrls.length}</span></h3>
            </div>
            <div class="url-checklist">
              {discoveredUrls.map(pageUrl => (
                <div key={pageUrl} class="url-check-item" style={{ paddingLeft: '8px' }}>
                  <span class="url-check-label">{pageUrl}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <hr class="doc-divider" />

      <DocSection title="See The Shape Of A Site Before You Extract It">
        <p class="doc-text">
          <strong>Map</strong> is the discovery-only mode. It reveals the structure of a site, the URLs it contains, and the likely scope of a future crawl without running the full Markdown conversion pipeline.
        </p>
        <p class="doc-text"><strong>Best when the first question is “what is on this site?”</strong></p>
      </DocSection>

      <DocSection title="How It Works">
        <ol class="doc-text" style={{ paddingLeft: '20px', marginBottom: '0' }}>
          <li>Enter the root URL.</li>
          <li>Set a crawl depth and page limit.</li>
          <li>Run discovery only.</li>
          <li>Review the site tree and export it if needed.</li>
        </ol>
      </DocSection>

      <DocSection title="When To Use This Mode">
        <p class="doc-text"><strong>Best for:</strong> Scoping a crawl, auditing site structure, exporting sitemaps, and estimating the size of a documentation portal.</p>
        <p class="doc-text" style={{ marginBottom: '0' }}><strong>Not for:</strong> Markdown conversion, batch extraction, or agent bundle generation.</p>
      </DocSection>

      <DocSection title="Output You Will Get">
        <p class="doc-text">
          <strong>Map</strong> returns structural data only. It is designed to show what pages exist and how they relate, not to convert content.
        </p>
        <ul class="doc-text" style={{ paddingLeft: '20px', marginBottom: '0' }}>
          <li>Visual site tree</li>
          <li>Flat URL list</li>
          <li>Exportable map output in <code>.txt</code>, <code>.md</code>, or <code>.json</code></li>
        </ul>
      </DocSection>

      <DocSection title="API Reference: Sitemap Discovery">
        <p class="doc-text">
          This page uses the crawl endpoint in discovery mode by sending <code>treeOnly: true</code>. It is the lightweight way to inspect a site before committing to a full crawl or Agentify run.
        </p>
        <h3 class="api-ref-subheader">Parameters</h3>
        <ParameterTable params={MAP_PARAMS} />
        <h3 class="api-ref-subheader">Example: Map a Documentation Site</h3>
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
    "https://docs.traylinx.com/api-reference"
  ],
  "stats": { "depth": 2, "maxPages": 50 }
}`}
          description="Use treeOnly: true for fast discovery. Returns the site structure without converting any content."
        />

        <h3 class="api-ref-subheader">Quick View via URL-Prepend</h3>
        <p class="doc-text">
          To quickly preview any site as Markdown, prepend <code>https://2md.traylinx.com/</code> to the URL:
        </p>
        <pre class="doc-code">{`https://2md.traylinx.com/https://docs.traylinx.com
https://2md.traylinx.com/https://docs.traylinx.com?format=json`}</pre>
        <p class="doc-text">This converts a single page instantly. For full site discovery, use the Map API above.</p>

        <h3 class="api-ref-subheader">Integrate: JavaScript</h3>
        <ApiReferenceCard
          endpoint="/api/crawl"
          method="POST"
          curlTemplate={(origin) => `// JavaScript — Discover site structure
const res = await fetch('${origin}/api/crawl', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://docs.example.com',
    depth: 2,
    maxPages: 100,
    treeOnly: true
  })
});
const { tree, urls, stats } = await res.json();
console.log(tree);
console.log('Discovered', urls.length, 'pages');`}
          responseJson={`# Python — Discover site structure
import requests

res = requests.post('https://2md.traylinx.com/api/crawl', json={
    'url': 'https://docs.example.com',
    'depth': 2,
    'maxPages': 100,
    'treeOnly': True
})
data = res.json()
print(data['tree'])
print(f"Discovered {len(data['urls'])} pages")`}
          description="Programmatic site mapping in JavaScript and Python."
        />
      </DocSection>

      <SwitchAICTA />
      <FaqSection faqs={MAP_FAQS} subtitle="Common questions about site mapping and URL discovery." />
    </div>
  );
}
