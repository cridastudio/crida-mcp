// Where the tools take their data from (26/11/2026): the website's own releases keep it up to date.
// Every Recursos release writes recursos/agents/mcp/crida.json (written by the website's build), the hosting syncs it
// every 20 minutes, and this file reads it: new pieces reach the server with no deploy.
// - One read per isolate and 10 minutes at most, shared by concurrent calls (one promise), through Cloudflare's cache
//   (cacheTtl 600): never more than one subrequest per call, never a call to this Worker (the address is a Recursos file,
//   not a Worker route), never an external host.
// - The copy bundled in the Worker (dades/crida.json) is the fallback: if the file is missing or broken, it stays.
// - The caps are untouched: this runs after the counter, only for calls that were counted and allowed.
import empaquetat from '../dades/crida.json';
import { fixaDades } from './eines.ts';
import type { Env } from './env.ts';

const TTL_MS = 10 * 60_000;
const ESPERA_MS = 5_000;
const MAX_BYTES = 20 * 1024 * 1024;
const LANGS = ['en', 'es', 'ca'] as const;

let origen: 'empaquetat' | 'publicat' = 'empaquetat';
let generat = String((empaquetat as { generat?: string }).generat ?? '');
let llegit = 0;
let empremta = '';
let enCurs: Promise<void> | null = null;
let darrerError = '';

/** The file has the shape the tools need (a broken or half-written file is never used). */
function valides(d: unknown): d is typeof empaquetat {
  if (!d || typeof d !== 'object') return false;
  const x = d as Record<string, Record<string, unknown> | undefined>;
  return LANGS.every((l) => x.idiomes?.[l] && Array.isArray(x.estudis?.[l]) && Array.isArray(x.pagines?.[l]) && Array.isArray(x.serveis?.[l]) && Array.isArray(x.casos?.[l]) && x.textos?.[l])
    && typeof x.fitxers === 'object' && typeof (d as { generat?: unknown }).generat === 'string';
}

async function llegeix(env: Env): Promise<void> {
  const url = env.DADES_URL;
  if (!url) return;
  try {
    const r = await fetch(url, { cf: { cacheTtl: 600, cacheEverything: true }, signal: AbortSignal.timeout(ESPERA_MS) } as RequestInit);
    if (!r.ok) { darrerError = `HTTP ${r.status}`; return; }
    if (Number(r.headers.get('content-length') ?? '0') > MAX_BYTES) { darrerError = 'too large'; return; }
    const d: unknown = await r.json();
    if (!valides(d)) { darrerError = 'invalid shape'; return; }
    // The published file is the source of truth whenever it is valid; the bundled copy is only the fallback.
    fixaDades(d); generat = d.generat; empremta = String((d as { empremta?: unknown }).empremta ?? ''); origen = 'publicat';
    darrerError = '';
  } catch (e) {
    darrerError = e instanceof Error ? e.name : 'error';
  } finally {
    llegit = Date.now();
  }
}

/** Makes sure the data are fresh: the first call of an isolate waits (5 s at most); later ones refresh in the background. */
export async function asseguraDades(env: Env, ctx: ExecutionContext): Promise<void> {
  if (Date.now() - llegit < TTL_MS) return;
  if (!enCurs) enCurs = llegeix(env).finally(() => { enCurs = null; });
  if (llegit === 0) await enCurs; else ctx.waitUntil(enCurs);
}

export const estatDades = () => ({ origen, generat, empremta: empremta || null, llegit: llegit ? new Date(llegit).toISOString() : null, error: darrerError || null });
