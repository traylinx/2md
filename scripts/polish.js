#!/usr/bin/env node

/**
 * polish.js — Step 5: Post-process Markdown for quality
 * 
 * Usage: node scripts/polish.js <job_dir> [--front-matter]
 * 
 * Reads:  <job_dir>/output/page.md, <job_dir>/job.json
 * Writes: Updated <job_dir>/output/page.md, updated job.json with quality score
 */

const fs = require('fs');
const path = require('path');
const { sanitizeMarkdown } = require('../lib/sanitize');

function main() {
  const args = process.argv.slice(2);
  const jobDir = args.find(arg => !arg.startsWith('--'));
  const addFrontMatter = args.includes('--front-matter');

  if (!jobDir) {
    console.error('Usage: node scripts/polish.js <job_dir> [--front-matter]');
    process.exit(1);
  }

  const mdPath = path.join(jobDir, 'output', 'page.md');
  if (!fs.existsSync(mdPath)) {
    console.error(`Markdown file not found: ${mdPath}`);
    process.exit(1);
  }

  let markdown = fs.readFileSync(mdPath, 'utf-8');

  // === Universal CSS/JS cleanup (safety net) ===
  markdown = sanitizeMarkdown(markdown);

  // === Normalize whitespace ===
  // Collapse 3+ consecutive blank lines to 2
  markdown = markdown.replace(/\n{4,}/g, '\n\n\n');

  // Remove trailing whitespace from lines
  markdown = markdown.split('\n').map(line => line.trimEnd()).join('\n');

  // Ensure file ends with a single newline
  markdown = markdown.trim() + '\n';

  // Remove zero-width characters
  markdown = markdown.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

  // === Fix common Markdown issues ===
  // Fix orphan list markers (a line with just "- " or "* ")
  markdown = markdown.replace(/^[*-]\s*$/gm, '');

  // Fix double-spaces in links that break rendering
  markdown = markdown.replace(/\]\(\s+/g, '](');
  markdown = markdown.replace(/\s+\)/g, ')');

  // Remove empty links
  markdown = markdown.replace(/\[([^\]]*)\]\(\s*\)/g, '$1');

  // Remove empty image references
  markdown = markdown.replace(/!\[\]\(\s*\)/g, '');

  // === Add front matter if requested ===
  if (addFrontMatter) {
    const jobJsonPath = path.join(jobDir, 'job.json');
    const pageJsonPath = path.join(jobDir, 'page.json');
    let jobData = {};
    if (fs.existsSync(pageJsonPath)) {
      try { jobData = JSON.parse(fs.readFileSync(pageJsonPath, 'utf-8')); } catch(e) {}
    } else if (fs.existsSync(jobJsonPath)) {
      try { jobData = JSON.parse(fs.readFileSync(jobJsonPath, 'utf-8')); } catch(e) {}
    }
    const metadata = jobData.metadata || {};

    const title = metadata.title || metadata.ogTitle || '';
    const description = metadata.description || metadata.ogDescription || '';
    const source = jobData.url || '';
    const ogImage = metadata.ogImage || '';

    const frontMatterLines = [
      '---',
      `title: "${title.replace(/"/g, '\\"')}"`,
      `source: "${source}"`,
      `date_converted: "${new Date().toISOString().split('T')[0]}"`
    ];

    if (description) {
      frontMatterLines.push(`description: "${description.replace(/"/g, '\\"')}"`);
    }
    if (ogImage) {
      frontMatterLines.push(`image: "${ogImage}"`);
    }
    frontMatterLines.push('---', '');

    markdown = frontMatterLines.join('\n') + '\n' + markdown;
  }

  // === Calculate quality metrics ===
  const headings = (markdown.match(/^#{1,6}\s/gm) || []).length;
  const lists = (markdown.match(/^[\s]*[-*+]\s/gm) || []).length;
  const codeBlocks = Math.floor((markdown.match(/^```/gm) || []).length / 2);
  const tables = (markdown.match(/^\|/gm) || []).length > 0 ? 1 : 0;
  const images = (markdown.match(/!\[/g) || []).length;
  const links = (markdown.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []).length;

  const textOnly = markdown.replace(/[#*_`|>\[\]()!\-]/g, '').replace(/\s+/g, ' ').trim();
  const textDensity = markdown.length > 0 ? Math.round((textOnly.length / markdown.length * 100) * 10) / 10 : 0;

  let artifacts = 0;
  artifacts += (markdown.match(/\\\[/g) || []).length;
  artifacts += (markdown.match(/\\_/g) || []).length;
  artifacts += (markdown.match(/\\\*/g) || []).length;

  const quality = {
    headings,
    lists,
    code_blocks: codeBlocks,
    tables,
    images,
    links,
    text_density_pct: textDensity,
    conversion_artifacts: artifacts,
    char_count: markdown.length,
    word_count: markdown.split(/\s+/).filter(Boolean).length
  };

  // Write polished Markdown
  fs.writeFileSync(mdPath, markdown);

  // Update job.json or page.json with quality metrics
  const jobJsonPath = path.join(jobDir, 'job.json');
  const pageJsonPath = path.join(jobDir, 'page.json');
  const targetPath = fs.existsSync(pageJsonPath) ? pageJsonPath : (fs.existsSync(jobJsonPath) ? jobJsonPath : null);
  
  if (targetPath) {
    try {
      const jobData = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
      jobData.quality = quality;
      jobData.completedAt = new Date().toISOString();
      fs.writeFileSync(targetPath, JSON.stringify(jobData, null, 2));
    } catch(e) {}
  }

  const result = {
    success: true,
    quality
  };

  console.log(JSON.stringify(result));
}

main();
