import { useState, useRef, useEffect } from 'preact/hooks';
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
import ClearJobButton from '../components/ClearJobButton';

const ACCEPTED_TYPES = [
  { ext: '.pdf', label: 'PDF', mime: 'application/pdf' },
  { ext: '.docx', label: 'DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { ext: '.xlsx', label: 'XLSX', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { ext: '.pptx', label: 'PPTX', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { ext: '.png', label: 'PNG', mime: 'image/png' },
  { ext: '.jpg', label: 'JPG', mime: 'image/jpeg' },
  { ext: '.jpeg', label: 'JPEG', mime: 'image/jpeg' },
  { ext: '.gif', label: 'GIF', mime: 'image/gif' },
  { ext: '.webp', label: 'WEBP', mime: 'image/webp' },
  { ext: '.csv', label: 'CSV', mime: 'text/csv' },
  { ext: '.json', label: 'JSON', mime: 'application/json' },
  { ext: '.md', label: 'MD', mime: 'text/markdown' },
  { ext: '.txt', label: 'TXT', mime: 'text/plain' },
  { ext: '.mp4', label: 'MP4', mime: 'video/mp4' },
  { ext: '.mov', label: 'MOV', mime: 'video/quicktime' },
  { ext: '.webm', label: 'WEBM', mime: 'video/webm' },
  { ext: '.mkv', label: 'MKV', mime: 'video/x-matroska' },
  { ext: '.avi', label: 'AVI', mime: 'video/x-msvideo' },
  { ext: '.mp3', label: 'MP3', mime: 'audio/mpeg' },
  { ext: '.wav', label: 'WAV', mime: 'audio/wav' },
  { ext: '.m4a', label: 'M4A', mime: 'audio/mp4' },
  { ext: '.flac', label: 'FLAC', mime: 'audio/flac' },
  { ext: '.ogg', label: 'OGG', mime: 'audio/ogg' },
  { ext: '.aac', label: 'AAC', mime: 'audio/aac' },
  { ext: '.youtube', label: 'YOUTUBE', mime: 'text/plain' }
];

const ACCEPT_STRING = ACCEPTED_TYPES.map(t => t.ext).join(',');
const STORAGE_KEY = 'agentify_api_key';

const FILE2MD_PARAMS = [
  { name: 'file', type: 'File', defaultVal: '—', description: 'The file to convert (multipart upload).', required: true },
  { name: 'url', type: 'string', defaultVal: '—', description: 'Fallback URL to download the file instead of uploading it.' },
  { name: 'apiKey', type: 'string', defaultVal: '—', description: 'Your SwitchAI API key (BYOK). Required for all conversions.', required: true },
  { name: 'enhance', type: 'string', defaultVal: 'true', description: 'When "true", the raw OCR output is polished by an AI model for cleaner Markdown.' },
  { name: 'model', type: 'string', defaultVal: '—', description: 'Optional override for the vision model used during processing.' },
  { name: 'format', type: 'string', defaultVal: 'json', description: 'Response format: json (structured), markdown (raw text), or stream (NDJSON logs + __JSON__ result).' },
];

const FILE2MD_FAQS = [
  {
    q: 'What types of files can I upload?',
    a: 'PDFs, images (PNG, JPG, GIF, WEBP), documents (DOCX, XLSX, PPTX), data files (CSV, JSON), text files (TXT, MD), and even video/audio (MP4, MP3, WAV, YouTube links). If you can open it, we can probably convert it.'
  },
  {
    q: 'Do I always need an API key?',
    a: 'Yes. File conversion uses AI vision models to read your documents, which requires a SwitchAI API key. You can get one for free at traylinx.com/switchai. Your key is stored only in your browser \u2014 we never see or save it.'
  },
  {
    q: 'What is "AI Enhancement"?',
    a: 'When turned on, an AI model cleans up the raw text extracted from your file \u2014 fixing formatting, improving headings, and making the Markdown more readable. Optional but recommended for scanned documents or messy PDFs.'
  },
  {
    q: 'What is the difference between Upload and From URL?',
    a: 'They produce the same result. Upload is for files on your computer. "From URL" is for files already hosted online (like a PDF link). Use whichever is easier for you.'
  },
  {
    q: 'How long does conversion take?',
    a: 'Most PDFs and images convert in under 30 seconds. Videos and audio files take longer because they need to be transcribed. You will see a real-time progress log while it works.'
  },
  {
    q: 'Is there a file size limit?',
    a: 'Files up to 10 MB work best. Very large files may take longer or time out. For big videos, consider using a YouTube link instead of uploading the file directly.'
  },
  {
    q: 'Can I convert YouTube videos?',
    a: 'Yes! Just paste a YouTube URL in the "From URL" tab. The system will download the audio and transcribe it into Markdown using Whisper AI.'
  }
];

export default function FileUploadPage({ recoveredJob }) {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [enhance, setEnhance] = useState(false);

  const inputRef = useRef(null);
  const byokRef = useRef(null);
  const [result, setResult] = useState(null);
  const { log, loading, error, streamFetch, abort } = useStreamFetch();

  const [hasApiKey, setHasApiKey] = useState(() => !!localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    const handleStorage = () => {
      setHasApiKey(!!localStorage.getItem(STORAGE_KEY));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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
        const restored = { success: true, url: meta.original_filename || recoveredJob.label || '', markdown: md, markdownPages: pages };
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
    setFile(null);
    setResult(null);
    localStorage.removeItem('html2md_active_job');
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleConvert() {
    const apiKey = localStorage.getItem(STORAGE_KEY);
    if (!file || !apiKey) return;
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
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
          url: metadata.original_filename || file.name,
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
            endpoint: 'upload'
          }));
        }
      }
    });
  }

  function handleFileSelect(e) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      localStorage.removeItem('html2md_active_job');
    }
  }

  function isAcceptedType(f) {
    const name = f.name.toLowerCase();
    return ACCEPTED_TYPES.some(t => name.endsWith(t.ext));
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer?.files?.[0];
    if (f && isAcceptedType(f)) {
      setFile(f);
      setResult(null);
      localStorage.removeItem('html2md_active_job');
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }




  return (
    <div id="upload-panel" class="mode-panel">
      <p class="mode-description">
        Upload a <strong>file</strong> (PDF, image, or document) and convert it to clean, structured Markdown — powered by OCR and optional <strong>AI enhancement</strong>.
      </p>

      <div ref={byokRef}>
        <BYOKInput 
          storageKey={STORAGE_KEY} 
          validationUrl="https://switchai.traylinx.com/health"
          tooltipText="Your SwitchAI API key is used to authenticate with the Traylinx File Engine for OCR processing, and optionally for AI-powered markdown enhancement."
          descriptionHtml="Powered by <strong><a href='https://traylinx.com/switchai' target='_blank' style='color: var(--mui-primary-main); text-decoration: none;'>Traylinx SwitchAI</a></strong>. Your key authenticates with the File Engine for OCR and with the LLM router for AI enhancement. Stored securely in the browser — never touches our logs."
        />
      </div>

      {/* Upload Zone / File Preview */}
      {!file ? (
        <div
          class={`upload-zone flat-box ${dragging ? 'upload-zone-active' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_STRING}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <div class="upload-zone-content">
            <span class="material-symbols-outlined upload-icon">upload_file</span>
            <p class="upload-zone-title">Drag & drop a file here</p>
            <p class="upload-zone-subtitle">or click to browse</p>
            <p class="upload-zone-formats">
              {ACCEPTED_TYPES.map(t => t.label).join(' · ')}
            </p>
          </div>
        </div>
      ) : (
        <FilePreview
          file={file}
          onRemove={handleNewJob}
          enhance={enhance}
          onEnhanceChange={setEnhance}
          onConvert={handleConvert}
          loading={loading}
          apiKeyReady={hasApiKey}
          markdownPages={result?.markdownPages && result.markdownPages.length > 0
            ? result.markdownPages
            : result?.markdown ? [result.markdown] : undefined
          }
          onNeedApiKey={() => {
            byokRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            byokRef.current?.querySelector('input')?.focus();
          }}
        />
      )}

      {loading && (
        <LoadingPanel message="Uploading and processing document..." log={log} onCancel={abort} />
      )}

      {error && !loading && (
        <ErrorPanel title="Conversion Failed" message={error} />
      )}

      {result && !loading && (
        <div id="result-screen">
          <ClearJobButton onClick={handleNewJob} label="Clear File & Start Over" />
          <OutputCard result={result} file={file} />
        </div>
      )}

      {/* Documentation & API Reference */}
      <hr class="doc-divider" />

      <DocSection title="Convert Local Files Into Structured Markdown">
        <p class="doc-text">
          <strong>File2MD Upload</strong> is for content that does not start as a webpage. Upload a PDF, image, text file, or media asset, run it through the file extraction pipeline, and receive Markdown that is easier to review, search, and reuse.
        </p>
        <p class="doc-text"><strong>Best when the source file is already on your machine.</strong></p>
      </DocSection>

      <DocSection title="How It Works">
        <ol class="doc-text" style={{ paddingLeft: '20px', marginBottom: '0' }}>
          <li>Upload a local file.</li>
          <li>Add the required API key.</li>
          <li>Choose enhancement options if needed.</li>
          <li>Run conversion and review the returned Markdown files.</li>
        </ol>
      </DocSection>

      <DocSection title="When To Use This Mode">
        <p class="doc-text"><strong>Best for:</strong> Local PDFs, scanned images, audio or video files, text files, and other documents that are not standard webpages.</p>
        <p class="doc-text" style={{ marginBottom: '0' }}><strong>Not for:</strong> Normal HTML page extraction or multi-page website crawling.</p>
      </DocSection>

      <DocSection title="Output You Will Get">
        <p class="doc-text">
          The result is a Markdown-oriented file set that can include page-level outputs, full-document output, and metadata. The exact artifact mix depends on the file type and pipeline path.
        </p>
        <ul class="doc-text" style={{ paddingLeft: '20px', marginBottom: '24px' }}>
          <li>Page-level Markdown when applicable</li>
          <li>Full-document Markdown</li>
          <li>Metadata and processing artifacts when available</li>
        </ul>
        <h3 class="api-ref-subheader">Supported Formats</h3>
        <div class="param-table-wrap">
          <table class="param-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Formats</th>
                <th>Processing Method</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Documents</td>
                <td><code>PDF</code></td>
                <td>Per-page OCR extraction</td>
              </tr>
              <tr>
                <td>Images</td>
                <td><code>PNG</code> <code>JPG</code> <code>JPEG</code> <code>GIF</code> <code>WEBP</code></td>
                <td>Vision-based text extraction</td>
              </tr>
              <tr>
                <td>Data</td>
                <td><code>CSV</code> <code>JSON</code></td>
                <td>Direct conversion to Markdown tables/blocks</td>
              </tr>
              <tr>
                <td>Media</td>
                <td><code>MP4</code> <code>MP3</code> <code>YOUTUBE</code></td>
                <td>Full Whisper transcription</td>
              </tr>
              <tr>
                <td>Text</td>
                <td><code>TXT</code> <code>MD</code></td>
                <td>Pass-through with optional AI cleanup</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection title="API Reference: /api/file2md">
        <p class="doc-text">
          Use <code>POST /api/file2md</code> with <code>multipart/form-data</code> when the source document is local. The request must include an <code>apiKey</code>, and the endpoint returns progress logs followed by the final <code>__JSON__</code> result.
        </p>

        <div class="doc-note">
          <strong>Required input:</strong> Either <code>file</code> or <code>url</code> must be provided to the endpoint. On this tab, the user-facing path is the <code>file</code> form field.
        </div>

        <h3 class="api-ref-subheader">Parameters</h3>
        <ParameterTable params={FILE2MD_PARAMS} />

        <h3 class="api-ref-subheader">Example: File Upload</h3>
        <ApiReferenceCard
          endpoint="/api/file2md"
          curlTemplate={(origin) => `curl -X POST ${origin}/api/file2md \\
  -F "file=@report.pdf" \\
  -F "apiKey=sk-lf-your-switchai-key" \\
  -F "enhance=true"`}
          responseJson={`{
  "success": true,
  "files": {
    "pages/page_1.md": "# Introduction\\n\\nThis report covers...",
    "pages/page_2.md": "## Methodology\\n\\n...",
    "full_document.md": "# Introduction\\n\\n...\\n\\n## Methodology...",
    "full_document_raw.md": "<!-- Page 1 -->\\nIntroduction...",
    "metadata.json": "{ \\"original_filename\\": \\"report.pdf\\", \\"total_pages\\": 2 }"
  }
}`}
          description="Use form fields to upload the local file and provide the required API key."
        />

        <h3 class="api-ref-subheader">Integrate: curl</h3>
        <ApiReferenceCard
          endpoint="/api/file2md"
          method="POST"
          curlTemplate={(origin) => `# Upload a PDF with AI enhancement
curl -X POST ${origin}/api/file2md \\
  -F "file=@/path/to/document.pdf" \\
  -F "apiKey=sk-lf-your-switchai-key" \\
  -F "enhance=true" \\
  -F "format=json"

# Upload an image for OCR
curl -X POST ${origin}/api/file2md \\
  -F "file=@/path/to/screenshot.png" \\
  -F "apiKey=sk-lf-your-switchai-key" \\
  -F "enhance=false"`}
          responseJson={`{
  "success": true,
  "files": {
    "pages/page_1.md": "# Introduction\\n...",
    "full_document.md": "# Full Document\\n...",
    "metadata.json": "{ \\"original_filename\\": \\"document.pdf\\", \\"total_pages\\": 3 }"
  }
}`}
          description="Upload files directly from the command line. Works with PDFs, images, and all supported formats."
        />

        <h3 class="api-ref-subheader">Integrate: JavaScript</h3>
        <ApiReferenceCard
          endpoint="/api/file2md"
          method="POST"
          curlTemplate={(origin) => `// JavaScript — Upload and convert a file
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('apiKey', 'sk-lf-your-switchai-key');
formData.append('enhance', 'true');
formData.append('format', 'json');

const res = await fetch('${origin}/api/file2md', {
  method: 'POST',
  body: formData
});
const { files } = await res.json();
console.log('Pages:', Object.keys(files).filter(k => k.startsWith('pages/')));
console.log('Full doc:', files['full_document.md'].substring(0, 200));`}
          responseJson={`# Python — Upload and convert a file
import requests

with open('document.pdf', 'rb') as f:
    res = requests.post('https://2md.traylinx.com/api/file2md',
        files={'file': f},
        data={
            'apiKey': 'sk-lf-your-switchai-key',
            'enhance': 'true',
            'format': 'json'
        }
    )
data = res.json()
for name, content in data['files'].items():
    print(f'{name}: {len(content)} chars')`}
          description="File upload integration in JavaScript (FormData) and Python (requests)."
        />
      </DocSection>

      <SwitchAICTA />
      <FaqSection faqs={FILE2MD_FAQS} subtitle="Common questions about file conversion, OCR, and AI enhancement." />
    </div>
  );
}
