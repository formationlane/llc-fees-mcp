// Bundles the MCP server's data at build time so /mcp can never drift from the site.
// Reads dist/for-agents/us-llc-states.json (generated from the Oct 30 fee dataset) and the
// shop products (src/data/products.ts), checks each checkout URL is on the built /shop/ page,
// then writes functions/_lib/mcp-data.json. Wrangler bundles that file into functions/mcp.js on deploy.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const MCP_PRODUCT_IDS = ['operating-agreement', 'kit', 'bundle'];

export default function mcpData({ products, shopLive }) {
  return {
    name: 'fl-mcp-data',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const states = JSON.parse(await readFile(join(root, 'for-agents/us-llc-states.json'), 'utf8'));
        if (!Array.isArray(states.states) || states.states.length !== 51) throw new Error(`mcp-data: expected 51 states, got ${states.states?.length}`);
        const shopHtml = shopLive ? await readFile(join(root, 'shop/index.html'), 'utf8') : '';
        const picked = MCP_PRODUCT_IDS.map((id) => products.find((p) => p.id === id));
        for (const p of picked) {
          if (!p) throw new Error('mcp-data: product missing');
          if (!shopHtml.includes(p.checkoutUrl)) throw new Error(`mcp-data: ${p.id} checkout URL not on built /shop/ page`);
        }
        const free = products.find((p) => p.id === 'free-checklist');
        const out = {
          generated_at: new Date().toISOString(),
          states,
          products: {
            as_of: new Date().toISOString().slice(0, 10),
            shop_url: 'https://formationlane.com/shop/',
            returns_url: 'https://formationlane.com/returns/',
            products: shopLive
              ? picked.map((p) => ({ id: p.id, name: p.name, price: p.price, description: p.blurb, format: p.format, checkout_url: p.checkoutUrl }))
              : [],
            free_alternatives: [
              { name: 'Free operating agreement builder', url: 'https://formationlane.com/tools/operating-agreement-builder/' },
              ...(free ? [{ name: free.name, url: free.checkoutUrl }] : []),
            ],
          },
        };
        const target = fileURLToPath(new URL('../../functions/_lib/mcp-data.json', import.meta.url));
        await writeFile(target, JSON.stringify(out) + '\n');
        logger.info(`mcp-data: wrote ${states.states.length} states (as_of ${states.as_of}) + ${out.products.products.length} products`);
      },
    },
  };
}
