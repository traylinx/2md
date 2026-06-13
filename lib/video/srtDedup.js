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
  // Merge consecutive cues by their WORD overlap (lope review): rolling captions
  // share a run of words between the end of one cue and the start of the next.
  // Append only the non-overlapping tail. This fixes two failure modes that a
  // naive substring check has: partial overlap ("the quick brown" + "brown fox"
  // → "...brown brown fox") and wrongly dropping a short distinct line that
  // happens to be a substring of a longer previous cue.
  const pieces = [];
  let prev = '';
  for (const line of textLines) {
    if (!prev) { pieces.push(line); prev = line; continue; }
    if (line === prev) { prev = line; continue; } // exact repeat
    const pw = prev.split(' ');
    const lw = line.split(' ');
    const maxK = Math.min(pw.length, lw.length);
    let overlap = 0;
    for (let k = maxK; k > 0; k -= 1) {
      if (pw.slice(pw.length - k).join(' ').toLowerCase() === lw.slice(0, k).join(' ').toLowerCase()) {
        overlap = k;
        break;
      }
    }
    if (overlap === lw.length) { prev = line; continue; } // line fully inside the rolling window
    pieces.push(lw.slice(overlap).join(' '));
    prev = line;
  }
  return pieces.join(' ').replace(/\s+/g, ' ').trim();
}

module.exports = { srtToText };
