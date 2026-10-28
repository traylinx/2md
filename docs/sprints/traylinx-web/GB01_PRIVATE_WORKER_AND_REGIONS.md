# GB01 private worker and scoped extraction evidence

Real `scripts/browser-worker.js` was forked through the production persistent worker
adapter on traylinx-ci. Test runtime used synthetic current-authority fixtures and
real signed credential completion/consent. Chromium submitted one owned fixture login,
returned private redacted content through IPC, recovered the same action receipt
without a second POST, and removed its profile/released its proxy on close.

Evidence: PRIVATE_WORKER_CHROMIUM.txt; PRIVATE_WORKER_REGION.txt additionally checks
semantic-region extraction. Test-only executable wrapper trusts a generated fixture
certificate; no production TLS flags or public-IP policy were weakened. Proxy maps
only the owned fixture origin to its loopback HTTPS listener. This is not production
container firewall/PG/Redis qualification. Owned remote scratch removed.

Observations now return optional `regions` for main/article/table/labeled regions.
`browser_extract(regionRef)` resolves the current observed handle in the selected
frame, rejects stale/foreign/nonsemantic references, removes hidden/input/script
content, and extracts only that fragment without a new request. Existing observation
payloads without regions remain valid. Legacy endpoints unchanged.

The real worker fixture asserts selected-region output excludes outside content,
hidden text, input values and the synthetic password echo. Full-page extraction and
its source/privacy/evidence contract remain intact. REGION_CORE.tap records focused
regression checks; later local change only replaces a temporary internal request
property with a local region-text variable and adds client instructions.
