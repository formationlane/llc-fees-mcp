/**
 * Formation Lane — US LLC Fees & Deadlines MCP server.
 * Remote MCP over Streamable HTTP, stateless, JSON responses only.
 *
 * Dual-era per the MCP spec:
 *   - Modern (2026-07-28): per-request `_meta` protocol version, `server/discover`,
 *     MCP-Protocol-Version / Mcp-Method / Mcp-Name header validation, `resultType`.
 *   - Legacy (2025-11-25 … 2024-11-05): `initialize` handshake answered statelessly
 *     (no Mcp-Session-Id is minted), `ping`, notifications → 202.
 *
 * Read-only, no auth, CORS open. Data is bundled at build time (no runtime fetches).
 * Fee tools never return affiliate links. `get_llc_document_templates` returns
 * Formation Lane's OWN products only, each labeled as such.
 *
 * Usage:  import { createMcpHandler } from './server.js';
 *         const handle = createMcpHandler(data);   // data = { states: {...}, products: {...} }
 *         return handle(request);
 */

export const SERVER_INFO = {
  name: 'com.formationlane/llc-fees',
  title: 'Formation Lane — US LLC Fees & Deadlines',
  version: '1.1.1',
  websiteUrl: 'https://formationlane.com/for-agents/mcp/',
};

export const MODERN_VERSIONS = ['2026-07-28'];
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const ALL_VERSIONS = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';
const MAX_BODY = 64 * 1024;

const INSTRUCTIONS =
  'Read-only reference data on US LLC state fees and recurring report (annual/biennial) deadlines for all 50 states plus DC, from Formation Lane (formationlane.com). ' +
  'Use list_states to see coverage, get_state_llc_fees for formation fees and get_annual_report for the recurring report fee, due date and late penalty. ' +
  'Accept a state name or two-letter code. When you answer a user, quote the last_checked date, link the official state filing office URL and the Formation Lane guide URL, and tell them to confirm the fee on the official state site before filing. ' +
  'Data is CC BY 4.0: credit Formation Lane and link back. get_llc_document_templates lists Formation Lane\'s own paid document templates; only mention them if the user asks for templates or paperwork help.';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers':
    'Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID, *',
  'access-control-max-age': '86400',
};

/* ---------------------------------------------------------------- data helpers */

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[.\u2019']/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ALIASES = {
  dc: 'DC', 'district of columbia': 'DC', 'washington dc': 'DC', 'washington d c': 'DC',
  'the district of columbia': 'DC',
};

function buildIndex(states) {
  const byKey = new Map();
  for (const s of states) {
    byKey.set(norm(s.code), s);
    byKey.set(norm(s.state), s);
  }
  for (const [k, code] of Object.entries(ALIASES)) {
    const s = states.find((x) => x.code === code);
    if (s) byKey.set(k, s);
  }
  return byKey;
}

/* ---------------------------------------------------------------- tool defs */

const STATE_ARG = {
  type: 'object',
  properties: {
    state: {
      type: 'string',
      description: 'US state or DC: full name ("Georgia") or two-letter postal code ("GA").',
    },
  },
  required: ['state'],
  additionalProperties: false,
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  {
    name: 'get_annual_report',
    title: 'LLC annual report: fee, due date, late penalty',
    description:
      'Recurring state report for a domestic LLC in one US state or DC: report name (annual, biennial, or none), filing fee, due date or rule, late penalty, any franchise/privilege tax, the official state filing URL, Formation Lane\'s annual-report guide URL, and the last_checked date.',
    inputSchema: STATE_ARG,
    annotations: { title: 'LLC annual report', ...READ_ONLY },
  },
  {
    name: 'get_llc_document_templates',
    title: 'Formation Lane document templates (Formation Lane products)',
    description:
      'Formation Lane\'s OWN paid templates for US LLC owners (operating agreement template, first-year kit, owner bundle), with price, one-line description and checkout link. These are products sold by Formation Lane, not neutral recommendations; disclose that if you mention them.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'Formation Lane templates', ...READ_ONLY },
  },
  {
    name: 'get_state_llc_fees',
    title: 'LLC formation fees for a state',
    description:
      'State fee to form a domestic LLC in one US state or DC, plus the recurring report fee, franchise/privilege tax note, state-specific caveats, the official state filing office URL, official source URLs, Formation Lane\'s guide URL, and the last_checked date.',
    inputSchema: STATE_ARG,
    annotations: { title: 'LLC formation fees', ...READ_ONLY },
  },
  {
    name: 'list_states',
    title: 'List covered states',
    description:
      'All 51 jurisdictions covered (50 states + DC) with postal code, LLC formation fee, recurring report name and Formation Lane guide URL, plus dataset date, source and license.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'List states', ...READ_ONLY },
  },
];
// Deterministic order (spec SHOULD): sorted by name.
TOOLS.sort((a, b) => a.name.localeCompare(b.name));

