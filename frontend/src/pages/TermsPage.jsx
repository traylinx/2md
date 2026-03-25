import { h } from 'preact';

export default function TermsPage() {
  return (
    <>
      <div class="hero-wrapper" style={{ padding: '4rem 0 2rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <span class="badge" style={{ display: 'inline-block', background: 'rgba(136,0,255,0.15)', color: 'var(--mui-primary-light)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, padding: '0.2em 0.6em', marginBottom: '1rem', textTransform: 'uppercase' }}>Legal</span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Terms of Service</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Last updated: March 2025</p>
      </div>

      <main style={{ maxWidth: '780px', margin: '0 auto', padding: '1rem 0 5rem' }}>
        <nav style={{ background: 'var(--flat-box-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.5rem 2rem', marginBottom: '2.5rem' }} aria-label="Table of contents">
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Contents</h2>
          <ol style={{ paddingLeft: '1.2rem', color: 'var(--mui-primary-main)' }}>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#acceptance" style={{ color: 'inherit', textDecoration: 'none' }}>Acceptance of Terms</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#description" style={{ color: 'inherit', textDecoration: 'none' }}>Description of Service</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#eligibility" style={{ color: 'inherit', textDecoration: 'none' }}>Eligibility</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#account" style={{ color: 'inherit', textDecoration: 'none' }}>Account & API Keys</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#use" style={{ color: 'inherit', textDecoration: 'none' }}>Permitted Use & Restrictions</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#ip" style={{ color: 'inherit', textDecoration: 'none' }}>Intellectual Property</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#ucontent" style={{ color: 'inherit', textDecoration: 'none' }}>Your Content</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#fees" style={{ color: 'inherit', textDecoration: 'none' }}>Fees & Payment</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#disclaimers" style={{ color: 'inherit', textDecoration: 'none' }}>Disclaimer of Warranties</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#liability" style={{ color: 'inherit', textDecoration: 'none' }}>Limitation of Liability</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#indemnification" style={{ color: 'inherit', textDecoration: 'none' }}>Indemnification</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#termination" style={{ color: 'inherit', textDecoration: 'none' }}>Termination</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#governing" style={{ color: 'inherit', textDecoration: 'none' }}>Governing Law</a></li>
            <li style={{ marginBottom: '0.4rem', fontSize: '0.9rem' }}><a href="#changes" style={{ color: 'inherit', textDecoration: 'none' }}>Changes to These Terms</a></li>
          </ol>
        </nav>

        <section id="acceptance" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>1. Acceptance of Terms</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>By accessing or using html2md and its related APIs and tools (collectively, the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you are using the Service on behalf of an organization, you represent that you are authorized to bind that organization to these Terms.</p>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>If you do not agree to these Terms, you may not use the Service. The Service is operated by Traylinx ("we," "us," or "our").</p>
        </section>

        <section id="description" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>2. Description of Service</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>html2md is a web content-to-Markdown conversion service. It allows users to convert webpage content — including single pages, crawled sites, and uploaded files — into clean, structured Markdown and other machine-readable formats suitable for AI applications, documentation, and knowledge processing. The Service is provided on an "as is" and "as available" basis.</p>
        </section>

        <section id="eligibility" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>3. Eligibility</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>You must be at least 16 years old (or the applicable legal age of digital consent in your jurisdiction) to use the Service. By using the Service, you confirm that you meet this requirement and that you are not prohibited by applicable law from using the Service.</p>
        </section>

        <section id="account" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>4. Account & API Keys</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>Certain features require account registration or an API key. If applicable:</p>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Accuracy:</strong> You agree to provide accurate, complete, and current information.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Security:</strong> You are responsible for safeguarding your API key and credentials. Do not share them with unauthorized parties.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Responsibility:</strong> You are responsible for all activity that occurs under your account or API key.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}><strong style={{ color: 'var(--text-primary)' }}>Reporting:</strong> Notify us immediately at <a href="mailto:legal@traylinx.com" style={{ color: 'var(--mui-primary-light)' }}>legal@traylinx.com</a> if you suspect unauthorized use.</li>
          </ul>
        </section>

        <section id="use" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>5. Permitted Use & Restrictions</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>You may use the Service only for lawful purposes. You agree <strong style={{ color: 'var(--text-primary)' }}>not</strong> to:</p>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>Violate any applicable laws, regulations, or third-party rights;</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>Attempt to circumvent rate limiting, authentication, or other technical controls;</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>Use the Service to scrape content in violation of third-party terms of service or applicable law;</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>Sell, resell, or sublicense access to the Service without our written consent;</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>Use automated means to place excessive load on our infrastructure;</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>Reverse engineer, decompile, or attempt to extract source code from the Service;</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>Use the Service to transmit malware, spam, or any harmful content;</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>Misrepresent your identity or affiliation with any person or organization.</li>
          </ul>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>We reserve the right to enforce rate limits at any time to ensure fair access for all users.</p>
        </section>

        <section id="ip" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>6. Intellectual Property</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>The Service, including all software, design, and documentation, is owned by Traylinx or its licensors and protected by applicable intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to use the Service as intended. No other rights are granted.</p>
        </section>

        <section id="ucontent" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>7. Your Content</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>You retain all rights to content you submit for conversion. By submitting, you grant us a limited license to process and temporarily store such content solely to provide the Service. We do not claim ownership of your content and will not use it for any other purpose.</p>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>You represent that you have all necessary rights and permissions to submit the content you provide, and that your submission does not infringe any third-party rights.</p>
        </section>

        <section id="fees" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>8. Fees & Payment</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>Certain tiers of the Service may require payment. Where applicable:</p>
          <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>You agree to pay the fees stated at the time of purchase.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>Subscriptions are billed in advance on a recurring basis unless otherwise stated.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>We use third-party payment processors. Payment information is subject to their terms.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>Fees are generally non-refundable except where required by applicable law or our stated refund policy.</li>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>We reserve the right to modify pricing with advance notice.</li>
          </ul>
        </section>

        <section id="disclaimers" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>9. Disclaimer of Warranties</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.88rem', letterSpacing: '0.01em', textTransform: 'uppercase' }}>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.</p>
        </section>

        <section id="liability" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>10. Limitation of Liability</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.88rem', letterSpacing: '0.01em', textTransform: 'uppercase' }}>TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL TRAYLINX, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE. OUR TOTAL AGGREGATE LIABILITY FOR ANY CLAIM SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE SIX MONTHS PRECEDING THE CLAIM OR (B) ONE HUNDRED EUROS (€100).</p>
        </section>

        <section id="indemnification" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>11. Indemnification</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>You agree to defend, indemnify, and hold harmless Traylinx and its affiliates, officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising from your violation of these Terms, your use of the Service, or your violation of any third-party rights.</p>
        </section>

        <section id="termination" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>12. Termination</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>We may suspend or terminate your access to the Service at any time, with or without prior notice, if you violate these Terms or engage in conduct that we determine is harmful to the Service or other users. You may also stop using the Service at any time. Provisions that by their nature should survive termination will do so.</p>
        </section>

        <section id="governing" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>13. Governing Law & Disputes</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>These Terms are governed by and construed in accordance with applicable law. We encourage you to contact us first to resolve any dispute informally at <a href="mailto:legal@traylinx.com" style={{ color: 'var(--mui-primary-light)' }}>legal@traylinx.com</a>. If not resolved informally, disputes will be subject to the jurisdiction of competent courts as determined by applicable law. Nothing limits your rights under applicable mandatory consumer protection legislation.</p>
        </section>

        <section id="changes" style={{ marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>14. Changes to These Terms</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>We may revise these Terms at any time. When we make material changes, we will update the date at the top of this page. Your continued use of the Service after changes take effect constitutes acceptance of the updated Terms.</p>
        </section>

        <section id="contact" style={{ borderBottom: 'none' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>Contact</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.8rem', fontSize: '0.95rem' }}>Questions about these Terms: <a href="mailto:legal@traylinx.com" style={{ color: 'var(--mui-primary-light)' }}>legal@traylinx.com</a></p>
        </section>
      </main>
    </>
  );
}
