import { useState, useEffect } from 'preact/hooks';

const CONSENT_KEY = 'html2md_cookie_consent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '1.5rem',
        right: 'auto',
        maxWidth: '380px',
        background: '#161616',
        border: '1px solid rgba(133,51,255,0.3)',
        borderRadius: '10px',
        padding: '1.2rem 1.4rem',
        zIndex: 9999,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        animation: 'cookieSlideUp 0.3s ease both',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <style>{`
        @keyframes cookieSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>
        🍪 We use cookies
      </p>
      <p style={{ fontSize: '0.82rem', color: '#9ca3af', lineHeight: 1.5, marginBottom: '1rem' }}>
        We use cookies to operate and improve our service. By accepting, you agree to our{' '}
        <a href="/privacy.html" style={{ color: '#8800ff' }}>Privacy Policy</a>.
      </p>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button
          onClick={accept}
          style={{
            flex: 1,
            padding: '0.45rem 0.75rem',
            background: '#8800ff',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Accept All
        </button>
        <button
          onClick={decline}
          style={{
            flex: 1,
            padding: '0.45rem 0.75rem',
            background: 'transparent',
            color: '#9ca3af',
            border: '1px solid rgba(133,51,255,0.3)',
            borderRadius: '6px',
            fontSize: '0.82rem',
            cursor: 'pointer',
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
