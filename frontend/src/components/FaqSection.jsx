import { useState } from 'preact/hooks';

export default function FaqSection({ faqs, title, subtitle }) {
  const [activeIdx, setActiveIdx] = useState(-1);

  function toggle(idx) {
    setActiveIdx(prev => prev === idx ? -1 : idx);
  }

  const items = faqs || [];
  const heading = title || 'Frequently Asked Questions';
  const sub = subtitle || 'Technical answers for developers integrating html2md into their AI pipelines.';

  return (
    <section class="faq-section">
      <div class="grid-header">
        <h2>{heading}</h2>
        <p>{sub}</p>
      </div>
      <div class="faq-list">
        {items.map((faq, idx) => (
          <div key={idx} class={`faq-item ${activeIdx === idx ? 'active' : ''}`}>
            <button class="faq-button" onClick={() => toggle(idx)}>
              {faq.q}
              <span class="faq-icon">{activeIdx === idx ? '−' : '+'}</span>
            </button>
            <div
              class="faq-content"
              style={{ maxHeight: activeIdx === idx ? '400px' : '0' }}
            >
              <p>{faq.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
