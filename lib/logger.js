const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'html2md.log');

class Logger {
  static init() {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  }

  static _formatTime() {
    const now = new Date();
    return now.toISOString(); // e.g. 2023-10-01T12:00:00.000Z
  }

  static info(message, meta = null) {
    this.init();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    const line = `[${this._formatTime()}] INFO: ${message}${metaStr}\n`;
    fs.appendFileSync(LOG_FILE, line);
  }

  static error(message, meta = null) {
    this.init();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    const line = `[${this._formatTime()}] ERROR: ${message}${metaStr}\n`;
    fs.appendFileSync(LOG_FILE, line);
  }

  static warn(message, meta = null) {
    this.init();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    const line = `[${this._formatTime()}] WARN: ${message}${metaStr}\n`;
    fs.appendFileSync(LOG_FILE, line);
  }

  static appendRaw(jobId, scriptName, rawOutput) {
    this.init();
    if (!rawOutput) return;
    const header = `\n--- [${this._formatTime()}] JOB: ${jobId || 'Global'} | SCRIPT: ${scriptName} ---\n`;
    fs.appendFileSync(LOG_FILE, header + rawOutput + '\n---------------------------------------------------\n');
  }
}

module.exports = Logger;