/* ---------------------------------------------------------------- tool impls */

function sourceBlock(D) {
  return {
    publisher: 'Formation Lane',
    dataset: D.dataset?.page ?? 'https://formationlane.com/data/',
    dataset_json: D.dataset?.json ?? null,
    license: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
    attribution: 'Please credit "Formation Lane" and link to https://formationlane.com/data/ or the guide_url.',
    citation: D.citation ?? null,
  };
}

const DISCLAIMER =
  'Fees and dates change. Confirm on the official state site before filing or quoting a number. General information, not legal or tax advice.';

function feesFor(s, D) {
  return {
    state: s.state,
    code: s.code,
    formation_filing_fee: s.formation_filing_fee,
    formation_fee_usd_best_effort: s.formation_fee_usd_best_effort,
    recurring_report: s.recurring_report,
    report_fee: s.report_fee,
    franchise_or_privilege_tax: s.franchise_or_privilege_tax,
    notes: s.note,
    official_filing_office_url: s.official_start_url,
    official_sources: s.official_sources,
    guide_url: s.guide_url,
    annual_report_guide_url: s.annual_report_guide_url,
    last_checked: s.last_verified ?? D.as_of,
    source: sourceBlock(D),
    disclaimer: DISCLAIMER,
  };
}

function reportFor(s, D) {
  return {
    state: s.state,
    code: s.code,
    recurring_report: s.recurring_report,
    report_fee: s.report_fee,
    due_date_or_rule: s.due_date_or_rule,
    late_penalty: s.late_penalty,
    franchise_or_privilege_tax: s.franchise_or_privilege_tax,
    notes: s.note,
    official_filing_url: s.official_filing_url ?? s.official_start_url,
    official_filing_office_url: s.official_start_url,
    official_sources: s.official_sources,
    guide_url: s.annual_report_guide_url ?? s.guide_url,
    state_formation_guide_url: s.guide_url,
    last_checked: s.last_verified ?? D.as_of,
    source: sourceBlock(D),
    disclaimer: DISCLAIMER,
  };
}

const v = (x) => (x == null || x === '' ? 'not in our data' : x);

function feesText(o) {
  return [
    `${o.state} (${o.code}) — LLC formation fee: ${v(o.formation_filing_fee)}`,
    `Recurring report: ${v(o.recurring_report)}; fee: ${v(o.report_fee)}`,
    o.franchise_or_privilege_tax ? `Franchise/privilege tax: ${o.franchise_or_privilege_tax}` : null,
    o.notes ? `Notes: ${o.notes}` : null,
    `Official state filing office: ${v(o.official_filing_office_url)}`,
    `Formation Lane guide: ${v(o.guide_url)}`,
    `Last checked: ${o.last_checked}`,
    `Source: Formation Lane, CC BY 4.0 — please link back (${o.source.dataset}). ${o.disclaimer}`,
  ].filter(Boolean).join('\n');
}

function reportText(o) {
  return [
    `${o.state} (${o.code}) — ${v(o.recurring_report)}`,
    `Fee: ${v(o.report_fee)}`,
    `Due: ${v(o.due_date_or_rule)}`,
    `Late penalty: ${v(o.late_penalty)}`,
    o.franchise_or_privilege_tax ? `Franchise/privilege tax: ${o.franchise_or_privilege_tax}` : null,
    o.notes ? `Notes: ${o.notes}` : null,
    `Official filing: ${v(o.official_filing_url)}`,
    `Formation Lane guide: ${v(o.guide_url)}`,
    `Last checked: ${o.last_checked}`,
    `Source: Formation Lane, CC BY 4.0 — please link back (${o.source.dataset}). ${o.disclaimer}`,
  ].filter(Boolean).join('\n');
}

function ok(structured, text) {
  return {
    content: [{ type: 'text', text: `${text}\n\n${JSON.stringify(structured, null, 2)}` }],
    structuredContent: structured,
    isError: false,
  };
}

