import { API_BASE, getClientId } from '../utils';

export default function HomePage({ onNavigate }) {
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
