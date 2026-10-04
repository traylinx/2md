import { useEffect, useRef, useState } from 'preact/hooks';

export const RELAY_ENTRY_URL = 'https://relay.jevvellabs.com/v1/projects/traylinx-2md/SKILL.md';
export const RELAY_CONTACT_PROMPT = `Read ${RELAY_ENTRY_URL} to learn about 2md by Traylinx and help me draft an enquiry. Do not install software, upload my details or send anything without asking me first. Show me the exact message and wait for my explicit confirmation before sending.`;

export default function AgentRelayContact() {
  const [copyState, setCopyState] = useState('idle');
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copyPrompt() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(RELAY_CONTACT_PROMPT);
      setCopyState('copied');
      timer.current = setTimeout(() => setCopyState('idle'), 2500);
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <section id="agent-relay-contact" class="doc-section flat-box relay-contact" aria-labelledby="relay-contact-title">
      <div class="doc-header">
        <h2 id="relay-contact-title">Contact the 2md team with your AI assistant</h2>
      </div>
      <div class="doc-content">
        <p class="doc-text">Have a question about 2md or an integration? Your assistant can read our published information, help draft your enquiry and send the exact message you approve to our business inbox through AgentRelay.</p>
        <p class="doc-text">This is a contact route, separate from the 2md conversion skill above. Exploring needs no installation. Sending requires a compatible tool-enabled assistant and the AgentRelay client. Copying this prompt sends nothing.</p>
        <div class="relay-contact-actions">
          <button type="button" class="outline-button action-btn" onClick={copyPrompt}>
            {copyState === 'copied' ? 'Copied contact prompt' : 'Copy contact prompt'}
          </button>
          <a href={RELAY_ENTRY_URL} class="footer-link" target="_blank" rel="noopener noreferrer">Read contact instructions</a>
          <a href="/AGENTRELAY.md" class="footer-link">How contact works</a>
        </div>
        <span role="status" aria-live="polite" class="doc-text">
          {copyState === 'copied' && 'Paste the prompt into your assistant. Nothing has been sent.'}
          {copyState === 'failed' && 'Clipboard unavailable. Open the prompt below and copy it manually.'}
        </span>
        <details open={copyState === 'failed'}>
          <summary>View the contact prompt</summary>
          <p class="doc-text relay-contact-prompt">{RELAY_CONTACT_PROMPT}</p>
        </details>
      </div>
    </section>
  );
}
