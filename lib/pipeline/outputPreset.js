const { chunkMarkdown } = require('./chunkMarkdown');

const VALID_PRESETS = ['full', 'compact', 'chunks'];

function validatePreset(preset) {
  if (!preset) return 'full';
  const normalized = preset.toLowerCase().trim();
  if (!VALID_PRESETS.includes(normalized)) return null;
  return normalized;
}

function stripImages(md) {
  return md.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
}

function stripDecorative(md) {
  let result = md;
  // Remove horizontal rules
  result = result.replace(/^(-{3,}|_{3,}|\*{3,})$/gm, '');
  // Remove badge images (common in READMEs)
  result = result.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '');
  // Remove standalone images
  result = stripImages(result);
  // Collapse multiple blank lines into at most two
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

function applyPreset(markdown, preset) {
  const validated = validatePreset(preset);

  if (validated === null) {
    return { ok: false, error: `Invalid preset "${preset}". Valid: ${VALID_PRESETS.join(', ')}` };
  }

  if (validated === 'full') {
    return { ok: true, markdown, preset: 'full' };
  }

  if (validated === 'compact') {
    const compacted = stripDecorative(markdown);
    return { ok: true, markdown: compacted, preset: 'compact' };
  }

  if (validated === 'chunks') {
    const chunks = chunkMarkdown(markdown);
    return { ok: true, chunks, preset: 'chunks' };
  }

  return { ok: true, markdown, preset: 'full' };
}

module.exports = { applyPreset, validatePreset, VALID_PRESETS };
