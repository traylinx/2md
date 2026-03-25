HTML to Markdown Converter | html2md

Security

# Security Policy

Last updated: March 2025

## 1\. Our Commitment

Security is a core design principle at Traylinx. The html2md Service processes URLs and files on your behalf — protecting that data is a fundamental obligation we take seriously. We invest continuously in technical and organizational measures to defend against modern threats.

## 2\. Data Protection

-   **Encryption in Transit:** All communication between users and our infrastructure is protected using TLS (Transport Layer Security).
-   **Encryption at Rest:** Sensitive stored data is encrypted using industry-standard algorithms.
-   **Minimal Data Storage:** We do not permanently store the content of pages you convert. Processed output is retained only as long as necessary to deliver results, then discarded.
-   **IP Address Handling:** IP addresses may be temporarily retained for rate limiting and abuse prevention, then automatically purged.

## 3\. Infrastructure Security

-   **Access Control:** Infrastructure access is restricted on a strict need-to-know basis with multi-factor authentication enforced for privileged systems.
-   **Network Security:** Firewalls, intrusion detection systems, and continuous network monitoring help detect and block unauthorized access.
-   **Isolation:** Processing environments are isolated to prevent cross-request data exposure.

## 4\. Secure Development

-   **Security-First Engineering:** We follow recognized best practices (including OWASP Top 10) to prevent common vulnerabilities such as injection attacks, SSRF, and authentication flaws.
-   **Code Review:** Security review is part of our standard pull request process.
-   **Dependency Management:** We monitor third-party dependencies for known vulnerabilities and apply patches promptly.
-   **SSRF Protections:** Given the nature of url-fetching, we implement specific Server-Side Request Forgery (SSRF) mitigations to prevent internal network access via user-supplied URLs.

## 5\. Vulnerability Management

-   **Regular Assessments:** We perform internal security reviews and, where appropriate, leverage external assessments to identify vulnerabilities.
-   **Prompt Remediation:** Critical security patches are applied without delay following discovery.
-   **Automated Scanning:** Automated tooling is used to continuously scan for common security issues in our codebase and infrastructure.

## 6\. Incident Response

In the event of a security incident:

-   **Containment:** Immediate action to isolate and limit the impact.
-   **Investigation:** Thorough root-cause analysis to understand scope and affected data.
-   **Notification:** Where required by law or our policies, affected users and relevant authorities will be notified in a timely manner.
-   **Remediation:** Corrective actions implemented to prevent recurrence.
-   **Post-Incident Review:** We conduct lessons-learned reviews to improve our security posture.

## 7\. Team & Access Controls

All team members with access to user data receive security awareness training covering data handling, phishing, and credential management. Access is granted on a least-privilege basis and reviewed regularly. Access is revoked promptly when no longer necessary.

## 8\. Third-Party Services

We carefully evaluate third-party service providers used to operate the Service. Our vendor due diligence covers their security practices, and data processing agreements include explicit security obligations. Key infrastructure providers are selected based on their industry-recognized security certifications and track record.

## 9\. Report a Vulnerability

If you discover a potential security vulnerability in html2md or any Traylinx service, we encourage you to report it responsibly. Please send details to [security@traylinx.com](mailto:security@traylinx.com). We will investigate all reports and respond promptly. We appreciate responsible disclosure and will acknowledge your contribution where appropriate.

## 10\. Policy Updates

This Security page is reviewed and updated periodically to reflect changes in our practices and the threat landscape. We encourage you to review it periodically.
