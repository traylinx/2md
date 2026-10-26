'use strict';
const { performance } = require('node:perf_hooks');
const { CaptureError } = require('./errors');

class Deadline {
  constructor(budgetMs, parentSignal) {
    this.started = performance.now();
    this.end = this.started + budgetMs;
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.parentSignal = parentSignal;
    this.onParentAbort = () => this.abort('CANCELLED');
    this.timer = setTimeout(() => this.abort('DEADLINE'), budgetMs);
    this.timer.unref?.();
    parentSignal?.addEventListener('abort', this.onParentAbort, { once: true });
    if (parentSignal?.aborted) this.onParentAbort();
  }

  abort(code = 'CANCELLED') { this.controller.abort(new CaptureError(code)); }

  tighten(budgetMs) {
    this.end = Math.min(this.end, this.started + budgetMs);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.abort('DEADLINE'), this.remaining());
    this.timer.unref?.();
  }

  remaining(reserveMs = 0) {
    this.signal.throwIfAborted();
    const remaining = Math.floor(this.end - performance.now() - reserveMs);
    if (remaining <= 0) throw new CaptureError('DEADLINE');
    return remaining;
  }

  async run(operation) {
    this.remaining();
    let aborted;
    const cancellation = new Promise((_, reject) => {
      aborted = () => reject(this.signal.reason);
      this.signal.addEventListener('abort', aborted, { once: true });
    });
    try {
      const result = await Promise.race([Promise.resolve().then(operation), cancellation]);
      this.remaining();
      return result;
    } finally { this.signal.removeEventListener('abort', aborted); }
  }

  sleep(ms) {
    let timer;
    return this.run(() => new Promise(resolve => {
      timer = setTimeout(resolve, Math.min(ms, this.remaining()));
    })).finally(() => clearTimeout(timer));
  }

  close() {
    clearTimeout(this.timer);
    this.parentSignal?.removeEventListener('abort', this.onParentAbort);
  }
}

module.exports = { Deadline };
