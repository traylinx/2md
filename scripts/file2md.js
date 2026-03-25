#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getFamily } = require('../lib/formatCapabilities');

const filePath = process.env.FILE2MD_FILE_PATH;
const fileUrl = process.env.FILE2MD_FILE_URL;
const originalName = process.env.FILE2MD_ORIGINAL_NAME;
const baseUrl = process.env.AGENTIC_UPLOAD_ENGINES_URL || 'https://api.makakoo.com/agentic-upload-engines/v1/api';
const apiKey = process.env.FILE2MD_API_KEY;
const enhance = process.env.FILE2MD_ENHANCE !== 'false';
const enhanceModel = process.env.FILE2MD_ENHANCE_MODEL;

if ((!filePath && !fileUrl) || !apiKey) {
  console.error('[file2md] Error: Missing required environment variables.');
  process.exit(1);
}

const delay = ms => new Promise(res => setTimeout(res, ms));

function maskUrl(url) {
  if (!url || typeof url !== 'string') return url;
  // Replace the base API URL with just the path, or a generic placeholder if it's the root API string
  return url.replace('https://api.makakoo.com', '');
}

function logRequest(method, url, extras) {
  const parts = [`[file2md] → ${method} ${maskUrl(url)}`];
  if (extras) parts.push(`  ${extras}`);
  console.log(parts.join('\n'));
}

function logResponse(status, body, label) {
  const preview = typeof body === 'string'
    ? body.substring(0, 300)
    : JSON.stringify(body).substring(0, 300);
  console.log(`[file2md] ← ${status} ${label || ''}\n  ${preview}${preview.length >= 300 ? '…' : ''}`);
}

async function apiFetch(method, url, options = {}) {
  const { body, headers = {}, label = '' } = options;

  const finalHeaders = { ...headers, 'Authorization': `Bearer ${apiKey}` };

  const bodyPreview = body instanceof FormData
    ? '[FormData]'
    : (typeof body === 'string' ? body.substring(0, 200) : '');
  logRequest(method, url, bodyPreview || undefined);

  const res = await fetch(url, { method, body, headers: finalHeaders });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch(e) {}

  logResponse(res.status, json || text, label);

  if (!res.ok && res.status !== 202) {
    throw new Error(`${label || 'Request'} failed: ${res.status} - ${text.substring(0, 500)}`);
  }
  return { status: res.status, json, text };
}

