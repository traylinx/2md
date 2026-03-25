import { useState, useEffect } from 'preact/hooks';
import InputBox from '../components/InputBox';
import { LoadingPanel, ErrorPanel } from '../components/StatePanel';
import { useStreamFetch } from '../hooks/useStreamFetch';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import DocSection from '../components/docs/DocSection';
import ApiReferenceCard from '../components/docs/ApiReferenceCard';
import ParameterTable from '../components/docs/ParameterTable';
import FaqSection from '../components/FaqSection';
import SwitchAICTA from '../components/SwitchAICTA';
import BYOKInput from '../components/BYOKInput';
import LogOutput from '../components/LogOutput';
import ClearJobButton from '../components/ClearJobButton';

const AGENTIFY_PARAMS = [
  { name: 'url', type: 'string', defaultVal: '—', description: 'The root URL of the website to Agentify.', required: true },
  { name: 'maxPages', type: 'number', defaultVal: '50', description: 'Maximum number of pages to discover and extract.' },
  { name: 'includeApiSchema', type: 'boolean', defaultVal: 'false', description: 'Instruct the LLM to generate API schemas.' },
  { name: 'targetAgent', type: 'string', defaultVal: '"web"', description: 'Target agent profile. Supported values are web and local.' },
  { name: 'apiKey', type: 'string', defaultVal: '—', description: 'Required only if AGENTIFY_BYOK=true.' },
  { name: 'urls', type: 'string[]', defaultVal: '[]', description: 'Optional predefined list of URLs to include in the Agentify run.' },
  { name: 'format', type: 'string', defaultVal: 'json', description: 'Response format: json (structured) or stream (NDJSON logs + __JSON__ result).' },
  { name: 'async', type: 'boolean', defaultVal: 'false', description: 'Return 202 immediately with a job_id. Poll /api/jobs/:id for status.' },
  { name: 'webhook_url', type: 'string', defaultVal: '—', description: 'URL to receive an HTTP POST callback when the job finishes.' },
];

