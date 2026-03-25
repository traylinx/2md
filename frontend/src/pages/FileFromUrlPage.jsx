import { useState, useEffect } from 'preact/hooks';
import { useStreamFetch } from '../hooks/useStreamFetch';
import OutputCard from '../components/OutputCard';
import { LoadingPanel, ErrorPanel } from '../components/StatePanel';
import DocSection from '../components/docs/DocSection';
import ApiReferenceCard from '../components/docs/ApiReferenceCard';
import ParameterTable from '../components/docs/ParameterTable';
import FaqSection from '../components/FaqSection';
import SwitchAICTA from '../components/SwitchAICTA';
import BYOKInput from '../components/BYOKInput';
import FilePreview from '../components/FilePreview';
import { useRef } from 'preact/hooks';

const STORAGE_KEY = 'agentify_api_key';

function getUrlType(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const ytMatch = urlStr.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return { type: 'youtube', id: ytMatch[1] };
  
  try {
    const urlObj = new URL(urlStr);
    const path = urlObj.pathname.toLowerCase();
    
    if (path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.mov')) return { type: 'video', url: urlStr, ext: path.match(/\.[^.]+$/)?.[0] || '.mp4' };
    if (path.endsWith('.mp3') || path.endsWith('.wav') || path.endsWith('.m4a') || path.endsWith('.ogg')) return { type: 'audio', url: urlStr, ext: path.match(/\.[^.]+$/)?.[0] || '.mp3' };
    if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.gif') || path.endsWith('.webp')) return { type: 'image', url: urlStr, ext: path.match(/\.[^.]+$/)?.[0] || '.png' };
    if (path.endsWith('.pdf')) return { type: 'pdf', url: urlStr, ext: '.pdf' };
    if (path.endsWith('.txt')) return { type: 'txt', url: urlStr, ext: '.txt' };
    if (path.endsWith('.csv')) return { type: 'csv', url: urlStr, ext: '.csv' };
    if (path.endsWith('.json')) return { type: 'json', url: urlStr, ext: '.json' };
    if (path.endsWith('.md')) return { type: 'md', url: urlStr, ext: '.md' };
  } catch (e) {
    // ignore invalid URLs for immediate parsing
  }
  return null;
}

const FILEURL_PARAMS = [
  { name: 'url', type: 'string', defaultVal: '—', description: 'A direct URL to a file (e.g., https://example.com/report.pdf).', required: true },
  { name: 'file', type: 'File', defaultVal: '—', description: 'Alternate form input when uploading a local file instead of using a URL.' },
  { name: 'apiKey', type: 'string', defaultVal: '—', description: 'Your SwitchAI API key (BYOK). Required for all conversions.', required: true },
  { name: 'enhance', type: 'string', defaultVal: 'true', description: 'When "true", the raw OCR output is polished by an AI model for cleaner Markdown.' },
  { name: 'model', type: 'string', defaultVal: '—', description: 'Optional override for the vision model used during processing.' },
  { name: 'format', type: 'string', defaultVal: 'json', description: 'Response format: json (structured), markdown (raw text), or stream (NDJSON logs + __JSON__ result).' },
];

const FILEURL_FAQS = [
  {
    q: 'What kinds of URLs work here?',
    a: 'Any URL that points directly to a downloadable file \u2014 PDFs, images, audio, video, or text files. The URL must lead to the actual file, not to a webpage that shows the file. YouTube links are the one exception \u2014 those work too!'
  },
  {
    q: 'Can I convert files from Google Drive or Dropbox?',
    a: 'Yes! Just make sure you use the direct download link. For Google Drive, use the "Export as PDF" format. For Dropbox, change "dl=0" to "dl=1" at the end of the sharing link.'
  },
  {
    q: 'What is the difference between this and the Upload tab?',
    a: 'They produce exactly the same result. This tab fetches the file from a URL. The Upload tab takes a file from your computer. Use whichever is more convenient.'
  },
  {
    q: 'Is my API key safe?',
    a: 'Yes. Your key is stored only in your browser. It is never logged, saved, or visible to anyone on our servers.'
  },
  {
    q: 'Can I convert a file without opening this page?',
    a: 'Yes! Just add "https://2md.traylinx.com/" before the file URL in your browser. PDFs and documents work for free. Images and media need your API key as a query parameter: ?apiKey=sk-...'
  },
  {
    q: 'Is there a size or time limit?',
    a: 'Files should be under 10 MB and downloadable within a reasonable time. Processing has a 5-minute timeout. For very large or slow files, the conversion may not complete.'
  },
  {
    q: 'Do I need an API key for PDFs?',
    a: 'No! PDFs and regular documents are extracted for free. API keys are only needed for images, audio, and video files because they require AI vision or transcription models.'
  }
];

export default function FileFromUrlPage({ recoveredJob }) {
  const [url, setUrl] = useState('');
  const [enhance, setEnhance] = useState(false);
  const [urlTypeInfo, setUrlTypeInfo] = useState(null);
  const [blobFile, setBlobFile] = useState(null);
  const byokRef = useRef(null);

  const [hasApiKey, setHasApiKey] = useState(() => !!localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    const handleStorage = () => {
      setHasApiKey(!!localStorage.getItem(STORAGE_KEY));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const info = getUrlType(url);
    setUrlTypeInfo(info);
    
    // For all non-YouTube types with a direct URL, fetch as blob for FilePreview
    const fetchableTypes = ['pdf', 'txt', 'csv', 'md', 'json', 'image', 'video', 'audio'];
    if (info && fetchableTypes.includes(info.type)) {
      let aborted = false;
      fetch(info.url)
        .then(res => {
          if (!res.ok) throw new Error('CORS or Network issue');
          return res.blob();
        })
        .then(blob => {
          if (!aborted) {
            const fileObj = new File([blob], url.split('/').pop() || `file${info.ext}`, { type: blob.type });
            setBlobFile(fileObj);
          }
        })
        .catch(err => {
          if (!aborted) {
            console.log('[FileFromUrl] Could not fetch blob for preview:', err.message);
            setBlobFile(null);
          }
        });
        
      return () => { aborted = true; };
    } else {
      setBlobFile(null);
    }
  }, [url]);

  const [result, setResult] = useState(null);
  const { log, loading, error, streamFetch, abort } = useStreamFetch();

  useEffect(() => {
    if (recoveredJob && recoveredJob.type === 'file2md' && recoveredJob.resultData) {
      const data = recoveredJob.resultData.result || recoveredJob.resultData;
      if (data.files) {
        const md = data.files['full_document.md'] || '';
        let meta = {};
        try { meta = JSON.parse(data.files['metadata.json'] || '{}'); } catch {}
        const pages = [];
        let i = 1;
        while (data.files[`pages/page_${i}.md`]) { pages.push(data.files[`pages/page_${i}.md`]); i++; }
        const restored = { success: true, url: meta.original_filename || recoveredJob.label || '', sourceUrl: recoveredJob.label || '', markdown: md, markdownPages: pages };
        if (meta.llm_metrics) {
          restored.model = meta.llm_metrics.model;
          restored.tokens_in = meta.llm_metrics.tokens_in;
          restored.tokens_out = meta.llm_metrics.tokens_out;
        }
        setResult(restored);
      }
    }
  }, [recoveredJob]);

  function handleNewJob() {
    setUrl('');
    setResult(null);
    localStorage.removeItem('html2md_active_job');
  }

  function handleConvert() {
    const apiKey = localStorage.getItem(STORAGE_KEY);
    if (!url.trim() || !apiKey) return;
    setResult(null);

    const formData = new FormData();
    formData.append('url', url.trim());
    formData.append('apiKey', apiKey);
    formData.append('enhance', enhance ? 'true' : 'false');

    streamFetch('/api/file2md', formData, (data) => {
      if (data.files) {
        const md = data.files['full_document.md'] || '';
        let metadata = {};
        try { metadata = JSON.parse(data.files['metadata.json'] || '{}'); } catch(e) {}
        
        const pages = [];
        let pageIdx = 1;
        while (data.files[`pages/page_${pageIdx}.md`]) {
          pages.push(data.files[`pages/page_${pageIdx}.md`]);
          pageIdx++;
        }

        const resultObj = {
          success: true,
          url: metadata.original_filename || url.trim(),
          sourceUrl: url.trim(),
          markdown: md,
          markdownPages: pages
        };

        if (metadata.llm_metrics) {
          resultObj.model = metadata.llm_metrics.model;
          resultObj.tokens_in = metadata.llm_metrics.tokens_in;
          resultObj.tokens_out = metadata.llm_metrics.tokens_out;
        }
        setResult(resultObj);

        if (data.jobId) {
          localStorage.setItem('html2md_active_job', JSON.stringify({
            jobId: data.jobId,
            product: 'file2md',
            endpoint: 'fromurl'
          }));
        }
      }
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleConvert();
  }


  return (
    <div id="file-url-panel" class="mode-panel">
      <p class="mode-description">
        Provide a <strong>direct file URL</strong> (PDF, image, or document) and convert it to clean, structured Markdown — powered by OCR and optional <strong>AI enhancement</strong>.
      </p>

      <div ref={byokRef}>
        <BYOKInput 
          storageKey={STORAGE_KEY} 
          validationUrl="https://switchai.traylinx.com/health"
          tooltipText="PDFs and Docs are free. SwitchAI API keys are only required for extracting Images, Audio, and Video files using Vision/Audio models."
          descriptionHtml="PDFs and Documents are extracted <strong>for free</strong>. Images, Audio, and Video require a <strong><a href='https://traylinx.com/switchai' target='_blank' style='color: var(--mui-primary-main); text-decoration: none;'>Traylinx SwitchAI</a></strong> API Key. Stored securely in the browser — never touches our logs."
        />
      </div>

      {/* URL Input */}
      <div class="input-container flat-box">
        <div class="input-wrapper">
          <input
            type="url"
            id="file-url-input"
            placeholder="Paste a direct file URL (e.g., https://example.com/report.pdf)"
            autocomplete="off"
            value={url}
            onInput={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            id="file-url-btn"
            class="outline-button action-btn"
            onClick={handleConvert}
            disabled={loading || !url.trim()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span class="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>bolt</span>
            {loading ? 'Converting...' : 'Convert'}
          </button>
        </div>

        {/* Live URL Preview before conversion */}
        {urlTypeInfo && !loading && !result && (
          <div style={{ margin: '16px 0', width: '100%' }}>

            {/* Unified FilePreview card for all blob-fetchable types */}
            {blobFile && urlTypeInfo.type !== 'youtube' && (
              <FilePreview
                file={blobFile}
                onRemove={handleNewJob}
                enhance={enhance}
                onEnhanceChange={setEnhance}
                onConvert={handleConvert}
                loading={loading}
                apiKeyReady={hasApiKey}
                markdownPages={undefined}
                onNeedApiKey={() => {
                  byokRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  byokRef.current?.querySelector('input')?.focus();
                }}
              />
            )}

            {/* YouTube — can't blob-fetch, so wrap in matching card style */}
            {urlTypeInfo.type === 'youtube' && (
              <div class="file-preview-card">
                <div class="file-preview-body" style={{ cursor: 'default' }}>
                  <div className="iframe-container" style={{ width: '100%', height: '100%' }}>
                    <iframe src={`https://www.youtube.com/embed/${urlTypeInfo.id}`} title="YouTube Preview" allowFullScreen />
                  </div>
                </div>
                <div class="file-preview-info">
                  <div class="file-preview-meta">
                    <span class="file-preview-name">YouTube Video</span>
                    <span class="file-preview-size">youtu.be/{urlTypeInfo.id}</span>
                  </div>
                </div>
                <div class="file-preview-actions">
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                      <button
                        class="outline-button action-btn"
                        onClick={handleConvert}
                        disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <span class="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>auto_awesome</span>
                        {loading ? 'Converting...' : 'Convert to Markdown'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fallback: blob fetch failed for non-YouTube types */}
            {!blobFile && urlTypeInfo.type !== 'youtube' && (
              <div class="file-preview-card">
                <div class="file-preview-body" style={{ cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-dim)' }}>
                    <span class="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.5 }}>description</span>
                    <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>Preview loading...</p>
                  </div>
                </div>
                <div class="file-preview-info">
                  <div class="file-preview-meta">
                    <span class="file-preview-name">{url.split('/').pop() || 'File'}</span>
                    <span class="file-preview-size">{urlTypeInfo.type.toUpperCase()}</span>
                  </div>
                </div>
                <div class="file-preview-actions">
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      class="outline-button action-btn"
                      onClick={handleConvert}
                      disabled={loading}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <span class="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>auto_awesome</span>
                      {loading ? 'Converting...' : 'Convert to Markdown'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Format constraints footer — show when no file preview is active */}
        {(!urlTypeInfo || loading || result) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
            <p class="upload-zone-formats" style={{ margin: 0 }}>
              Supported: PDF · PNG · JPG · JPEG · GIF · WEBP · CSV · JSON · TXT · MD · MP4 · MP3 · YOUTUBE
            </p>
          </div>
        )}
      </div>

      {loading && (
        <LoadingPanel message="Fetching and processing document..." log={log} onCancel={abort} />
      )}

      {error && !loading && (
        <ErrorPanel title="Conversion Failed" message={error} />
      )}

      {result && !loading && (
        <div id="result-screen">
          <OutputCard result={result} />
        </div>
      )}

      {/* Documentation & API Reference */}
      <hr class="doc-divider" />

      <DocSection title="Convert Remote Files Without Downloading Them First">
        <p class="doc-text">
          <strong>File2MD From URL</strong> is for files that already live at a stable direct URL. Instead of downloading the asset manually and re-uploading it, point the pipeline at the file and receive the same Markdown-oriented output.
        </p>
        <p class="doc-text"><strong>Best when the file already exists behind a direct download link.</strong></p>
      </DocSection>

      <DocSection title="How It Works">
        <ol class="doc-text" style={{ paddingLeft: '20px', marginBottom: '0' }}>
          <li>Paste a direct file URL.</li>
          <li>Add the required API key.</li>
          <li>Run extraction.</li>
          <li>Review the returned Markdown files and metadata.</li>
        </ol>
      </DocSection>

      <DocSection title="When To Use This Mode">
        <p class="doc-text"><strong>Best for:</strong> Remote PDFs, downloadable reports, hosted images, and media files that resolve directly to the file asset.</p>
        <p class="doc-text" style={{ marginBottom: '0' }}><strong>Not for:</strong> Regular webpages, landing pages, or links that open an HTML wrapper instead of the raw file.</p>
      </DocSection>

      <DocSection title="Output You Will Get">
        <p class="doc-text">
          This mode returns the same output family as upload mode. The difference is only the input source.
        </p>
        <ul class="doc-text" style={{ paddingLeft: '20px', marginBottom: '0' }}>
          <li>Page-level Markdown when applicable</li>
          <li>Full-document Markdown</li>
          <li>Metadata and processing artifacts when available</li>
        </ul>
      </DocSection>

      <DocSection title="API Reference: /api/file2md (URL Mode)">
        <p class="doc-text">
          Use <code>POST /api/file2md</code> with <code>multipart/form-data</code> form fields when the source is a direct file URL. The request still requires <code>apiKey</code>, and the endpoint returns progress logs followed by the final <code>__JSON__</code> result.
        </p>
        <div class="doc-note">
          <strong>Direct URL warning:</strong> The URL must resolve to the raw file. If it resolves to an HTML landing page instead, the request belongs in <code>Convert</code>, not <code>File2MD</code>.
        </div>

        <h3 class="api-ref-subheader">Parameters</h3>
        <ParameterTable params={FILEURL_PARAMS} />

        <h3 class="api-ref-subheader">Example: Convert File from URL</h3>
        <ApiReferenceCard
          endpoint="/api/file2md"
          curlTemplate={(origin) => `curl -X POST ${origin}/api/file2md \\
  -F "url=https://example.com/report.pdf" \\
  -F "apiKey=sk-lf-your-switchai-key" \\
  -F "enhance=true"`}
          responseJson={`{
  "success": true,
  "files": {
    "pages/page_1.md": "# Introduction\\n\\nThis report covers...",
    "full_document.md": "# Introduction\\n\\n...",
    "metadata.json": "{ \\"original_filename\\": \\"report.pdf\\", \\"total_pages\\": 1 }"
  }
}`}
          description="Pass the direct file URL as a form field instead of uploading a local file."
        />

        <h3 class="api-ref-subheader">Integrate: curl</h3>
        <ApiReferenceCard
          endpoint="/api/file2md"
          method="POST"
          curlTemplate={(origin) => `# Convert a remote PDF by URL
curl -X POST ${origin}/api/file2md \\
  -F "url=https://example.com/annual-report.pdf" \\
  -F "apiKey=sk-lf-your-switchai-key" \\
  -F "enhance=true" \\
  -F "format=json"

# Convert a remote image by URL
curl -X POST ${origin}/api/file2md \\
  -F "url=https://example.com/whiteboard.jpg" \\
  -F "apiKey=sk-lf-your-switchai-key"`}
          responseJson={`{
  "success": true,
  "files": {
    "pages/page_1.md": "# Annual Report 2025\\n...",
    "full_document.md": "# Annual Report 2025\\n\\n## Executive Summary\\n...",
    "metadata.json": "{ \\"original_filename\\": \\"annual-report.pdf\\", \\"total_pages\\": 12 }"
  }
}`}
          description="Convert any direct file URL to Markdown from the command line."
        />

        <h3 class="api-ref-subheader">Integrate: JavaScript</h3>
        <ApiReferenceCard
          endpoint="/api/file2md"
          method="POST"
          curlTemplate={(origin) => `// JavaScript — Convert remote file by URL
const formData = new FormData();
formData.append('url', 'https://example.com/report.pdf');
formData.append('apiKey', 'sk-lf-your-switchai-key');
formData.append('enhance', 'true');
formData.append('format', 'json');

const res = await fetch('${origin}/api/file2md', {
  method: 'POST',
  body: formData
});
const { files } = await res.json();
console.log('Full doc:', files['full_document.md'].substring(0, 200));`}
          responseJson={`# Python — Convert remote file by URL
import requests

res = requests.post('https://2md.traylinx.com/api/file2md', data={
    'url': 'https://example.com/report.pdf',
    'apiKey': 'sk-lf-your-switchai-key',
    'enhance': 'true',
    'format': 'json'
})
data = res.json()
print(data['files']['full_document.md'][:200])`}
          description="Remote file conversion in JavaScript (FormData) and Python (requests)."
        />

        <h3 class="api-ref-subheader">Quick View via URL-Prepend</h3>
        <p class="doc-text">
          For <strong>direct file URLs</strong>, you can use the URL-prepend shortcut to instantly convert them, just like HTML pages.
        </p>
        <p class="doc-text">
          <strong>PDFs and Documents are extracted for free</strong> without needing an API key. However, because Vision and Audio models are computationally expensive, <strong>Media URLs (like Images and Video) strictly require your API key</strong> as a query parameter:
        </p>
        <pre class="doc-code">{`// Free Document extraction (No Key needed)
https://2md.traylinx.com/https://example.com/report.pdf

// Premium Media extraction (Requires Key)
https://2md.traylinx.com/https://example.com/architecture.png?apiKey=sk-lf-...`}</pre>
        <p class="doc-text">
          This will automatically route the request to the <code>/api/file2md</code> engine and return the processed Markdown document.
        </p>

        <div style={{ marginTop: '16px', marginBottom: '24px', padding: '16px', background: 'rgba(255, 171, 0, 0.1)', borderLeft: '4px solid #ffab00', borderRadius: '4px' }}>
          <strong style={{ display: 'flex', alignItems: 'center', color: '#ffab00' }}>
            <span class="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>warning</span>
            Security Warning for Media Embeds
          </strong>
          <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', color: 'var(--text-color)' }}>
            Never place URLs containing your <code>?apiKey=</code> directly into client-side HTML tags (like <code>&lt;a&gt;</code> or <code>&lt;iframe&gt;</code>) on a public website. Anyone can view your page source and steal your key. For Media URLs, you should securely proxy the request through your own backend.
          </p>
        </div>

        <h3 class="api-ref-subheader">Embed in Your HTML</h3>
        <p class="doc-text">You can wrap any file link on your site to instantly offer a readable Markdown version of the document. For documents, no key is needed:</p>
        <pre class="doc-code">{`<a href="https://2md.traylinx.com/https://example.com/report.pdf" target="_blank">
  View Report in Markdown
</a>`}</pre>
      </DocSection>

      <SwitchAICTA />
      <FaqSection faqs={FILEURL_FAQS} subtitle="Common questions about converting files from URLs." />
    </div>
  );
}
