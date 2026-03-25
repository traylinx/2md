/**
 * Centralized format capability registry for html2md.
 * Single source of truth for: allowed upload types, MIME types, families,
 * and processing hints.
 *
 * Mirrors the pattern from file_engine's format_capabilities.py (phase 1).
 * To enable new formats, set uploadAllowed/urlAllowed to true — the multer
 * filter, browser accept string, and /api/upload-info all update automatically.
 */

const FORMAT_REGISTRY = [
  // ── Images (full upstream support) ──────────────────────────────────────
  { ext: 'png',  mime: 'image/png',     family: 'image',          label: 'PNG',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'jpg',  mime: 'image/jpeg',    family: 'image',          label: 'JPG',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'jpeg', mime: 'image/jpeg',    family: 'image',          label: 'JPEG', uploadAllowed: true,  urlAllowed: true  },
  { ext: 'gif',  mime: 'image/gif',     family: 'image',          label: 'GIF',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'webp', mime: 'image/webp',    family: 'image',          label: 'WEBP', uploadAllowed: true,  urlAllowed: true  },

  // ── Images (partial upstream support — not exposed yet) ─────────────────
  { ext: 'tiff', mime: 'image/tiff',    family: 'image-partial',  label: 'TIFF', uploadAllowed: false, urlAllowed: false },
  { ext: 'tif',  mime: 'image/tiff',    family: 'image-partial',  label: 'TIF',  uploadAllowed: false, urlAllowed: false },
  { ext: 'bmp',  mime: 'image/bmp',     family: 'image-partial',  label: 'BMP',  uploadAllowed: false, urlAllowed: false },

  // ── Documents ─────────────────────────────────────────────────────────────
  { ext: 'pdf',  mime: 'application/pdf', family: 'document', label: 'PDF',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', family: 'document', label: 'DOCX', uploadAllowed: true, urlAllowed: true },
  { ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', family: 'document', label: 'PPTX', uploadAllowed: true, urlAllowed: true },

  // ── Tabular ───────────────────────────────────────────────────────────────
  { ext: 'csv',  mime: 'text/csv',      family: 'tabular',        label: 'CSV',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', family: 'tabular', label: 'XLSX', uploadAllowed: true, urlAllowed: true },

  // ── Media (Audio/Video via Transcription) ─────────────────────────────────
  { ext: 'mp3',  mime: ['audio/mpeg', 'audio/mp3'],    family: 'media',          label: 'MP3',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'wav',  mime: ['audio/wav', 'audio/x-wav'],     family: 'media',          label: 'WAV',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'm4a',  mime: ['audio/mp4', 'audio/x-m4a'],     family: 'media',          label: 'M4A',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'flac', mime: 'audio/flac',    family: 'media',          label: 'FLAC', uploadAllowed: true,  urlAllowed: true  },
  { ext: 'ogg',  mime: 'audio/ogg',     family: 'media',          label: 'OGG',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'aac',  mime: 'audio/aac',     family: 'media',          label: 'AAC',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'mp4',  mime: 'video/mp4',     family: 'media',          label: 'MP4',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'mov',  mime: 'video/quicktime', family: 'media',        label: 'MOV',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'webm', mime: 'video/webm',    family: 'media',          label: 'WEBM', uploadAllowed: true,  urlAllowed: true  },
  { ext: 'mkv',  mime: 'video/x-matroska', family: 'media',       label: 'MKV',  uploadAllowed: true,  urlAllowed: true  },
  { ext: 'avi',  mime: 'video/x-msvideo', family: 'media',        label: 'AVI',  uploadAllowed: true,  urlAllowed: true  },

  // ── Structured data ───────────────────────────────────────────────────────
  { ext: 'json', mime: 'application/json', family: 'structured',  label: 'JSON', uploadAllowed: true,  urlAllowed: true  },

  // ── Text/Markdown ─────────────────────────────────────────────────────────
  { ext: 'md',   mime: 'text/markdown', family: 'text-markdown',  label: 'MD',   uploadAllowed: true,  urlAllowed: true  },
  { ext: 'txt',  mime: 'text/plain',    family: 'text-markdown',  label: 'TXT',  uploadAllowed: true,  urlAllowed: true  },
];

const UPLOAD_ALLOWED = FORMAT_REGISTRY.filter(f => f.uploadAllowed);
const URL_ALLOWED    = FORMAT_REGISTRY.filter(f => f.urlAllowed);
const BROWSER_ACCEPT_STRING = [...new Set(UPLOAD_ALLOWED.map(f => `.${f.ext}`))].join(',');

function getFormatByExt(ext) {
  const normalized = ext.replace(/^\./, '').toLowerCase();
  return FORMAT_REGISTRY.find(f => f.ext === normalized) || null;
}

function getFamily(ext) {
  const entry = getFormatByExt(ext);
  return entry ? entry.family : null;
}

function isUploadAllowed(ext) {
  const normalized = ext.replace(/^\./, '').toLowerCase();
  return UPLOAD_ALLOWED.some(f => f.ext === normalized);
}

module.exports = {
  FORMAT_REGISTRY,
  UPLOAD_ALLOWED,
  URL_ALLOWED,
  BROWSER_ACCEPT_STRING,
  getFormatByExt,
  getFamily,
  isUploadAllowed,
};