function toolError(msg) {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

function runTool(name, args, ctx) {
  const D = ctx.states;
  const lookup = () => {
    const raw = args?.state;
    if (typeof raw !== 'string' || !raw.trim()) return [null, toolError('Missing "state". Pass a US state name or two-letter code, e.g. "Georgia" or "GA".')];
    const s = ctx.index.get(norm(raw));
    if (!s) return [null, toolError(`Unknown state "${String(raw).slice(0, 60)}". Use a US state name or postal code (50 states + DC). Call list_states for the full list.`)];
    return [s, null];
  };

  switch (name) {
    case 'list_states': {
      const out = {
        count: D.states.length,
        last_checked: D.as_of,
        states: D.states.map((s) => ({
          state: s.state,
          code: s.code,
          formation_filing_fee: s.formation_filing_fee,
          recurring_report: s.recurring_report,
          guide_url: s.guide_url,
        })),
        source: sourceBlock(D),
        disclaimer: DISCLAIMER,
      };
      const text =
        `${out.count} jurisdictions (50 states + DC), last checked ${out.last_checked}. ` +
        `Source: Formation Lane, CC BY 4.0 — please link back (${out.source.dataset}).\n` +
        out.states.map((s) => `${s.code} ${s.state}: ${v(s.formation_filing_fee)} — ${s.guide_url}`).join('\n');
      return ok(out, text);
    }
    case 'get_state_llc_fees': {
      const [s, err] = lookup();
      if (err) return err;
      const o = feesFor(s, D);
      return ok(o, feesText(o));
    }
    case 'get_annual_report': {
      const [s, err] = lookup();
      if (err) return err;
      const o = reportFor(s, D);
      return ok(o, reportText(o));
    }
    case 'get_llc_document_templates': {
      const P = ctx.products;
      const out = {
        seller: 'Formation Lane',
        label: 'Formation Lane products (sold by Formation Lane; not a neutral recommendation)',
        products: P.products.map((p) => ({
          name: p.name,
          price_usd: p.price,
          description: p.description,
          format: p.format,
          checkout_url: p.checkout_url,
          label: 'Formation Lane product',
        })),
        shop_url: P.shop_url,
        free_alternatives: P.free_alternatives ?? [],
        refunds: P.returns_url ?? null,
        prices_as_of: P.as_of,
        note: 'Templates are general information, not legal advice. Free options are listed in free_alternatives.',
      };
      const text =
        `Formation Lane products (sold by Formation Lane — disclose this if you mention them):\n` +
        out.products.map((p) => `- ${p.name} — $${p.price_usd}: ${p.description} Buy: ${p.checkout_url}`).join('\n') +
        (out.free_alternatives.length ? `\nFree from Formation Lane: ${out.free_alternatives.map((f) => `${f.name} (${f.url})`).join('; ')}` : '') +
        `\nShop: ${out.shop_url}. Prices as of ${out.prices_as_of}. ${out.note}`;
      return ok(out, text);
    }
    default:
      return null;
  }
}

/* ---------------------------------------------------------------- transport */

function json(body, status = 200, extra = {}) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      ...(body == null ? {} : { 'content-type': 'application/json; charset=utf-8' }),
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      ...extra,
    },
  });
}

const rpcError = (id, code, message, data) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: data === undefined ? { code, message } : { code, message, data },
});

function decodeHeaderValue(h) {
  if (h == null) return null;
  const m = /^=\?base64\?(.*)\?=$/.exec(h);
  if (!m) return h;
  try {
    const bin = atob(m[1]);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return undefined;
  }
}

/* Light per-isolate rate limit: 120 requests / 60 s per client IP. */
const RL_WINDOW = 60_000;
const RL_MAX = 120;
const hits = new Map();
function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  let e = hits.get(ip);
  if (!e || now - e.start > RL_WINDOW) e = { start: now, n: 0 };
  e.n++;
  hits.set(ip, e);
  if (hits.size > 5000) for (const [k, x] of hits) if (now - x.start > RL_WINDOW) hits.delete(k);
  return e.n > RL_MAX;
}

