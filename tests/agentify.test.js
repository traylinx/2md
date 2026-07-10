import { describe, it, expect } from 'vitest';
import request from 'supertest';
import http from 'http';
import app from '../server'; // Must not include .js if using ES modules or CommonJS appropriately

describe('Agentify Integration API', () => {
  it('should process a tiny website and return the skill bundle VFS', async () => {
    const llmServer = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }

      req.resume();
      req.on('end', () => {
        const content = JSON.stringify({
          skill_md: '# Example Domain Skill\n\nUse references/_root.md for the source page.',
          llms_txt: '# Example Domain\n\n- [Home](references/_root.md)',
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'chatcmpl_agentify_test',
          object: 'chat.completion',
          created: 0,
          model: 'test-model',
          choices: [{
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }));
      });
    });

    await new Promise((resolve) => llmServer.listen(0, '127.0.0.1', resolve));
    const { port } = llmServer.address();
    const previousApiKey = process.env.AGENTIFY_LLM_API_KEY;
    const previousBaseUrl = process.env.AGENTIFY_LLM_BASE_URL;
    const previousModel = process.env.AGENTIFY_LLM_MODEL;
    process.env.AGENTIFY_LLM_API_KEY = 'test-key';
    process.env.AGENTIFY_LLM_BASE_URL = `http://127.0.0.1:${port}/v1`;
    process.env.AGENTIFY_LLM_MODEL = 'test-model';

    try {
    // 1 page is the minimum to test the full pipeline end-to-end
    // Example.com is very fast to process
    const response = await request(app)
      .post('/api/agentify')
      .send({
        url: 'https://example.com',
        maxPages: 1
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);

    const text = response.text;
    
    // Verify it streams logs
    expect(text).toContain('[Agentify]');
    
    // Verify the JSON delimiter
    expect(text).toContain('__JSON__');

    // Extract the JSON payload
    const jsonString = text.split('__JSON__')[1];
    expect(jsonString).toBeDefined();

    const data = JSON.parse(jsonString);
    
    // Verify the structure of the final output
    expect(data.success).toBe(true);
    expect(data.files).toBeDefined();
    
    // Check for the generated reference page
    // Example domain usually results in 'example-domain.md'
    const fileKeys = Object.keys(data.files);
    const hasReference = fileKeys.some(key => key.startsWith('references/'));
    expect(hasReference).toBe(true);

    // Check for the AI routing artifacts
    expect(data.files['SKILL.md']).toBeDefined();
    expect(data.files['llms.txt']).toBeDefined();
    expect(data.files['SKILL.md']).not.toContain('LLM Generation Failed');
    expect(data.files['validation-report.md']).toContain('- **LLM Status**: Success');

    } finally {
      if (previousApiKey === undefined) delete process.env.AGENTIFY_LLM_API_KEY;
      else process.env.AGENTIFY_LLM_API_KEY = previousApiKey;
      if (previousBaseUrl === undefined) delete process.env.AGENTIFY_LLM_BASE_URL;
      else process.env.AGENTIFY_LLM_BASE_URL = previousBaseUrl;
      if (previousModel === undefined) delete process.env.AGENTIFY_LLM_MODEL;
      else process.env.AGENTIFY_LLM_MODEL = previousModel;
      await new Promise((resolve) => llmServer.close(resolve));
    }
  }, 60000); // Allow up to 60 seconds for the puppeteer crawl and LLM extraction
});
