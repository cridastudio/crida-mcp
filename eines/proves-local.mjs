// Local tests of the MCP server against `wrangler dev` (never production). Each scenario starts its own wrangler dev
// with fresh state and low caps passed with --var, so the caps can be reached in a few calls.
// Usage: node eines/proves-local.mjs           (all scenarios)  ·  node eines/proves-local.mjs protocol
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Content rules live in a private file (eines/regles.local.json). Without it, the checks that need them are skipped.
const REGLES = existsSync(join(ARREL, 'eines/regles.local.json')) ? JSON.parse(readFileSync(join(ARREL, 'eines/regles.local.json'), 'utf8')) : null;
const EXCLOSA = REGLES ? new RegExp(REGLES.empresa_excloure) : null;
const PROVEIDORS = REGLES ? new RegExp(REGLES.proveidors_ona, 'i') : null;
const PORT = 8799, BASE = `http://127.0.0.1:${PORT}`;
let fallades = 0, passades = 0;
const comprova = (nom, cond, detall = '') => {
  if (cond) { passades++; console.log(`  ok   ${nom}`); }
  else { fallades++; console.log(`  FAIL ${nom} ${detall}`); }
};

async function arrenca(vars) {
  const estat = mkdtempSync(join(tmpdir(), 'crida-mcp-'));
  const args = ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', estat, '--log-level', 'error'];
  // The tests never read the network: no published data file, the bundled copy only (unless a scenario sets DADES_URL).
  for (const [k, v] of Object.entries({ DADES_URL: '', ...vars })) args.push('--var', `${k}:${v}`);
  const p = spawn('npx', args, { cwd: ARREL, stdio: ['ignore', 'pipe', 'pipe'] });
  let sortida = '';
  p.stdout.on('data', (d) => { sortida += d; });
  p.stderr.on('data', (d) => { sortida += d; });
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { const r = await fetch(`${BASE}/res`); if (r.status === 404) return { p, estat }; } catch {}
  }
  p.kill(); throw new Error('wrangler dev did not start:\n' + sortida.slice(-2000));
}
async function atura({ p, estat }) {
  p.kill('SIGINT');
  await new Promise((r) => setTimeout(r, 1500));
  try { p.kill('SIGKILL'); } catch {}
  rmSync(estat, { recursive: true, force: true });
}

