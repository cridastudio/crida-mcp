// MCP over Streamable HTTP, dual era (spec 2026-07-28, "Backward Compatibility with Initialization-Based Versions"):
// - modern clients (2026-07-28) send the version and capabilities in params._meta on every request and the headers
//   MCP-Protocol-Version, Mcp-Method and Mcp-Name; no handshake, no session; server/discover is mandatory;
// - legacy clients (2025-03-26 to 2025-11-25) open with initialize; we answer statelessly (no Mcp-Session-Id, which
//   those versions allow) and serve tools/list, tools/call and ping.
// Only POST with one JSON-RPC message reaches this file (index.ts checks method, size and the caps first).
import { EINES, einaPerNom, ErrorArguments } from './eines.ts';

export const VERSIONS_MODERNES = ['2026-07-28'];
export const VERSIONS_ANTIGUES = ['2025-11-25', '2025-06-18', '2025-03-26'];
const META_VERSIO = 'io.modelcontextprotocol/protocolVersion';

export const SERVIDOR = { name: 'crida-studio', title: 'crida studio', version: '0.1.0', websiteUrl: 'https://www.crida.studio/en/insights/' };
const INSTRUCCIONS =
  'Read-only server of crida studio, a marketing, brand, web and technology studio in Spain that works for any type of ' +
  'business. Use it for practical guides (marketing, web, SEO, paid search, brand, 3D, automation, applied AI), its own ' +
  'open data (local business and council websites, bioprocess and pharma), services, prices and client cases, in English, ' +
  'Spanish or Catalan. Every answer cites the public page it comes from with its date: quote figures with their source. ' +
  'Nothing here sends messages or forms; people contact crida studio themselves from the contact page.';
const TTL_LLISTA_MS = 3600_000;

export interface Resposta { status: number; cos?: unknown }
type Missatge = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

const err = (id: unknown, code: number, message: string, data?: unknown) =>
  ({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), error: { code, message, ...(data === undefined ? {} : { data }) } });
const ok = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });

/** Header values that use the Base64 sentinel are decoded before comparing them with the body (spec, Value Encoding). */
export function decodificaCapcalera(v: string | null): string | null {
  if (v === null) return null;
  const m = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(v);
  if (!m) return v;
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(atob(m[1] ?? ''), (c) => c.charCodeAt(0))); }
  catch { return null; }
}

