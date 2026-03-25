File to Markdown Converter | file2md

# Any File to Markdown.

Upload PDFs, Word documents, presentations, spreadsheets, or raw HTML files and get clean, structured Markdown output—ready for your AI pipelines.

80% Token Reduction5x More Content Per Context Window0 External Dependencies

[upload\_fileUpload](/file2md)[linkFrom URL](/file2md/from-url)

Upload a **file** (PDF, image, or document) and convert it to clean, structured Markdown — powered by OCR and optional **AI enhancement**.

iSwitchAI API Key (BYOK) — Required

saveSave Key

Powered by **[Traylinx SwitchAI](https://traylinx.com/switchai)**. Your key authenticates with the File Engine for OCR and with the LLM router for AI enhancement. Stored securely in the browser — never touches our logs.

upload\_file

Drag & drop a file here

or click to browse

PDF · DOCX · XLSX · PPTX · PNG · JPG · JPEG · GIF · WEBP · CSV · JSON · MD · TXT · MP4 · MOV · WEBM · MKV · AVI · MP3 · WAV · M4A · FLAC · OGG · AAC · YOUTUBE

---

## How File2MD Works

File2MD converts any supported file into structured Markdown through a multi-phase pipeline. Files are uploaded to the **Traylinx File Engine** for OCR extraction, then optionally enhanced by an AI model via the **Agentic Upload Engines** service.

**Pipeline Phases:**
1\. **Upload** — File is sent to the Agentic Upload Engines API.
2\. **OCR & Transcription** — The File Engine extracts text from each page (PDFs get per-page OCR, images get vision-based extraction, and media files get full audio transcription).
3\. **Polling** — Progress is streamed to the UI in real time.
4\. **AI Enhancement** (optional) — Raw OCR is cleaned and restructured by an LLM.
5\. **VFS Output** — Results are assembled into a virtual file system with per-page and full-document Markdown.

### Supported Formats

| Category  | Formats                         | Processing Method                           |
| --------- | ------------------------------- | ------------------------------------------- |
| Documents | `PDF`                           | Per-page OCR extraction                     |
| Images    | `PNG` `JPG` `JPEG` `GIF` `WEBP` | Vision-based text extraction                |
| Data      | `CSV` `JSON`                    | Direct conversion to Markdown tables/blocks |
| Media     | `MP4` `MP3` `YOUTUBE`           | Full Whisper transcription                  |
| Text      | `TXT` `MD`                      | Pass-through with optional AI cleanup       |

## API Reference: /api/file2md

Upload a file via multipart form data and receive structured Markdown.

**Response Modes:** Use `format=json` (default) for a clean JSON response with the virtual file system, or `format=stream` for live NDJSON progress logs followed by a `__JSON__` result.

**Authentication:** A valid SwitchAI API key is **always required** in the request body. This key is forwarded to the Traylinx File Engine and LLM router. No server-side fallback — your key, your usage.

### Parameters

| Parameter        | Type     | Default | Description                                                                      |
| ---------------- | -------- | ------- | -------------------------------------------------------------------------------- |
| `file`required   | `File`   | `—`     | The file to convert (multipart upload).                                          |
| `apiKey`required | `string` | `—`     | Your SwitchAI API key (BYOK). Required for all conversions.                      |
| `enhance`        | `string` | `true`  | When "true", the raw OCR output is polished by an AI model for cleaner Markdown. |
| `format`         | `string` | `json`  | Response format: `json` or `stream`.                                             |
| `model`          | `string` | `—`     | Override the vision/LLM model used for extraction.                               |

### Example: File Upload

POST/api/file2md

Upload a file via multipart form. Use `format=json` (default) for a clean JSON response, or `format=stream` for live progress logs.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl -X POST https://2md.traylinx.com/api/file2md \
  -F "file=@report.pdf" \
  -F "apiKey=sk-lf-your-switchai-key" \
  -F "enhance=true"
```

### 🚀 Get Your Free SwitchAI API Key

SwitchAI is Traylinx's unified LLM router — one key, access to GPT, Claude, Llama, Mistral, and more. Sign up in 30 seconds and start generating intelligent Skill Bundles immediately.

[Create Free Account →](https://traylinx.com/switchai)

Pay-as-you-go pricing · No monthly minimums · Your key, your data

## Frequently Asked Questions

Common questions about file conversion, OCR, and AI enhancement.

Which file formats are supported?+

PDF, DOCX, XLSX, PPTX, PNG, JPG, JPEG, GIF, WEBP, CSV, JSON, MD, TXT, MP4, MP3, and YouTube URLs. PDFs and Office documents are processed page-by-page with OCR. Images are analyzed with vision models. Audio/Video/YouTube files are fully transcribed into Markdown paragraphs with speaker labels.

What does the AI Enhance toggle do?+

When enabled, the raw OCR output is sent through an LLM (via Traylinx SwitchAI) for cleanup — fixing formatting artifacts, reconstructing tables, adding proper headings, and removing noise. This uses your API key credits. When disabled, you get the raw OCR output as-is.

Is there a file size limit?+

Yes, the maximum upload size is 100 MB per file. For larger documents, consider splitting them into smaller parts before uploading.

How long does the conversion take?+

Small files (1-5 pages) typically complete in 10-30 seconds. Larger documents may take up to 2 minutes. AI enhancement adds 5-15 seconds depending on content length. The pipeline times out after 5 minutes maximum.

What happens if AI enhancement fails?+

The system gracefully falls back to the raw OCR output. You still get your Markdown — just without the AI cleanup. The error is logged in the streaming output so you can see what happened.

Where is my API key stored?+

Your SwitchAI API key is stored only in your browser's localStorage (shared with the Agentify tab). It is never logged on our servers. The key is sent as a Bearer token directly to the Traylinx API for authentication.

## Unlock Data Trapped in Documents

PDFs, Office Documents (DOCX, XLSX, PPTX), images, and raw data files are notoriously difficult for AI to parse. File2MD uses state-of-the-art OCR, Vision models, and data extraction to accurately convert content and restructure it into pristine Markdown, preserving tables, lists, and context.

STEP 1

### Intelligent Ingestion

Accepts a wide range of formats (PDF, DOCX, XLSX, PPTX, PNG, JPG, CSV, JSON, TXT, MD). Large files are accurately processed, and pipelines dynamically adapt based on document structure or visual content.

STEP 2

### Advanced OCR & Vision Extraction

Applies highly accurate optical character recognition. Text layout, columns, and structural elements are preserved rather than flattened into a jumbled, illegible string.

STEP 3

### LLM-Powered Enhancement

An optional AI rendering pass refines the raw OCR output, fixing formatting artifacts, resolving broken tables, and ensuring the final Markdown is strictly formatted and optimized for agents.

## REST API Reference

For programmatic access, File2MD exposes a unified backend endpoint for file extraction. Check the **Upload** and **From URL** tabs for real-world usage examples and endpoint specifics.

GET/api/health

Check the health of the backend file engine.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl ${host}/api/health
```

## Built For

Analysts, enterprise AI pipelines, and teams needing clean, structured data from messy documents.

picture\_as\_pdf

#### Invoice and receipt processing pipelines

description

#### RAG systems requiring complex document ingestion

table\_chart

#### Extracting clean tables from legacy spreadsheets

analytics

#### Automated auditing and compliance agents
