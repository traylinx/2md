/**
 * Convert an SRT/VTT subtitle file to clean, de-duplicated plain text.
 *
 * YouTube auto-generated captions overlap heavily: consecutive cues repeat the
 * tail of the previous cue (rolling captions), so a line is often equal to, or a
 * substring of, its predecessor, or the predecessor grows into it. This collapses
 * that noise into readable prose. Pure + synchronous → unit-tested with real
 * fixtures (no network). NOTE: adjacent-window dedup handles the common rolling
 * pattern; pathological non-adjacent overlap is out of scope for V0b (documented
 * quality bar in docs/video2md-sprint.md).
 */

// SRT: 00:00:01,000 --> 00:00:04,000   VTT: 00:00:01.000 --> 00:00:04.000 align:...
const TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/;
const INDEX_RE = /^\d+$/;
// VTT inline timing/style tags: <00:00:01.000>, <c>, </c>
const VTT_TAG_RE = /<\/?[^>]+>/g;

function normalize(line) {
  return line.replace(VTT_TAG_RE, '').replace(/\s+/g, ' ').trim();
}

/** @param {string} content raw .srt or .vtt text @returns {string} clean prose */
function srtToText(content) {
  if (!content || typeof content !== 'string') return '';
  const textLines = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('WEBVTT')) continue;
    if (line.startsWith('NOTE') || line.startsWith('Kind:') || line.startsWith('Language:')) continue;
    if (INDEX_RE.test(line)) continue;
    if (TIMESTAMP_RE.test(line) || line.includes('-->')) continue;
    const clean = normalize(line);
    if (clean) textLines.push(clean);
  }
  // Drop a line if it equals or is contained in the previous kept line; if the
  // previous line is contained in this one (rolling growth), replace it.
  const deduped = [];
  for (const line of textLines) {
    const prev = deduped.length ? deduped[deduped.length - 1] : null;
    if (prev) {
      if (line === prev || prev.includes(line)) continue;
      if (line.includes(prev)) {
        deduped[deduped.length - 1] = line;
        continue;
      }
    }
    deduped.push(line);
  }
  return deduped.join(' ').replace(/\s+/g, ' ').trim();
}

module.exports = { srtToText };
