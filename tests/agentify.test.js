import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server'; // Must not include .js if using ES modules or CommonJS appropriately

describe('Agentify Integration API', () => {
  it('should process a tiny website and return the skill bundle VFS', async () => {
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

  }, 60000); // Allow up to 60 seconds for the puppeteer crawl and LLM extraction
});
