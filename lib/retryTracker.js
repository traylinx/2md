function createRetryTracker(options = {}) {
  const maxAttempts = options.maxAttempts || 6;

  const state = {
    attempts: 0,
    history: [],
  };

  return {
    canRetry() {
      return state.attempts < maxAttempts;
    },

    record(category, reason) {
      state.attempts++;
      state.history.push({
        attempt: state.attempts,
        category: category || 'general',
        reason: reason || '',
        timestamp: Date.now(),
      });
      return state.attempts < maxAttempts;
    },

    getAttempts() {
      return state.attempts;
    },

    getHistory() {
      return [...state.history];
    },

    isExhausted() {
      return state.attempts >= maxAttempts;
    },
  };
}

module.exports = { createRetryTracker };
