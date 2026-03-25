FROM node:22-slim

RUN apt-get update && apt-get install -y \
    dumb-init \
    wget gnupg ca-certificates procps curl \
    python3 python3-pip python3-venv \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

RUN python3 -m venv venv
RUN /app/venv/bin/pip install --no-cache-dir trafilatura

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8222

HEALTHCHECK --interval=30s --timeout=5s \
    CMD curl -f http://localhost:8222/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--expose-gc", "--max-old-space-size=512", "server.js"]
