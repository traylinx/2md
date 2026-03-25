
import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { marked } from 'marked';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import VideoJS from './VideoJS';
import { slugFromUrl } from '../utils';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const renderer = new marked.Renderer();
renderer.image = (href, title, text) => {
  if (typeof href === 'string' && !href.startsWith('http') && !href.startsWith('data:')) {
    return `<div class="md-image-placeholder">
      <span class="material-symbols-outlined">image</span>
      <span class="md-image-placeholder-text">[Embedded Image Extracted: ${text || href}]</span>
    </div>`;
  }
  return `<img src="${href}" alt="${text || ''}" title="${title || ''}" />`;
};

marked.setOptions({ breaks: true, gfm: true, renderer: renderer });

export default function PdfViewerDialog({ file, markdownPages, imageUrls, sourceUrl, initialPage = 1, onClose }) {
  const canvasRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [rendering, setRendering] = useState(false);
  const [viewMode, setViewMode] = useState('pdf');
  const [mdDarkMode, setMdDarkMode] = useState(false);

  const hasMarkdown = markdownPages && markdownPages.length > 0;
  const hasImages = imageUrls && imageUrls.length > 0;
  const isPdf = file && (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf'));
  const isImage = (file && file.type?.startsWith('image/')) || hasImages;

  const audioExts = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'];
  const videoExts = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];
  const isAudio = file && (file.type?.startsWith('audio/') || audioExts.some(ext => file.name?.toLowerCase().endsWith(ext)));
  const isVideo = file && (file.type?.startsWith('video/') || videoExts.some(ext => file.name?.toLowerCase().endsWith(ext)));
  const isMedia = isAudio || isVideo;

  const ytMatch = (sourceUrl || '').match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  );
  const youtubeVideoId = ytMatch ? ytMatch[1] : null;

  // Lock body scroll while dialog is open to prevent double scrollbars
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

  useEffect(() => {
    if (isMedia || youtubeVideoId) {
      setViewMode('media');
      setTotalPages(hasMarkdown ? markdownPages.length : 1);
      return;
    }
    if (!isPdf) {
      if (hasMarkdown) {
        setViewMode('markdown');
        setTotalPages(Math.max(markdownPages.length, hasImages ? imageUrls.length : 0));
      } else if (isImage) {
        setViewMode('image');
        if (hasImages) setTotalPages(imageUrls.length);
      }
      return;
    }

    let cancelled = false;
    async function loadPdf() {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
      } catch (err) {
        console.error('[PdfViewer] Load error:', err);
      }
    }
    loadPdf();
    return () => { cancelled = true; };
  }, [file, isPdf]);

  const renderPage = useCallback(async (pageNum) => {
    if (!pdfDoc || rendering) return;
    setRendering(true);
    try {
      const page = await pdfDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = (zoom / 100) * (Math.min(window.innerWidth * 0.85, 900) / baseViewport.width);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport
      }).promise;
    } catch (err) {
      console.error('[PdfViewer] Render error:', err);
    } finally {
      setRendering(false);
    }
  }, [pdfDoc, zoom, rendering]);

  useEffect(() => {
    if (pdfDoc && viewMode === 'pdf') renderPage(currentPage);
  }, [pdfDoc, currentPage, zoom, viewMode]);

  const currentMarkdownHtml = useMemo(() => {
    if (!hasMarkdown || viewMode !== 'markdown') return '';
    const pageContent = markdownPages[currentPage - 1] || '';
    return marked.parse(pageContent);
  }, [markdownPages, currentPage, viewMode]);

  function prevPage() { if (currentPage > 1) setCurrentPage(p => p - 1); }
  function nextPage() { if (currentPage < totalPages) setCurrentPage(p => p + 1); }
  function zoomIn() { setZoom(z => Math.min(z + 25, 300)); }
  function zoomOut() { setZoom(z => Math.max(z - 25, 50)); }

  function toggleViewMode() {
    if (!hasMarkdown) return;
    if (isMedia || youtubeVideoId) {
      setViewMode(m => m === 'media' ? 'markdown' : 'media');
    } else if (isPdf) {
      setViewMode(m => m === 'pdf' ? 'markdown' : 'pdf');
    } else if (isImage) {
      setViewMode(m => m === 'image' ? 'markdown' : 'image');
    }
  }

  function handleDownload() {
    if (viewMode === 'markdown' && hasMarkdown) {
      const fullMd = markdownPages.join('\n\n---\n\n');
      const blob = new Blob([fullMd], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = slugFromUrl(file?.name || 'document') + '.md';
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      const cleanName = slugFromUrl(file.name.replace(/\.[^.]+$/, ''));
      const ext = file.name.split('.').pop();
      a.download = `${cleanName}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prevPage();
      else if (e.key === 'ArrowRight') nextPage();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
      else if (e.key === 't' || e.key === 'T') toggleViewMode();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentPage, totalPages, viewMode]);

  const displayName = hasImages && !file ? 'Document' : (file?.name || 'Document');
  const originalFileIcon = isPdf ? 'picture_as_pdf'
    : (isMedia || youtubeVideoId) ? (isAudio ? 'headphones' : 'play_circle')
    : isImage ? 'image' : 'insert_drive_file';
  const modeBadge = viewMode === 'pdf' ? 'PDF'
    : viewMode === 'media' ? (youtubeVideoId ? 'YT' : (isAudio ? 'AUDIO' : 'VIDEO'))
    : viewMode === 'image' ? 'IMG' : 'MD';
  
  const [localImageUrl, setLocalImageUrl] = useState('');
  useEffect(() => {
    if (isImage && !hasImages && file) {
      const url = URL.createObjectURL(file);
      setLocalImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, isImage, hasImages]);
  const currentImageUrl = hasImages ? imageUrls[Math.min(currentPage - 1, imageUrls.length - 1)] : localImageUrl;

  return (
    <div class="pdf-viewer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="pdf-viewer-dialog">
        <div class="pdf-viewer-toolbar">
          <div class="pdf-viewer-filename">
            <span class="traylinx-file-badge">
              {modeBadge}
            </span>
            <span class="traylinx-file-title">{displayName}</span>
          </div>

          <div class="traylinx-toolbar-right">
            <div class="traylinx-btn-group">
              {/* Theme Toggle (First Button) */}
              {hasMarkdown && viewMode === 'markdown' && (
                <button 
                  class="traylinx-btn" 
                  onClick={() => setMdDarkMode(!mdDarkMode)} 
                  title={`Switch to ${mdDarkMode ? 'Light' : 'Dark'} Mode`}
                >
                  <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    {mdDarkMode ? 'light_mode' : 'dark_mode'}
                  </span>
                </button>
              )}

              {/* View mode toggle */}
              {hasMarkdown && (file || hasImages || isMedia || youtubeVideoId) && (
                <>
                  <button
                    class={`traylinx-btn ${viewMode === 'markdown' ? 'active' : ''}`}
                    onClick={() => setViewMode('markdown')}
                    title="Markdown view"
                  >
                    <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>description</span>
                  </button>
                  <button
                    class={`traylinx-btn ${viewMode !== 'markdown' ? 'active' : ''}`}
                    onClick={() => setViewMode(
                      isMedia || youtubeVideoId ? 'media' : (isImage ? 'image' : (isPdf ? 'pdf' : 'original'))
                    )}
                    title={isMedia ? (isAudio ? 'Audio player' : 'Video player') : (youtubeVideoId ? 'YouTube player' : (isImage ? 'Image view' : (isPdf ? 'PDF view' : 'Original file view')))}
                  >
                    <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      {originalFileIcon}
                    </span>
                  </button>
                </>
              )}

              {/* Pagination */}
              <button class="traylinx-btn" onClick={prevPage} disabled={currentPage <= 1 || (viewMode === 'image' && !hasImages)} title="Previous page (←)">
                <span class="material-symbols-outlined">chevron_left</span>
              </button>
              <div class="traylinx-page-info">{viewMode === 'image' && !hasImages ? '1 / 1' : `${currentPage} / ${totalPages}`}</div>
              <button class="traylinx-btn" onClick={nextPage} disabled={currentPage >= totalPages || (viewMode === 'image' && !hasImages)} title="Next page (→)">
                <span class="material-symbols-outlined">chevron_right</span>
              </button>

              {/* Zoom */}
              <button class="traylinx-btn" onClick={zoomOut} disabled={zoom <= 50} title="Zoom out (−)">
                <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>zoom_out</span>
              </button>
              <div class="traylinx-page-info" style={{ minWidth: '54px' }}>{zoom}%</div>
              <button class="traylinx-btn" onClick={zoomIn} disabled={zoom >= 300} title="Zoom in (+)">
                <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>zoom_in</span>
              </button>

              {/* Actions */}
              {hasMarkdown && (file || hasImages || isMedia || youtubeVideoId) && (
                <button class="traylinx-btn" title="AI Enhance (Coming soon)">
                  <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>auto_awesome</span>
                </button>
              )}
              <button class="traylinx-btn" onClick={handleDownload} title={`Download ${viewMode === 'markdown' && hasMarkdown ? 'Markdown' : (file?.name?.split('.').pop()?.toUpperCase() || 'File')}`}>
                <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
              </button>
              <button class="traylinx-btn" onClick={onClose} title="Close (Esc)">
                <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
              </button>
            </div>
          </div>
        </div>

        <div class="pdf-viewer-content">
          {viewMode === 'pdf' && (
            <>
              {rendering && !canvasRef.current?.width && (
                <div class="pdf-viewer-loading">
                  <div class="spinner-purple" />
                  <p>Loading page...</p>
                </div>
              )}
              <canvas ref={canvasRef} class="pdf-viewer-canvas" />
            </>
          )}

          {viewMode === 'markdown' && (
            <div class={`pdf-viewer-md-page ${mdDarkMode ? 'md-dark' : ''}`} style={{ zoom: `${zoom}%` }}>
              <div class="pdf-viewer-md-page-header">
                Page {currentPage} of {totalPages}
              </div>
              <div
                class="md-preview-body"
                dangerouslySetInnerHTML={{ __html: currentMarkdownHtml }}
              />
            </div>
          )}

          {viewMode === 'image' && currentImageUrl && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                height: '100%',
                width: '100%',
                overflowY: 'auto',
                padding: '24px 0',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  background: 'transparent',
                  zoom: `${zoom}%`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}
              >
                <div class="pdf-viewer-md-page-header" style={{ color: '#999', alignSelf: 'flex-start' }}>
                  Page {currentPage} of {totalPages}
                </div>
                <img
                  src={currentImageUrl}
                  alt="Source preview"
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                    display: 'block',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    borderRadius: '4px'
                  }}
                />
              </div>
            </div>
          )}

          {viewMode === 'original' && (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%', color: '#6e6e80' }}>
              <span class="material-symbols-outlined" style={{ fontSize: '48px', marginBottom: '16px' }}>insert_drive_file</span>
              <p style={{ marginBottom: '16px' }}>Preview not available for this file type.</p>
              <button class="traylinx-btn outline" onClick={handleDownload}>
                <span class="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '8px' }}>download</span>
                Download Original File
              </button>
            </div>
          )}

          {viewMode === 'media' && (
            <div style={{
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              alignItems: 'center', height: '100%', width: '100%', padding: '24px',
              boxSizing: 'border-box'
            }}>
              {youtubeVideoId ? (
                <div style={{ width: '100%', maxWidth: `${zoom}%`, display: 'flex', justifyContent: 'center', transition: 'max-width 0.2s ease' }}>
                  <div class="iframe-container" style={{ width: '100%', maxWidth: '1440px', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=0`}
                      title="YouTube Video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              ) : isVideo && file ? (
                <div class="video-container" style={{ maxWidth: '960px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                  <VideoJS
                    options={{
                      controls: true,
                      preload: 'metadata',
                      fluid: true,
                      sources: [{ src: URL.createObjectURL(file), type: file.type }]
                    }}
                  />
                </div>
              ) : isAudio && file ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: '24px', padding: '48px 0', width: '100%', maxWidth: '600px'
                }}>
                  <div style={{
                    width: '96px', height: '96px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #7c4dff 0%, #b388ff 50%, #ea80fc 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <span class="material-symbols-outlined" style={{ fontSize: '48px', color: '#fff' }}>headphones</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '4px' }}>{file.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      {file.name.split('.').pop().toUpperCase()} · {(file.size / (1024*1024)).toFixed(1)} MB
                    </div>
                  </div>
                  <div class="audio-container" style={{ width: '100%' }}>
                    <VideoJS
                      audioOnly={true}
                      options={{
                        controls: true,
                        preload: 'metadata',
                        fluid: false,
                        height: 120,
                        sources: [{ src: URL.createObjectURL(file), type: file.type }],
                        controlBar: {
                          fullscreenToggle: false,
                          pictureInPictureToggle: false
                        }
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ color: '#6e6e80', textAlign: 'center' }}>
                  <span class="material-symbols-outlined" style={{ fontSize: '48px', marginBottom: '16px' }}>play_circle</span>
                  <p>Media preview not available.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
