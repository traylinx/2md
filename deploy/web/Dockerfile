# Supply an approved Node 22 image by immutable digest. No implicit latest tag.
ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS runtime-deps
WORKDIR /app
COPY deploy/web/runtime/package.json deploy/web/runtime/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS sentinel-deps
WORKDIR /app/deploy/capture/sentinel-sdk
COPY deploy/capture/sentinel-sdk/package.json deploy/capture/sentinel-sdk/package-lock.json deploy/capture/sentinel-sdk/traylinx-auth-client-1.1.0-rc.1.tgz ./
RUN echo '2713a86810f13e5badfd6710f39e17065bad004120ee1c450d55c3d91fba026e  traylinx-auth-client-1.1.0-rc.1.tgz' | sha256sum -c - \
    && npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS mcp-deps
WORKDIR /app/deploy/web-agent
COPY deploy/web-agent/package.json deploy/web-agent/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS read
WORKDIR /app
COPY --from=runtime-deps /app/node_modules /app/node_modules
COPY --from=sentinel-deps /app/deploy/capture/sentinel-sdk /app/deploy/capture/sentinel-sdk
COPY lib/web /app/lib/web
COPY lib/capture/errors.js lib/capture/deadline.js lib/capture/targetPolicy.js lib/capture/sentinelPrincipal.js lib/capture/resourceScope.js lib/capture/verifierTokens.js /app/lib/capture/
COPY scripts/web-read-server.js /app/scripts/web-read-server.js
USER node
ENV NODE_ENV=production WEB_READ_ENABLED=0 WEB_READ_HOST=0.0.0.0 WEB_READ_PORT=8081
EXPOSE 8081
STOPSIGNAL SIGTERM
CMD ["node", "--max-old-space-size=256", "scripts/web-read-server.js"]

FROM read AS mcp
COPY --from=mcp-deps /app/deploy/web-agent /app/deploy/web-agent
COPY scripts/web-agent-mcp.js scripts/web-agent-run.js /app/scripts/
CMD ["node", "--max-old-space-size=256", "scripts/web-agent-mcp.js"]

# Separate headless human control plane; do not mount its key/token in MCP or READ.
FROM read AS control
COPY scripts/web-control-server.js /app/scripts/web-control-server.js
ENV WEB_CONTROL_ENABLED=0 WEB_CONTROL_HOST=0.0.0.0 WEB_CONTROL_PORT=8082
EXPOSE 8082
CMD ["node", "--max-old-space-size=256", "scripts/web-control-server.js"]
