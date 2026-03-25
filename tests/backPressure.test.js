import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { backPressureMiddleware, DEFAULT_THRESHOLD, DEFAULT_RETRY_AFTER } from '../lib/http/backPressure';

/**
 * backPressure.js lazy-requires memoryGC at runtime, which in turn reads
 * process.memoryUsage(). We mock at the process level for reliable interception.
 */
describe('backPressureMiddleware', () => {
  let mockReq;
  let mockRes;
  let nextFn;

  beforeEach(() => {
    mockReq = { originalUrl: '/api/convert' };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };
    nextFn = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export sensible defaults', () => {
    expect(DEFAULT_THRESHOLD).toBe(0.85);
    expect(DEFAULT_RETRY_AFTER).toBe(30);
  });

  it('should call next() when memory usage is low', () => {
    // RSS 200MB out of 768MB ceiling = 26% — well below 85%
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 200 * 1024 * 1024,
      heapUsed: 100 * 1024 * 1024,
      heapTotal: 500 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      arrayBuffers: 0,
    });

    const middleware = backPressureMiddleware();
    middleware(mockReq, mockRes, nextFn);

    expect(nextFn).toHaveBeenCalledOnce();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should return 503 when RSS exceeds threshold', () => {
    // RSS 700MB out of 768MB ceiling = 91% — exceeds 85%
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 700 * 1024 * 1024,
      heapUsed: 450 * 1024 * 1024,
      heapTotal: 500 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      arrayBuffers: 0,
    });

    const middleware = backPressureMiddleware();
    middleware(mockReq, mockRes, nextFn);

    expect(nextFn).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.set).toHaveBeenCalledWith('Retry-After', '30');
  });

  it('should accept a custom threshold', () => {
    // RSS 400MB / 768MB = 52% — below 70% custom threshold
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 400 * 1024 * 1024,
      heapUsed: 300 * 1024 * 1024,
      heapTotal: 500 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      arrayBuffers: 0,
    });

    const middleware = backPressureMiddleware(0.70);
    middleware(mockReq, mockRes, nextFn);
    expect(nextFn).toHaveBeenCalledOnce();
  });

  it('should bypass memory check for exempt paths like /download/', () => {
    // RSS 760MB / 768MB = 99% — should still bypass for exempt paths
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 760 * 1024 * 1024,
      heapUsed: 490 * 1024 * 1024,
      heapTotal: 500 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      arrayBuffers: 0,
    });

    const middleware = backPressureMiddleware();
    mockReq.originalUrl = '/api/download/job/j_1234';
    middleware(mockReq, mockRes, nextFn);

    expect(nextFn).toHaveBeenCalledOnce();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});
