/**
 * /mcp — Formation Lane public MCP server (US LLC fees & annual-report deadlines).
 * Streamable HTTP, stateless, read-only, CORS open. Code: functions/_lib/mcpServer.js
 * (canonical copy: src/server.js in github.com/formationlane/llc-fees-mcp). Data: functions/_lib/mcp-data.json,
 * written at `astro build` by src/integrations/mcpData.mjs from the same dataset as
 * /for-agents/us-llc-states.json and /downloads/llc-fees-by-state-2026-2027.json.
 * Human docs: /for-agents/mcp/
 */
import data from './_lib/mcp-data.json';
import { createMcpHandler } from './_lib/mcpServer.js';

const handle = createMcpHandler(data, { humanPage: '/for-agents/mcp/' });

export const onRequest = ({ request }) => handle(request);
