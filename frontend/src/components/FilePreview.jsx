import { useState, useEffect, useRef } from 'preact/hooks';
import PdfViewerDialog from './PdfViewerDialog';
import VideoJS from './VideoJS';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function isImage(file) {
  return file.type.startsWith('image/');
}

function isPdf(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isAudio(file) {
  const audioExts = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'];
  return file.type.startsWith('audio/') || audioExts.some(ext => file.name.toLowerCase().endsWith(ext));
}

function isVideo(file) {
  const videoExts = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];
  return file.type.startsWith('video/') || videoExts.some(ext => file.name.toLowerCase().endsWith(ext));
}

function isText(file) {
  const textTypes = ['text/', 'application/json'];
  return textTypes.some(t => file.type.startsWith(t)) || 
    ['.txt', '.md', '.csv', '.json'].some(ext => file.name.toLowerCase().endsWith(ext));
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function PdfPreview({ file }) {
  const canvasRef = useRef(null);
  const [pageInfo, setPageInfo] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function renderPdf() {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        
        setPageInfo(`${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}`);
        
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        // Render at a high resolution to ensure text is crisp when CSS scales it up
        const renderWidth = 1600; 
        const scale = renderWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        await page.render({
          canvasContext: canvas.getContext('2d'),
          viewport: scaledViewport
        }).promise;
      } catch (err) {
        console.error('[FilePreview] PDF render error:', err);
      }
    }
    renderPdf();
    return () => { cancelled = true; };
  }, [file]);

  return (
    <div class="file-preview-canvas-wrap" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', borderRadius: '4px' }} />
      {pageInfo && <span class="file-preview-page-badge">{pageInfo}</span>}
    </div>
  );
}

function ImagePreview({ file }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return src ? (
    <img src={src} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', borderRadius: '4px' }} />
  ) : null;
}

function TextPreview({ file }) {
  const [text, setText] = useState('');

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      setText(content.length > 600 ? content.substring(0, 600) + '\n...' : content);
    };
    reader.readAsText(file);
  }, [file]);

  return (
    <pre class="file-preview-text" style={{ width: '100%', height: '100%', margin: 0, boxSizing: 'border-box', overflow: 'auto' }}>{text}</pre>
  );
}

function AudioPreview({ file }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const ext = file.name.split('.').pop().toUpperCase();

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', width: '100%', height: '100%' }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--mui-primary-main, #7c4dff) 0%, var(--mui-primary-light, #b388ff) 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <span class="material-symbols-outlined" style={{ fontSize: '30px', color: '#fff' }}>headphones</span>
      </div>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px', fontWeight: 600 }}>{ext} AUDIO</span>
      {src && (
        <div class="audio-container">
          <VideoJS
            audioOnly={true}
            options={{
              controls: true,
              preload: 'metadata',
              fluid: false,
              height: 120,
              sources: [{ src, type: file.type }],
              controlBar: {
                fullscreenToggle: false,
                pictureInPictureToggle: false
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

function VideoPreview({ file }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return src ? (
    <div class="video-container" onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '100%' }}>
      <VideoJS
        options={{
          controls: true,
          preload: 'metadata',
          fluid: true,
          sources: [{ src, type: file.type }]
        }}
      />
    </div>
  ) : null;
}

export default function FilePreview({ file, onRemove, enhance, onEnhanceChange, onConvert, loading, apiKeyReady, markdownPages, onNeedApiKey }) {
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const requiresApiKey = isImage(file) || isAudio(file) || isVideo(file);
  const showApiKeyNudge = requiresApiKey && !apiKeyReady && !loading;
  const canConvert = apiKeyReady || !requiresApiKey;

  return (
    <div class="file-preview-card">
      <button
        type="button"
        class="file-preview-remove"
        onClick={onRemove}
        title="Remove file"
        disabled={loading}
      >
        <span class="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
      </button>

      <div class="file-preview-body" onClick={() => { if (!isAudio(file) && !isVideo(file)) setPdfViewerOpen(true); }} style={{ cursor: isAudio(file) || isVideo(file) ? 'default' : 'pointer' }} title={isAudio(file) || isVideo(file) ? '' : 'Click to open fullscreen preview'}>
        {isPdf(file) && (
          <PdfPreview file={file} />
        )}
        {isImage(file) && <ImagePreview file={file} />}
        {isAudio(file) && <AudioPreview file={file} />}
        {isVideo(file) && <VideoPreview file={file} />}
        {isText(file) && !isPdf(file) && !isImage(file) && <TextPreview file={file} />}
        {!isPdf(file) && !isImage(file) && !isAudio(file) && !isVideo(file) && !isText(file) && (
          <div class="file-preview-fallback">
            <span class="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--mui-primary-light)', opacity: 0.7 }}>description</span>
          </div>
        )}
      </div>

      <div class="file-preview-info">
        <div class="file-preview-meta">
          <span class="file-preview-name">{file.name}</span>
          <span class="file-preview-size">{formatSize(file.size)} · {file.type || 'unknown'}</span>
        </div>
      </div>

      <div class="file-preview-actions">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {showApiKeyNudge && (
            <div class="api-key-nudge" onClick={onNeedApiKey} title="Click to enter your API key">
              <span class="material-symbols-outlined" style={{ fontSize: '18px', flexShrink: 0, color: 'var(--mui-primary-main)' }}>key</span>
              <div>
                <strong>SwitchAI API Key required for Media</strong>
                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '2px' }}>Your API key is heavily required to run Vision/Audio models. Click to add yours above.</span>
              </div>
              <span class="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--text-dim)', marginLeft: 'auto', flexShrink: 0 }}>arrow_upward</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <button
              class={`outline-button action-btn ${!canConvert && !loading ? 'needs-key' : ''}`}
              onClick={!canConvert && !loading ? onNeedApiKey : onConvert}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <span class="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>auto_awesome</span>
              {loading ? 'Converting...' : 'Convert to Markdown'}
            </button>
          </div>
        </div>
      </div>

      {pdfViewerOpen && (
        <PdfViewerDialog file={file} markdownPages={markdownPages} onClose={() => setPdfViewerOpen(false)} />
      )}
    </div>
  );
}
