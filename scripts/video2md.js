#!/usr/bin/env node
/**
 * video2md worker — URL → transcript markdown via yt-dlp caption tracks.
 *
 * Spawned by routes/video2md.js (one child per request, bounded by the route's
 * concurrency semaphore). Emits `__JSON__{success, files}` exactly like
 * scripts/file2md.js so the bridge's existing parser reads it unchanged. Captions
 * only — actual audio transcription (no-captions fallback) is a separate, gated
 * path (V3). yt-dlp exits non-zero when a video has no subs: that is the
 * `needs-transcription` terminal state, NOT a process error.
 */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { srtToText } = require('../lib/video/srtDedup');

const url = process.env.VIDEO2MD_URL;
const preferredLang = (process.env.VIDEO2MD_LANG || 'en').toLowerCase();
const YTDLP = process.env.YTDLP_BIN || 'yt-dlp';
const META_TIMEOUT_MS = parseInt(process.env.VIDEO2MD_META_TIMEOUT_MS, 10) || 90000;
const DL_TIMEOUT_MS = parseInt(process.env.VIDEO2MD_DL_TIMEOUT_MS, 10) || 120000;

// SIGKILL bypasses `finally`, orphaning the temp dir. The route SIGTERMs first
// (grace) before SIGKILL; this handler makes that grace actually clean up.
let activeTmpDir = null;
function cleanupTmp() {
  if (activeTmpDir) {
    try { fs.rmSync(activeTmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
    activeTmpDir = null;
  }
}
process.on('SIGTERM', () => { cleanupTmp(); process.exit(143); });

function emit(obj) {
  // Leading newline so the marker can never collide with progress on the same line.
  console.log('\n__JSON__' + JSON.stringify(obj));
}

function runYtdlp(args, timeout) {
  return new Promise((resolve) => {
    execFile(YTDLP, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

/**
 * Choose the best caption track. Prefer the REQUESTED language across BOTH human
 * and auto captions before falling back to another language (lope review: don't
 * return manual-English when the user asked for Spanish and auto-Spanish exists).
 * At the same language, human captions beat auto.
 */
function pickLang(subtitles, autoCaptions, preferred) {
  const subs = subtitles && typeof subtitles === 'object' ? subtitles : {};
  const autos = autoCaptions && typeof autoCaptions === 'object' ? autoCaptions : {};
  const match = (obj, l) => Object.keys(obj).find((k) => {
    const lk = k.toLowerCase();
    return lk === l || lk.startsWith(l + '-');
  });
  for (const l of [preferred, 'en']) {
    let lang = match(subs, l);
    if (lang) return { lang, auto: false };
    lang = match(autos, l);
    if (lang) return { lang, auto: true };
  }
  if (Object.keys(subs).length) return { lang: Object.keys(subs)[0], auto: false };
  if (Object.keys(autos).length) return { lang: Object.keys(autos)[0], auto: true };
  return null;
}

async function run() {
  let tmpDir = null;
  try {
    if (!url) {
      emit({ success: false, error: 'missing-url' });
      process.exitCode = 1;
      return;
    }

    // Phase 1: one extraction → title, duration, available caption languages.
    const meta = await runYtdlp(['-J', '--skip-download', '--no-playlist', '--no-warnings', url], META_TIMEOUT_MS);
    if (meta.err && !meta.stdout) {
      const blocked = /sign in|confirm.*not a bot|HTTP Error 403|HTTP Error 429|unavailable|private|members-only/i.test(meta.stderr);
      emit({ success: false, error: blocked ? 'blocked-or-unavailable' : 'fetch-failed' });
      process.exitCode = 1;
      return;
    }
    let info;
    try {
      info = JSON.parse(meta.stdout);
    } catch {
      emit({ success: false, error: 'metadata-parse-failed' });
      process.exitCode = 1;
      return;
    }
    const title = info.title || 'video';
    const durationSec = Number.isFinite(Number(info.duration)) ? Number(info.duration) : null;

    const chosen = pickLang(info.subtitles, info.automatic_captions, preferredLang);
    if (!chosen) {
      // No captions in any language — valid terminal state, exit 0 (not an error).
      emit({ success: false, error: 'no-captions', needsTranscription: true, title, durationSec });
      return;
    }

    // Phase 2: download just the chosen track, convert to SRT (ffmpeg via yt-dlp).
    // Phase 1 already confirmed captions EXIST, so any failure here is a tool /
    // transport failure (timeout, ffmpeg, blocking) — NOT "no captions". It must
    // NOT be misrouted to the metered transcription fallback (lope review HIGH).
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2md-'));
    activeTmpDir = tmpDir;
    const base = path.join(tmpDir, 'sub');
    const dl = await runYtdlp([
      '--skip-download', '--no-playlist', '--no-warnings',
      chosen.auto ? '--write-auto-subs' : '--write-subs',
      '--sub-langs', chosen.lang,
      '--convert-subs', 'srt',
      '-o', base, url,
    ], DL_TIMEOUT_MS);

    // Accept .srt OR .vtt — srtToText parses both, and if ffmpeg is absent yt-dlp
    // still leaves the raw .vtt (don't discard it).
    const produced = fs.existsSync(tmpDir)
      ? fs.readdirSync(tmpDir).filter((f) => f.endsWith('.srt') || f.endsWith('.vtt'))
      : [];
    if (!produced.length) {
      emit({ success: false, error: dl.err ? 'caption-download-failed' : 'caption-empty', title, durationSec });
      process.exitCode = 1;
      return;
    }
    produced.sort((a) => (a.endsWith('.srt') ? -1 : 1)); // prefer .srt when both exist
    const text = srtToText(fs.readFileSync(path.join(tmpDir, produced[0]), 'utf8'));
    if (!text) {
      emit({ success: false, error: 'caption-empty', title, durationSec });
      process.exitCode = 1;
      return;
    }

    emit({
      success: true,
      files: {
        'full_document.md': text,
        'metadata.json': JSON.stringify({
          source_url: url,
          title,
          lang: chosen.lang,
          captions: true,
          auto_captions: chosen.auto,
          duration_sec: durationSec,
          char_count: text.length,
        }, null, 2),
      },
    });
  } catch (e) {
    emit({ success: false, error: (e && e.message) || 'video2md-failed' });
    process.exitCode = 1;
  } finally {
    cleanupTmp();
  }
}

run();
