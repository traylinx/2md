import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter, once } from 'events';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import express from 'express';
import request from 'supertest';

const require = createRequire(import.meta.url);
const { runAsyncJob } = require('../lib/jobs/asyncJobRunner');
const jobRegistry = require('../lib/jobRegistry');
const { REGISTRY_DIR } = require('../lib/config');
const registerAgentifyRoutes = require('../routes/agentify');
const { synthesizeAgentManifests, buildValidationReport } = require('../scripts/agentify');

const createdJobIds = [];

afterEach(() => {
  for (const jobId of createdJobIds.splice(0)) {
    try { fs.unlinkSync(path.join(REGISTRY_DIR, `${jobId}.json`)); } catch (_) {}
  }
});

describe('Agentify async runtime', () => {
  it('forwards the supplied environment to the child process', async () => {
    let output = '';
    const { child } = runAsyncJob({
      jobId: 'j_env_forwarding_test',
      spawnArgs: ['-e', 'process.stdout.write(process.env.AGENTIFY_TARGET_URL || "missing")'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGENTIFY_TARGET_URL: 'https://agentify.example.test',
      },
      onStdout: (text) => { output += text; },
    });

    await once(child, 'close');
    expect(output).toBe('https://agentify.example.test');
  });

  it('marks a non-zero child exit as failed', async () => {
    const job = jobRegistry.createJob('agentify', 'https://example.test', 'test');
    createdJobIds.push(job.id);

    const { child } = runAsyncJob({
      jobId: job.id,
      spawnArgs: ['-e', 'process.exit(1)'],
      cwd: process.cwd(),
      env: process.env,
      buildResult: () => ({ success: false, error: 'expected test failure' }),
    });

    await once(child, 'close');
    expect(jobRegistry.getJob(job.id).status).toBe('failed');
  });
});

describe('Agentify route process handling', () => {
  it('passes AGENTIFY_TARGET_URL to async Agentify jobs', async () => {
    const runAsyncJob = vi.fn();
    const registry = {
      createJob: vi.fn(() => ({ id: 'j_async_agentify_test' })),
      updateJob: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    registerAgentifyRoutes(app, {
      apiLimiter: (_req, _res, next) => next(),
      runAsyncJob,
      registry,
    });

    const response = await request(app)
      .post('/api/agentify')
      .send({ url: 'https://docs.example.test', maxPages: 2, async: true });

    expect(response.status).toBe(202);
    expect(runAsyncJob).toHaveBeenCalledOnce();
    expect(runAsyncJob.mock.calls[0][0].env).toMatchObject({
      AGENTIFY_TARGET_URL: 'https://docs.example.test',
      AGENTIFY_MAX_PAGES: 2,
    });
  });

  it('marks synchronous Agentify jobs failed when the child exits non-zero', async () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.exitCode = null;
    child.pid = 12345;

    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => {
        child.stderr.emit('data', Buffer.from('[Agentify] LLM Synthesis Failed'));
        child.exitCode = 1;
        child.emit('close', 1);
      });
      return child;
    });
    const registry = {
      createJob: vi.fn(() => ({ id: 'j_sync_agentify_test' })),
      updateJob: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    registerAgentifyRoutes(app, {
      apiLimiter: (_req, _res, next) => next(),
      spawnProcess,
      registry,
    });

    const response = await request(app)
      .post('/api/agentify')
      .send({ url: 'https://docs.example.test', maxPages: 2 });

    expect(response.status).toBe(200);
    expect(registry.updateJob).toHaveBeenCalledWith(
      'j_sync_agentify_test',
      expect.objectContaining({
        status: 'failed',
        resultPath: null,
        error: 'Agentify process exited with code 1',
      }),
    );
  });
});

describe('Agentify LLM synthesis reporting', () => {
  it('returns a failed result without fake manifest content when both LLM formats fail', async () => {
    const openai = {
      chat: {
        completions: {
          create: vi.fn()
            .mockRejectedValueOnce(new Error('json_schema unsupported'))
            .mockRejectedValueOnce(new Error('upstream unavailable')),
        },
      },
    };
    const logger = { log: vi.fn(), error: vi.fn() };

    const result = await synthesizeAgentManifests({
      openai,
      model: 'test-model',
      systemPrompt: 'system',
      userPrompt: 'user',
      logger,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('Failed');
    expect(result.skillContent).toBe('');
    expect(result.llmsTxtContent).toBe('');
    expect(JSON.stringify(result)).not.toContain('LLM Generation Failed');
  });

  it('renders the actual failed LLM status in the validation report', () => {
    const report = buildValidationReport({
      targetUrl: 'https://docs.example.test',
      generatedAt: '2026-07-10T00:00:00.000Z',
      discoveredPages: 2,
      extractedReferences: 2,
      totalTokenEstimate: 100,
      llmStatus: 'Failed',
      cleanupStats: { cookieBanners: 0, mergedButtons: 0 },
      metricsTable: '',
    });

    expect(report).toContain('- **LLM Status**: Failed');
    expect(report).not.toContain('- **LLM Status**: Success');
  });
});
