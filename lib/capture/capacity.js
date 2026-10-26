'use strict';
const { CaptureError } = require('./errors');

class Capacity {
  constructor({ active = 2, queued = 4 } = {}) {
    this.limit = active; this.queueLimit = queued;
    this.active = new Set(); this.waiting = []; this.stopped = false;
  }

  async acquire(principal, deadline, privateMode = false) {
    deadline.remaining();
    if (this.stopped) throw new CaptureError('UNAVAILABLE');
    if (this.active.has(principal) || this.waiting.some(item => item.principal === principal)) throw new CaptureError('CAPACITY');
    if (this.active.size < this.limit) return this.admit(principal);
    // No credentials in this queue. Private requests are rejected, never queued.
    if (privateMode || this.waiting.length >= this.queueLimit) throw new CaptureError('CAPACITY');
    return new Promise((resolve, reject) => {
      const item = { principal, resolve, reject, deadline, abort: null };
      item.abort = () => { this.waiting = this.waiting.filter(other => other !== item); reject(deadline.signal.reason); };
      deadline.signal.addEventListener('abort', item.abort, { once: true });
      this.waiting.push(item);
    });
  }

  admit(principal) {
    this.active.add(principal);
    let released = false;
    return () => {
      if (released) return;
      released = true; this.active.delete(principal); this.drain();
    };
  }

  drain() {
    while (!this.stopped && this.active.size < this.limit && this.waiting.length) {
      const item = this.waiting.shift();
      item.deadline.signal.removeEventListener('abort', item.abort);
      try { item.deadline.remaining(); item.resolve(this.admit(item.principal)); }
      catch (error) { item.reject(error); }
    }
  }

  stop() {
    this.stopped = true;
    for (const item of this.waiting.splice(0)) {
      item.deadline.signal.removeEventListener('abort', item.abort);
      item.reject(new CaptureError('UNAVAILABLE'));
    }
  }
}

module.exports = { Capacity };