export default function AgentifyPage({ recoveredJob }) {
  const [vfs, setVfs] = useState(null);
  const [selectedFile, setSelectedFile] = useState('SKILL.md');
  const [fileList, setFileList] = useState([]);

  // Step 1: Discovery
  const [treeData, setTreeData] = useState(null);
  const [discoveredUrls, setDiscoveredUrls] = useState([]);
  const [selectedUrls, setSelectedUrls] = useState(new Set());
  const [agentifyOptions, setAgentifyOptions] = useState(null);

  const discovery = useStreamFetch();
  const { log, loading, error, streamFetch, abort } = useStreamFetch();

  // Recovery state
  const [recoveredUrl, setRecoveredUrl] = useState('');
  const [recoveredLog, setRecoveredLog] = useState('');

  // Phase 3: Result Recovery from History
  useEffect(() => {
    if (recoveredJob && recoveredJob.type === 'agentify' && recoveredJob.resultData) {
      const data = recoveredJob.resultData.result || recoveredJob.resultData;
      if (data.files) {
        setVfs(data.files);
        setFileList(Object.keys(data.files).sort());
        setSelectedFile('SKILL.md');
      }
      setRecoveredUrl(recoveredJob.url || '');
      setRecoveredLog(recoveredJob.resultData.log || '');
    }
  }, [recoveredJob]);

  function handleNewJob() {
    setVfs(null);
    setFileList([]);
    setSelectedFile('SKILL.md');
    setTreeData(null);
    setDiscoveredUrls([]);
    setSelectedUrls(new Set());
    setAgentifyOptions(null);
    setRecoveredUrl('');
    setRecoveredLog('');
    localStorage.removeItem('html2md_active_job');
  }

  function handleDiscover({ url, maxPages }) {
    setTreeData(null);
    setDiscoveredUrls([]);
    setSelectedUrls(new Set());
    setVfs(null);
    setFileList([]);
    setSelectedFile('SKILL.md');
    setAgentifyOptions({ url, maxPages });

    discovery.streamFetch('/api/crawl', { url, depth: 3, maxPages, treeOnly: true }, (data) => {
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

  function handleAgentifySelected() {
    const urls = Array.from(selectedUrls);
    if (urls.length === 0 || !agentifyOptions) return;
    setVfs(null);
    setFileList([]);
    setSelectedFile('SKILL.md');

    const apiKey = localStorage.getItem('agentify_api_key');
    streamFetch('/api/agentify', {
      url: agentifyOptions.url,
      urls,
      maxPages: agentifyOptions.maxPages,
      apiKey
    }, (data) => {
      if (data.files) {
        setVfs(data.files);
        setFileList(Object.keys(data.files).sort());
      }
      if (data.jobId) {
        localStorage.setItem('html2md_active_job', JSON.stringify({
          jobId: data.jobId,
          product: 'html2md',
          endpoint: 'agentify'
        }));
      }
    });
  }

  function handleFileEdit(e) {
    if (!vfs || !selectedFile) return;
    setVfs(prev => ({
      ...prev,
      [selectedFile]: e.target.value
    }));
  }

  async function handleDownloadZip() {
    if (!vfs) return;
    const zip = new JSZip();
    Object.keys(vfs).forEach(filename => {
      zip.file(filename, vfs[filename]);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'agentify-skill-bundle.zip');
  }

  const treeNodes = { files: [], dirs: {} };
  fileList.forEach(filePath => {
    const slashIdx = filePath.indexOf('/');
    if (slashIdx !== -1) {
      const dir = filePath.substring(0, slashIdx);
      const file = filePath.substring(slashIdx + 1);
      if (!treeNodes.dirs[dir]) treeNodes.dirs[dir] = [];
      treeNodes.dirs[dir].push({ path: filePath, name: file });
    } else {
      treeNodes.files.push({ path: filePath, name: filePath });
    }
  });

  return (
    <div id="agentify-panel" class="mode-panel">

      <p class="mode-description">
        We crawl your website, extract every page into clean Markdown, then use AI to generate an <strong>agent-ready Skill Bundle</strong> — so tools like Cursor, Windsurf, and Claude know your docs without hallucinating.
      </p>

      <BYOKInput 
        storageKey="agentify_api_key" 
        validationUrl="https://switchai.traylinx.com/health"
        tooltipText="We call SwitchAI to analyze page summaries and generate a SKILL.md routing index + llms.txt discovery file. This key is used for that AI synthesis step only."
        descriptionHtml="Currently, Agentify is exclusively powered by <strong><a href='https://traylinx.com/switchai' target='_blank' style='color: var(--mui-primary-main); text-decoration: none;'>Traylinx SwitchAI</a></strong>. After extracting your pages, we call the LLM router to classify and index the content into a <code>SKILL.md</code> routing file. Your key is stored securely in the browser and never touches our logs."
      />

      <InputBox
        urlId="agentify-url-input"
        btnId="agentify-btn"
        btnText="Discover Pages"
        placeholder="Enter base URL (e.g., https://docs.stripe.com)"
        showDepth={false}
        showMaxPages={true}
        showToggles={false}
        optPrefix="agentify-"
        onSubmit={handleDiscover}
        disabled={discovery.loading || loading}
        defaultUrl={recoveredUrl}
      />

      {discovery.loading && (
        <LoadingPanel message="Discovering pages on the site..." log={discovery.log} onCancel={discovery.abort} />
      )}

      {discovery.error && !discovery.loading && (
        <ErrorPanel title="Discovery Failed" message={discovery.error} />
      )}

      {treeData && !discovery.loading && (
        <div id="agentify-tree-panel">
          {!vfs && <ClearJobButton onClick={handleNewJob} />}
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
            <div class="convert-selected-bar">
              <button
                class="outline-button action-btn"
                onClick={handleAgentifySelected}
                disabled={selectedUrls.size === 0 || loading}
              >
                <span class="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>auto_awesome</span>
                Agentify Selected ({selectedUrls.size} pages)
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <LoadingPanel message="Generating Agent Manifests..." log={log} onCancel={abort} />
      )}

      {error && !loading && (
        <ErrorPanel title="Synthesis Failed" message={error} />
      )}

      {/* The Agent Console (3-Panel UI) */}
      {vfs && !loading && (
        <div id="agentify-results">
          <ClearJobButton onClick={handleNewJob} />
          <div class="output-card">
            
            <div class="result-status-bar">
              <span class="result-converted-label"><span class="checkmark">✓</span> Agentify Complete</span>
              <div class="result-actions">
                <button class="outline-button" onClick={handleDownloadZip}>
                  <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>folder_zip</span>
                  Download Bundle (.zip)
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

            <div class="agentify-console" style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '0' }}>
              
              {/* Panel A: Explorer */}
              <div class="explorer-panel" style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', height: '600px', borderRight: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '11px', marginBottom: '16px', color: 'var(--text-dim)', fontWeight: '600', letterSpacing: '0.05em', textTransform: 'uppercase' }}>SKILL BUNDLE</h3>
                
                <div class="file-tree" style={{ flexGrow: 1, overflowY: 'auto', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
                  {treeNodes.files.map(f => (
                    <div 
                      key={f.path} 
                      onClick={() => setSelectedFile(f.path)}
                      style={{ 
                        padding: '6px 8px', cursor: 'pointer', borderRadius: '4px',
                        color: selectedFile === f.path ? 'var(--primary-color)' : 'var(--text-primary)',
                        background: selectedFile === f.path ? 'rgba(136, 0, 255, 0.1)' : 'transparent',
                        fontWeight: selectedFile === f.path ? '600' : 'normal',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}
                    >
                      📄 {f.name}
                    </div>
                  ))}
                  
                  {Object.keys(treeNodes.dirs).map(dir => (
                    <div key={dir} style={{ marginTop: '12px' }}>
                      <div style={{ padding: '6px 8px', color: 'var(--text-dim)', fontWeight: 'bold' }}>
                        📁 {dir}/
                      </div>
                      <div style={{ paddingLeft: '16px' }}>
                        {treeNodes.dirs[dir].map(f => (
                          <div 
                            key={f.path} 
                            onClick={() => setSelectedFile(f.path)}
                            style={{ 
                              padding: '6px 8px', cursor: 'pointer', borderRadius: '4px',
                              color: selectedFile === f.path ? 'var(--primary-color)' : 'var(--text-primary)',
                              background: selectedFile === f.path ? 'rgba(136, 0, 255, 0.1)' : 'transparent',
                              fontWeight: selectedFile === f.path ? '600' : 'normal',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                            }}
                          >
                            📄 {f.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Panel B: Code Editor */}
              <div class="editor-panel" style={{ display: 'flex', flexDirection: 'column', height: '600px', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>{selectedFile}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Editable</span>
                </div>
                <textarea
                  value={vfs[selectedFile] || ''}
                  onInput={handleFileEdit}
                  style={{
                    flexGrow: 1, width: '100%', background: 'transparent',
                    border: 'none', color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)', fontSize: '13px',
                    lineHeight: '1.6', padding: '16px 24px', resize: 'none', outline: 'none',
                  }}
                  spellcheck="false"
                />
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Documentation UI - displayed when no bundle is loaded */}
      {!vfs && !loading && (
        <>
          <hr class="doc-divider" />

          <DocSection title="Agentify = SEO, but for AI Agents">
            <p class="doc-text">
              When a user Googles your product, they find you via <strong>SEO</strong>. When an <strong>AI agent</strong> needs to understand your product — through Cursor, Claude, ChatGPT Plugins, or an autonomous agent — it needs a different kind of signal: structured, machine-readable knowledge files.
            </p>
            <p class="doc-text">
              <strong>Agentify generates that signal automatically.</strong> It crawls your website, converts every page to clean Markdown, then uses AI to synthesize three essential files that AI agents can immediately parse, navigate, and act on:
            </p>
            <ul class="doc-text" style={{ paddingLeft: '20px', marginBottom: '0' }}>
              <li><code>SKILL.md</code> — A routing map telling agents <em>which page to read for which topic</em>.</li>
              <li><code>llms.txt</code> — A machine-readable discovery file following the <a href="https://llmstxt.org" target="_blank" style={{ color: 'var(--mui-primary-main)' }}>llms.txt standard</a>.</li>
              <li><code>references/*.md</code> — Clean Markdown versions of your key pages.</li>
            </ul>
          </DocSection>

          <DocSection title="Why This Matters: The AI Discoverability Gap">
            <p class="doc-text">
              AI coding assistants (Cursor, Windsurf, Copilot), autonomous agents, and LLM-powered search tools are increasingly used to <em>research</em> products and <em>integrate</em> APIs. But these tools cannot read your website the way a human does.
            </p>
            <div class="doc-note" style={{ marginBottom: '16px' }}>
              <strong>Without Agentify:</strong> An AI agent asked "how do I integrate Stripe webhooks?" must blindly guess, hallucinate docs, or fail. It has no structured way to navigate your site.
            </div>
            <div class="doc-note" style={{ borderColor: 'rgba(0, 255, 150, 0.3)', background: 'rgba(0, 255, 150, 0.05)' }}>
              <strong>With Agentify:</strong> Your site ships a <code>SKILL.md</code> and <code>llms.txt</code>. Any AI tool that opens your docs URL discovers these files, reads the routing index, and navigates directly to the correct reference — no hallucination.
            </div>
          </DocSection>

          <DocSection title="The 3 Files Explained">
            <div class="comparison-box" style={{ flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 class="api-ref-subheader">1. SKILL.md — The Routing Index</h3>
                <p class="doc-text">
                  <code>SKILL.md</code> is a simple Markdown file that maps topics to reference files, like a table of contents written for AI readers. Structured agents read this first to understand what your docs cover, then jump to the relevant file.
                </p>
                <div class="doc-code-block">
                  <div class="doc-code-header">SKILL.md — example output</div>
                  <pre class="code-display">{`# YourProduct Knowledge Base

## Routing

| Topic | File |
|-------|------|
| Authentication & API Keys | references/auth.md |
| Webhooks Setup | references/webhooks.md |
| Rate Limits | references/rate-limits.md |
| SDK Overview | references/sdk.md |

## How to use this bundle
1. Read the relevant reference file for the topic you need.
2. Use llms.txt for full site discovery.`}</pre>
                </div>
              </div>

              <div>
                <h3 class="api-ref-subheader">2. llms.txt — The Discovery Standard</h3>
                <p class="doc-text">
                  Following the <a href="https://llmstxt.org" target="_blank" style={{ color: 'var(--mui-primary-main)' }}>llms.txt open standard</a>, this file is placed at the root of your site (like <code>robots.txt</code> for search crawlers) so any LLM-aware tool can discover your structured knowledge automatically.
                </p>
                <div class="doc-code-block">
                  <div class="doc-code-header">llms.txt — example output</div>
                  <pre class="code-display">{`# YourProduct

> AI-ready documentation for developers integrating YourProduct

## Docs
- [Authentication](https://yoursite.com/references/auth.md)
- [Webhooks](https://yoursite.com/references/webhooks.md)

## Optional
- [Full API Reference](https://yoursite.com/references/api.md)`}</pre>
                </div>
              </div>

              <div>
                <h3 class="api-ref-subheader">3. HTML Meta Tags — Declare Discovery in Your Pages</h3>
                <p class="doc-text">
                  Add these tags to your HTML <code>&lt;head&gt;</code> to make your <code>llms.txt</code> discoverable by any AI tool or crawler that visits your site. Think of it like the Open Graph tags you add for social sharing — but for AI systems.
                </p>
                <div class="doc-code-block">
                  <div class="doc-code-header">HTML — Add to your &lt;head&gt; tag</div>
                  <pre class="code-display">{`<!DOCTYPE html>
<html>
<head>
  <title>YourProduct Docs</title>

  <!-- AI Discoverability: llms.txt standard -->
  <link rel="llms" href="https://yoursite.com/llms.txt" />
  <meta name="llms-txt" content="https://yoursite.com/llms.txt" />

  <!-- Optional: point directly to your SKILL.md bundle -->
  <meta name="ai-skill-bundle"
        content="https://yoursite.com/SKILL.md" />

  <!-- Standard: signal AI-readiness to crawlers -->
  <meta name="robots" content="index, follow, ai-content" />
</head>
<body>
  <!-- Your existing docs content -->
</body>
</html>`}</pre>
                </div>
                <p class="doc-text">
                  Once these tags are live, tools like Cursor, Claude, and custom agents can <em>auto-discover</em> your knowledge bundle just by visiting your homepage — zero configuration required on the developer's side.
                </p>
              </div>
            </div>
          </DocSection>

          <DocSection title="How It Works — Step by Step">
            <ol class="doc-text" style={{ paddingLeft: '20px', marginBottom: '0' }}>
              <li><strong>Enter your base URL</strong> (e.g., <code>https://docs.stripe.com</code>) and set how many pages to discover.</li>
              <li><strong>Review discovered pages</strong> — a site tree is mapped. You choose which pages to include.</li>
              <li><strong>Run the Agentify pipeline</strong> — pages are scraped, converted to Markdown, then an AI model reads them to generate the routing index and discovery files.</li>
              <li><strong>Inspect and edit the bundle</strong> — all files open in a live code editor right here in your browser.</li>
              <li><strong>Download the bundle as a ZIP</strong> — drop it into your repo, deploy to your server, or pipe it into your agent system.</li>
            </ol>
          </DocSection>

          <DocSection title="Integration Examples">
            <h3 class="api-ref-subheader">Quick Start: cURL</h3>
            <ApiReferenceCard
              endpoint="/api/agentify"
              curlTemplate={(origin) => `curl -X POST ${origin}/api/agentify \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://docs.yourproduct.com",
    "maxPages": 30,
    "targetAgent": "web",
    "apiKey": "sk-..."
  }'`}
              responseJson={`{
  "success": true,
  "files": {
    "SKILL.md": "# YourProduct Docs\\n\\n## Routing\\n...",
    "llms.txt": "# YourProduct\\n\\n> AI-ready documentation...",
    "references/quickstart.md": "# Quickstart\\n\\n...",
    "references/api.md": "# API Reference\\n\\n..."
  }
}`}
              description="POST to /api/agentify with your docs URL. You get back a structured bundle of files ready for agents."
            />

            <h3 class="api-ref-subheader">JavaScript — Embed AI Discoverability In Your CI/CD</h3>
            <ApiReferenceCard
              endpoint="/api/agentify"
              method="POST"
              curlTemplate={(origin) => `// Node.js — Auto-generate your AI knowledge files after every deploy
import fs from 'fs';

const res = await fetch('${origin}/api/agentify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://docs.yourproduct.com',
    maxPages: 50,
    apiKey: process.env.SWITCHAI_KEY,
    targetAgent: 'web',
    format: 'json'
  })
});

const { files } = await res.json();

// Write files to your public directory
for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(\`./public/\${name}\`, content);
}
console.log('AI skill bundle deployed:', Object.keys(files));`}
              responseJson={`// Output on success:
// AI skill bundle deployed: [ 'SKILL.md', 'llms.txt', 'references/auth.md', ... ]

// Files written to ./public/:
// - ./public/SKILL.md
// - ./public/llms.txt
// - ./public/references/auth.md
// - ./public/references/webhooks.md`}
              description="Integrate into your deployment pipeline so your AI knowledge base stays in sync with your docs automatically."
            />

            <h3 class="api-ref-subheader">Python — Generate and Index Locally</h3>
            <ApiReferenceCard
              endpoint="/api/agentify"
              method="POST"
              curlTemplate={(origin) => `import requests
import os

res = requests.post('${origin}/api/agentify', json={
    'url': 'https://docs.yourproduct.com',
    'maxPages': 30,
    'apiKey': os.environ.get('SWITCHAI_KEY'),
    'targetAgent': 'web',
    'format': 'json'
})

data = res.json()

# Save the full bundle to disk
os.makedirs('./agent_bundle', exist_ok=True)
for name, content in data['files'].items():
    path = os.path.join('./agent_bundle', name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(content)

print('Skill bundle ready:', list(data['files'].keys()))`}
              responseJson={`# Skill bundle ready: ['SKILL.md', 'llms.txt', 'references/quickstart.md', ...]
#
# Directory structure created:
# agent_bundle/
#   SKILL.md
#   llms.txt
#   references/
#     quickstart.md
#     api.md
#     webhooks.md`}
              description="Ideal for Python-based agent frameworks like LangChain, LlamaIndex, or plain file-based RAG systems."
            />

            <h3 class="api-ref-subheader">Async + Webhook — Fire-and-Forget for Large Sites</h3>
            <ApiReferenceCard
              endpoint="/api/agentify"
              method="POST"
              curlTemplate={(origin) => `# For large docs sites (50+ pages), use async mode.
# Returns a job_id immediately. Your webhook fires when done.
curl -X POST ${origin}/api/agentify \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://docs.yourproduct.com",
    "maxPages": 100,
    "apiKey": "sk-...",
    "async": true,
    "webhook_url": "https://your-server.com/webhooks/agentify"
  }'`}
              responseJson={`// Immediate response (202):
{
  "success": true,
  "job_id": "j_agentify_7f3a...",
  "status": "running",
  "status_url": "/api/jobs/j_agentify_7f3a",
  "result_url": "/api/jobs/j_agentify_7f3a/result"
}

// Webhook payload (sent to your server when done):
{
  "job_id": "j_agentify_7f3a...",
  "status": "done",
  "files": {
    "SKILL.md": "...",
    "llms.txt": "...",
    "references/api.md": "..."
  }
}`}
              description="Use async mode for large docs sites. Your server receives the complete bundle via webhook — no timeout issues."
            />

            <h3 class="api-ref-subheader">API Parameters</h3>
            <div class="doc-note">
              <strong>API key behavior:</strong> <code>apiKey</code> is optional unless <code>AGENTIFY_BYOK=true</code> is set server-side. The key is used only for the AI synthesis step (generating <code>SKILL.md</code> routing). Scraping and Markdown conversion run without it.
            </div>
            <ParameterTable params={AGENTIFY_PARAMS} />
          </DocSection>

          <DocSection title="Where to Put the Files">
            <p class="doc-text">Once you have the bundle, deploy it alongside your docs. Here is a simple hosting strategy:</p>
            <div class="doc-code-block">
              <div class="doc-code-header">Recommended file placement on your server</div>
              <pre class="code-display">{`your-docs-site/
├── index.html           ← Add the <meta> discovery tags here
├── llms.txt             ← Root-level, discoverable by all AI crawlers
├── SKILL.md             ← Root-level routing index for agents
└── references/
    ├── quickstart.md
    ├── api.md
    └── webhooks.md`}</pre>
            </div>
            <p class="doc-text">
              With this structure, any agent or LLM-aware tool that visits <code>https://yoursite.com/llms.txt</code> gets an instant, structured overview of your entire knowledge base — ready to use without any additional configuration.
            </p>
          </DocSection>

          <SwitchAICTA />
          <FaqSection
            faqs={[
              {
                q: 'What is the difference between this and regular SEO?',
                a: 'Traditional SEO makes your site findable by search engines like Google. Agentify makes your site understandable to AI systems — Cursor, Claude, ChatGPT Plugins, autonomous agents. Instead of keywords and meta descriptions, you get a structured routing index (SKILL.md) and a machine-readable discovery file (llms.txt) that AI tools can parse directly.'
              },
              {
                q: 'What files does Agentify produce?',
                a: 'You get three types of files: SKILL.md (a routing table that maps topics to reference files), llms.txt (a discovery file following the llmstxt.org standard), and a references/ folder with clean Markdown versions of your key pages. You can edit all of them before downloading.'
              },
              {
                q: 'What is the difference between Agentify and Crawl?',
                a: 'Crawl gives you raw Markdown — one file per page. Agentify goes further: it reads all those pages through AI, then synthesizes a structured bundle with navigation logic. Think of Crawl as "extract" and Agentify as "extract + organize + package for AI use".'
              },
              {
                q: 'Do I need an API key?',
                a: 'The scraping and Markdown conversion steps run for free. The AI synthesis step (which generates the SKILL.md routing logic) requires a SwitchAI key. Get a free key at traylinx.com/switchai — it takes under a minute.'
              },
              {
                q: 'How do I make my site auto-discoverable by AI tools?',
                a: 'After downloading the bundle, place llms.txt and SKILL.md at the root of your docs site. Then add two HTML meta tags to your <head>: <link rel="llms" href="/llms.txt" /> and <meta name="ai-skill-bundle" content="/SKILL.md" />. Any LLM-aware tool that visits your site will find and use these files automatically.'
              },
              {
                q: 'Can I automate this as part of my deployment pipeline?',
                a: 'Yes. Use the /api/agentify endpoint from your CI/CD system (GitHub Actions, Vercel hooks, etc.) to regenerate the bundle after every docs deploy. The async + webhook mode lets you fire the job without waiting — your server gets the completed bundle via webhook when it\'s ready.'
              }
            ]}
            subtitle="Everything you need to know about Agentify, AI discoverability, and Skill Bundles."
          />
        </>
      )}
    </div>
  );
}
