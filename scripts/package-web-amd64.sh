#!/usr/bin/env bash
set -euo pipefail
# Local packaging only. No registry push, credentials, migrations or deployment.
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
[[ "$(docker info --format '{{.Architecture}}')" == x86_64 ]] || { echo 'Native AMD64 Docker engine required'; exit 1; }
revision=$(git rev-parse HEAD)
base=node@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
stage=$(mktemp -d /tmp/web-amd64-package.XXXXXX)
cleanup(){ rm -rf "$stage"; }
trap cleanup EXIT
# Only committed, explicitly needed paths enter the build context.
git archive "$revision" deploy/web/Dockerfile deploy/web/runtime deploy/web-agent/package.json deploy/web-agent/package-lock.json \
 deploy/capture/sentinel-sdk/package.json deploy/capture/sentinel-sdk/package-lock.json deploy/capture/sentinel-sdk/traylinx-auth-client-1.1.0-rc.1.tgz \
 lib/web lib/capture/errors.js lib/capture/deadline.js lib/capture/targetPolicy.js lib/capture/sentinelPrincipal.js lib/capture/verifierTokens.js \
 scripts/web-read-server.js scripts/web-control-server.js scripts/web-agent-mcp.js scripts/web-agent-run.js tests/web/image-smoke.cjs | tar xf - -C "$stage"
gitleaks dir "$stage" --no-banner --redact
printf 'SOURCE_REVISION=%s\nBASE=%s\n' "$revision" "$base"
for role in read control mcp; do
 image="traylinx-web-$role:amd64-${revision:0:12}"
 docker build --platform linux/amd64 --file "$stage/deploy/web/Dockerfile" --target "$role" \
  --build-arg "NODE_IMAGE=$base" --label "org.opencontainers.image.revision=$revision" --tag "$image" "$stage"
 [[ "$(docker image inspect "$image" --format '{{.Architecture}}')" == amd64 ]]
 docker image inspect "$image" --format '{{.Id}} {{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
 docker run --rm --network none --read-only --cpus 1 --memory 384m --pids-limit 96 \
  --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,size=16m \
  --mount "type=bind,source=$stage/tests/web/image-smoke.cjs,target=/test/image-smoke.cjs,readonly" \
  --entrypoint node "$image" /test/image-smoke.cjs "$role"
done
