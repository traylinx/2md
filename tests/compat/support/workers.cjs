const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const state = { mode: 'success', calls: [], killed: [] };
const markdown = '# Browser fixture\n\nCaptured content.';
const result = { success: true, markdown: '# Document fixture', tokens: { html: 0, md: 5 } };
const videoResult = { success: true, files: { 'full_document.md': '# Video fixture' } };

function spawn(command, args, options) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.pid = 900000 + state.calls.length; child.exitCode = null;
  child.kill = signal => { state.killed.push({ pid: child.pid, signal }); return true; };
  state.calls.push({ command, args, options, child });
  setImmediate(() => {
    if (state.mode === 'hold') return child.stdout.emit('data', Buffer.from('Working...\n'));
    if (state.mode === 'error') return child.emit('error', new Error('Synthetic worker error'));
    if (state.mode !== 'missing-output') produce(args, child);
    child.exitCode = state.mode === 'failure' ? 1 : 0;
    child.emit('close', child.exitCode);
  });
  return child;
}

function produce(args, child) {
  if (args.includes('-o')) {
    const out = args[args.indexOf('-o') + 1];
    fs.mkdirSync(path.join(out, 'output'), { recursive: true });
    fs.writeFileSync(path.join(out, 'output/page.md'), markdown);
    fs.writeFileSync(path.join(out, 'job.json'), JSON.stringify({ tokens: { html: 42, md: 10 }, metadata: { title: 'Browser fixture' }, quality: { wordCount: 5 } }));
    if (args.includes('--screenshot')) {
      fs.mkdirSync(path.join(out, 'input'), { recursive: true });
      fs.writeFileSync(path.join(out, 'input/screenshot.png'), 'synthetic-image');
    }
    child.stdout.emit('data', Buffer.from('Synthetic browser worker\n'));
  } else if (args[0].endsWith('file2md.js') || args[0].endsWith('video2md.js')) {
    let body = args[0].endsWith('video2md.js') ? videoResult : result;
    if (state.mode === 'failure') body = { success: false, error: 'Synthetic conversion failed' };
    if (state.mode === 'no-captions') body = { success: false, needsTranscription: true, error: 'Synthetic no captions' };
    child.stdout.emit('data', Buffer.from(`Worker log\n__JSON__${JSON.stringify(body)}\n`));
  } else if (args.includes('--crawl')) {
    child.stdout.emit('data', Buffer.from('Fixture tree\n{"urls":["https://owned.invalid/page"]}\n'));
  } else {
    child.stdout.emit('data', Buffer.from('Synthetic agent worker\n'));
  }
}

function kill(pid, signal) { state.killed.push({ pid, signal }); }
function reset() { state.mode = 'success'; state.calls.length = 0; state.killed.length = 0; }
module.exports = { spawn, kill, state, reset, markdown, result, videoResult };
