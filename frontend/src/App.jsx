import { useState, useEffect, useCallback } from 'preact/hooks';
import { API_BASE, getClientId } from './utils';
import ConvertPage from './pages/ConvertPage';
import CrawlPage from './pages/CrawlPage';
import MapPage from './pages/MapPage';
import AgentifyPage from './pages/AgentifyPage';
import FileUploadPage from './pages/FileUploadPage';
import FileFromUrlPage from './pages/FileFromUrlPage';
import Footer from './components/Footer';
import CookieBanner from './components/CookieBanner';
import JobHistoryPanel from './components/JobHistoryPanel';

import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import SecurityPage from './pages/SecurityPage';

const PRODUCTS = {
  html2md: {
    label: 'html2md',
    defaultEndpoint: 'convert',
    endpoints: [
      { key: 'convert',  label: 'Convert Page', icon: 'document_scanner' },
      { key: 'crawl',    label: 'Crawl Site', icon: 'travel_explore' },
      { key: 'map',      label: 'Sitemap', icon: 'account_tree' },
      { key: 'agentify', label: 'Agentify', icon: 'smart_toy' },
    ],
  },
  file2md: {
    label: 'file2md',
    defaultEndpoint: 'upload',
    endpoints: [
      { key: 'upload',  label: 'Upload', icon: 'upload_file' },
      { key: 'fromurl', label: 'From URL', icon: 'link' },
    ],
  },
};

const ROUTES = {
  '/':                 { product: 'html2md', endpoint: 'convert' },
  '/crawl':            { product: 'html2md', endpoint: 'crawl' },
  '/map':              { product: 'html2md', endpoint: 'map' },
  '/agentify':         { product: 'html2md', endpoint: 'agentify' },
  '/file2md':          { product: 'file2md', endpoint: 'upload' },
  '/file2md/from-url': { product: 'file2md', endpoint: 'fromurl' },
  '/privacy':          { product: 'legal',   endpoint: 'privacy' },
  '/terms':            { product: 'legal',   endpoint: 'terms' },
  '/security':         { product: 'legal',   endpoint: 'security' },
};

const REVERSE_ROUTES = Object.fromEntries(
  Object.entries(ROUTES).map(([path, { product, endpoint }]) => [`${product}:${endpoint}`, path])
);

const HTML2MD_WORKFLOWS = [
  {
    key: 'convert',
    icon: 'document_scanner',
    title: 'Convert',
    bestFor: 'Best for one exact webpage.',
    description: 'Use this when you already know the page you want and need clean Markdown fast.'
  },
  {
    key: 'crawl',
    icon: 'travel_explore',
    title: 'Crawl',
    bestFor: 'Best for multi-page sites.',
    description: 'Discover a site first, then batch-convert only the pages you actually want.'
  },
  {
    key: 'map',
    icon: 'account_tree',
    title: 'Map',
    bestFor: 'Best for structure without extraction.',
    description: 'Inspect site shape, estimate scope, and export a sitemap without converting content.'
  },
  {
    key: 'agentify',
    icon: 'smart_toy',
    title: 'Agentify',
    bestFor: 'Best for agent-ready bundles.',
    description: 'Turn a website into organized Markdown references, llms.txt, and SKILL.md files.'
  }
];

const FILE2MD_WORKFLOWS = [
  {
    key: 'upload',
    icon: 'upload_file',
    title: 'Upload',
    bestFor: 'Best for local files.',
    description: 'Convert PDFs, images, and documents already on your machine into structured Markdown.'
  },
  {
    key: 'fromurl',
    icon: 'link',
    title: 'From URL',
    bestFor: 'Best for direct file links.',
    description: 'Point File2MD at a remote PDF or asset URL and get the same Markdown-oriented output.'
  }
];

