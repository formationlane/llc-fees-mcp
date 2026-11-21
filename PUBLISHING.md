# Official MCP Registry — publishing notes

Namespace `com.formationlane/*` is proven by HTTP domain auth:
`https://formationlane.com/.well-known/mcp-registry-auth` (served from the site's `public/.well-known/`).
Private key: kept offline by the publisher (Ed25519; never commit it). `.gitignore` excludes `*.pem` and `*.hex`.

First published: com.formationlane/llc-fees 1.1.0 on 2026-11-21 12:59 PM ET (mcp-publisher v1.8.11).

## Publish a new version
1. Bump `version` in `server.json` (and SERVER_INFO.version in src/server.js), deploy the site.
2. ```bash
   mcp-publisher validate server.json
   mcp-publisher login http --domain formationlane.com \
     --private-key-file path/to/mcp-registry-ed25519.hex
   mcp-publisher publish server.json
   curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=com.formationlane"
   ```
Binary: `mcp-publisher` from the github.com/modelcontextprotocol/registry releases.
Keep the well-known file live (200, no redirect) or future logins fail with 401.
