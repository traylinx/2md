import { useState } from 'preact/hooks';
import { API_BASE, getClientId } from '../utils';

export default function HomePage({ onNavigate }) {
  const [copied, setCopied] = useState(false);

  const agentPrompt = `I'd like you to use 2md by Traylinx — a powerful data-extraction API that converts any URL, file, or website into clean, AI-ready Markdown.

STEP 1 — Quick Convert (URL-Prepend shortcut):
For instant extraction, simply prepend the service URL to any target:
https://2md.traylinx.com/https://example.com/any-page

This returns clean Markdown immediately — no API key needed for public pages.

STEP 2 — API: Convert a single URL:
curl -X POST https://api.traylinx.com/api/convert \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/docs", "format": "json"}'

Supported formats: json (structured, recommended), markdown (raw text), stream (NDJSON logs).
Supported methods: auto (default), native, static, browser (for JS-heavy SPAs).

STEP 3 — API: Batch Convert multiple URLs in parallel:
curl -X POST https://api.traylinx.com/api/batch \\
  -H "Content-Type: application/json" \\
  -d '{"urls": ["https://example.com/1", "https://example.com/2"], "format": "json", "async": true}'

STEP 4 — API: Crawl an entire website:
curl -X POST https://api.traylinx.com/api/crawl \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com", "format": "json", "async": true}'

Returns a job_id for async processing. Optionally pass "email" or "webhook_url" for notifications.

STEP 5 — API: Map a Website (Generate Sitemap):
curl -X POST https://api.traylinx.com/api/map \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com", "format": "json"}'

STEP 6 — API: Convert uploaded files (PDF, DOCX, images, audio, video):
curl -X POST https://api.traylinx.com/api/file2md \\
  -F "file=@document.pdf" \\
  -F "format=json"

Uses OCR and Vision AI to extract structured text from any media.

STEP 7 — API: Agentify (generate AI Skill Bundles):
curl -X POST https://api.traylinx.com/api/agentify \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://docs.example.com", "format": "json", "async": true}'

Generates SKILL.md + llms.txt + reference files for injecting human knowledge into autonomous agents.

STEP 8 — Format Negotiation & Workflows:
All endpoints accept ?format=json (recommended for agents), ?format=markdown (raw), or ?format=stream (NDJSON).
Use method=browser only for JavaScript-heavy single-page apps.
Long-running jobs (batch, crawl, agentify) support "async": true payload.

IMPORTANT:
- Free tier: unlimited public page conversions, no API key required.
- For media/vision extraction, pass ?apiKey=sk-... with your key.
- Full API reference: https://docs.traylinx.com
- Agent discovery files: https://2md.traylinx.com/llms.txt and https://2md.traylinx.com/agents.json`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(agentPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="home-page fade-in">
      {/* Hero Section */}
      <section className="unified-hero-section">
        <h1 className="hero-title">
          The Data Extraction API for the <span className="gradient-text">AI Era.</span>
        </h1>
        <p className="hero-subtitle">
          Turn websites, PDFs, and deep crawls into perfectly formatted Markdown and JSON for your LLMs and RAG pipelines in seconds. Extract signal, drop the noise.
        </p>

        <div className="hero-cta-group">
          <button
            className="gradient-button large-btn"
            onClick={() => onNavigate('html2md', 'convert')}
            style={{ fontSize: '1.1rem', padding: '0.8rem 2rem' }}
          >
            Start Free Extraction
            <span className="material-symbols-outlined nav-icon" style={{ marginLeft: '8px', fontSize: '1.2rem', verticalAlign: 'middle' }}>arrow_forward</span>
          </button>
          
          <a
            href="https://docs.traylinx.com"
            target="_blank"
            rel="noopener noreferrer"
            className="outline-button large-btn"
            style={{ fontSize: '1.1rem', padding: '0.8rem 2rem', textDecoration: 'none' }}
          >
            <span className="material-symbols-outlined nav-icon" style={{ marginRight: '8px', fontSize: '1.2rem', verticalAlign: 'middle' }}>menu_book</span>
            Read the Docs
          </a>
        </div>
      </section>

      {/* ═══ AGENT INSTALL BLOCK ═══ */}
      <div style={{ maxWidth: '750px', margin: '3rem auto 0', textAlign: 'left' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div style={{ background: '#e4e4e7', color: '#09090b', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, borderRadius: '4px', flexShrink: 0, lineHeight: 1 }}>1</div>
            <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', lineHeight: 1 }}>Copy the setup prompt and paste it into <strong>any AI agent</strong></p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div style={{ background: '#e4e4e7', color: '#09090b', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, borderRadius: '4px', flexShrink: 0, lineHeight: 1 }}>2</div>
            <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', lineHeight: 1 }}>Your agent instantly knows how to extract data from any URL</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '4rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '1rem', fontWeight: 700 }}>Try it now</div>
            <button
              onClick={handleCopyPrompt}
              className="copy-prompt-btn"
              style={{
                background: copied ? 'rgba(34, 197, 94, 0.1)' : '#18181b',
                color: copied ? '#22c55e' : '#e4e4e7',
                border: copied ? '1px solid #22c55e' : '1px solid #27272a',
                padding: '1rem 1.25rem',
                fontSize: '0.95rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                fontFamily: 'var(--font-mono)',
                transition: 'all 0.15s ease',
                boxShadow: copied ? 'none' : '4px 4px 0px #52525b',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => {
                if (!copied) {
                  e.currentTarget.style.transform = 'translate(2px, 2px)';
                  e.currentTarget.style.boxShadow = '2px 2px 0px #52525b';
                }
              }}
              onMouseLeave={(e) => {
                if (!copied) {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '4px 4px 0px #52525b';
                }
              }}
            >
              {copied ? 'Copied to clipboard' : 'Copy instructions for my agent'}
              <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', opacity: 0.8 }}>{copied ? 'check' : 'content_copy'}</span>
            </button>
          </div>

          <div style={{ flex: '1 1 300px' }}>
            <div style={{ textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '1rem', fontWeight: 700 }}>Works with every agent</div>
            <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', height: '52px' }}>
              <div className="custom-tooltip-container">
                <img src="/agenticons/agenticon-openclaw.svg" alt="OpenClaw" style={{ height: '32px' }} />
                <span className="custom-tooltip">OpenClaw</span>
              </div>
              <div className="custom-tooltip-container">
                <img src="/agenticons/agenticon-antigravity.svg" alt="Antigravity" style={{ height: '36px' }} />
                <span className="custom-tooltip">Antigravity</span>
              </div>
              <div className="custom-tooltip-container">
                <img src="/agenticons/agenticon-claudecode.svg" alt="Claude Code" style={{ height: '32px' }} />
                <span className="custom-tooltip">Claude Code</span>
              </div>
              <div className="custom-tooltip-container">
                <img src="/agenticons/agenticon-cursor.svg" alt="Cursor" style={{ height: '24px' }} />
                <span className="custom-tooltip">Cursor</span>
              </div>
              <div className="custom-tooltip-container">
                <img src="/agenticons/agenticon-opencode.svg" alt="OpenCode" style={{ height: '24px' }} />
                <span className="custom-tooltip">OpenCode</span>
              </div>
              <div className="custom-tooltip-container">
                <img src="/agenticons/agenticon-codex.svg" alt="Codex" style={{ height: '24px' }} />
                <span className="custom-tooltip">Codex</span>
              </div>
              <div className="custom-tooltip-container"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-dim)', opacity: 0.8
                }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span className="custom-tooltip">Any other agent or IDE</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal / Code Visual */}
      <section className="api-showcase-section">
        <div className="terminal-window pulse-glow-subtle">
          <div className="terminal-header">
            <div className="terminal-buttons">
              <span className="close"></span>
              <span className="minimize"></span>
              <span className="maximize"></span>
            </div>
            <div className="terminal-title">bash — curl</div>
          </div>
          <div className="terminal-body" style={{ textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
            <span className="term-prompt">$ </span>
            <span className="term-cmd">curl -X POST</span><span className="term-arg"> https://api.traylinx.com/api/convert \</span><br/>
            <span className="term-arg">  -H </span><span className="term-string">"Content-Type: application/json"</span><span className="term-arg"> \</span><br/>
            <span className="term-arg">  -d </span><span className="term-string">'{'{"url": "https://example.com/docs", "format": "markdown"}'}'</span><br/>
            <br/>
            <span className="term-comment"># Output: LLM-Ready Markdown</span><br/>
            <span className="term-output" style={{ color: 'var(--success-color)' }}>{`---
title: Example Docs
date: 2024-03-10
---
# Welcome to Example Docs
This is perfectly formatted markdown instantly ready for RAG...`}</span>
          </div>
        </div>
      </section>

      {/* Feature / Tool Grid */}
      <section className="features-grid" style={{ marginTop: '4rem' }}>
        <div className="grid-header">
          <h2>One API. Every Extraction Workflow.</h2>
          <p>We handle JS rendering, anti-bot circumvention, and headless browsers so you don't have to.</p>
        </div>
        <div className="workflow-grid">
          {/* Convert */}
          <a className="workflow-card hover-card" href="/convert" onClick={(e) => { e.preventDefault(); onNavigate('html2md', 'convert'); }}>
            <div className="workflow-card-header">
              <span className="material-symbols-outlined">document_scanner</span>
              <h3>Convert</h3>
            </div>
            <p className="workflow-bestfor">Single Page Extraction</p>
            <p className="workflow-description">Paste a URL. Get clean Markdown. Perfect for capturing docs, articles, or JS-heavy views.</p>
            <span className="workflow-link">Extract Signal Now</span>
          </a>

          {/* Crawl */}
          <a className="workflow-card hover-card" href="/crawl" onClick={(e) => { e.preventDefault(); onNavigate('html2md', 'crawl'); }}>
            <div className="workflow-card-header">
              <span className="material-symbols-outlined">travel_explore</span>
              <h3>Crawl</h3>
            </div>
            <p className="workflow-bestfor">Domain Scale Context</p>
            <p className="workflow-description">Discover entire websites, select the paths that matter, and batch-convert everything to asynchronous ZIP archives.</p>
            <span className="workflow-link">Map a Domain</span>
          </a>

          {/* File2MD */}
          <a className="workflow-card hover-card" href="/file2md" onClick={(e) => { e.preventDefault(); onNavigate('file2md', 'upload'); }}>
            <div className="workflow-card-header">
              <span className="material-symbols-outlined">description</span>
              <h3>File2MD</h3>
            </div>
            <p className="workflow-bestfor">Local PDFs & Images</p>
            <p className="workflow-description">Upload visual documents or point to a remote URL. We run OCR and turn massive PDFs into highly structured text strings.</p>
            <span className="workflow-link">Upload File</span>
          </a>

          {/* Agentify */}
          <a className="workflow-card hover-card" href="/agentify" onClick={(e) => { e.preventDefault(); onNavigate('html2md', 'agentify'); }}>
            <div className="workflow-card-header">
              <span className="material-symbols-outlined">smart_toy</span>
              <h3>Agentify</h3>
            </div>
            <p className="workflow-bestfor">Skill Bundles (llms.txt)</p>
            <p className="workflow-description">Automatically generate 'llms.txt' manifests and 'SKILL.md' routing files to inject human knowledge into autonomous agents.</p>
            <span className="workflow-link">Build Agent Context</span>
          </a>
        </div>
      </section>

      {/* Target Personas */}
      <section className="built-for-section" style={{ marginTop: '5rem', marginBottom: '3rem' }}>
        <div className="grid-header">
          <h2>Who Uses Our Extraction Engine?</h2>
        </div>
        <div className="built-for-grid">
          <div className="built-for-card hover-card">
             <div className="flat-box-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' }}>
               <span className="material-symbols-outlined">psychology</span>
             </div>
             <div className="built-for-content">
               <h4 style={{ marginBottom: '0.4rem' }}>AI Engineers (RAG)</h4>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Feed your language models and vector databases with stripped, pristine Markdown instead of messy raw HTML.</p>
             </div>
          </div>
          
          <div className="built-for-card hover-card">
             <div className="flat-box-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
               <span className="material-symbols-outlined">trending_up</span>
             </div>
             <div className="built-for-content">
               <h4 style={{ marginBottom: '0.4rem' }}>Growth & Leads</h4>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Automate scraping of competitor blogs, lead lists, or pricing pages using our scalable batch APIs.</p>
             </div>
          </div>
          
          <div className="built-for-card hover-card">
             <div className="flat-box-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
               <span className="material-symbols-outlined">auto_graph</span>
             </div>
             <div className="built-for-content">
               <h4 style={{ marginBottom: '0.4rem' }}>SEO Analysts</h4>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Use the 'Map' workflow to generate instant structural audits of any website without paying for full conversion.</p>
             </div>
          </div>

        </div>
      </section>

    </div>
  );
}