let n = 0;
/** One MCP call. modern=true adds _meta and the three headers; ip goes in CF-Connecting-IP (honoured by wrangler dev). */
async function crida(method, params = {}, { modern = true, ip = '198.51.100.1', notif = false, headers = {}, versio = '2026-07-28' } = {}) {
  const cos = { jsonrpc: '2.0', method, params: { ...params } };
  if (!notif) cos.id = ++n;
  const h = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'CF-Connecting-IP': ip, ...headers };
  if (modern) {
    cos.params._meta = { 'io.modelcontextprotocol/protocolVersion': versio, 'io.modelcontextprotocol/clientInfo': { name: 'proves-local', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} };
    h['MCP-Protocol-Version'] ??= versio;
    h['Mcp-Method'] ??= method;
    if (method === 'tools/call') h['Mcp-Name'] ??= params.name;
  }
  const r = await fetch(`${BASE}/mcp`, { method: 'POST', headers: h, body: JSON.stringify(cos) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch {}
  return { status: r.status, j, text, retry: r.headers.get('retry-after') };
}

async function protocol() {
  console.log('\n[protocol] caps high, one IP');
  const s = await arrenca({ TOPALL_IP_DIA: 1000, TOPALL_DIA: 1000, TOPALL_MES: 1000 });
  try {
    comprova('GET /mcp is 405', (await fetch(`${BASE}/mcp`)).status === 405);
    for (const cami of ['/mcp/server-card', '/.well-known/mcp/server-card.json']) {
      const c = await fetch(`${BASE}${cami}`);
      const j = await c.json().catch(() => ({}));
      comprova(`server card at ${cami}`, c.status === 200 && c.headers.get('content-type') === 'application/mcp-server-card+json' && j.name === 'studio.crida/mcp' && j.remotes?.[0]?.url === 'https://www.crida.studio/mcp' && j.description.length <= 100 && j.remotes[0].supportedProtocolVersions.includes('2026-07-28'), JSON.stringify(j));
    }
    comprova('other path is 404', (await fetch(`${BASE}/mcpx`)).status === 404);
    comprova('OPTIONS is 204 with CORS', (await fetch(`${BASE}/mcp`, { method: 'OPTIONS' })).headers.get('access-control-allow-origin') === '*');
    let r = await crida('server/discover');
    comprova('modern server/discover', r.status === 200 && r.j?.result?.supportedVersions?.[0] === '2026-07-28' && r.j.result.resultType === 'complete' && r.j.result.cacheScope === 'public', r.text);
    r = await crida('tools/list');
    comprova('modern tools/list', r.status === 200 && r.j?.result?.tools?.[0]?.name === 'about_crida' && r.j.result.tools.every((t) => t.annotations.readOnlyHint === true) && typeof r.j.result.ttlMs === 'number' && r.j.result.tools[0].annotations.readOnlyHint === true, r.text);
    r = await crida('tools/call', { name: 'about_crida', arguments: { lang: 'es' } });
    const t = r.j?.result?.content?.[0]?.text ?? '';
    comprova('modern tools/call (es) answers with sources and dates, in Spanish', r.status === 200 && r.j.result.resultType === 'complete' && t.includes('Fuentes:') && /actualizado 20\d\d-\d\d-\d\d/.test(t) && r.j.result.structuredContent.sources.length >= 1, r.text);
    comprova('answer is in Spanish data', t.includes('/es/recursos/'), t.slice(0, 200));
    r = await crida('tools/call', { name: 'about_crida', arguments: { lang: 'fr' } });
    comprova('bad argument is a tool error the model can fix', r.status === 200 && r.j?.result?.isError === true, r.text);
    r = await crida('tools/call', { name: 'nope', arguments: {} });
    comprova('unknown tool is -32602', r.j?.error?.code === -32602, r.text);
    r = await crida('tools/list', {}, { headers: { 'Mcp-Method': 'tools/call' } });
    comprova('Mcp-Method mismatch is 400 -32020', r.status === 400 && r.j?.error?.code === -32020, r.text);
    r = await crida('tools/call', { name: 'about_crida', arguments: {} }, { headers: { 'Mcp-Name': 'other' } });
    comprova('Mcp-Name mismatch is 400 -32020', r.status === 400 && r.j?.error?.code === -32020, r.text);
    r = await crida('tools/call', { name: 'about_crida', arguments: {} }, { headers: { 'Mcp-Name': '=?base64?' + Buffer.from('about_crida').toString('base64') + '?=' } });
    comprova('Mcp-Name in Base64 sentinel is accepted', r.status === 200 && !r.j?.error, r.text);
    r = await crida('tools/list', {}, { headers: { 'MCP-Protocol-Version': '2025-06-18' } });
    comprova('MCP-Protocol-Version header ≠ _meta is 400 -32020', r.status === 400 && r.j?.error?.code === -32020, r.text);
    r = await crida('tools/list', {}, { versio: '2099-01-01' });
    comprova('unknown version is 400 -32022 with the supported list', r.status === 400 && r.j?.error?.code === -32022 && r.j.error.data.supported[0] === '2026-07-28', r.text);
    r = await crida('resources/list');
    comprova('unknown modern method is 404 -32601', r.status === 404 && r.j?.error?.code === -32601, r.text);
    // legacy era
    r = await crida('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'legacy', version: '1' } }, { modern: false });
    comprova('legacy initialize negotiates 2025-06-18', r.status === 200 && r.j?.result?.protocolVersion === '2025-06-18' && r.j.result.serverInfo.name === 'crida-studio', r.text);
    r = await crida('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'old', version: '1' } }, { modern: false });
    comprova('legacy initialize with an old version gets 2025-11-25', r.j?.result?.protocolVersion === '2025-11-25', r.text);
    r = await crida('notifications/initialized', {}, { modern: false, notif: true, headers: { 'MCP-Protocol-Version': '2025-06-18' } });
    comprova('legacy notification is 202', r.status === 202, r.text);
    r = await crida('tools/list', {}, { modern: false, headers: { 'MCP-Protocol-Version': '2025-06-18' } });
    comprova('legacy tools/list', r.status === 200 && r.j?.result?.tools?.length === 12 && r.j.result.resultType === undefined, r.text);
    r = await crida('tools/call', { name: 'about_crida', arguments: { lang: 'ca' } }, { modern: false, headers: { 'MCP-Protocol-Version': '2025-06-18' } });
    comprova('legacy tools/call (ca)', r.status === 200 && (r.j?.result?.content?.[0]?.text ?? '').includes('/recursos/'), r.text);
    r = await crida('ping', {}, { modern: false });
    comprova('legacy ping without version header', r.status === 200 && r.j?.result && Object.keys(r.j.result).length === 0, r.text);
    // malformed input
    let x = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[{"jsonrpc":"2.0","id":1,"method":"ping"}]' });
    comprova('batch is rejected 400', x.status === 400);
    x = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' });
    comprova('parse error is 400 -32700', x.status === 400 && (await x.json()).error.code === -32700);
    x = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(70000) } }) });
    comprova('body over 64 KB is 413', x.status === 413);
    // our own test calls (27/11/2026): the right X-Crida-Prova counts apart, a wrong one counts as an ordinary call
    const ping = { jsonrpc: '2.0', id: 99, method: 'ping' };
    await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Crida-Prova': 'prova-local-27-11' }, body: JSON.stringify(ping) });
    await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Crida-Prova': 'no-es-la-clau' }, body: JSON.stringify(ping) });
    x = await fetch(`${BASE}/mcp/estat`);
    const e = await x.json();
    comprova('counter is visible at /mcp/estat', x.status === 200 && e.avui.crides === 22 && e.avui.topall === 1000, JSON.stringify(e));
    comprova('our test calls are counted apart (only the right key)', e.avui.proves === 1 && e.mes_actual.proves === 1, JSON.stringify(e));
  } finally { await atura(s); }
}

