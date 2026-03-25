import { h } from 'preact';

export default function PrivacyPage() {
  return (
    <>
      <div class="hero-wrapper" style={{ padding: '4rem 0 2rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <span class="badge" style={{ display: 'inline-block', background: 'rgba(136,0,255,0.15)', color: 'var(--mui-primary-light)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, padding: '0.2em 0.6em', marginBottom: '1rem', textTransform: 'uppercase' }}>Legal</span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Privacy Policy</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Last updated: March 2025</p>
      </div>

      <main style={{ maxWidth: '780px', margin: '0 auto', padding: '1rem 0 5rem' }}>
        <nav style={{ background: 'var(--flat-box-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.5rem 2rem', marginBottom: '2.5rem' }} aria-label="Table of contents">
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Contents</h2>
          <ol style={{ paddingLeft: '1.2rem', color: 'var(--mui-primary-main)' }}>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#overview" style={{ color: 'inherit', textDecoration: 'none' }}>Overview</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#information" style={{ color: 'inherit', textDecoration: 'none' }}>Information We Collect</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#use" style={{ color: 'inherit', textDecoration: 'none' }}>How We Use Your Information</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#sharing" style={{ color: 'inherit', textDecoration: 'none' }}>Sharing & Disclosure</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#cookies" style={{ color: 'inherit', textDecoration: 'none' }}>Cookies & Tracking</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#retention" style={{ color: 'inherit', textDecoration: 'none' }}>Data Retention</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#transfers" style={{ color: 'inherit', textDecoration: 'none' }}>International Transfers</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#rights" style={{ color: 'inherit', textDecoration: 'none' }}>Your Rights</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#children" style={{ color: 'inherit', textDecoration: 'none' }}>Children's Privacy</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#changes" style={{ color: 'inherit', textDecoration: 'none' }}>Changes to This Policy</a></li>
          </ol>
        </nav>

        <section id="overview" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>1. Overview</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>This Privacy Policy describes how Traylinx ("we," "us," or "our") collects, uses, and discloses information when you use html2md and its related tools and APIs (collectively, the "Service"). By accessing or using the Service, you acknowledge the data practices described in this Policy.</p>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>We are committed to handling your data responsibly and in compliance with applicable data protection laws, including, where applicable, the General Data Protection Regulation (GDPR). If you have questions, contact us at <a href="mailto:legal@traylinx.com" style={{ color: 'var(--mui-primary-light)' }}>legal@traylinx.com</a>.</p>
        </section>

        <section id="information" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>2. Information We Collect</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>We collect information to operate and improve the Service:</p>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>URLs and Content:</strong> URLs you submit for conversion. We do not permanently store the full content of pages you convert beyond the operational period required to deliver results.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Technical Data:</strong> IP address, browser type and version, device type, operating system, and referral source — collected automatically for rate limiting, security, and analytics.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Account Information:</strong> If you register for an API key, we collect your email address and relevant usage metadata.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Usage Data:</strong> Information about how you interact with the Service, such as request frequency, features used, and session duration.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Cookies & Tracking Technologies:</strong> We use cookies and similar technologies to maintain session state, remember preferences, and analyze traffic patterns.</li>
          </ul>
        </section>

        <section id="use" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>3. How We Use Your Information</h2>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Service Provision:</strong> To process your conversion requests and deliver results.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Rate Limiting & Abuse Prevention:</strong> To enforce fair usage policies and prevent misuse of the Service.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Analytics & Improvement:</strong> To understand usage patterns and develop better features.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Security:</strong> To detect, investigate, and address unauthorized access or fraudulent activity.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Communication:</strong> To send important service-related notifications (e.g., API key updates), and, where you have opted in, product news.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Legal Compliance:</strong> To fulfil our legal obligations and enforce our Terms of Service.</li>
          </ul>
        </section>

        <section id="sharing" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>4. Sharing & Disclosure</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>We do not sell your personal data. We may share information in the following limited circumstances:</p>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Infrastructure & Service Providers:</strong> With trusted providers that help operate and deliver the Service (e.g., cloud hosting, analytics), under contractual confidentiality obligations.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Business Transfers:</strong> In connection with a merger, acquisition, or asset sale, your data may be part of the transferred assets.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Legal Requirements:</strong> When required by applicable law, regulation, or legal process, or to protect rights, safety, or property.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>With Your Consent:</strong> For any other purpose, with your explicit agreement.</li>
          </ul>
        </section>

        <section id="cookies" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>5. Cookies & Tracking</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>We use cookies and similar technologies to operate and improve the Service:</p>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Essential Cookies:</strong> Required for basic functionality. Cannot be disabled.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Analytics Cookies:</strong> Help us understand how users interact with the Service. May be disabled via browser settings.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Functional Cookies:</strong> Remember your preferences for a better experience.</li>
          </ul>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>You can control cookies through your browser settings at any time.</p>
        </section>

        <section id="retention" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>6. Data Retention</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>We retain personal data only as long as necessary to fulfil the purposes described in this Policy or to comply with applicable law. Temporary caches of converted content are cleared on a short-term rolling basis. You may request deletion of your personal data by contacting <a href="mailto:legal@traylinx.com" style={{ color: 'var(--mui-primary-light)' }}>legal@traylinx.com</a>.</p>
        </section>

        <section id="transfers" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>7. International Data Transfers</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>Our infrastructure may be located across different countries. If you are outside the country where our servers operate, your data may be transferred and processed in other countries, which may have different data protection standards. We take appropriate measures to ensure any such transfers comply with applicable law.</p>
        </section>

        <section id="rights" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>8. Your Rights</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>Depending on your location, you may have rights including:</p>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Access:</strong> Request a copy of the personal data we hold about you.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Rectification:</strong> Request correction of inaccurate or incomplete data.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Erasure:</strong> Request deletion of your personal data ("right to be forgotten"), subject to legal exceptions.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Restriction:</strong> Request that we limit processing in certain circumstances.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Portability:</strong> Request a structured, machine-readable copy of your data.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Objection:</strong> Object to processing based on legitimate interests or direct marketing.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Withdrawal of Consent:</strong> Withdraw consent at any time without affecting prior processing.</li>
          </ul>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>To exercise any right, contact <a href="mailto:legal@traylinx.com" style={{ color: 'var(--mui-primary-light)' }}>legal@traylinx.com</a>.</p>
        </section>

        <section id="children" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>9. Children's Privacy</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>The Service is not directed at individuals under the age of 16. We do not knowingly collect personal data from children. If you believe a child has provided personal information without appropriate consent, please contact us and we will take prompt steps to delete such information.</p>
        </section>

        <section id="changes" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>10. Changes to This Policy</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>We may update this Privacy Policy to reflect changes in our practices or applicable law. When we make material changes, we will update the date at the top of this page. Your continued use of the Service after changes take effect constitutes acceptance of the revised Policy.</p>
        </section>

        <section id="contact" style={{ borderBottom: 'none' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>Contact</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>For any privacy-related questions or requests: <a href="mailto:legal@traylinx.com" style={{ color: 'var(--mui-primary-light)' }}>legal@traylinx.com</a></p>
        </section>
      </main>
    </>
  );
}
