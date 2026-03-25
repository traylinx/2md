import { describe, it, expect } from 'vitest';
import { createRetryTracker } from '../lib/retryTracker';

describe('retryTracker', () => {
  it('should allow retries up to maxAttempts', () => {
    const tracker = createRetryTracker({ maxAttempts: 3 });
    expect(tracker.canRetry()).toBe(true);
    expect(tracker.getAttempts()).toBe(0);

    tracker.record('fetch', 'timeout');
    expect(tracker.canRetry()).toBe(true);
    expect(tracker.getAttempts()).toBe(1);

    tracker.record('fetch', '503');
    expect(tracker.canRetry()).toBe(true);

    tracker.record('browser', 'crash');
    expect(tracker.canRetry()).toBe(false);
    expect(tracker.isExhausted()).toBe(true);
  });

  it('should default to 6 max attempts', () => {
    const tracker = createRetryTracker();
    for (let i = 0; i < 6; i++) {
      expect(tracker.canRetry()).toBe(true);
      tracker.record('general');
    }
    expect(tracker.canRetry()).toBe(false);
  });

  it('should track history with categories and reasons', () => {
    const tracker = createRetryTracker({ maxAttempts: 5 });
    tracker.record('fetch', 'timeout');
    tracker.record('browser', 'OOM');

    const history = tracker.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].category).toBe('fetch');
    expect(history[0].reason).toBe('timeout');
    expect(history[1].category).toBe('browser');
    expect(history[1].attempt).toBe(2);
  });

  it('record() should return whether more retries are available', () => {
    const tracker = createRetryTracker({ maxAttempts: 2 });
    expect(tracker.record('a', 'first')).toBe(true); // 1/2 → still can retry
    expect(tracker.record('b', 'second')).toBe(false); // 2/2 → exhausted
  });
});
