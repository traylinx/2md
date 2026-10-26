# Preserve the qualified runtime and dependency tree; no apt/npm install.
# The workflow verifies the source package-lock.json matches this base.
FROM ghcr.io/traylinx/2md@sha256:acdbc7229c7f427bcb705527ad446cde7365af5e7e4eb459f9ea7d285a78ccba
WORKDIR /app
COPY . .
ARG SOURCE_REVISION
RUN printf '%s' "$SOURCE_REVISION" | grep -Eq '^[a-f0-9]{40}$' \
    && printf '%s\n' "$SOURCE_REVISION" > /app/.release-revision
LABEL org.opencontainers.image.source="https://github.com/traylinx/2md" \
      org.opencontainers.image.revision=$SOURCE_REVISION
