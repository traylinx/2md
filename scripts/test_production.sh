#!/bin/bash

# Test Production Deployment of HTML2MD API
API_URL="https://api.2md.traylinx.com"
API_KEY="${SWITCHAI_API_KEY}"

echo "=========================================="
echo "Testing API Health"
echo "=========================================="
curl -s "${API_URL}/api/health" | jq .

echo -e "\n=========================================="
echo "Testing Convert (format=json)"
echo "=========================================="
curl -s -X POST "${API_URL}/api/convert" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","format":"json"}' | jq 'del(.markdown)'

echo -e "\n=========================================="
echo "Testing Agentify (Async)"
echo "=========================================="
# Testing the async agentify which should return a 202 quickly
curl -s -i -X POST "${API_URL}/api/agentify" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","async":true,"format":"json"}' | head -n 15

echo -e "\n=========================================="
echo "Testing Batch (Async)"
echo "=========================================="
curl -s -X POST "${API_URL}/api/batch" \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://example.com","https://info.cern.ch"],"async":true,"format":"json"}' | jq .

echo -e "\n=========================================="
echo "Testing Crawl (Sync, treeOnly)"
echo "=========================================="
curl -s -X POST "${API_URL}/api/crawl" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://info.cern.ch/","depth":1,"treeOnly":true,"format":"json"}' | grep -o '__JSON__{.*' | sed 's/__JSON__//' | jq .

echo -e "\n=========================================="
echo "Testing File2MD (Audio .mp3)"
echo "=========================================="
if [ -z "$API_KEY" ]; then
  echo "Skipping File2MD test: SWITCHAI_API_KEY not set"
else
  curl -s -X POST "${API_URL}/api/file2md" \
    -F "url=https://github.com/AssemblyAI-Examples/audio-examples/raw/main/20230607_me_canadian_wildfires.mp3" \
    -F "format=json" \
    -F "apiKey=${API_KEY}" | jq '{success, "files_keys": (.files | keys)}'
fi

echo -e "\n=========================================="
echo "Tests Completed"
echo "=========================================="