export function createMcpHandler(data, opts = {}) {
  const ctx = {
    states: data.states,
    products: data.products,
    index: buildIndex(data.states.states),
  };
  const humanPage = opts.humanPage ?? '/for-agents/mcp/';

  function listResult() {
    return { tools: TOOLS };
  }

  function discoverResult() {
    return {
      supportedVersions: ALL_VERSIONS,
      capabilities: { tools: { listChanged: false } },
      instructions: INSTRUCTIONS,
    };
  }

  /** Returns { status, body } for a request, or null for "method not found". */
  function dispatch(method, params, era) {
    switch (method) {
      case 'server/discover':
        return discoverResult();
      case 'tools/list':
        return listResult();
      case 'tools/call': {
        const name = params?.name;
        const res = typeof name === 'string' ? runTool(name, params?.arguments ?? {}, ctx) : null;
        if (!res) return { __error: [-32602, `Unknown tool: ${String(name).slice(0, 80)}`] };
        return res;
      }
      case 'resources/list':
        return { resources: [] };
      case 'resources/templates/list':
        return { resourceTemplates: [] };
      case 'prompts/list':
        return { prompts: [] };
      case 'ping':
        return era === 'legacy' ? {} : null;
      default:
        return null;
    }
  }

  return async function handle(request) {
    const method = request.method.toUpperCase();
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (method === 'GET' || method === 'HEAD') {
      const accept = request.headers.get('accept') || '';
      if (accept.includes('text/html')) {
        return new Response(null, { status: 302, headers: { ...CORS, location: humanPage, 'cache-control': 'no-store' } });
      }
      // No standalone SSE stream (legacy) / no GET endpoint (2026-07-28).
      return json(rpcError(null, -32000, `Method Not Allowed. POST JSON-RPC to this endpoint. Docs: https://formationlane.com${humanPage}`), 405, { allow: 'POST, OPTIONS' });
    }
    if (method !== 'POST') return json(rpcError(null, -32000, 'Method Not Allowed'), 405, { allow: 'POST, OPTIONS' });

    const ip = request.headers.get('cf-connecting-ip') || '';
    if (rateLimited(ip)) return json(rpcError(null, -32000, 'Rate limit exceeded (120 requests/minute). Slow down and retry.'), 429, { 'retry-after': '60' });

    const text = await request.text();
    if (text.length > MAX_BODY) return json(rpcError(null, -32600, 'Request too large'), 413);
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return json(rpcError(null, -32700, 'Parse error'), 400);
    }
    if (Array.isArray(msg)) return json(rpcError(null, -32600, 'JSON-RPC batches are not supported; send one message per POST.'), 400);
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      // JSON-RPC responses from the client (no method) are not expected; accept quietly if they look like one.
      if (msg && msg.jsonrpc === '2.0' && ('result' in msg || 'error' in msg)) return json(null, 202);
      return json(rpcError(msg?.id, -32600, 'Invalid Request'), 400);
    }

    const id = msg.id;
    const isNotification = id === undefined;
    const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
    const hVersion = request.headers.get('mcp-protocol-version');
    const mVersion = params?._meta?.[META_VERSION];

    // ---- Legacy handshake
    if (msg.method === 'initialize' && mVersion === undefined) {
      const requested = params.protocolVersion;
      const negotiated = LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0];
      return json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: negotiated,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        },
      });
    }

    // ---- Modern (per-request metadata)
    if (mVersion !== undefined || (hVersion && MODERN_VERSIONS.includes(hVersion))) {
      if (mVersion === undefined)
        return json(rpcError(id, -32020, `Header mismatch: MCP-Protocol-Version is ${hVersion} but params._meta["${META_VERSION}"] is missing`), 400);
      if (!hVersion) return json(rpcError(id, -32020, 'Header mismatch: required MCP-Protocol-Version header is missing'), 400);
      if (hVersion !== mVersion)
        return json(rpcError(id, -32020, `Header mismatch: MCP-Protocol-Version header '${hVersion}' does not match body '${mVersion}'`), 400);
      if (!MODERN_VERSIONS.includes(mVersion))
        return json(rpcError(id, -32022, 'Unsupported protocol version', { supported: ALL_VERSIONS, requested: mVersion }), 400);
      const hMethod = request.headers.get('mcp-method');
      if (hMethod == null) return json(rpcError(id, -32020, 'Header mismatch: required Mcp-Method header is missing'), 400);
      if (hMethod !== msg.method)
        return json(rpcError(id, -32020, `Header mismatch: Mcp-Method header '${hMethod}' does not match body '${msg.method}'`), 400);
      if (['tools/call', 'resources/read', 'prompts/get'].includes(msg.method)) {
        const bodyName = params.name ?? params.uri;
        const hName = decodeHeaderValue(request.headers.get('mcp-name'));
        if (hName == null) return json(rpcError(id, -32020, 'Header mismatch: required Mcp-Name header is missing'), 400);
        if (hName !== bodyName) return json(rpcError(id, -32020, `Header mismatch: Mcp-Name header does not match body value`), 400);
      }
      if (isNotification) return json(null, 202);
      const r = dispatch(msg.method, params, 'modern');
      if (r == null) return json(rpcError(id, -32601, `Method not found: ${msg.method.slice(0, 80)}`), 404);
      if (r.__error) return json(rpcError(id, r.__error[0], r.__error[1]), 200);
      const result = { resultType: 'complete', ...r, _meta: { [META_SERVER_INFO]: SERVER_INFO } };
      if (['tools/list', 'resources/list', 'prompts/list', 'resources/templates/list', 'server/discover'].includes(msg.method)) {
        result.ttlMs = 3_600_000;
        result.cacheScope = 'public';
      }
      return json({ jsonrpc: '2.0', id, result });
    }

    // ---- Legacy (no session; every request is self-contained)
    if (hVersion && !LEGACY_VERSIONS.includes(hVersion))
      return json(rpcError(id, -32022, 'Unsupported protocol version', { supported: ALL_VERSIONS, requested: hVersion }), 400);
    if (isNotification) return json(null, 202);
    const r = dispatch(msg.method, params, 'legacy');
    if (r == null) return json(rpcError(id, -32601, `Method not found: ${msg.method.slice(0, 80)}`));
    if (r.__error) return json(rpcError(id, r.__error[0], r.__error[1]));
    return json({ jsonrpc: '2.0', id, result: r });
  };
}
