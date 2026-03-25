import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Setup environment variables before imports
const mockHome = '/mock/home';
const mockTmp = '/mock/tmp';

// We must reset modules to test config initialization properly
beforeEach(() => {
  vi.resetModules();
  vi.spyOn(os, 'homedir').mockReturnValue(mockHome);
  vi.spyOn(os, 'tmpdir').mockReturnValue(mockTmp);
  vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.APP_DIR;
  delete process.env.JOBS_DIR;
  delete process.env.UPLOADS_DIR;
});

describe('Config Module', () => {
  it('should use default os paths if environment variables are not set', async () => {
    const config = await import('../lib/config');
    
    expect(config.APP_DIR).toBe(path.join(mockHome, '.2md'));
    expect(config.JOBS_DIR).toBe(path.join(mockHome, '.2md', 'jobs'));
    expect(config.REGISTRY_DIR).toBe(path.join(mockHome, '.2md', 'jobs', '_registry'));
    expect(config.UPLOADS_DIR).toBe(path.join(mockTmp, 'html2md_uploads'));
    
    // Ensure directories are created
    expect(fs.mkdirSync).toHaveBeenCalledWith(config.APP_DIR, { recursive: true });
  });

  it('should respect APP_DIR override', async () => {
    process.env.APP_DIR = '/custom/app/dir';
    const config = await import('../lib/config');
    
    expect(config.APP_DIR).toBe('/custom/app/dir');
    expect(config.JOBS_DIR).toBe(path.join('/custom/app/dir', 'jobs'));
    expect(config.REGISTRY_DIR).toBe(path.join('/custom/app/dir', 'jobs', '_registry'));
  });

  it('should respect JOBS_DIR override independently', async () => {
    process.env.JOBS_DIR = '/data/jobs';
    const config = await import('../lib/config');
    
    expect(config.JOBS_DIR).toBe('/data/jobs');
    expect(config.REGISTRY_DIR).toBe(path.join('/data/jobs', '_registry'));
  });

  it('should respect UPLOADS_DIR override', async () => {
    process.env.UPLOADS_DIR = '/tmp/custom_uploads';
    const config = await import('../lib/config');
    
    expect(config.UPLOADS_DIR).toBe('/tmp/custom_uploads');
  });
});
