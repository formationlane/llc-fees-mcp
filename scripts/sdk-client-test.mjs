import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const c = new Client({ name: 'sdk-test', version: '1.0.0' });
await c.connect(new StreamableHTTPClientTransport(new URL(process.argv[2])));
console.log('server', c.getServerVersion?.());
const t = await c.listTools(); console.log(t.tools.map(x => x.name));
const r = await c.callTool({ name: 'get_annual_report', arguments: { state: 'CA' } }); console.log(r.content[0].text.slice(0, 400));
const r2 = await c.callTool({ name: 'list_states', arguments: {} }); console.log(r2.structuredContent.count);
await c.close();