async function topallIpIDia() {
  console.log('\n[caps] 5 per IP, 8 per day');
  const s = await arrenca({ TOPALL_IP_DIA: 5, TOPALL_DIA: 8, TOPALL_MES: 1000 });
  try {
    const a = [];
    for (let i = 0; i < 6; i++) a.push((await crida('tools/list', {}, { ip: '203.0.113.10' })).status);
    comprova('IP A: 5 calls go through, the 6th is 429', a.slice(0, 5).every((x) => x === 200) && a[5] === 429, a.join(','));
    let r = await crida('tools/list', {}, { ip: '203.0.113.10' });
    comprova('IP A stays cut (429 with Retry-After)', r.status === 429 && Number(r.retry) >= 60, `${r.status} ${r.retry}`);
    const b = [];
    for (let i = 0; i < 4; i++) b.push((await crida('tools/list', {}, { ip: '203.0.113.20' })).status);
    comprova('IP B: 3 calls fill the day (8), the 4th is 429', b.slice(0, 3).every((x) => x === 200) && b[3] === 429, b.join(','));
    r = await crida('tools/list', {}, { ip: '203.0.113.30' });
    comprova('a new IP C is refused too: the day is full', r.status === 429 && r.text.includes('daily limit'), r.text);
    r = await crida('tools/list', {}, { ip: '2001:db8:1:2:aaaa::1' });
    const r2 = await crida('tools/list', {}, { ip: '2001:db8:1:2:bbbb::2' });
    comprova('day stays closed for IPv6 too', r.status === 429 && r2.status === 429);
    const e = await (await fetch(`${BASE}/mcp/estat`)).json();
    comprova('counter: 8 calls, 1 IP cut, refusals counted', e.avui.crides === 8 && e.avui.ips_tallades >= 1 && e.avui.rebutjades >= 2, JSON.stringify(e));
  } finally { await atura(s); }
}

async function topallMes() {
  console.log('\n[caps] 3 per month');
  const s = await arrenca({ TOPALL_IP_DIA: 100, TOPALL_DIA: 100, TOPALL_MES: 3 });
  try {
    const a = [];
    for (let i = 0; i < 4; i++) a.push((await crida('tools/list', {}, { ip: `192.0.2.${i + 1}` })).status);
    comprova('3 calls from 3 IPs go through, the 4th is 429 (month)', a.slice(0, 3).every((x) => x === 200) && a[3] === 429, a.join(','));
    const r = await crida('server/discover', {}, { ip: '192.0.2.99' });
    comprova('the month message is given', r.status === 429 && r.text.includes('monthly limit'), r.text);
  } finally { await atura(s); }
}

async function topallMinut() {
  console.log('\n[caps] 60 per IP per minute (rate limiting binding)');
  const s = await arrenca({ TOPALL_IP_DIA: 1000, TOPALL_DIA: 1000, TOPALL_MES: 1000 });
  try {
    const st = [];
    for (let i = 0; i < 65; i++) st.push((await crida('ping', {}, { modern: false, ip: '198.51.100.77' })).status);
    const primer429 = st.indexOf(429);
    comprova('the per-minute limit cuts after about 60', primer429 >= 55 && primer429 <= 61, `first 429 at call ${primer429 + 1}`);
    const e = await (await fetch(`${BASE}/mcp/estat`)).json();
    comprova('calls cut by the minute limit never reach the counter', e.avui.crides === primer429, JSON.stringify(e.avui));
  } finally { await atura(s); }
}

