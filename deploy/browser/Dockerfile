# Candidate-only additive runtime. Existing capture/READ images are not rebuilt.
ARG BASE_IMAGE=ghcr.io/traylinx/2md-capture@sha256:3d014ddfc1b43ad3cd16e64694ae7219c369cbb72772e3fb689c4dac372a203a
FROM ${BASE_IMAGE} AS runtime-dependencies
USER root
WORKDIR /opt/browser-runtime
COPY deploy/web/runtime/package.json deploy/web/runtime/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${BASE_IMAGE} AS browser
ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/traylinx/2md" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
WORKDIR /app
COPY --from=runtime-dependencies /opt/browser-runtime/node_modules /app/deploy/browser-runtime/node_modules
COPY lib/browser /app/lib/browser
COPY lib/web /app/lib/web
COPY lib/capture /app/lib/capture
COPY lib/pipeline/extractStatic.js /app/lib/pipeline/extractStatic.js
COPY lib/sanitize.js /app/lib/sanitize.js
COPY routes/browser.js routes/browserInput.js routes/browserHost.js routes/browserControl.js routes/browserEnrollment.js /app/routes/
COPY scripts/browser-server.js scripts/browser-worker.js scripts/browser-egress.js /app/scripts/
# Extra PG/Redis dependencies are parent-only. Worker exec has a minimal explicit env.
ENV NODE_PATH=/app/deploy/browser-runtime/node_modules BROWSER_ENABLED=0 BROWSER_PRIVATE_ENABLED=0 BROWSER_ENROLLMENT_ENABLED=0 HOME=/tmp
USER node
HEALTHCHECK NONE
ENTRYPOINT ["dumb-init", "--", "/app/scripts/capture-entrypoint.sh"]
CMD ["node", "--max-old-space-size=256", "scripts/browser-server.js"]
