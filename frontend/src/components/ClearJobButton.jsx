export default function ClearJobButton({ onClick, label = "Clear Results & Start Over" }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 1.5rem 0' }}>
      <button 
        onClick={onClick}
        class="clear-job-btn"
        style={{ 
          background: 'rgba(255, 255, 255, 0.04)', 
          border: '1px dashed rgba(255, 255, 255, 0.2)',
          color: 'var(--text-secondary)',
          padding: '8px 24px',
          borderRadius: '24px',
          fontSize: '0.85rem',
          fontWeight: '600',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.2s',
          fontFamily: 'var(--font-sans)',
          letterSpacing: '0.3px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.color = 'var(--text-primary)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
          e.currentTarget.style.color = 'var(--text-secondary)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }}
      >
        <span class="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '8px' }}>restart_alt</span>
        {label}
      </button>
    </div>
  );
}
