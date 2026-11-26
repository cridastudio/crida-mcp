// crida studio · public MCP server, read only, at www.crida.studio/mcp (Worker route; nothing else on the site).
// Order of every call, cheapest first, so abuse costs as little as possible:
//   1. path and method (405/404), size (413)            - no counter touched
//   2. service closed for the day/month in this isolate  - no counter touched (re-checked once a minute)
//   3. per-IP per-minute limit (rate limiting binding)   - free, approximate, per Cloudflare location
//   4. this IP already cut today in this isolate         - no counter touched
//   5. the exact counter (Durable Object): IP per day, service per day and per month
//   6. only then the body is parsed and answered from bundled data: no fetch, no self-call, no e-mail.
import { Comptador } from './comptador.ts';
import type { Env } from './env.ts';
import { atenMissatge, SERVIDOR, VERSIONS_MODERNES, VERSIONS_ANTIGUES } from './mcp.ts';
import { EINES } from './eines.ts';
import { asseguraDades, estatDades } from './dades.ts';
import { dia, ipResumida, mes, segonsFinsDema } from './topalls.ts';

export { Comptador };

const MAX_COS = 64 * 1024;

/** WebMCP (W3C draft, imperative API): a small script the website loads with defer. Only if the browser has
 *  document.modelContext, it registers four read-only tools that call this same /mcp endpoint (same data, same caps;
 *  nothing runs until an agent calls a tool). Built from the tool registry, so names and schemas never drift. No form
 *  is exposed and nothing is ever sent: prepare_quote_request only returns a draft and the contact page link. */
const WEBMCP_EINES = ['search_crida', 'list_services', 'get_prices', 'prepare_quote_request'];
const WEBMCP_JS = `/* crida studio · WebMCP (read only). Tools call https://www.crida.studio/mcp. Switch off: ?crida_webmcp=0 */
(function () {
  var mc = document.modelContext;
  if (!mc || typeof mc.registerTool !== 'function' || /[?&]crida_webmcp=0/.test(location.search)) return;
  var l = (document.documentElement.lang || 'ca').slice(0, 2), lang = l === 'es' || l === 'en' ? l : 'ca';
  var n = 0;
  function crida(nom, args, senyal) {
    var a = {}; for (var k in args || {}) a[k] = args[k];
    if (a.lang === undefined) a.lang = lang;
    var v = '2026-07-28';
    return fetch('/mcp', {
      method: 'POST', credentials: 'omit', signal: senyal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': v, 'Mcp-Method': 'tools/call', 'Mcp-Name': nom },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: nom, arguments: a, _meta: { 'io.modelcontextprotocol/protocolVersion': v, 'io.modelcontextprotocol/clientInfo': { name: 'crida-webmcp', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} } } })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error.message);
      var res = j.result || {}, text = (res.content && res.content[0] && res.content[0].text) || '';
      if (res.isError) throw new Error(text);
      return res.structuredContent || text;
    });
  }
  var eines = ${JSON.stringify(EINES.filter((e) => WEBMCP_EINES.includes(e.name)).map((e) => ({ name: e.name, title: e.title, description: e.description, inputSchema: e.inputSchema })))};
  eines.forEach(function (e) {
    try {
      var p = mc.registerTool({ name: e.name, title: e.title, description: e.description, inputSchema: e.inputSchema, annotations: { readOnlyHint: true },
        execute: function (input, opcions) { return crida(e.name, input, opcions && opcions.signal); } });
      if (p && p.catch) p.catch(function () {});
    } catch (err) {}
  });
})();
`;

/** MCP Server Card (SEP-2127, schema v1): identity, endpoint and protocol versions only, consistent with server/discover. */
const TARGETA = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
  name: 'studio.crida/mcp',
  title: SERVIDOR.title,
  version: SERVIDOR.version,
  description: 'Marketing, web and AI guides, own open data, services, prices and cases of crida studio.',
  websiteUrl: SERVIDOR.websiteUrl,
  remotes: [{ type: 'streamable-http', url: 'https://www.crida.studio/mcp', supportedProtocolVersions: [...VERSIONS_MODERNES, ...VERSIONS_ANTIGUES] }],
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

// Per isolate memory (lost when the isolate goes; it only saves counter calls, it never lets anything through).
let tancatFins = 0, motiuTancat = '';
const ipsTallades = new Map<string, string>(); // summarised IP -> Madrid day it was cut

const json = (status: number, cos: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(cos), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });
const errorRpc = (status: number, code: number, message: string, extra: Record<string, string> = {}) =>
  json(status, { jsonrpc: '2.0', error: { code, message } }, extra);

