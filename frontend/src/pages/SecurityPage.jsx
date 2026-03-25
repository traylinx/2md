import { h } from 'preact';

export default function SecurityPage() {
  return (
    <>
      <div class="hero-wrapper" style={{ padding: '4rem 0 2rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <span class="badge" style={{ display: 'inline-block', background: 'rgba(136,0,255,0.15)', color: 'var(--mui-primary-light)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, padding: '0.2em 0.6em', marginBottom: '1rem', textTransform: 'uppercase' }}>Security</span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Security Policy</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Last updated: March 2025</p>
      </div>

      <main style={{ maxWidth: '780px', margin: '0 auto', padding: '1rem 0 5rem' }}>
        <nav style={{ background: 'var(--flat-box-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.5rem 2rem', marginBottom: '2.5rem' }} aria-label="Table of contents">
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Contents</h2>
          <ol style={{ paddingLeft: '1.2rem', color: 'var(--mui-primary-main)' }}>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#commitment" style={{ color: 'inherit', textDecoration: 'none' }}>Our Commitment</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#data-protection" style={{ color: 'inherit', textDecoration: 'none' }}>Data Protection</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#infrastructure" style={{ color: 'inherit', textDecoration: 'none' }}>Infrastructure Security</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#dev" style={{ color: 'inherit', textDecoration: 'none' }}>Secure Development</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#vulnerability" style={{ color: 'inherit', textDecoration: 'none' }}>Vulnerability Management</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#incident" style={{ color: 'inherit', textDecoration: 'none' }}>Incident Response</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#team" style={{ color: 'inherit', textDecoration: 'none' }}>Team & Access Controls</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#third-party" style={{ color: 'inherit', textDecoration: 'none' }}>Third-Party Services</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#report" style={{ color: 'inherit', textDecoration: 'none' }}>Report a Vulnerability</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#updates" style={{ color: 'inherit', textDecoration: 'none' }}>Policy Updates</a></li>
          </ol>
        </nav>

        <section id="commitment" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>1. Our Commitment</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>Security is a core design principle at Traylinx. The html2md Service processes URLs and files on your behalf — protecting that data is a fundamental obligation we take seriously. We invest continuously in technical and organizational measures to defend against modern threats.</p>
        </section>

        <section id="data-protection" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>2. Data Protection</h2>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Encryption in Transit:</strong> All communication between users and our infrastructure is protected using TLS (Transport Layer Security).</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Encryption at Rest:</strong> Sensitive stored data is encrypted using industry-standard algorithms.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Minimal Data Storage:</strong> We do not permanently store the content of pages you convert. Processed output is retained only as long as necessary to deliver results, then discarded.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>IP Address Handling:</strong> IP addresses may be temporarily retained for rate limiting and abuse prevention, then automatically purged.</li>
          </ul>
        </section>

        <section id="infrastructure" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>3. Infrastructure Security</h2>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Access Control:</strong> Infrastructure access is restricted on a strict need-to-know basis with multi-factor authentication enforced for privileged systems.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Network Security:</strong> Firewalls, intrusion detection systems, and continuous network monitoring help detect and block unauthorized access.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Isolation:</strong> Processing environments are isolated to prevent cross-request data exposure.</li>
          </ul>
        </section>

        <section id="dev" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>4. Secure Development</h2>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Security-First Engineering:</strong> We follow recognized best practices (including OWASP Top 10) to prevent common vulnerabilities such as injection attacks, SSRF, and authentication flaws.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Code Review:</strong> Security review is part of our standard pull request process.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Dependency Management:</strong> We monitor third-party dependencies for known vulnerabilities and apply patches promptly.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>SSRF Protections:</strong> Given the nature of url-fetching, we implement specific Server-Side Request Forgery (SSRF) mitigations to prevent internal network access via user-supplied URLs.</li>
          </ul>
        </section>

        <section id="vulnerability" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>5. Vulnerability Management</h2>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Regular Assessments:</strong> We perform internal security reviews and, where appropriate, leverage external assessments to identify vulnerabilities.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Prompt Remediation:</strong> Critical security patches are applied without delay following discovery.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Automated Scanning:</strong> Automated tooling is used to continuously scan for common security issues in our codebase and infrastructure.</li>
          </ul>
        </section>

        <section id="incident" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>6. Incident Response</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>In the event of a security incident:</p>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Containment:</strong> Immediate action to isolate and limit the impact.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Investigation:</strong> Thorough root-cause analysis to understand scope and affected data.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Notification:</strong> Where required by law or our policies, affected users and relevant authorities will be notified in a timely manner.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Remediation:</strong> Corrective actions implemented to prevent recurrence.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Post-Incident Review:</strong> We conduct lessons-learned reviews to improve our security posture.</li>
          </ul>
        </section>

        <section id="team" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>7. Team & Access Controls</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>All team members with access to user data receive security awareness training covering data handling, phishing, and credential management. Access is granted on a least-privilege basis and reviewed regularly. Access is revoked promptly when no longer necessary.</p>
        </section>

        <section id="third-party" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>8. Third-Party Services</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>We carefully evaluate third-party service providers used to operate the Service. Our vendor due diligence covers their security practices, and data processing agreements include explicit security obligations. Key infrastructure providers are selected based on their industry-recognized security certifications and track record.</p>
        </section>

        <section id="report" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>9. Report a Vulnerability</h2>
          <div style={{ background: 'var(--flat-box-bg)', border: '1px solid var(--border-color)', borderLeft: '3px solid var(--mui-primary-main)', borderRadius: 'var(--radius)', padding: '1.2rem 1.5rem', margin: '1rem 0' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>If you discover a potential security vulnerability in html2md or any Traylinx service, we encourage you to report it responsibly. Please send details to <a href="mailto:security@traylinx.com" style={{ color: 'var(--mui-primary-light)' }}>security@traylinx.com</a>. We will investigate all reports and respond promptly. We appreciate responsible disclosure and will acknowledge your contribution where appropriate.</p>
          </div>
        </section>

        <section id="updates" style={{ borderBottom: 'none' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>10. Policy Updates</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>This Security page is reviewed and updated periodically to reflect changes in our practices and the threat landscape. We encourage you to review it periodically.</p>
        </section>
      </main>
    </>
  );
}