async function dadesObertes() {
  console.log('\n[phase b] open data tools');
  const s = await arrenca({ TOPALL_IP_DIA: 1000, TOPALL_DIA: 1000, TOPALL_MES: 1000 });
  try {
    const call = (name, args) => crida('tools/call', { name, arguments: args });
    let r = await crida('tools/list');
    comprova('tools/list has the 12 tools in a fixed order', JSON.stringify(r.j?.result?.tools?.map((t) => t.name)) === JSON.stringify(['about_crida', 'search_crida', 'read_page', 'list_open_datasets', 'get_open_dataset', 'read_open_data_file', 'list_services', 'get_service', 'get_prices', 'list_cases', 'get_case', 'prepare_quote_request']), r.text.slice(0, 300));
    r = await call('list_open_datasets', { lang: 'es' });
    comprova('list in Spanish: 22 datasets with sources', r.j?.result?.structuredContent?.count === 22 && r.j.result.content[0].text.includes('Fuentes:'), r.text.slice(0, 300));
    r = await call('list_open_datasets', { lang: 'en', query: 'antibody' });
    const n = r.j?.result?.structuredContent?.count ?? 0;
    comprova('query "antibody" narrows the list', n >= 2 && n < 22, String(n));
    r = await call('get_open_dataset', { key: 'bio-assajos-anticossos-monoclonals-europa', lang: 'en' });
    const t = r.j?.result?.content?.[0]?.text ?? '', sc = r.j?.result?.structuredContent ?? {};
    comprova('dataset detail has the published figure, DOI, citation and date', t.includes('809') && sc.dataset?.doi === '10.7910/DVN/UKWMDM' && sc.citation?.startsWith('crida studio (2026)') && /updated 20\d\d-\d\d-\d\d/.test(t), t.slice(0, 300));
    comprova('dataset detail lists the CSV with columns and rows', sc.dataset?.files?.[0]?.files > 0 && sc.dataset.files[0].columnes.includes('valor') || sc.dataset?.files?.[0]?.files > 0, JSON.stringify(sc.dataset?.files));
    const url = sc.dataset?.files?.[0]?.url;
    r = await call('read_open_data_file', { url, offset: 0, limit: 3 });
    const rs = r.j?.result?.structuredContent ?? {};
    comprova('file read: 3 rows as objects, total and columns', rs.rows?.length === 3 && rs.total_rows > 3 && rs.columns?.length > 1, r.text.slice(0, 300));
    r = await call('read_open_data_file', { url, limit: 500 });
    comprova('limit over 200 is a tool error', r.j?.result?.isError === true, r.text.slice(0, 200));
    r = await call('read_open_data_file', { url: 'https://example.com/x.csv' });
    comprova('a file that is not crida\'s is refused (no fetch)', r.j?.result?.isError === true, r.text.slice(0, 200));
    r = await call('get_open_dataset', { key: 'nope' });
    comprova('unknown key is a tool error', r.j?.result?.isError === true, r.text.slice(0, 200));
    r = await call('get_open_dataset', { key: 'obs-2026-11', lang: 'ca' });
    comprova('Catalan detail of the November Market Watch', r.j?.result?.structuredContent?.url?.includes('/recursos/') && !r.j.result.isError, r.text.slice(0, 200));
  } finally { await atura(s); }
}

