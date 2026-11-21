#!/usr/bin/env bash
# Refresh this repo from the Formation Lane site after `astro build`.
set -euo pipefail
SITE="${SITE:?set SITE to the Formation Lane site checkout}"
cp "$SITE/functions/_lib/mcp-data.json" data/mcp-data.json
cp "$SITE/functions/mcp.js" src/pages-function-mcp.js
cp "$SITE/src/integrations/mcpData.mjs" src/astro-integration-mcpData.mjs
# server.js is canonical HERE; push it to the site:
cp src/server.js "$SITE/functions/_lib/mcpServer.js"
echo synced
