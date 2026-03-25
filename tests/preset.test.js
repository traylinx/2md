import { describe, it, expect } from 'vitest';
import { applyPreset, validatePreset, VALID_PRESETS } from '../lib/pipeline/outputPreset';
import { chunkMarkdown } from '../lib/pipeline/chunkMarkdown';

describe('outputPreset: validatePreset', () => {
  it('should return full for undefined input', () => {
    expect(validatePreset(undefined)).toBe('full');
  });

  it('should return full for empty string', () => {
    expect(validatePreset('')).toBe('full');
  });

  it('should normalize case', () => {
    expect(validatePreset('COMPACT')).toBe('compact');
    expect(validatePreset('Chunks')).toBe('chunks');
  });

  it('should reject invalid presets', () => {
    expect(validatePreset('summary')).toBe(null);
    expect(validatePreset('turbo')).toBe(null);
  });

  it('should accept all valid presets', () => {
    for (const p of VALID_PRESETS) {
      expect(validatePreset(p)).toBe(p);
    }
  });
});

describe('outputPreset: applyPreset', () => {
  const sampleMd = `# Title

![banner](https://example.com/banner.png)

Some paragraph text here.

---

## Section One

Content for section one with details.

![image](https://example.com/photo.jpg)

## Section Two

More content for section two.`;

  it('full preset should return markdown unchanged', () => {
    const result = applyPreset(sampleMd, 'full');
    expect(result.ok).toBe(true);
    expect(result.markdown).toBe(sampleMd);
    expect(result.preset).toBe('full');
  });

  it('compact preset should strip images and horizontal rules', () => {
    const result = applyPreset(sampleMd, 'compact');
    expect(result.ok).toBe(true);
    expect(result.markdown).not.toContain('![');
    expect(result.markdown).not.toContain('---');
    expect(result.markdown).toContain('Some paragraph text');
    expect(result.markdown).toContain('Section One');
  });

  it('chunks preset should return array of chunks', () => {
    const result = applyPreset(sampleMd, 'chunks');
    expect(result.ok).toBe(true);
    expect(result.chunks).toBeDefined();
    expect(Array.isArray(result.chunks)).toBe(true);
    expect(result.chunks.length).toBeGreaterThan(0);

    const sectionOne = result.chunks.find(c => c.heading === 'Section One');
    expect(sectionOne).toBeDefined();
    expect(sectionOne.wordCount).toBeGreaterThan(0);
    expect(sectionOne.tokens).toBeGreaterThan(0);
  });

  it('invalid preset should return error', () => {
    const result = applyPreset(sampleMd, 'summary');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid preset');
  });
});

describe('chunkMarkdown', () => {
  it('should split on ## headings', () => {
    const md = `## Introduction

Hello world, this is the intro paragraph.

## Details

Here are the details about the topic.

## Conclusion

The final wrap-up.`;

    const chunks = chunkMarkdown(md);
    expect(chunks.length).toBe(3);
    expect(chunks[0].heading).toBe('Introduction');
    expect(chunks[1].heading).toBe('Details');
    expect(chunks[2].heading).toBe('Conclusion');
  });

  it('should handle content before first heading', () => {
    const md = `Some preamble text here.

## First Section

Section content.`;

    const chunks = chunkMarkdown(md);
    expect(chunks.length).toBe(2);
    expect(chunks[0].heading).toBe(null);
    expect(chunks[0].content).toContain('preamble');
    expect(chunks[1].heading).toBe('First Section');
  });

  it('should return single chunk when no headings exist', () => {
    const md = 'Just plain text without any headings at all.';
    const chunks = chunkMarkdown(md);
    expect(chunks.length).toBe(1);
    expect(chunks[0].heading).toBe(null);
    expect(chunks[0].wordCount).toBe(8);
  });

  it('should include token estimates', () => {
    const md = '## Test\n\nSome test content here that should produce tokens.';
    const chunks = chunkMarkdown(md);
    expect(chunks[0].tokens).toBeGreaterThan(0);
  });
});