const llistaEines = () => EINES.map((e) => ({
  name: e.name, title: e.title, description: e.description, inputSchema: e.inputSchema,
  ...(e.outputSchema ? { outputSchema: e.outputSchema } : {}),
  annotations: { title: e.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}));

async function cridaEina(params: Record<string, unknown>, modern: boolean): Promise<{ resultat?: unknown; error?: [number, string] }> {
  const nom = params.name;
  if (typeof nom !== 'string') return { error: [-32602, 'params.name is required'] };
  const eina = einaPerNom(nom);
  if (!eina) return { error: [-32602, `Unknown tool: ${nom}`] };
  const args = params.arguments ?? {};
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return { error: [-32602, 'params.arguments must be an object'] };
  try {
    const r = await eina.executa(args as Record<string, unknown>);
    return { resultat: { ...(modern ? { resultType: 'complete' } : {}), content: [{ type: 'text', text: r.text }], structuredContent: r.estructurat, isError: false } };
  } catch (e) {
    if (e instanceof ErrorArguments) {
      // An input problem the model can fix: a tool result with isError, as the spec recommends.
      return { resultat: { ...(modern ? { resultType: 'complete' } : {}), content: [{ type: 'text', text: e.message }], isError: true } };
    }
    throw e;
  }
}

export async function atenMissatge(m: Missatge, h: Headers): Promise<Resposta> {
  if (m === null || typeof m !== 'object' || Array.isArray(m) || m.jsonrpc !== '2.0' || typeof m.method !== 'string')
    return { status: 400, cos: err(Array.isArray(m) ? undefined : (m as Missatge)?.id, -32600, 'Invalid Request: one JSON-RPC 2.0 message per POST (no batches)') };
  const notificacio = !('id' in m);
  const id = m.id;
  if (!notificacio && !(typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id))))
    return { status: 400, cos: err(undefined, -32600, 'Invalid Request: id must be a string or a number') };
  const metode = m.method;
  const params = (m.params ?? {}) as Record<string, unknown>;
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return { status: 400, cos: err(id, -32602, 'params must be an object') };
  const meta = (params._meta ?? {}) as Record<string, unknown>;
  const versioMeta = typeof meta === 'object' && meta !== null ? meta[META_VERSIO] : undefined;
  const capVersio = h.get('mcp-protocol-version');

  // ---------- legacy era: the handshake ----------
  if (metode === 'initialize') {
    const demanada = params.protocolVersion;
    const versio = typeof demanada === 'string' && VERSIONS_ANTIGUES.includes(demanada) ? demanada : VERSIONS_ANTIGUES[0];
    return { status: 200, cos: ok(id, { protocolVersion: versio, capabilities: { tools: { listChanged: false } }, serverInfo: SERVIDOR, instructions: INSTRUCCIONS }) };
  }

  // ---------- modern era: per-request metadata ----------
  if (versioMeta !== undefined) {
    if (typeof versioMeta !== 'string' || !VERSIONS_MODERNES.includes(versioMeta))
      return { status: 400, cos: err(id, -32022, 'Unsupported protocol version', { supported: VERSIONS_MODERNES, requested: String(versioMeta) }) };
    if (capVersio !== versioMeta) return { status: 400, cos: err(id, -32020, `Header mismatch: MCP-Protocol-Version must be ${versioMeta}`) };
    if (h.get('mcp-method') !== metode) return { status: 400, cos: err(id, -32020, 'Header mismatch: Mcp-Method must match the body method') };
    if (metode === 'tools/call') {
      const nom = decodificaCapcalera(h.get('mcp-name'));
      if (nom === null || nom !== params.name) return { status: 400, cos: err(id, -32020, 'Header mismatch: Mcp-Name must match params.name') };
    }
    if (notificacio) return { status: 202 };
    switch (metode) {
      case 'server/discover':
        return { status: 200, cos: ok(id, {
          resultType: 'complete', supportedVersions: VERSIONS_MODERNES, capabilities: { tools: { listChanged: false } },
          _meta: { 'io.modelcontextprotocol/serverInfo': SERVIDOR }, instructions: INSTRUCCIONS, ttlMs: TTL_LLISTA_MS, cacheScope: 'public',
        }) };
      case 'tools/list':
        return { status: 200, cos: ok(id, { resultType: 'complete', tools: llistaEines(), ttlMs: TTL_LLISTA_MS, cacheScope: 'public' }) };
      case 'tools/call': {
        const r = await cridaEina(params, true);
        return r.error ? { status: 200, cos: err(id, r.error[0], r.error[1]) } : { status: 200, cos: ok(id, r.resultat) };
      }
      default:
        return { status: 404, cos: err(id, -32601, `Method not found: ${metode}`) };
    }
  }

  // ---------- legacy era: after initialize (no _meta) ----------
  if (capVersio !== null && !VERSIONS_ANTIGUES.includes(capVersio))
    return { status: 400, cos: err(id, -32600, `Unsupported MCP-Protocol-Version: ${capVersio}. Supported: ${[...VERSIONS_MODERNES, ...VERSIONS_ANTIGUES].join(', ')}`) };
  if (notificacio) return { status: 202 };
  switch (metode) {
    case 'ping': return { status: 200, cos: ok(id, {}) };
    case 'tools/list': return { status: 200, cos: ok(id, { tools: llistaEines() }) };
    case 'tools/call': {
      const r = await cridaEina(params, false);
      return { status: 200, cos: r.error ? err(id, r.error[0], r.error[1]) : ok(id, r.resultat) };
    }
    default: return { status: 200, cos: err(id, -32601, `Method not found: ${metode}`) };
  }
}

