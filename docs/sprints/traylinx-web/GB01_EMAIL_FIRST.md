# GB01 email-first login

One protected form submission authorizes one login attempt. That attempt may consist
of a username-only step followed by a password step using the same credentialRef.
Each step still needs fresh observed controls, its own action ID, current authority,
and an exact signed decision. Rechecking an existing action ID returns its receipt.

The volatile broker returns an empty password for the username-only stage, including
across the private IPC boundary. It retains the original secret only within the
existing session-bound 120-second entry. A second username stage is denied. The
password stage consumes and wipes the secret. Expiry, cancellation, session disposal
and broker shutdown wipe retained buffers. No persistent password/profile is added.
The host retains approval metadata for the password stage, not credentials; failures
or uncertain receipts remove automatic approval. A new protected input is required
for another password attempt. No automatic retries or cross-recipient continuation.

Evidence: EMAIL_FIRST_CORE.tap, 110 focused checks passed, including signed HTTP,
owner pairing, one real loopback protected form and two-step worker-fixture execution.
This is not yet real Chromium email-first or production end-to-end qualification.