async function serveis() {
  console.log('\n[phase c] search, services, prices, cases, quote request');
  const s = await arrenca({ TOPALL_IP_DIA: 1000, TOPALL_DIA: 1000, TOPALL_MES: 1000 });
  try {
    const call = (name, args) => crida('tools/call', { name, arguments: args });
    let r = await call('search_crida', { query: 'ensayos anticuerpos monoclonales', lang: 'es' });
    let sc = r.j?.result?.structuredContent ?? {};
    comprova('search (es) finds the antibody trials study first', sc.results?.[0]?.url?.includes('/es/recursos/') && /anticuerpos/i.test(sc.results[0].title) && sc.results[0].kind === 'study', JSON.stringify(sc.results?.slice(0, 2)));
    r = await call('search_crida', { query: 'website price', lang: 'en', kind: 'service', limit: 3 });
    sc = r.j?.result?.structuredContent ?? {};
    comprova('search filtered by kind and limit', sc.results?.length > 0 && sc.results.length <= 3 && sc.results.every((x) => x.kind === 'service'), JSON.stringify(sc.results));
    r = await call('search_crida', { query: 'x' });
    comprova('a one-letter query is refused', r.j?.result?.isError === true, r.text.slice(0, 200));
    r = await call('search_crida', { query: 'n8n Make Zapier', lang: 'en', kind: 'guide' });
    sc = r.j?.result?.structuredContent ?? {};
    comprova('search finds a general marketing/automation guide', sc.results?.[0]?.key === 'n8n-make-zapier-pime', JSON.stringify(sc.results?.slice(0, 2)));
    r = await call('read_page', { key: 'n8n-make-zapier-pime', lang: 'es' });
    sc = r.j?.result?.structuredContent ?? {};
    comprova('read_page reads a general guide in full, with date', sc.sections?.length > 1 && sc.url?.includes('/es/recursos/') && /actualizado 20\d\d-\d\d-\d\d/.test(r.j.result.content[0].text), r.text.slice(0, 200));
    r = await call('read_page', { key: 'web', lang: 'en' });
    comprova('read_page on a service points to get_service', r.j?.result?.isError === true && r.text.includes('get_service'), r.text.slice(0, 200));
    r = await call('read_page', { key: 'xatbot-en-catala', lang: 'ca' });
    comprova('a guide that names AI models in general is served', r.status === 200 && !r.j?.result?.isError, r.text.slice(0, 200));
    r = await call('list_services', { lang: 'ca' });
    comprova('list_services (ca): 18 services', r.j?.result?.structuredContent?.services?.length === 18, r.text.slice(0, 200));
    r = await call('get_service', { key: 'marketing-biotech', lang: 'en' });
    comprova('get_service has sections, FAQs and the price page', r.j?.result?.structuredContent?.sections?.length > 0 && r.j.result.structuredContent.pricing_page?.includes('pricing'), r.text.slice(0, 200));
    r = await call('get_service', { key: 'outsourced-marketing', lang: 'en' });
    if (EXCLOSA) comprova('no service answer names the excluded company', r.status === 200 && !EXCLOSA.test(r.text));
    r = await call('get_prices', { lang: 'es', group: 'web' });
    const tp = r.j?.result?.content?.[0]?.text ?? '';
    comprova('get_prices (es, web): published prices without VAT, with date', tp.includes('1200') || tp.includes('1.200') || tp.includes('1,200'), tp.slice(0, 300));
    comprova('get_prices cites the price page with its date, labels in Spanish', /actualizado 20\d\d-\d\d-\d\d/.test(tp) && tp.includes('Incluye:') && !tp.includes('Includes:'), tp.slice(-200));
    r = await call('get_prices', { group: 'nope' });
    comprova('unknown price group is a tool error', r.j?.result?.isError === true);
    r = await call('list_cases', { lang: 'en' });
    const casos = r.j?.result?.structuredContent?.cases ?? [];
    comprova('list_cases: 8 cases', casos.length === 8 && (!EXCLOSA || !EXCLOSA.test(r.text)), String(casos.length));
    r = await call('get_case', { key: 'ona', lang: 'es' });
    if (PROVEIDORS) comprova('the Ona case names none of its providers', r.status === 200 && !PROVEIDORS.test(r.text));
    r = await call('prepare_quote_request', { lang: 'es', service: 'web', business: 'Hotel rural en el Empordà', need: 'Una web con reservas directas en tres idiomas', timeline: 'primavera 2027' });
    sc = r.j?.result?.structuredContent ?? {};
    comprova('quote request: a draft, the contact page and the starting price; sends nothing', sc.sends_anything === false && sc.draft?.startsWith('Hola, crida studio:') && sc.contact_page?.includes('/es/recursos/') && sc.starting_price?.price, JSON.stringify(sc).slice(0, 300));
    comprova('the draft leaves name and contact to the person', sc.draft?.includes('[escríbelos aquí]'), sc.draft);
    r = await call('prepare_quote_request', { need: 'x'.repeat(2000) });
    comprova('an over-long request is refused', r.j?.result?.isError === true);
    r = await call('prepare_quote_request', { need: 'Need a site', service: 'nope' });
    comprova('an unknown service in the request is refused', r.j?.result?.isError === true);
  } finally { await atura(s); }
}

const ESCENARIS = { protocol, dadesObertes, serveis, topallIpIDia, topallMes, topallMinut };
const tria = process.argv[2];
for (const [nom, f] of Object.entries(ESCENARIS)) if (!tria || tria === nom) await f();
console.log(`\n${passades} ok, ${fallades} failed`);
process.exit(fallades ? 1 : 0);
