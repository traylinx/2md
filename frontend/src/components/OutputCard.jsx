import { useState, useMemo } from 'preact/hooks';
import { marked } from 'marked';
import PdfViewerDialog from './PdfViewerDialog';
import { formatTokens, getSourceDisplay, slugFromUrl, API_BASE } from '../utils';

const renderer = new marked.Renderer();
renderer.image = (href, title, text) => {
  // Check if it's a relative/hallucinated image from OCR (e.g. img-0.jpeg)
  if (typeof href === 'string' && !href.startsWith('http') && !href.startsWith('data:')) {
    return `<div class="md-image-placeholder">
      <span class="material-symbols-outlined">image</span>
      <span class="md-image-placeholder-text">[Embedded Image Extracted: ${text || href}]</span>
    </div>`;
  }
  // Otherwise default rendering
  return `<img src="${href}" alt="${text || ''}" title="${title || ''}" />`;
};

marked.setOptions({
  breaks: true,
  gfm: true,
  renderer: renderer
});

export default function OutputCard({ result, file, isBatch = false, idx = -1, allResults = [] }) {
  const [activeTab, setActiveTab] = useState('preview');
  const [copied, setCopied] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  if (!result.success) {
    return (
      <div class="output-card">
        <div class="result-status-bar">
          <span class="result-converted-label" style={{ color: 'var(--error-color)' }}>
            <span class="checkmark" style={{ color: 'var(--error-color)' }}>✗</span> Failed
          </span>
        </div>
        <div class="result-meta-grid">
          <div class="meta-item" style={{ gridColumn: '1 / -1' }}>
            <span class="meta-label">SOURCE</span>
            <span class="meta-value">{result.url}</span>
          </div>
          <div class="meta-item" style={{ gridColumn: '1 / -1' }}>
            <span class="meta-label">ERROR</span>
            <span class="meta-value" style={{ color: 'var(--error-color)' }}>{result.error || 'Unknown error'}</span>
          </div>
        </div>
      </div>
    );
  }

  const sourceDisplay = getSourceDisplay(result.url);
  const wordCount = result.markdown ? result.markdown.split(/\s+/).filter(Boolean).length : 0;
  const htmlTokens = result.htmlTokens || result.tokens?.html || 0;
  const mdTokens = result.mdTokens || result.tokens?.md || 0;

  const renderedHtml = useMemo(() => {
    if (!result.markdown) return '';
    
    // Prevent browser crash from pathologically large markdown or raw CSS dumps
    if (result.markdown.length > 200000) {
       return `<div style="text-align: center; padding: 60px 40px; color: var(--text-dim); background: rgba(0,0,0,0.1); border-radius: 8px;">
          <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">warning</span>
          <h3 style="margin-bottom: 8px; color: var(--text-color);">Preview Disabled (File Too Large)</h3>
          <p style="font-size: 14px; max-width: 400px; margin: 0 auto;">This markdown file is abnormally large and may freeze your browser if rendered natively.</p>
          <p style="font-size: 14px; max-width: 400px; margin: 8px auto 0;">Switch to the <strong>Markdown</strong> tab to view the raw text, or download the file.</p>
       </div>`;
    }
    
    return marked.parse(result.markdown);
  }, [result.markdown]);

  const jsonData = JSON.stringify({
    success: true,
    data: {
      url: result.url,
      markdown: result.markdown,
      htmlTokens,
      mdTokens
    }
  }, null, 2);

  function handleCopy() {
    const content = activeTab === 'json' ? jsonData : result.markdown;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const isJson = activeTab === 'json';
    const content = isJson ? jsonData : result.markdown;
    const ext = isJson ? '.json' : '.md';
    const filename = slugFromUrl(result.url) + ext;
    const blob = new Blob([content], { type: isJson ? 'application/json' : 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div class="output-card">
      <div class="result-status-bar">
        <span class="result-converted-label">
          <span class="checkmark">✓</span> {isBatch ? sourceDisplay : 'Converted'}
        </span>
        <div class="result-actions">
          <button class="outline-button" onClick={() => setViewerOpen(true)} title="Open fullscreen preview">
            <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>open_in_full</span>
            Full Screen
          </button>
          <button class="outline-button" onClick={handleCopy}>
            <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button class="outline-button" onClick={handleDownload}>
            <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>download</span>
            Download
          </button>
        </div>
      </div>

      <div class="result-meta-grid">
        <div class="meta-item">
          <span class="meta-label">SOURCE</span>
          <span class="meta-value" title={result.url}>{sourceDisplay}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">FORMAT</span>
          <span class="meta-value">markdown</span>
        </div>
        
        {(result.htmlTokens !== undefined || result.tokens?.html !== undefined) ? (
          <div class="meta-item">
            <span class="meta-label">TOKENS</span>
            <span class="meta-value">
              <span style={{ color: 'var(--text-dim)' }}>{formatTokens(htmlTokens)}</span>
              {' → '}
              <span style={{ color: 'var(--success-color)' }}>{formatTokens(mdTokens)}</span>
            </span>
          </div>
        ) : (result.tokens_in !== undefined && result.tokens_out !== undefined) ? (
          <div class="meta-item">
            <span class="meta-label">TOKENS (AI)</span>
            <span class="meta-value">
              <span style={{ color: 'var(--text-dim)' }}>{formatTokens(result.tokens_in)}</span>
              {' → '}
              <span style={{ color: 'var(--success-color)' }}>{formatTokens(result.tokens_out)}</span>
            </span>
          </div>
        ) : null}

        {result.model && (
          <div class="meta-item">
            <span class="meta-label">AI MODEL</span>
            <span class="meta-value">{result.model}</span>
          </div>
        )}

        <div class="meta-item">
          <span class="meta-label">WORDS</span>
          <span class="meta-value">{wordCount}</span>
        </div>
      </div>

      {/* YouTube Video Preview Embed */}
      {(() => {
        const checkUrl = result.sourceUrl || result.url || '';
        const ytMatch = checkUrl.match(
          /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
        );
        if (!ytMatch) return null;
        const videoId = ytMatch[1];
        return (
          <div className="iframe-container" style={{ margin: '16px 0' }}>
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title="Video Preview"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      })()}

      <div class="format-tabs">
        <button
          class={`format-tab ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          <span class="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>visibility</span>
          Preview
        </button>
        <button
          class={`format-tab ${activeTab === 'markdown' ? 'active' : ''}`}
          onClick={() => setActiveTab('markdown')}
        >
          <span class="tab-icon">📄</span> Markdown
        </button>
        <button
          class={`format-tab ${activeTab === 'json' ? 'active' : ''}`}
          onClick={() => setActiveTab('json')}
        >
          <span class="tab-icon">{'{ }'}</span> JSON
        </button>
      </div>

      <div class={`format-content preview-view ${activeTab === 'preview' ? 'active' : ''}`}>
        <div
          class="md-preview-body"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>
      <div class={`format-content markdown-view ${activeTab === 'markdown' ? 'active' : ''}`}>
        <textarea class="batch-markdown-output" readonly>{result.markdown}</textarea>
      </div>
      <div class={`format-content json-view ${activeTab === 'json' ? 'active' : ''}`}>
        <pre class="json-output">{jsonData}</pre>
      </div>

      {viewerOpen && (
        <PdfViewerDialog
          file={file}
          sourceUrl={result.sourceUrl}
          imageUrls={
            allResults && allResults.length > 0
              ? allResults.map(r => r.screenshotUrl ? `${API_BASE}${r.screenshotUrl}` : null).filter(Boolean)
              : result.screenshotUrl ? [`${API_BASE}${result.screenshotUrl}`] : []
          }
          markdownPages={
            allResults && allResults.length > 0
              ? allResults.map(r => r.markdown || 'Failed to convert')
              : result.markdownPages && result.markdownPages.length > 0
                ? result.markdownPages
                : result.markdown ? [result.markdown] : []
          }
          initialPage={allResults && allResults.length > 0 && idx >= 0 ? idx + 1 : 1}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
