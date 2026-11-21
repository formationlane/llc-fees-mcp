// Standalone Cloudflare Worker entry (optional). The production server runs as a
// Pages Function on formationlane.com (see src/pages-function-mcp.js).
import data from '../data/mcp-data.json';
import { createMcpHandler } from './server.js';
const handle = createMcpHandler(data, { humanPage: 'https://formationlane.com/for-agents/mcp/' });
export default {
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname !== '/mcp' && pathname !== '/mcp/') return new Response('Not found', { status: 404 });
    return handle(request);
  },
};
