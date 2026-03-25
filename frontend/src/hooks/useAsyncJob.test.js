import { renderHook, act, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAsyncJob } from './useAsyncJob';

const globalFetch = vi.fn();
global.fetch = globalFetch;

describe('useAsyncJob', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    globalFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useAsyncJob());
    expect(result.current.jobId).toBeNull();
    expect(result.current.status).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.polling).toBe(false);
  });

  it('starts polling and updates status to running', async () => {
    globalFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'running' })
    });

    const { result } = renderHook(() => useAsyncJob());

    act(() => {
      result.current.startPolling('job_123');
    });

    expect(result.current.jobId).toBe('job_123');
    expect(result.current.polling).toBe(true);
    expect(globalFetch).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(result.current.status).toBe('running');
    });
  });

  it('stops polling and fetches result when status becomes done', async () => {
    // Return done on the first fetch
    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'done' })
    });
    // Return result on the second fetch
    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ url: 'test.com', success: true }] })
    });

    const { result } = renderHook(() => useAsyncJob());

    act(() => {
      result.current.startPolling('job_456');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('done');
      expect(result.current.polling).toBe(false);
      expect(result.current.result).toEqual({ results: [{ url: 'test.com', success: true }] });
    });
  });

  it('stops polling and sets error when status becomes failed', async () => {
    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'failed', error: 'Internal server error' })
    });

    const { result } = renderHook(() => useAsyncJob());

    act(() => {
      result.current.startPolling('job_789');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
      expect(result.current.polling).toBe(false);
      expect(result.current.error).toBe('Internal server error');
    });
  });

  it('resets state correctly', () => {
    const { result } = renderHook(() => useAsyncJob());

    act(() => {
      result.current.startPolling('job_abc');
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.jobId).toBeNull();
    expect(result.current.status).toBeNull();
    expect(result.current.polling).toBe(false);
  });
});

