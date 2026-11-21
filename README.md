# Formation Lane MCP server: US LLC fees & annual-report deadlines

Free, public, read-only [MCP](https://modelcontextprotocol.io/) server.

- Endpoint: `https://formationlane.com/mcp` (Streamable HTTP, stateless, JSON responses, no auth, CORS open)
- Docs: https://formationlane.com/for-agents/mcp/
- Official MCP Registry: `com.formationlane/llc-fees`
- Protocol: 2026-07-28 (per-request `_meta`, `server/discover`, header validation) and legacy `initialize` (2025-11-25 → 2024-11-05)

## Tools
| Tool | Returns |
|---|---|
| `list_states` | 51 jurisdictions (50 states + DC), formation fee, report name, guide URL |
| `get_state_llc_fees(state)` | formation fee, report fee, franchise/privilege tax, notes, official filing office + sources, guide URL, last_checked |
| `get_annual_report(state)` | report name, fee, due date/rule, late penalty, official filing URL, guide URL, last_checked |
| `get_llc_document_templates` | Formation Lane's own paid templates ($19 operating agreement, $19 first-year kit, $39 bundle), labeled as Formation Lane products, plus free alternatives |

The fee tools contain no affiliate links. Data: the Formation Lane "LLC Fees and Deadlines by State (2026–2027)" dataset, https://formationlane.com/data/ (CC BY 4.0).

## Connect
- Claude: Settings → Connectors → Add custom connector → `https://formationlane.com/mcp`
- Claude Code: `claude mcp add --transport http formation-lane https://formationlane.com/mcp`
- Cursor (`.cursor/mcp.json`): `{"mcpServers":{"formation-lane":{"url":"https://formationlane.com/mcp"}}}`
- VS Code (`.vscode/mcp.json`): `{"servers":{"formation-lane":{"type":"http","url":"https://formationlane.com/mcp"}}}`

## Try it
```bash
curl -s https://formationlane.com/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_annual_report","arguments":{"state":"GA"}}}'
```

## Layout
- `src/server.js` — transport + tools (canonical; copied to the site as `functions/_lib/mcpServer.js`)
- `src/pages-function-mcp.js` — the Cloudflare Pages Function at `/mcp`
- `src/astro-integration-mcpData.mjs` — writes `mcp-data.json` at `astro build` from the same dataset as `/for-agents/us-llc-states.json`, and checks each checkout URL is on the built /shop/ page
- `src/worker.js` — optional standalone Worker entry
- `data/mcp-data.json` — snapshot of the bundled data
- `server.json` — official MCP Registry manifest
- `scripts/` — local smoke test, SDK client test, sync script

Fees change; confirm on the official state site before filing. General information, not legal or tax advice.
