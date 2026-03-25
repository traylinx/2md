import { useState, useEffect } from 'preact/hooks';

export default function BYOKInput({ storageKey, validationUrl, tooltipText, descriptionHtml }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(storageKey) || '');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isLocked, setIsLocked] = useState(() => !!localStorage.getItem(storageKey));
  const [isExpanded, setIsExpanded] = useState(() => !localStorage.getItem(storageKey));

  useEffect(() => {
    const handleStorage = () => {
      const current = localStorage.getItem(storageKey) || '';
      setApiKey(current);
      if (current && !isLocked) {
        setIsLocked(true);
        setIsExpanded(false);
      } else if (!current) {
        setApiKeyInput('');
        setIsLocked(false);
        setIsExpanded(true);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  async function handleSaveApiKey() {
    setValidationError('');
    const keyToSave = apiKeyInput.trim();

    if (!keyToSave) {
      localStorage.removeItem(storageKey);
      setApiKey('');
      setIsLocked(false);
      setIsExpanded(true);
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('byok_updated'));
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch(validationUrl, {
        headers: { 'Authorization': `Bearer ${keyToSave}` }
      });
      if (response.ok) {
        localStorage.setItem(storageKey, keyToSave);
        setApiKey(keyToSave);
        setApiKeyInput('');
        setIsSaved(true);
        setIsLocked(true);
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('byok_updated'));
        setTimeout(() => {
          setIsSaved(false);
          setIsExpanded(false);
        }, 1200);
      } else {
        setValidationError('Invalid API Key provided.');
      }
    } catch (err) {
      setValidationError('Failed to connect to validation server.');
    } finally {
      setIsValidating(false);
    }
  }

  function handleUnlock() {
    setIsLocked(false);
    setIsExpanded(true);
    setApiKeyInput(apiKey);
  }

  function handleDelete() {
    localStorage.removeItem(storageKey);
    setApiKey('');
    setApiKeyInput('');
    setIsLocked(false);
    setIsExpanded(true);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('byok_updated'));
  }

  function getMaskedKey(key) {
    if (!key || key.length < 15) return '•••••••••••••••••••••';
    const start = key.substring(0, 9);
    const end = key.substring(key.length - 4);
    return `${start}${'•'.repeat(22)}${end}`;
  }

  const isInputEmpty = !apiKeyInput.trim();

  let btnText = 'Save Key';
  if (isValidating) btnText = 'Checking...';
  else if (isSaved) btnText = 'Saved! ✓';
  else if (apiKey && !isLocked) btnText = 'Update Key';

  if (!isExpanded && isLocked) {
    return (
      <div 
        class="input-container flat-box" 
        style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer' }} 
        onClick={() => setIsExpanded(true)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span class="material-symbols-outlined" style={{ fontSize: '20px', color: '#10b981' }}>check_circle</span>
          <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.95rem' }}>SwitchAI API Key (BYOK) &mdash; Provided</span>
        </div>
        <button type="button" class="icon-btn" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', padding: 0, cursor: 'pointer', display: 'flex' }}>
          <span class="material-symbols-outlined" style={{ fontSize: '20px' }}>expand_more</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div class="input-container flat-box" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label class="input-option-label" style={{ display: 'flex', alignItems: 'center', margin: 0 }}>
            <span class="info-icon" data-tooltip={tooltipText}>i</span>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
              SwitchAI API Key (BYOK) &mdash; <span style={{color: 'var(--text-dim)', fontWeight: 'normal'}}>Required</span>
            </span>
          </label>
          {isLocked && (
            <button type="button" class="icon-btn" onClick={() => setIsExpanded(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', padding: 0, cursor: 'pointer', display: 'flex' }}>
              <span class="material-symbols-outlined" style={{ fontSize: '20px' }}>expand_less</span>
            </button>
          )}
        </div>

      <div class="input-wrapper" style={{ display: 'flex', gap: '8px', alignItems: 'stretch', marginBottom: '8px' }}>
        <input
          type={isLocked ? "text" : "password"}
          placeholder="sk-lf-... (Traylinx SwitchAI API Key)"
          value={isLocked ? getMaskedKey(apiKey) : apiKeyInput}
          onInput={(e) => { if (!isLocked) setApiKeyInput(e.target.value); }}
          readOnly={isLocked}
          autocomplete="off"
          style={{ flex: 1 }}
        />
        {isLocked ? (
          <>
            <button
              type="button"
              class="outline-button action-btn"
              onClick={handleUnlock}
              title="Unlock to edit API Key"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', minWidth: '48px' }}
            >
              <span class="material-symbols-outlined" style={{ fontSize: '20px' }}>lock_open</span>
            </button>
            <button
              type="button"
              class="outline-button action-btn"
              onClick={handleDelete}
              title="Delete API Key"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', minWidth: '48px' }}
            >
              <span class="material-symbols-outlined" style={{ fontSize: '20px' }}>delete</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            class="outline-button action-btn"
            onClick={handleSaveApiKey}
            disabled={isValidating || isInputEmpty}
            style={{ minWidth: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span class="material-symbols-outlined" style={{ fontSize: '16px', marginRight: '6px' }}>save</span>
            {btnText}
          </button>
        )}
      </div>

      {validationError && <p style={{ color: 'var(--error-color)', fontSize: '0.85rem', margin: '0 0 8px 0' }}>{validationError}</p>}

      <p
        style={{ fontSize: '12px', color: 'var(--text-dim)', margin: '4px 0 0 0', lineHeight: '1.5' }}
        dangerouslySetInnerHTML={{ __html: descriptionHtml }}
      />
    </div>

    </>
  );
}
