import { useState } from 'preact/hooks';

export default function CodeSnippet({ code, language = 'bash' }) {
  const [copied, setCopied] = useState(false);
  const lines = code.split('\n');

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div class="code-terminal">
      <div class="code-terminal-bar">
        <div class="code-terminal-dots">
          <span class="dot-red" />
          <span class="dot-yellow" />
          <span class="dot-green" />
        </div>
        <span class="code-lang-label">{language.toUpperCase()}</span>
        <button class="code-copy-btn" onClick={handleCopy} title="Copy code">
          <span class="material-symbols-outlined" style={{ fontSize: '14px' }}>
            {copied ? 'check' : 'content_copy'}
          </span>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div class="code-terminal-body">
        <div class="code-line-numbers" aria-hidden="true">
          {lines.map((_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <pre class="code-terminal-pre"><code>{code}</code></pre>
      </div>
    </div>
  );
}