async function run() {
  let attachmentId = null;
  try {
    // -------------------------------------------------------------------------
    // Phase 1: Upload via Agentic Upload Engines
    // -------------------------------------------------------------------------
    console.log('[file2md] ═══════════════════════════════════════════');
    console.log('[file2md] Phase 1: Upload');
    const form = new FormData();
    if (fileUrl) {
      form.append('url', fileUrl);
    } else {
      const fileBuffer = fs.readFileSync(filePath);
      const blob = new Blob([fileBuffer]);
      form.append('uploaded_file', blob, originalName);
    }

    const uploadUrl = `${baseUrl}/upload`;
    logRequest('POST', uploadUrl, `file=${originalName || fileUrl}`);

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      body: form,
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const uploadText = await uploadRes.text();
    let uploadData;
    try { uploadData = JSON.parse(uploadText); } catch(e) {}
    logResponse(uploadRes.status, uploadData || uploadText, 'Upload');

    if (!uploadRes.ok) {
      throw new Error(`Upload failed: ${uploadRes.status} - ${uploadText.substring(0, 500)}`);
    }

    if (!uploadData || !uploadData.files || uploadData.files.length === 0) {
      throw new Error('Upload succeeded but no file data returned.');
    }

    const attachment = uploadData.files[0];
    attachmentId = attachment.id;
    const config = attachment.config || {};
    const pageCount = config.pages || 1;
    const finalOriginalName = config.original_filename || originalName || 'document';

    console.log(`[file2md] ✓ Upload OK — ID: ${attachmentId}, Pages: ${pageCount}, Type: ${config.file_type || '?'}`);

    // -------------------------------------------------------------------------
    // Phase 2: Trigger OCR
    // -------------------------------------------------------------------------
    console.log('[file2md] ═══════════════════════════════════════════');
    console.log(`[file2md] Phase 2: Trigger OCR (${pageCount} pages)`);

    const ocrBody = JSON.stringify({ ocr_provider: 'auto', include_image_base64: false });
    const { json: ocrData } = await apiFetch('POST', `${baseUrl}/attachments/${attachmentId}/ocr`, {
      body: ocrBody,
      headers: { 'Content-Type': 'application/json' },
      label: 'OCR trigger'
    });

    // -------------------------------------------------------------------------
    // Phase 3: Poll for Completion
    // -------------------------------------------------------------------------
    console.log('[file2md] ═══════════════════════════════════════════');
    console.log('[file2md] Phase 3: Polling OCR status...');
    let isCompleted = false;
    let failed = false;
    const maxPolls = 400; // Increased from 100 to 400 (~20 minutes for long videos)
    let pollCount = 0;
    let errorMsg = 'OCR processing failed on the File Engine.';

    while (!isCompleted && !failed && pollCount < maxPolls) {
      await delay(3000);
      pollCount++;

      try {
        const { json: statusData } = await apiFetch('GET', `${baseUrl}/attachments/${attachmentId}/ocr/status`, {
          label: `Poll #${pollCount}`
        });

        const status = statusData.status;
        const pagesProcessed = statusData.pages_processed || 0;
        const pagesTotal = statusData.pages_total || pageCount;
        const progress = statusData.progress || 0;

        console.log(`[file2md] OCR Progress: ${pagesProcessed}/${pagesTotal} pages (${progress}%)`);

        if (status === 'completed' || status === 'partial_success') {
          isCompleted = true;
        } else if (status === 'failed') {
          failed = true;
          if (statusData.status_message) {
            errorMsg = statusData.status_message;
          }
        }
      } catch (pollErr) {
        console.log(`[file2md] Warning: Poll error — ${pollErr.message}`);
      }
    }

    if (failed) throw new Error(errorMsg);
    if (!isCompleted) throw new Error('OCR polling timed out after 5 minutes.');

    // -------------------------------------------------------------------------
    // Phase 4: Fetch Extracted Content
    // -------------------------------------------------------------------------
    console.log('[file2md] ═══════════════════════════════════════════');
    console.log('[file2md] Phase 4: Fetching extracted content...');

    const { json: detailData } = await apiFetch('GET', `${baseUrl}/attachments/${attachmentId}`, {
      label: 'Attachment detail'
    });

    const pages = detailData.pages || [];
    console.log(`[file2md] Got ${pages.length} page entries. Sorting by page index...`);

    // Sort pages by page index to ensure correct order
    pages.sort((a, b) => (a.page || 0) - (b.page || 0));
    console.log(`[file2md] Page order: ${pages.map(p => `p${p.page}→h${p.human_readable_page}`).join(', ')}`);

    const vfs = {};
    let fullDocumentMD = '';

    for (const p of pages) {
      let markdown = p.markdown;
      if (!markdown && p.presigned_url) {
        console.log(`[file2md] Fetching OCR content for page ${p.human_readable_page || p.page} from S3...`);
        logRequest('GET', maskUrl(p.presigned_url).substring(0, 120) + '...');

        const pRes = await fetch(p.presigned_url);
        logResponse(pRes.status, `(${pRes.headers.get('content-length') || '?'} bytes)`, `Page ${p.page} OCR`);

        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData.pages && pData.pages.length > 0) {
            markdown = pData.pages.map(x => x.markdown).join('\n---\n');
          } else if (pData.markdown) {
            markdown = pData.markdown;
          } else if (pData.text) {
             markdown = pData.text;
          }
          console.log(`[file2md] Page ${p.human_readable_page || p.page}: ${(markdown || '').length} chars extracted`);
        } else {
          console.error(`[file2md] ✗ Failed to fetch OCR for page ${p.page}: ${pRes.status}`);
        }
      }

      markdown = markdown || '';
      const pageIndex = p.page !== undefined ? p.page : 0;
      const humanPage = p.human_readable_page || (pageIndex + 1);

      const pageName = `pages/page_${humanPage}.md`;
      vfs[pageName] = markdown;

      fullDocumentMD += `\n<!-- Page ${humanPage} -->\n${markdown}\n`;
    }

    console.log(`[file2md] Full document assembled: ${fullDocumentMD.length} chars, ${pages.length} pages`);

    // Save raw content before potential enhancement
    const rawDocumentMD = fullDocumentMD;

    // -------------------------------------------------------------------------
    // Phase 4.5: AI Enhancement (optional)
    // -------------------------------------------------------------------------
    let enhanceData = null;
    if (enhance && fullDocumentMD.trim()) {
      console.log('[file2md] ═══════════════════════════════════════════');
      console.log('[file2md] Phase 4.5: AI Enhancement');
      
      const enhanceBody = {};
      if (enhanceModel) {
        enhanceBody.model = enhanceModel;
        console.log(`[file2md] Using custom enhancement model: ${enhanceModel}`);
      }

      try {
        const response = await apiFetch(
          'POST', `${baseUrl}/attachments/${attachmentId}/enhance`,
          { body: JSON.stringify(enhanceBody), headers: { 'Content-Type': 'application/json' }, label: 'AI Enhance' }
        );
        enhanceData = response.json;

        if (enhanceData && enhanceData.enhanced_content) {
          console.log(`[file2md] ✓ AI enhancement OK — model: ${enhanceData.model_used || 'unknown'}, pages: ${enhanceData.pages_enhanced || '?'}, output: ${enhanceData.enhanced_content.length} chars`);
          fullDocumentMD = enhanceData.enhanced_content;
          vfs['full_document_raw.md'] = rawDocumentMD.trim();
        } else {
          console.log(`[file2md] AI enhancement returned no content, using raw OCR.`);
        }
      } catch (enhErr) {
        console.log(`[file2md] ✗ AI enhancement failed: ${enhErr.message}. Using raw OCR output.`);
      }
    }

    vfs['full_document.md'] = fullDocumentMD.trim();
    vfs['metadata.json'] = JSON.stringify({
      original_filename: finalOriginalName,
      file_type: config.file_type || 'unknown',
      total_pages: pageCount,
      attachment_id: attachmentId,
      enhanced: enhance,
      llm_metrics: (enhance && enhanceData !== null) ? {
        model: enhanceData.model_used,
        tokens_in: enhanceData.tokens_in || 0,
        tokens_out: enhanceData.tokens_out || 0,
        cost_usd: enhanceData.cost_usd || 0
      } : null
    }, null, 2);

    // -------------------------------------------------------------------------
    // Phase 5: Emit VFS
    // -------------------------------------------------------------------------
    console.log('[file2md] ═══════════════════════════════════════════');
    console.log(`[file2md] Phase 5: Emitting VFS — ${Object.keys(vfs).length} files`);
    console.log('\n__JSON__' + JSON.stringify({ success: true, files: vfs }));

  } catch (err) {
    console.error(`[file2md] ✗ Fatal Error: ${err.message}`);
    if (err.stack) console.error(err.stack);
    console.log('\n__JSON__' + JSON.stringify({ success: false, error: err.message }));
    process.exit(1);
  } finally {
    // -------------------------------------------------------------------------
    // Phase 6: Cleanup remote attachment
    // -------------------------------------------------------------------------
    if (attachmentId) {
      try {
        await apiFetch('DELETE', `${baseUrl}/attachments/${attachmentId}`, { label: 'Cleanup' });
        console.log(`[file2md] ✓ Cleanup done.`);
      } catch (e) {
        console.error(`[file2md] Error during cleanup: ${e.message}`);
      }
    }
  }
}

run();
