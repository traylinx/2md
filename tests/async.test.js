import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';

let app;

beforeEach(async () => {
  vi.resetAllMocks();
  app = (await import('../server.js')).default || (await import('../server.js'));
});

describe('Async Workflows — Batch', () => {
  it('POST /api/batch with async:true should return 202 with job_id', async () => {
    const response = await request(app)
      .post('/api/batch')
      .send({
        urls: ['https://example.com'],
        async: true,
      });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(response.body.job_id).toBeDefined();
    expect(response.body.job_id).toMatch(/^j_/);
    expect(response.body.status).toBe('running');
    expect(response.body.status_url).toContain('/api/jobs/');
    expect(response.body.result_url).toContain('/api/jobs/');
  }, 10000);

  it('POST /api/batch with async:true should create a pollable job', async () => {
    const batchRes = await request(app)
      .post('/api/batch')
      .send({
        urls: ['https://example.com'],
        async: true,
      });

    const jobId = batchRes.body.job_id;
    expect(jobId).toBeDefined();

    const jobRes = await request(app).get(`/api/jobs/${jobId}`);
    expect(jobRes.status).toBe(200);
    expect(jobRes.body.type).toBe('batch');
    expect(['running', 'done']).toContain(jobRes.body.status);
  }, 10000);

  it('POST /api/batch without async should still return 200 (stream)', async () => {
    const response = await request(app)
      .post('/api/batch')
      .send({
        urls: ['https://example.com'],
        format: 'stream',
      });

    expect(response.status).toBe(200);
  }, 30000);
});

describe('Async Workflows — Crawl', () => {
  it('POST /api/crawl with async:true should return 202 with job_id', async () => {
    const response = await request(app)
      .post('/api/crawl')
      .send({
        url: 'https://example.com',
        maxPages: 1,
        depth: 1,
        async: true,
      });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(response.body.job_id).toMatch(/^j_/);
    expect(response.body.status_url).toContain('/api/jobs/');
  }, 10000);
});

describe('Webhook Delivery Module', () => {
  it('should validate webhook URLs', async () => {
    const { isValidWebhookUrl } = await import('../lib/jobs/webhookDelivery.js');

    expect(isValidWebhookUrl('https://example.com/hook')).toBe(true);
    expect(isValidWebhookUrl('http://localhost:3000/callback')).toBe(true);
    expect(isValidWebhookUrl('ftp://example.com')).toBe(false);
    expect(isValidWebhookUrl('not-a-url')).toBe(false);
    expect(isValidWebhookUrl('')).toBe(false);
  });

  it('should deliver webhook to a mock server', async () => {
    const { deliverWebhook } = await import('../lib/jobs/webhookDelivery.js');

    const mockServer = express();
    let receivedBody = null;
    mockServer.use(express.json());
    mockServer.post('/hook', (req, res) => {
      receivedBody = req.body;
      res.status(200).json({ ok: true });
    });

    const server = mockServer.listen(0);
    const port = server.address().port;

    try {
      const result = await deliverWebhook(`http://localhost:${port}/hook`, {
        job_id: 'j_test123',
        status: 'done',
        type: 'batch',
      });

      expect(result.delivered).toBe(true);
      expect(result.status).toBe(200);
      expect(receivedBody).toBeDefined();
      expect(receivedBody.job_id).toBe('j_test123');
      expect(receivedBody.status).toBe('done');
    } finally {
      server.close();
    }
  }, 10000);

  it('should return failure for unreachable webhook URL', async () => {
    const { deliverWebhook } = await import('../lib/jobs/webhookDelivery.js');

    const result = await deliverWebhook('http://localhost:1/nonexistent', {
      job_id: 'j_fail',
      status: 'done',
    });

    expect(result.delivered).toBe(false);
    expect(result.error).toBeDefined();
  }, 30000);

  it('should include HMAC signature when secret is provided', async () => {
    const { deliverWebhook } = await import('../lib/jobs/webhookDelivery.js');
    const crypto = await import('crypto');

    const mockServer = express();
    let receivedSignature = null;
    mockServer.use(express.json());
    mockServer.post('/signed-hook', (req, res) => {
      receivedSignature = req.headers['x-webhook-signature'];
      res.status(200).json({ ok: true });
    });

    const server = mockServer.listen(0);
    const port = server.address().port;

    try {
      const payload = { job_id: 'j_signed', status: 'done' };
      const secret = 'test-secret-key';

      await deliverWebhook(`http://localhost:${port}/signed-hook`, payload, {
        secret,
        jobId: 'j_signed',
      });

      expect(receivedSignature).toBeDefined();
      expect(receivedSignature).toMatch(/^sha256=/);

      const body = JSON.stringify(payload);
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
      expect(receivedSignature).toBe(expected);
    } finally {
      server.close();
    }
  }, 10000);
});

describe('Job Registry — Webhook Fields', () => {
  it('should include webhookUrl in created job', async () => {
    const jobRegistry = await import('../lib/jobRegistry.js');
    const job = jobRegistry.createJob('test', 'https://example.com', 'test', null, { webhookUrl: 'https://hook.example.com' });

    expect(job.webhookUrl).toBe('https://hook.example.com');
    expect(job.webhookStatus).toBe('pending');

    const fetched = jobRegistry.getJob(job.id);
    expect(fetched.webhookUrl).toBe('https://hook.example.com');
  });

  it('should have null webhook fields when no webhook_url provided', async () => {
    const jobRegistry = await import('../lib/jobRegistry.js');
    const job = jobRegistry.createJob('test', 'https://example.com', 'test');

    expect(job.webhookUrl).toBeNull();
    expect(job.webhookStatus).toBeNull();
    expect(job.webhookError).toBeNull();
  });
});
