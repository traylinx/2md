import { useState, useEffect } from 'preact/hooks';

export default function SwitchAICTA() {
  const [hasKey, setHasKey] = useState(() => {
    return !!(localStorage.getItem('html2md_api_key') || localStorage.getItem('agentify_api_key'));
  });

  useEffect(() => {
    const handleStorage = () => {
      setHasKey(!!(localStorage.getItem('html2md_api_key') || localStorage.getItem('agentify_api_key')));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  if (hasKey) return null;

  return (
    <div class="input-container flat-box" style={{ marginBottom: '32px', textAlign: 'center', padding: '32px 24px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '8px' }}>
        {'\uD83D\uDE80'} Get Your Free <span class="gradient-text">SwitchAI</span> API Key
      </h3>
      <p class="doc-text" style={{ maxWidth: '600px', margin: '0 auto 20px auto', textAlign: 'center' }}>
        SwitchAI is Traylinx's unified LLM router — one key, access to GPT, Claude, Llama, Mistral, and more. Sign up in 30 seconds and start generating intelligent Skill Bundles immediately.
      </p>
      <a 
        href="https://traylinx.com/switchai" 
        target="_blank" 
        class="outline-button action-btn"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', fontSize: '1rem', padding: '0.7rem 2rem' }}
      >
        Create Free Account {'\u2192'}
      </a>
      <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '12px', marginBottom: 0 }}>
        Pay-as-you-go pricing {'\u00B7'} No monthly minimums {'\u00B7'} Your key, your data
      </p>
    </div>
  );
}
