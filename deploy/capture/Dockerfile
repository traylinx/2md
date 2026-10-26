# Extend the EXACT deployed runtime. No dependency upgrade or legacy rebuild.
ARG BASE_IMAGE=ghcr.io/traylinx/2md@sha256:acdbc7229c7f427bcb705527ad446cde7365af5e7e4eb459f9ea7d285a78ccba
FROM ${BASE_IMAGE} AS sentinel-dependencies
USER root
WORKDIR /opt/capture-sentinel
COPY deploy/capture/sentinel-sdk/package.json deploy/capture/sentinel-sdk/package-lock.json deploy/capture/sentinel-sdk/traylinx-auth-client-1.1.0-rc.1.tgz ./
RUN echo '2713a86810f13e5badfd6710f39e17065bad004120ee1c450d55c3d91fba026e  traylinx-auth-client-1.1.0-rc.1.tgz' | sha256sum -c - \
    && npm ci --omit=dev --ignore-scripts --no-audit --no-fund
FROM ${BASE_IMAGE}
ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/traylinx/2md" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
COPY --from=sentinel-dependencies /opt/capture-sentinel /app/deploy/capture/sentinel-sdk
COPY lib/capture /app/lib/capture
COPY routes/capture.js /app/routes/capture.js
COPY scripts/capture-server.js scripts/capture-worker.js scripts/capture-egress.js scripts/capture-frontend.js /app/scripts/
COPY --chmod=755 scripts/capture-entrypoint.sh /app/scripts/capture-entrypoint.sh
USER node
ENV HOME=/tmp
HEALTHCHECK NONE
ENTRYPOINT ["dumb-init", "--", "/app/scripts/capture-entrypoint.sh"]
CMD ["node", "--max-old-space-size=256", "scripts/capture-server.js"]