const MISSATGE_TOPALL: Record<string, string> = {
  ip: 'Daily limit for this address reached. Try again tomorrow (Madrid time), or read https://www.crida.studio/en/insights/llms.txt.',
  dia: 'This server has reached its daily limit. Try again tomorrow (Madrid time), or read https://www.crida.studio/en/insights/llms.txt.',
  mes: 'This server has reached its monthly limit. Try again next month, or read https://www.crida.studio/en/insights/llms.txt.',
  minut: 'Too many requests from this address in the last minute. Wait a minute.',
};

async function llegeixCos(req: Request): Promise<string | null> {
  const declarat = Number(req.headers.get('content-length') ?? '0');
  if (declarat > MAX_COS) return null;
  const lector = req.body?.getReader();
  if (!lector) return '';
  const trossos: Uint8Array[] = [];
  let mida = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    mida += value.byteLength;
    if (mida > MAX_COS) { await lector.cancel(); return null; }
    trossos.push(value);
  }
  const tot = new Uint8Array(mida);
  let o = 0;
  for (const t of trossos) { tot.set(t, o); o += t.byteLength; }
  return new TextDecoder().decode(tot);
}

async function estat(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Public counter, cached 60 s per location: at most one counter read per location and minute.
  const clau = new Request(new URL('/mcp/estat', req.url).toString());
  const desat = await caches.default.match(clau);
  if (desat) return desat;
  const e = await env.COMPTADOR.getByName('global').estat(dia(), mes());
  const r = json(200, { servei: 'crida studio MCP', ...e, dades: estatDades(), actualitzat: new Date().toISOString() }, { 'Cache-Control': 'public, max-age=60' });
  ctx.waitUntil(caches.default.put(clau, r.clone()));
  return r;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const cami = url.pathname.replace(/\/+$/, '') || '/';
    if (cami === '/mcp/estat') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', ...CORS } });
      if (!env.IP_SAL) return errorRpc(503, -32603, 'Server not configured');
      const ip = await ipResumida(req, env.IP_SAL);
      if (!(await env.PER_MINUT.limit({ key: ip.clau })).success) return errorRpc(429, -32029, MISSATGE_TOPALL.minut!, { 'Retry-After': '60' });
      return estat(req, env, ctx);
    }
    if (cami === '/mcp/server-card' || cami === '/.well-known/mcp/server-card.json' || cami === '/.well-known/mcp/server-card') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', ...CORS } });
      return new Response(JSON.stringify(TARGETA, null, 1), {
        headers: { 'Content-Type': 'application/mcp-server-card+json', 'Cache-Control': 'public, max-age=3600', ...CORS },
      });
    }
    if (cami === '/mcp/webmcp.js') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
      return new Response(WEBMCP_JS, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
    }
    if (cami !== '/mcp') return new Response('Not found', { status: 404 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return errorRpc(405, -32600, 'Method not allowed: this MCP endpoint accepts POST only (no GET stream).', { Allow: 'POST, OPTIONS' });
    if (!env.IP_SAL) return errorRpc(503, -32603, 'Server not configured');

    const ara = Date.now();
    if (tancatFins > ara) return errorRpc(429, -32029, MISSATGE_TOPALL[motiuTancat] ?? MISSATGE_TOPALL.dia!, { 'Retry-After': String(segonsFinsDema()) });

    const ip = await ipResumida(req, env.IP_SAL);
    if (!(await env.PER_MINUT.limit({ key: ip.clau })).success) return errorRpc(429, -32029, MISSATGE_TOPALL.minut!, { 'Retry-After': '60' });
    const avui = dia();
    if (ipsTallades.get(ip.resum) === avui) return errorRpc(429, -32029, MISSATGE_TOPALL.ip!, { 'Retry-After': String(segonsFinsDema()) });

    const d = await env.COMPTADOR.getByName('global').compta(ip.resum, avui, mes());
    if (!d.ok) {
      if (d.motiu === 'ip') { if (ipsTallades.size > 5000) ipsTallades.clear(); ipsTallades.set(ip.resum, avui); }
      else { tancatFins = ara + 60_000; motiuTancat = d.motiu ?? 'dia'; }
      return errorRpc(429, -32029, MISSATGE_TOPALL[d.motiu ?? 'dia']!, { 'Retry-After': String(segonsFinsDema()) });
    }

    const text = await llegeixCos(req);
    if (text === null) return errorRpc(413, -32600, `Request too large (max ${MAX_COS} bytes)`);
    let missatge: unknown;
    try { missatge = JSON.parse(text); } catch { return errorRpc(400, -32700, 'Parse error'); }
    try {
      await asseguraDades(env, ctx);
      const r = await atenMissatge(missatge as never, req.headers);
      return r.cos === undefined ? new Response(null, { status: r.status, headers: CORS }) : json(r.status, r.cos);
    } catch {
      return errorRpc(500, -32603, 'Internal error');
    }
  },
} satisfies ExportedHandler<Env>;