const PAGE_MARKETING = {
  html2md: {
    convert: {
      heroTitle: <>Feed Your AI <span class="gradient-text">Better Data.</span></>,
      heroSubtitle: 'Raw HTML wastes up to 80% of your context window on tags, scripts, and styling your model can\'t use. We extract only the content that matters and deliver it as clean Markdown — the format LLMs understand best.',
      badges: [
        { accent: '80%', text: 'Fewer Tokens vs Raw HTML' },
        { accent: 'JS', text: 'Rendered Before Extraction' },
        { accent: '35%', text: 'Better RAG Recall' },
        { accent: 'GET', text: 'URL-Prepend Shortcut' },
      ],
      featuresTitle: 'Why Your AI Needs Markdown, Not HTML',
      featuresIntro: 'LLMs were trained on clean text and Markdown. Feeding them raw HTML forces them to parse rendering noise instead of understanding your content.',
      features: [
        {
          marker: '01',
          title: 'See What Users See',
          body: 'JavaScript-heavy sites get fully rendered before extraction, so your AI gets the real content — not empty <div> shells or loading spinners.'
        },
        {
          marker: '02',
          title: 'Cut 80% of Token Waste',
          body: 'Navigation, popups, ads, CSS classes — all the noise that inflates your context window and confuses your model gets removed automatically.'
        },
        {
          marker: '03',
          title: 'Get AI-Ready Markdown',
          body: 'Receive structured Markdown with headings, lists, and code blocks preserved — the format that gives LLMs the clearest semantic signal for better responses.'
        }
      ],
      builtForIntro: 'Teams that need their AI to reason over web content accurately, not hallucinate from HTML noise.',
      builtFor: [
        { icon: 'hub', text: 'RAG pipelines that need precise retrieval from web sources', bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' },
        { icon: 'psychology', text: 'LLM prompts and fine-tuning with real-world web content', bg: 'rgba(16, 185, 129, 0.1)', color: '#10B981' },
        { icon: 'savings', text: 'Anyone paying per token and tired of wasting budget on HTML noise', bg: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' },
        { icon: 'smart_toy', text: 'AI agents (Cursor, Windsurf, Claude) that need clean context', bg: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' }
      ]
    },
    crawl: {
      heroTitle: <>Turn Any Site Into an AI <span class="gradient-text">Knowledge Base.</span></>,
      heroSubtitle: 'Your AI agents don\'t browse — they read. Crawl discovers every page on a site, then batch-converts only the ones you select into agent-ready Markdown. Build the knowledge corpus your RAG pipeline actually needs.',
      badges: [
        { accent: '2-Step', text: 'Discover Then Select' },
        { accent: 'RAG', text: 'Pipeline Ready Output' },
        { accent: 'ZIP', text: 'Download Archive' },
      ],
      featuresTitle: 'From Website to AI-Ready Corpus',
      featuresIntro: 'Stop copy-pasting docs into prompts. Crawl automates the entire pipeline from site discovery to structured Markdown archive.',
      features: [
        {
          marker: '01',
          title: 'Discover the Knowledge Map',
          body: 'See every page on a site before committing resources. Know exactly what your AI will learn and how large the token budget needs to be.'
        },
        {
          marker: '02',
          title: 'Curate, Don\'t Dump',
          body: 'Select only the pages that matter. Focused context means sharper AI responses, lower token costs, and fewer hallucinations.'
        },
        {
          marker: '03',
          title: 'Export a Ready-Made Corpus',
          body: 'Download a clean Markdown archive ready to chunk, embed, and load into your vector database or agent memory.'
        }
      ],
      builtForIntro: 'Teams that need their AI to understand entire documentation sites, not just individual pages.',
      builtFor: [
        { icon: 'menu_book', text: 'Company knowledge bases for internal AI assistants', bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' },
        { icon: 'hub', text: 'Training and retrieval corpora from public documentation', bg: 'rgba(16, 185, 129, 0.1)', color: '#10B981' },
        { icon: 'database', text: 'Complete domain snapshots in a format AI can use', bg: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' },
        { icon: 'savings', text: 'Teams with token budgets who need control over context', bg: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' }
      ]
    },
    map: {
      heroTitle: <>Know What Your AI Will Learn — Before It <span class="gradient-text">Learns It.</span></>,
      heroSubtitle: 'Map scans a site and shows you every page it contains without converting anything. Estimate token costs, plan your knowledge boundaries, and decide what\'s worth extracting before spending a single API credit.',
      badges: [
        { accent: 'Scope', text: 'Plan Before You Spend' },
        { accent: 'Tree', text: 'Visual Site Structure' },
        { accent: 'TXT/MD/JSON', text: 'Export Ready' },
      ],
      featuresTitle: 'Plan Your AI\'s Knowledge Boundaries',
      featuresIntro: 'Every extra page in your context window costs tokens and risks diluting your AI\'s focus. Map helps you choose wisely.',
      features: [
        {
          marker: '01',
          title: 'Estimate Before You Commit',
          body: 'See total page count, depth, and structure so you can forecast token costs and scope your AI\'s knowledge boundaries before extraction.'
        },
        {
          marker: '02',
          title: 'Decide What Enters the Context',
          body: 'Identify which sections are documentation, which are marketing, and which are noise — then only extract what your AI actually needs.'
        },
        {
          marker: '03',
          title: 'Share the Plan',
          body: 'Download the site structure in TXT, Markdown, or JSON and share it with your team before starting a crawl or Agentify job.'
        }
      ],
      builtForIntro: 'Teams that want to understand scope and cost before committing to extraction.',
      builtFor: [
        { icon: 'account_tree', text: 'Pre-crawl planning to avoid wasting token budget', bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' },
        { icon: 'search', text: 'Scoping which docs your AI assistant should know', bg: 'rgba(16, 185, 129, 0.1)', color: '#10B981' },
        { icon: 'travel_explore', text: 'Estimating RAG corpus size before ingestion', bg: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' },
        { icon: 'download', text: 'Exportable sitemaps for team review', bg: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' }
      ]
    },
    agentify: {
      heroTitle: <>Inject Web Knowledge Directly Into Your <span class="gradient-text">AI Agents.</span></>,
      heroSubtitle: 'Coding agents like Cursor, Windsurf, and Claude hallucinate less when they have structured context. Agentify crawls any documentation site and packages it into an agent-ready skill bundle — so your copilot knows the SDK instead of guessing.',
      badges: [
        { accent: 'SKILL.md', text: 'Agent Routing Manifest' },
        { accent: 'llms.txt', text: 'Discovery Standard' },
        { accent: 'Bundle', text: 'Editable Before Download' },
      ],
      featuresTitle: 'Stop Pasting Docs Into Prompts',
      featuresIntro: 'Your coding agent is only as good as the context it has. Agentify turns any documentation site into permanent, structured agent knowledge.',
      features: [
        {
          marker: '01',
          title: 'Teach Your Agent the Docs',
          body: 'Select which pages become part of your agent\'s knowledge. No more pasting README fragments into prompts or hoping the model remembers the API.'
        },
        {
          marker: '02',
          title: 'Get llms.txt + SKILL.md',
          body: 'Produce the structured manifests that modern coding agents use to route questions to the right documentation section — automatically.'
        },
        {
          marker: '03',
          title: 'Edit and Verify In-Browser',
          body: 'Review, rename, and restructure every file in the bundle before downloading — because your agent is only as good as its context.'
        }
      ],
      builtForIntro: 'Teams that want their AI to actually know their stack instead of guessing at it.',
      builtFor: [
        { icon: 'smart_toy', text: 'Developers who want Cursor/Windsurf to know their stack', bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' },
        { icon: 'data_object', text: 'Internal copilots that need verified company knowledge', bg: 'rgba(16, 185, 129, 0.1)', color: '#10B981' },
        { icon: 'menu_book', text: 'API providers who want agents to use their SDK correctly', bg: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' },
        { icon: 'folder_zip', text: 'Anyone tired of copy-pasting docs into every prompt', bg: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' }
      ]
    }
  },
  file2md: {
    upload: {
      heroTitle: <>Make Your Documents Readable <span class="gradient-text">By AI.</span></>,
      heroSubtitle: 'PDFs, scanned images, and legacy documents are invisible to language models. File2MD extracts their content into structured Markdown — so your AI can actually read, summarize, and reason over files that were never designed for machines.',
      badges: [
        { accent: 'OCR', text: 'Vision-Powered Extraction' },
        { accent: 'AI', text: 'Optional Enhancement' },
        { accent: 'PDF', text: 'Tables & Structure Preserved' },
      ],
      featuresTitle: 'Unlock Knowledge Trapped in Documents',
      featuresIntro: 'Your AI can\'t read a PDF. It can\'t parse a scanned contract. File2MD bridges the gap between legacy documents and modern AI workflows.',
      features: [
        {
          marker: '01',
          title: 'Unlock Trapped Knowledge',
          body: 'PDFs, images, and scanned documents contain critical information your AI can\'t access in their original format. Upload them and we extract it.'
        },
        {
          marker: '02',
          title: 'OCR + Structure Preservation',
          body: 'Tables stay as tables. Headings stay as headings. The extracted Markdown preserves the document\'s meaning, not just its pixels.'
        },
        {
          marker: '03',
          title: 'AI-Enhanced Cleanup',
          body: 'Optionally run model-based enhancement to produce cleaner, more readable Markdown when raw OCR output alone isn\'t enough for your AI pipeline.'
        }
      ],
      builtForIntro: 'Teams that need AI to reason over documents that were never designed to be machine-readable.',
      builtFor: [
        { icon: 'picture_as_pdf', text: 'PDF reports and contracts for AI summarization', bg: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' },
        { icon: 'image', text: 'Scanned documents for RAG knowledge bases', bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' },
        { icon: 'table_chart', text: 'Tabular data that needs to enter LLM context', bg: 'rgba(16, 185, 129, 0.1)', color: '#10B981' },
        { icon: 'description', text: 'Legacy docs feeding downstream AI systems', bg: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' }
      ]
    },
    fromurl: {
      heroTitle: <>Point. Extract. <span class="gradient-text">Feed to Your AI.</span></>,
      heroSubtitle: 'Have a PDF report link, a hosted spreadsheet, or a media URL? File2MD fetches it, runs the same OCR and extraction pipeline, and delivers structured Markdown — no manual download step. Perfect for automated AI pipelines.',
      badges: [
        { accent: 'URL', text: 'Direct File Input' },
        { accent: 'Auto', text: 'No Download Required' },
        { accent: 'Pipeline', text: 'Same OCR Engine' },
      ],
      featuresTitle: 'Remote Documents, AI-Ready Output',
      featuresIntro: 'When the file already lives online, skip the download step. Point File2MD at the URL and get structured Markdown back.',
      features: [
        {
          marker: '01',
          title: 'Skip the Download',
          body: 'Paste a direct file link instead of downloading the asset and re-uploading it. One less step between your documents and your AI.'
        },
        {
          marker: '02',
          title: 'Same Extraction Pipeline',
          body: 'The remote file goes through the same OCR and Markdown pipeline used by upload mode — consistent, structured output every time.'
        },
        {
          marker: '03',
          title: 'Built for Automation',
          body: 'Integrate via API to automatically process remote documents as they appear — ideal for pipelines that feed content into LLMs continuously.'
        }
      ],
      builtForIntro: 'Teams building automated pipelines that process remote documents for AI consumption.',
      builtFor: [
        { icon: 'link', text: 'PDF report URLs for automated AI analysis', bg: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' },
        { icon: 'cloud_download', text: 'Hosted assets in continuous ingestion pipelines', bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' },
        { icon: 'movie', text: 'Remote media for transcription and summarization', bg: 'rgba(16, 185, 129, 0.1)', color: '#10B981' },
        { icon: 'integration_instructions', text: 'Automated workflows that feed LLMs with fresh documents', bg: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' }
      ]
    }
  }
};

function getInitialState() {
  const pathname = window.location.pathname.replace(/\.html$/, '');

  // 1. Try path-based routing first
  if (ROUTES[pathname] && ROUTES[pathname].product !== 'legal') {
    return ROUTES[pathname];
  }

  // 2. Fall back to query params (backward compat)
  const params = new URLSearchParams(window.location.search);
  const product = params.get('product') || 'html2md';
  const validProduct = PRODUCTS[product] ? product : 'html2md';
  const endpoint = params.get('endpoint') || PRODUCTS[validProduct].defaultEndpoint;
  const validEndpoints = PRODUCTS[validProduct].endpoints.map(e => e.key);
  const validEndpoint = validEndpoints.includes(endpoint) ? endpoint : PRODUCTS[validProduct].defaultEndpoint;

  // 3. If we got here via query params, silently redirect to the clean URL
  const key = `${validProduct}:${validEndpoint}`;
  if (REVERSE_ROUTES[key] && window.location.search) {
    history.replaceState(null, '', REVERSE_ROUTES[key]);
  }

  return { product: validProduct, endpoint: validEndpoint };
}

function updateUrl(product, endpoint) {
  const key = `${product}:${endpoint}`;
  const path = REVERSE_ROUTES[key] || '/';
  history.pushState(null, '', path);
}

const MOBILE_NAV_ITEMS = [
  { key: 'convert',  product: 'html2md', endpoint: 'convert',  icon: 'document_scanner', label: 'Convert' },
  { key: 'crawl',    product: 'html2md', endpoint: 'crawl',    icon: 'travel_explore',   label: 'Crawl' },
  { key: 'file',     product: 'file2md', endpoint: 'upload',   icon: 'upload_file',      label: 'File' },
  { key: 'agentify', product: 'html2md', endpoint: 'agentify', icon: 'smart_toy',        label: 'Agentify' },
  { key: 'game',     product: null,      endpoint: null,       icon: 'sports_esports',   label: 'Game' },
  { key: 'history',  product: null,      endpoint: null,       icon: 'history',          label: 'History' },
];

function MobileBottomNav({ product, endpoint, setProduct, setEndpoint, onHistoryClick }) {
  const handleNavClick = (item) => {
    if (item.key === 'game') {
      if (window.__ninjaRunner) {
        window.__ninjaRunner.enterFullscreen();
      }
      return;
    }
    if (item.key === 'history') {
      onHistoryClick();
      return;
    }
    setProduct(item.product);
    setEndpoint(item.endpoint);
  };

  return (
    <nav className="mobile-bottom-nav">
      {MOBILE_NAV_ITEMS.map((item) => {
        const isActive = item.product && item.product === product &&
          (item.key === 'file' ? (endpoint === 'upload' || endpoint === 'fromurl') : item.endpoint === endpoint);
        return (
          <button
            key={item.key}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => handleNavClick(item)}
          >
            <span className="material-symbols-outlined nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// All pages remain mounted for instant switching
function renderAllPages(product, endpoint, recoveredJob) {
  const hiddenStyle = { display: 'none' };

  return (
    <>
      {/* html2md pages — always mounted, hidden when inactive */}
      {product === 'html2md' && (
        <>
          <div style={endpoint !== 'convert' ? hiddenStyle : undefined}><ConvertPage recoveredJob={recoveredJob} /></div>
          <div style={endpoint !== 'crawl' ? hiddenStyle : undefined}><CrawlPage recoveredJob={recoveredJob} /></div>
          <div style={endpoint !== 'map' ? hiddenStyle : undefined}><MapPage /></div>
          <div style={endpoint !== 'agentify' ? hiddenStyle : undefined}><AgentifyPage recoveredJob={recoveredJob} /></div>
        </>
      )}

      {/* file2md pages — always mounted, hidden when inactive */}
      {product === 'file2md' && (
        <>
          <div style={endpoint !== 'upload' ? hiddenStyle : undefined}><FileUploadPage recoveredJob={recoveredJob} /></div>
          <div style={endpoint !== 'fromurl' ? hiddenStyle : undefined}><FileFromUrlPage recoveredJob={recoveredJob} /></div>
        </>
      )}
    </>
  );
}

const AgentInstallBlock = ({ copied, handleCopyPrompt, isBottomMode = false }) => (
  <section className={isBottomMode ? "doc-section flat-box agent-install-section" : "agent-install-section"} style={isBottomMode ? {} : { marginBottom: '3rem' }}>
    {isBottomMode && (
      <div className="doc-header" style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h2>Empower Your AI Agents</h2>
        <p>Give Cursor, Windsurf, or Copilot native instructions to extract pristine Markdown from any URL.</p>
      </div>
    )}
    
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: '#e4e4e7', color: '#09090b', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, borderRadius: '4px', flexShrink: 0, lineHeight: 1 }}>1</div>
          <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', lineHeight: 1 }}>Copy the setup prompt and paste it into <strong>any AI agent</strong></p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: '#e4e4e7', color: '#09090b', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, borderRadius: '4px', flexShrink: 0, lineHeight: 1 }}>2</div>
          <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', lineHeight: 1 }}>Your agent instantly knows how to extract data natively — zero setup</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '3rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', height: '52px', flexWrap: 'wrap' }}>
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
              <span className="custom-tooltip">Any other IDE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default function App() {
  const [state, setState] = useState(getInitialState);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recoveredJob, setRecoveredJob] = useState(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const agentPrompt = `Read https://raw.githubusercontent.com/traylinx/2md/main/.agents/skills/2md/SKILL.md and follow the instructions to use 2md natively.`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(agentPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const setProduct = useCallback((product) => {

    const endpoint = PRODUCTS[product].defaultEndpoint;
    setState({ product, endpoint });
    updateUrl(product, endpoint);
  }, []);

  const setEndpoint = useCallback((endpoint) => {
    setState(prev => {
      updateUrl(prev.product, endpoint);
      return { ...prev, endpoint };
    });
  }, []);

  useEffect(() => {
    function onPopState() {
      setState(getInitialState());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Auto-recover active job from localStorage on page load
  useEffect(() => {
    const saved = localStorage.getItem('html2md_active_job');
    if (!saved) return;
    try {
      const { jobId, product, endpoint } = JSON.parse(saved);
      
      // Only recover the job if the user explicitly landed on that tool's route.
      // Do not hijack the root URL or other routes.
      if (state.product !== product || state.endpoint !== endpoint) {
        return;
      }

      fetch(`${API_BASE}/api/jobs/${jobId}`, { headers: { 'X-Client-ID': getClientId() } })
        .then(r => r.ok ? r.json() : null)
        .then(job => {
          if (!job || job.status !== 'done') return;
          return fetch(`${API_BASE}/api/jobs/${jobId}/result`, { headers: { 'X-Client-ID': getClientId() } })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data) setRecoveredJob({ ...job, resultData: data });
            });
        })
        .catch(() => {});
    } catch (_) {
      localStorage.removeItem('html2md_active_job');
    }
  }, []);

  // Dynamic SEO: update <title> and <meta description> on route change
  const { product, endpoint } = state;
  useEffect(() => {
    const SEO = {
      'html2md:convert':  { title: 'Feed Your AI Better Data | 2md by Traylinx',  desc: 'Raw HTML wastes 80% of your context window. Extract clean, AI-ready Markdown from any web page — fewer tokens, better LLM responses, sharper RAG retrieval.' },
      'html2md:crawl':    { title: 'Turn Any Site Into an AI Knowledge Base | 2md', desc: 'Crawl entire websites and convert them to structured Markdown — ready for RAG pipelines, vector databases, and AI agent context.' },
      'html2md:map':      { title: 'Plan Your AI Knowledge Boundaries | 2md',      desc: 'Map any website structure to estimate token costs and scope your AI context before committing to extraction.' },
      'html2md:agentify': { title: 'Agentify — Skill Bundles for AI Agents | 2md', desc: 'Package any documentation site into llms.txt and SKILL.md bundles so Cursor, Windsurf, and Claude know your SDK instead of guessing.' },
      'file2md:upload':   { title: 'Make Documents Readable by AI | file2md',      desc: 'PDFs and scanned documents are invisible to LLMs. Extract structured Markdown via OCR so your AI can read, summarize, and reason over them.' },
      'file2md:fromurl':  { title: 'Remote Files to AI-Ready Markdown | file2md',  desc: 'Point at a remote PDF, image, or document URL and get structured Markdown back — no download step, ready for your AI pipeline.' },
    };

    const key = `${product}:${endpoint}`;
    const meta = SEO[key] || { title: '2md — Clean Markdown for the AI Era | Traylinx', desc: 'Stop feeding raw HTML to your LLMs. Extract clean, structured Markdown from any URL, file, or entire website — ready for RAG, agents, and AI workflows.' };

    document.title = meta.title;

    let el = document.querySelector('meta[name="description"]');
    if (!el) {
      el = document.createElement('meta');
      el.name = 'description';
      document.head.appendChild(el);
    }
    el.content = meta.desc;
  }, [product, endpoint]);

  const currentProduct = PRODUCTS[state.product];
  const currentMarketing = PAGE_MARKETING[state.product]?.[state.endpoint] || null;

  const pathname = window.location.pathname;
  const isPrivacy = pathname === '/privacy' || pathname === '/privacy.html';
  const isTerms = pathname === '/terms' || pathname === '/terms.html';
  const isSecurity = pathname === '/security' || pathname === '/security.html';

  if (isPrivacy || isTerms || isSecurity) {
    return (
      <div class="container">
        <header class="top-nav">
          <div class="logo" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center' }} onClick={(e) => {
              e.preventDefault();
              setProduct('html2md');
              setEndpoint('convert');
            }}>
              <img src="/logo.svg" alt="Traylinx" style={{ height: '28px', width: 'auto' }} />
            </a>
            <nav class="product-nav">
              {Object.entries(PRODUCTS).map(([key, prod]) => (
                <a
                  key={key}
                  class="product-tab"
                  href={REVERSE_ROUTES[`${key}:${PRODUCTS[key].defaultEndpoint}`]}
                  style={{ textDecoration: 'none' }}
                >
                  {prod.label}
                </a>
              ))}
              <a
                class="product-tab"
                href="/docs"
                onClick={() => setDocsLoading(true)}
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Docs
                {docsLoading && <span class="material-symbols-outlined" style={{ fontSize: '16px', animation: 'spin 1s linear infinite' }}>progress_activity</span>}
              </a>
              <button
                class="job-history-btn"
                onClick={() => setHistoryOpen(prev => !prev)}
                title="Job History"
              >
                <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>history</span>
              </button>
            </nav>
          </div>
        </header>

        {isPrivacy && <PrivacyPage />}
        {isTerms && <TermsPage />}
        {isSecurity && <SecurityPage />}

        <Footer />
        <CookieBanner />
      </div>
    );
  }

  return (
    <div class="container">
      <header class="top-nav">
        <div class="logo" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center' }} onClick={(e) => {
            e.preventDefault();
            setProduct('html2md');
          }}>
            <img src="/logo.svg" alt="Traylinx" style={{ height: '28px', width: 'auto' }} />
          </a>
          <nav class="product-nav">
            {Object.entries(PRODUCTS).map(([key, prod]) => (
              <a
                key={key}
                class={`product-tab ${state.product === key ? 'active' : ''}`}
                href={REVERSE_ROUTES[`${key}:${PRODUCTS[key].defaultEndpoint}`]}
                onClick={(e) => {
                  e.preventDefault();
                  setProduct(key);
                }}
                style={{ textDecoration: 'none' }}
              >
                {prod.label}
              </a>
            ))}
            <a
              class="product-tab"
              href="/docs"
              onClick={() => setDocsLoading(true)}
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Docs
              {docsLoading && <span class="material-symbols-outlined" style={{ fontSize: '16px', animation: 'spin 1s linear infinite' }}>progress_activity</span>}
            </a>
            <button
              class="job-history-btn"
              onClick={() => setHistoryOpen(prev => !prev)}
              title="Job History"
            >
              <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>history</span>
            </button>
          </nav>
        </div>
        <div class="nav-links" id="game-slot">
        </div>
      </header>

      <div class="hero-wrapper">
            <section class="hero-section">
              {currentMarketing && (
                <>
                  <h1 class="hero-title">{currentMarketing.heroTitle}</h1>
                  <p class="hero-subtitle">{currentMarketing.heroSubtitle}</p>
                </>
              )}

          <div class="hero-badges">
            {currentMarketing?.badges?.map((badge) => (
              <span key={`${badge.accent}-${badge.text}`} class="badge"><span class="gradient-text">{badge.accent}</span> {badge.text}</span>
            ))}
          </div>
        </section>
      </div>

      {state.product === 'html2md' && (
        <AgentInstallBlock copied={copied} handleCopyPrompt={handleCopyPrompt} />
      )}

      <main class="main-content">
        <div class="mode-tabs">
          {currentProduct.endpoints.map(ep => (
            <a
              key={ep.key}
              class={`mode-tab ${state.endpoint === ep.key ? 'active' : ''}`}
              href={REVERSE_ROUTES[`${state.product}:${ep.key}`]}
              onClick={(e) => {
                e.preventDefault();
                setEndpoint(ep.key);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none' }}
            >
              {ep.icon && <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>{ep.icon}</span>}
              {ep.label}
            </a>
          ))}
        </div>

        {renderAllPages(state.product, state.endpoint, recoveredJob)}
      </main>

      {state.product === 'html2md' && (
        <>

          <section class="features-grid">
            <div class="grid-header">
              <h2>{currentMarketing.featuresTitle}</h2>
              <p>{currentMarketing.featuresIntro}</p>
            </div>
            <div class="grid-columns">
              {currentMarketing.features.map((item) => (
                <div key={item.title} class="feature-card hover-card">
                  <div class="flat-box-icon">{item.marker}</div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section class="doc-section flat-box">
            <div class="doc-header">
              <h2>Choose Your Workflow</h2>
            </div>
            <div class="doc-content">
              <p class="doc-text">
                Use the same workflow in the UI and the API. Pick the mode that matches the job instead of starting from a generic endpoint.
              </p>
              <div class="workflow-grid">
                {HTML2MD_WORKFLOWS.map((workflow) => (
                  <a
                    key={workflow.key}
                    class="workflow-card"
                    href={REVERSE_ROUTES[`html2md:${workflow.key}`]}
                    onClick={(e) => {
                      e.preventDefault();
                      setProduct('html2md');
                      setEndpoint(workflow.key);
                    }}
                  >
                    <div class="workflow-card-header">
                      <span class="material-symbols-outlined">{workflow.icon}</span>
                      <h3>{workflow.title}</h3>
                    </div>
                    <p class="workflow-bestfor">{workflow.bestFor}</p>
                    <p class="workflow-description">{workflow.description}</p>
                    <span class="workflow-link">Open {workflow.title}</span>
                  </a>
                ))}
              </div>
              <p class="doc-text">
                Exact endpoints, parameters, and cURL examples live inside each feature page where they are paired with the matching UI workflow.
              </p>
            </div>
          </section>

          <section class="built-for-section">
            <div class="grid-header">
              <h2>Built For</h2>
              <p>{currentMarketing.builtForIntro}</p>
            </div>
            <div class="built-for-grid">
              {currentMarketing.builtFor.map(({ icon, text, bg, color }) => (
                <div key={icon} class="built-for-card hover-card">
                  <div class="flat-box-icon" style={{ background: `${bg} !important`, color: `${color} !important` }}>
                    <span class="material-symbols-outlined">{icon}</span>
                  </div>
                  <div class="built-for-content"><h4>{text}</h4></div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {state.product === 'file2md' && (
        <>
          <section class="features-grid">
            <div class="grid-header">
              <h2>{currentMarketing.featuresTitle}</h2>
              <p>{currentMarketing.featuresIntro}</p>
            </div>
            <div class="grid-columns">
              {currentMarketing.features.map((item) => (
                <div key={item.title} class="feature-card hover-card">
                  <div class="flat-box-icon">{item.marker}</div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section class="doc-section flat-box">
            <div class="doc-header">
              <h2>Choose Your Workflow</h2>
            </div>
            <div class="doc-content">
              <p class="doc-text">
                Both File2MD modes use the same extraction pipeline. Choose based on where the file lives before you start.
              </p>
              <div class="workflow-grid workflow-grid-compact">
                {FILE2MD_WORKFLOWS.map((workflow) => (
                  <a
                    key={workflow.key}
                    class="workflow-card"
                    href={REVERSE_ROUTES[`file2md:${workflow.key}`]}
                    onClick={(e) => {
                      e.preventDefault();
                      setProduct('file2md');
                      setEndpoint(workflow.key);
                    }}
                  >
                    <div class="workflow-card-header">
                      <span class="material-symbols-outlined">{workflow.icon}</span>
                      <h3>{workflow.title}</h3>
                    </div>
                    <p class="workflow-bestfor">{workflow.bestFor}</p>
                    <p class="workflow-description">{workflow.description}</p>
                    <span class="workflow-link">Open {workflow.title}</span>
                  </a>
                ))}
              </div>
              <p class="doc-text">
                Exact request fields, API key requirements, and cURL examples live inside the <strong>Upload</strong> and <strong>From URL</strong> pages.
              </p>
            </div>
          </section>

          <section class="built-for-section">
            <div class="grid-header">
              <h2>Built For</h2>
              <p>{currentMarketing.builtForIntro}</p>
            </div>
            <div class="built-for-grid">
              {currentMarketing.builtFor.map(({ icon, text, bg, color }) => (
                <div key={icon} class="built-for-card hover-card">
                  <div class="flat-box-icon" style={{ background: `${bg} !important`, color: `${color} !important` }}>
                    <span class="material-symbols-outlined">{icon}</span>
                  </div>
                  <div class="built-for-content"><h4>{text}</h4></div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ═══ GLOBAL AGENT INSTALL BLOCK (BOTTOM) ═══ */}
      <AgentInstallBlock copied={copied} handleCopyPrompt={handleCopyPrompt} isBottomMode={true} />

      <MobileBottomNav
        product={state.product}
        endpoint={state.endpoint}
        setProduct={setProduct}
        setEndpoint={setEndpoint}
        onHistoryClick={() => setHistoryOpen(prev => !prev)}
      />
      <Footer />
      <CookieBanner />
      <JobHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onNavigate={async (product, endpoint, job) => {
          setHistoryOpen(false);
          setState({ product, endpoint });
          updateUrl(product, endpoint);

          if (job && job.hasResult && job.status === 'done') {
            try {
              const res = await fetch(`${API_BASE}/api/jobs/${job.id}/result`, { headers: { 'X-Client-ID': getClientId() } });
              if (res.ok) {
                const data = await res.json();
                setRecoveredJob({ ...job, resultData: data });
                localStorage.setItem('html2md_active_job', JSON.stringify({
                  jobId: job.id,
                  product,
                  endpoint
                }));
              }
            } catch (e) {
              console.error('Failed to load job result:', e);
            }
          } else if (job && job.status === 'running') {
            setRecoveredJob({ ...job, resultData: null });
          }
        }}
      />
    </div>
  );
}
