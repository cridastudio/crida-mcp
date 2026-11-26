// Tools of the MCP server. All read only, all answered from the data in use (see src/dades.ts: the file Recursos
// publishes on every release, or the copy bundled here): no tool calls the network, another Worker or itself. Every answer carries
// its sources with URL and date. Nothing is estimated or written by hand.
import empaquetat from '../dades/crida.json';

// The data in use: the bundled copy until src/dades.ts reads a newer one published by Recursos. Tools read it at call
// time, never at load time, so a new file applies to the very next call.
let dades: typeof empaquetat = empaquetat;
export const fixaDades = (d: typeof empaquetat): void => { dades = d; };

export type Lang = 'en' | 'es' | 'ca';
const LANGS: Lang[] = ['en', 'es', 'ca'];

export interface Font { titol: string; url: string; data: string | null }
export interface ResultatEina { text: string; estructurat: Record<string, unknown>; fonts: Font[]; error?: boolean }
export interface Eina {
  name: string; title: string; description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  executa: (args: Record<string, unknown>) => Promise<ResultatEina> | ResultatEina;
}

const ESQUEMA_LANG = { type: 'string', enum: LANGS, default: 'en', description: 'Language of the answer: en (English), es (Spanish) or ca (Catalan).' };
const ESQUEMA_FONTS = {
  type: 'array',
  items: { type: 'object', properties: { titol: { type: 'string' }, url: { type: 'string' }, data: { type: ['string', 'null'] } }, required: ['titol', 'url', 'data'] },
};

export class ErrorArguments extends Error {}

export function llengua(args: Record<string, unknown>): Lang {
  const l = args.lang ?? 'en';
  if (typeof l !== 'string' || !LANGS.includes(l as Lang)) throw new ErrorArguments('lang must be one of en, es, ca');
  return l as Lang;
}

/** The footer every answer carries: where it comes from and when that page was last updated. */
/** Labels of the answers in the three languages (the data itself already comes in each language). */
const ETIQUETES = {
  en: { fonts: 'Sources', actualitzat: 'updated', inclou: 'Includes', afegir: 'Can be added', preguntes: 'Questions', preus: 'Prices', fitxers: 'Files', llicencia: 'Licence', llicenciaPagina: 'stated on the study page', cita: 'Cite as', periode: 'Period', ambit: 'Scope', originals: 'Original public sources', client: 'Client', serveis: 'Services', contacte: 'Contact page', preuPartida: 'Published starting price', files: 'rows', columnes: 'columns' },
  es: { fonts: 'Fuentes', actualitzat: 'actualizado', inclou: 'Incluye', afegir: 'Se puede añadir', preguntes: 'Preguntas', preus: 'Precios', fitxers: 'Archivos', llicencia: 'Licencia', llicenciaPagina: 'indicada en la página del estudio', cita: 'Cómo citarlo', periode: 'Periodo', ambit: 'Ámbito', originals: 'Fuentes públicas originales', client: 'Cliente', serveis: 'Servicios', contacte: 'Página de contacto', preuPartida: 'Precio de partida publicado', files: 'filas', columnes: 'columnas' },
  ca: { fonts: 'Fonts', actualitzat: 'actualitzat', inclou: 'Inclou', afegir: 'Es pot afegir', preguntes: 'Preguntes', preus: 'Preus', fitxers: 'Fitxers', llicencia: 'Llicència', llicenciaPagina: 'indicada a la pàgina de l\'estudi', cita: 'Com citar-lo', periode: 'Període', ambit: 'Àmbit', originals: 'Fonts públiques originals', client: 'Client', serveis: 'Serveis', contacte: 'Pàgina de contacte', preuPartida: 'Preu de partida publicat', files: 'files', columnes: 'columnes' },
} as const;
const et = (lang: string) => ETIQUETES[(lang in ETIQUETES ? lang : 'en') as keyof typeof ETIQUETES];

export const peuDeFonts = (fonts: Font[], lang = 'en'): string =>
  `\n\n${et(lang).fonts}:\n` + fonts.map((f) => `- ${f.titol}: ${f.url}${f.data ? ` (${et(lang).actualitzat} ${f.data})` : ''}`).join('\n');

const sobreCrida: Eina = {
  name: 'about_crida',
  title: 'About crida studio',
  description:
    'What crida studio is (a marketing, brand, web and technology studio in Spain that works for any type of business) and where to find its guides, open data, services, prices and contact page, in English, Spanish or Catalan. Every answer cites the public page it comes from and its date.',
  inputSchema: { type: 'object', properties: { lang: ESQUEMA_LANG }, additionalProperties: false },
  outputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' }, description: { type: 'string' }, resources_hub: { type: 'string' }, website: { type: 'string' },
      llms_txt: { type: 'string' }, pricing: { type: ['string', 'null'] }, contact: { type: ['string', 'null'] }, sources: ESQUEMA_FONTS,
    },
    required: ['name', 'description', 'resources_hub', 'website', 'llms_txt', 'sources'],
  },
  executa(args) {
    const lang = llengua(args);
    const d = dades.idiomes[lang];
    const fonts: Font[] = [{ titol: d.hub.titol, url: d.hub.url, data: d.hub.actualitzat }];
    if (d.preus) fonts.push({ titol: d.preus.titol, url: d.preus.url, data: d.preus.actualitzat });
    if (d.contacte) fonts.push({ titol: d.contacte.titol, url: d.contacte.url, data: d.contacte.actualitzat });
    const estructurat = {
      name: 'crida studio', description: d.hub.descripcio, resources_hub: d.hub.url, website: d.home, llms_txt: d.llms,
      pricing: d.preus?.url ?? null, contact: d.contacte?.url ?? null, sources: fonts,
    };
    const text = [
      `crida studio. ${d.hub.descripcio}`,
      d.hub.intro,
      `Resources: ${d.hub.url}`,
      `Index for assistants: ${d.llms}`,
      d.preus ? `${et(lang).preus}: ${d.preus.url}` : '',
      d.contacte ? `Contact: ${d.contacte.url}. People send their own requests from that page; this server never sends anything.` : '',
    ].filter(Boolean).join('\n') + peuDeFonts(fonts, lang);
    return { text, estructurat, fonts };
  },
};

// ---------- Phase b: open data ----------
interface Estudi {
  clau: string; titol: string; resum: string; descripcio: string; url: string; tema: string | null; publicat: string | null; actualitzat: string | null;
  dataset: { nom: string; descripcio: string; periode: string | null; ambit: string | null; llicencia: string | null; doi: string | null; fitxers: string[] };
  seccions: { titol: string; text: string }[];
  fonts_originals: { titol: string; url: string }[];
}
const ESQUEMA_CLAU = { type: 'string', minLength: 1, maxLength: 120, description: 'Dataset key, as given by list_open_datasets.' };
const estudis = (lang: Lang): Estudi[] => (dades.estudis as unknown as Record<Lang, Estudi[]>)[lang];
const fontEstudi = (e: Estudi): Font => ({ titol: e.titol, url: e.url, data: e.actualitzat });
const normal = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const citacio = (e: Estudi) =>
  `crida studio (${(e.publicat ?? e.actualitzat ?? '').slice(0, 4) || 'n.d.'}). ${e.titol}. ${e.url}` + (e.dataset.doi ? ` https://doi.org/${e.dataset.doi}` : '');

/** Minimal CSV reader (RFC 4180 quotes). The files are crida's own and small. */
export function llegeixCsv(t: string): string[][] {
  const files: string[][] = []; let fila: string[] = [], camp = '', cometes = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (cometes) {
      if (c === '"' && t[i + 1] === '"') { camp += '"'; i++; } else if (c === '"') cometes = false; else camp += c;
    } else if (c === '"') cometes = true;
    else if (c === ',') { fila.push(camp); camp = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; fila.push(camp); files.push(fila); fila = []; camp = ''; }
    else camp += c;
  }
  if (camp !== '' || fila.length) { fila.push(camp); files.push(fila); }
  return files.filter((f) => f.length > 1 || f[0] !== '');
}

const fitxer = (url: string): string | undefined => (dades.fitxers as Record<string, string>)[url];
const resumFitxer = (url: string) => {
  const t = fitxer(url);
  if (t === undefined) return { url, columnes: null, files: null };
  if (url.endsWith('.csv')) { const f = llegeixCsv(t); return { url, columnes: f[0] ?? [], files: Math.max(0, f.length - 1) }; }
  return { url, columnes: null, files: null, format: 'json' };
};

const llistaDatasets: Eina = {
  name: 'list_open_datasets',
  title: 'List crida studio open datasets',
  description:
    'Lists the open datasets crida studio has counted itself: studies of local business and council websites (Girona accommodation and town councils), of company websites, and of public bioprocess and pharma data (EMA approvals, clinical trials, Horizon Europe, the monthly Bioprocess Market Watch). Each item has its page, period, DOI and last update. Optional query filters by words.',
  inputSchema: { type: 'object', properties: { lang: ESQUEMA_LANG, query: { type: 'string', maxLength: 200, description: 'Optional words to filter by, e.g. "antibody" or "EMA".' } }, additionalProperties: false },
  executa(args) {
    const lang = llengua(args);
    const q = args.query === undefined ? '' : String(args.query);
    if (q.length > 200) throw new ErrorArguments('query is too long (max 200 characters)');
    const paraules = normal(q).split(/\s+/).filter((p) => p.length > 1);
    const llista = estudis(lang).filter((e) => !paraules.length || paraules.every((p) => normal(`${e.titol} ${e.resum} ${e.dataset.nom} ${e.dataset.descripcio}`).includes(p)));
    const items = llista.map((e) => ({ key: e.clau, title: e.titol, summary: e.resum, dataset: e.dataset.nom, period: e.dataset.periode, scope: e.dataset.ambit, doi: e.dataset.doi, url: e.url, updated: e.actualitzat }));
    const fonts = llista.map(fontEstudi);
    const text = items.length
      ? `${items.length} open dataset(s)${q ? ` matching "${q}"` : ''}:\n` + items.map((i) => `- ${i.key}: ${i.title}. ${i.summary}${i.period ? ` Period ${i.period}.` : ''}${i.doi ? ` DOI ${i.doi}.` : ''}`).join('\n') + peuDeFonts(fonts, lang)
      : `No open dataset matches "${q}". Call list_open_datasets without query to see all of them.`;
    return { text, estructurat: { count: items.length, datasets: items, sources: fonts }, fonts };
  },
};

const detallDataset: Eina = {
  name: 'get_open_dataset',
  title: 'Get one crida studio open dataset',
  description:
    'Full detail of one open dataset: what it counts, the published findings with their figures, how it was counted and its limits, the files (columns and rows), the original public sources and a ready citation. Quote figures with the date and page this tool gives.',
  inputSchema: { type: 'object', properties: { key: ESQUEMA_CLAU, lang: ESQUEMA_LANG }, required: ['key'], additionalProperties: false },
  executa(args) {
    const lang = llengua(args);
    const e = estudis(lang).find((x) => x.clau === args.key);
    if (!e) throw new ErrorArguments(`Unknown dataset key "${String(args.key)}". Call list_open_datasets for the keys.`);
    const fonts: Font[] = [fontEstudi(e)];
    const files = e.dataset.fitxers.map(resumFitxer);
    const estructurat = {
      key: e.clau, title: e.titol, url: e.url, published: e.publicat, updated: e.actualitzat,
      dataset: { name: e.dataset.nom, description: e.dataset.descripcio, period: e.dataset.periode, scope: e.dataset.ambit, licence: e.dataset.llicencia, doi: e.dataset.doi, files },
      findings: e.seccions.map((s) => ({ heading: s.titol, text: s.text })),
      original_sources: e.fonts_originals, citation: citacio(e), sources: fonts,
    };
    const text = [
      `${e.titol} (${et(lang).actualitzat} ${e.actualitzat}).`, e.dataset.descripcio,
      e.dataset.periode ? `${et(lang).periode}: ${e.dataset.periode}.` : '', e.dataset.ambit ? `${et(lang).ambit}: ${e.dataset.ambit}.` : '',
      ...e.seccions.map((s) => `\n## ${s.titol}\n${s.text}`),
      `\n${et(lang).fitxers}:`, ...files.map((f) => `- ${f.url}${f.files !== null ? ` (${f.files} ${et(lang).files}; ${et(lang).columnes}: ${(f.columnes ?? []).join(', ')})` : ''}`),
      e.fonts_originals.length ? `\n${et(lang).originals}:\n` + e.fonts_originals.map((s) => `- ${s.titol}: ${s.url}`).join('\n') : '',
      `\n${et(lang).llicencia}: ${e.dataset.llicencia ?? et(lang).llicenciaPagina}.`, `${et(lang).cita}: ${citacio(e)}`,
    ].filter(Boolean).join('\n') + peuDeFonts(fonts, lang);
    return { text, estructurat, fonts };
  },
};

const llegeixFitxer: Eina = {
  name: 'read_open_data_file',
  title: 'Read a crida studio open data file',
  description:
    'Reads rows of one open data file of crida studio (CSV), with paging: header, rows as objects and the total. Every row of the bioprocess files names its own original source. Use the file URLs given by get_open_dataset.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', maxLength: 300, description: 'File URL from get_open_dataset, e.g. https://www.crida.studio/recursos/dades/....csv' },
      offset: { type: 'integer', minimum: 0, default: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    },
    required: ['url'], additionalProperties: false,
  },
  executa(args) {
    const url = String(args.url ?? '');
    const lang = 'en';
    const t = fitxer(url);
    if (t === undefined) throw new ErrorArguments('Unknown file. Use a file URL given by get_open_dataset.');
    const offset = args.offset === undefined ? 0 : Number(args.offset), limit = args.limit === undefined ? 50 : Number(args.limit);
    if (!Number.isInteger(offset) || offset < 0) throw new ErrorArguments('offset must be an integer ≥ 0');
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new ErrorArguments('limit must be an integer from 1 to 200');
    const estudi = estudis('en').find((e) => e.dataset.fitxers.includes(url));
    const fonts: Font[] = estudi ? [fontEstudi(estudi), { titol: 'Data file', url, data: estudi.actualitzat }] : [{ titol: 'Data file', url, data: null }];
    if (!url.endsWith('.csv')) {
      const tros = t.slice(offset, offset + 20000);
      return { text: tros + peuDeFonts(fonts, lang), estructurat: { url, format: 'json', characters: t.length, offset, returned: tros.length, content: tros, sources: fonts }, fonts };
    }
    const [cap = [], ...files] = llegeixCsv(t);
    const tria = files.slice(offset, offset + limit).map((f) => Object.fromEntries(cap.map((c, i) => [c, f[i] ?? ''])));
    const text = `${url}: rows ${offset + 1}–${offset + tria.length} of ${files.length}. Columns: ${cap.join(', ')}.\n` +
      tria.map((r) => JSON.stringify(r)).join('\n') + (offset + tria.length < files.length ? `\n(more: offset ${offset + tria.length})` : '') + peuDeFonts(fonts, lang);
    return { text, estructurat: { url, columns: cap, total_rows: files.length, offset, rows: tria, licence: estudi?.dataset.llicencia ?? null, sources: fonts }, fonts };
  },
};

// ---------- Phase c: search, services, prices, cases and the quote request ----------
interface Pagina { clau: string; tipus: string; titol: string; resum: string; descripcio: string; url: string; actualitzat: string | null }
interface Seccio { titol: string; text: string }
interface Servei { clau: string; titol: string; resum: string; descripcio: string; url: string; actualitzat: string | null; seccions: Seccio[]; faqs: { q: string; a: string }[]; cta: { titol: string; text: string } | null }
interface ServeiPreu { id: string; nom: string; per_a: string; preu: string; unitat: string; inclou: string[]; afegits: string[]; te_sentit_si: string }
interface Preus { titol: string; url: string; actualitzat: string | null; nota: string; explicacio: string; grups: { id: string; titol: string; serveis: ServeiPreu[] }[]; paraula_des_de: string; faqs: { q: string; a: string }[] }
interface Cas { clau: string; nom: string; titol: string; resum: string; url: string; actualitzat: string | null; client: { nom: string; web: string | null; sector: string; pais: string | null } | null; periode: unknown; serveis: string[]; fet: string; seccions: Seccio[] }
interface Contacte { titol: string; resum: string; url: string; actualitzat: string | null; tancament: string; formulari: string }
const D = () => dades as unknown as { pagines: Record<Lang, Pagina[]>; serveis: Record<Lang, Servei[]>; preus: Record<Lang, Preus | null>; casos: Record<Lang, Cas[]>; contacte: Record<Lang, Contacte | null> };
const font = (x: { titol: string; url: string; actualitzat: string | null }): Font => ({ titol: x.titol, url: x.url, data: x.actualitzat });
const enter = (v: unknown, def: number, min: number, max: number, nom: string): number => {
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ErrorArguments(`${nom} must be an integer from ${min} to ${max}`);
  return n;
};
const textCurt = (v: unknown, nom: string, max: number, obligatori = false): string => {
  if (v === undefined || v === null || v === '') { if (obligatori) throw new ErrorArguments(`${nom} is required`); return ''; }
  if (typeof v !== 'string') throw new ErrorArguments(`${nom} must be text`);
  if (v.length > max) throw new ErrorArguments(`${nom} is too long (max ${max} characters)`);
  return v.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim();
};
const TIPUS_CERCA = ['guide', 'service', 'case', 'study', 'pricing', 'contact', 'any'] as const;

/** Static search: words in the title weigh 3, in the summary or description 1. No model, no network. */
function cercaEstatica(lang: Lang, q: string, tipus: string, max: number) {
  const paraules = normal(q).split(/[^\p{L}\p{N}]+/u).filter((p) => p.length > 2);
  const estudisClaus = new Set(estudis(lang).map((e) => e.clau));
  return D().pagines[lang]
    .map((p) => ({ ...p, tipus: estudisClaus.has(p.clau) ? 'study' : p.tipus }))
    .filter((p) => tipus === 'any' || p.tipus === tipus)
    .map((p) => {
      const t = normal(p.titol), r = normal(`${p.resum} ${p.descripcio}`);
      const punts = paraules.reduce((s, w) => s + (t.includes(w) ? 3 : 0) + (r.includes(w) ? 1 : 0), 0);
      return { p, punts };
    })
    .filter((x) => x.punts > 0)
    .sort((a, b) => b.punts - a.punts || (b.p.actualitzat ?? '').localeCompare(a.p.actualitzat ?? ''))
    .slice(0, max).map((x) => x.p);
}

const cerca: Eina = {
  name: 'search_crida',
  title: 'Search crida studio resources',
  description:
    'Searches all of crida studio\'s public pages: guides on marketing, web, SEO, paid search, brand, 3D, automation and applied AI for any type of business, studies with open data, client cases, services, prices and contact, in English, Spanish or Catalan. Returns the best pages with address and date; then read_page, get_open_dataset, get_service or get_case for the detail.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 2, maxLength: 200, description: 'What you are looking for, in any of the three languages.' },
      lang: ESQUEMA_LANG, kind: { type: 'string', enum: [...TIPUS_CERCA], default: 'any' }, limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
    },
    required: ['query'], additionalProperties: false,
  },
  executa(args) {
    const lang = llengua(args);
    const q = textCurt(args.query, 'query', 200, true);
    if (q.length < 2) throw new ErrorArguments('query must have at least 2 characters');
    const tipus = String(args.kind ?? 'any');
    if (!(TIPUS_CERCA as readonly string[]).includes(tipus)) throw new ErrorArguments(`kind must be one of ${TIPUS_CERCA.join(', ')}`);
    const max = enter(args.limit, 5, 1, 10, 'limit');
    const r = cercaEstatica(lang, q, tipus, max);
    const fonts = r.map(font);
    const items = r.map((p) => ({ key: p.clau, kind: p.tipus, title: p.titol, summary: p.resum, url: p.url, updated: p.actualitzat }));
    const text = items.length
      ? `${items.length} result(s) for "${q}":\n` + items.map((i) => `- [${i.kind}] ${i.title}. ${i.summary} ${i.url}`).join('\n') + peuDeFonts(fonts, lang)
      : `Nothing found for "${q}". Try other words or another language (en, es, ca).`;
    return { text, estructurat: { query: q, method: 'keyword', results: items, sources: fonts }, fonts };
  },
};

const llistaServeis: Eina = {
  name: 'list_services',
  title: 'List crida studio services',
  description: 'Every service crida studio offers, for any type of business: web, brand, SEO, paid search, 3D, motion, automation, applied AI, landing pages, B2B, institutional, tourism and biotech marketing and outsourced marketing, each with its page and date.',
  inputSchema: { type: 'object', properties: { lang: ESQUEMA_LANG }, additionalProperties: false },
  executa(args) {
    const lang = llengua(args);
    const s = D().serveis[lang];
    const fonts = s.map(font);
    const items = s.map((x) => ({ key: x.clau, title: x.titol, summary: x.resum, url: x.url, updated: x.actualitzat }));
    return { text: items.map((i) => `- ${i.key}: ${i.title}. ${i.summary}`).join('\n') + peuDeFonts(fonts, lang), estructurat: { services: items, sources: fonts }, fonts };
  },
};

const detallServei: Eina = {
  name: 'get_service',
  title: 'Get one crida studio service',
  description: 'What one service includes, how crida studio works on it and its frequent questions, from the service page. For prices use get_prices.',
  inputSchema: { type: 'object', properties: { key: { type: 'string', maxLength: 80, description: 'Service key from list_services.' }, lang: ESQUEMA_LANG }, required: ['key'], additionalProperties: false },
  executa(args) {
    const lang = llengua(args);
    const s = D().serveis[lang].find((x) => x.clau === args.key);
    if (!s) throw new ErrorArguments(`Unknown service key "${String(args.key)}". Call list_services for the keys.`);
    const preus = D().preus[lang];
    const fonts = [font(s), ...(preus ? [font(preus)] : [])];
    const text = [`${s.titol}. ${s.resum}`, ...s.seccions.map((x) => `\n## ${x.titol}\n${x.text}`),
      s.faqs.length ? `\n${et(lang).preguntes}:\n` + s.faqs.map((f) => `- ${f.q} ${f.a}`).join('\n') : '',
      preus ? `\n${et(lang).preus}: ${preus.url}` : ''].filter(Boolean).join('\n') + peuDeFonts(fonts, lang);
    return { text, estructurat: { key: s.clau, title: s.titol, summary: s.resum, url: s.url, updated: s.actualitzat, sections: s.seccions, faqs: s.faqs, pricing_page: preus?.url ?? null, sources: fonts }, fonts };
  },
};

const preus: Eina = {
  name: 'get_prices',
  title: 'Get crida studio prices',
  description: 'crida studio\'s published starting prices (excluding VAT) for websites, brand, SEO, paid search, 3D and video, automation and outsourced marketing: what each price includes, what can be added and when it makes sense. A fixed quote is always given in writing.',
  inputSchema: { type: 'object', properties: { lang: ESQUEMA_LANG, group: { type: 'string', maxLength: 40, description: 'Optional group id, e.g. web, marca, visibilitat, 3d-video, automatitzacio, extern.' } }, additionalProperties: false },
  executa(args) {
    const lang = llengua(args);
    const p = D().preus[lang];
    if (!p) throw new ErrorArguments('The price page is not available in this language.');
    const grup = args.group === undefined ? '' : String(args.group);
    const grups = grup ? p.grups.filter((g) => g.id === grup) : p.grups;
    if (!grups.length) throw new ErrorArguments(`Unknown group. Groups: ${p.grups.map((g) => g.id).join(', ')}`);
    const fonts = [font(p)];
    const text = [`${p.titol}. ${p.nota}`, p.explicacio,
      ...grups.map((g) => `\n## ${g.titol}\n` + g.serveis.map((s) => `- ${s.nom}: ${p.paraula_des_de} ${s.preu}${s.unitat ? ` ${s.unitat}` : ''}. ${s.per_a} ${et(lang).inclou}: ${s.inclou.join('; ')}.${s.afegits.length ? ` ${et(lang).afegir}: ${s.afegits.join('; ')}.` : ''}`).join('\n'))]
      .join('\n') + peuDeFonts(fonts, lang);
    return { text, estructurat: { note: p.nota, groups: grups, url: p.url, updated: p.actualitzat, sources: fonts }, fonts };
  },
};

const llistaCasos: Eina = {
  name: 'list_cases',
  title: 'List crida studio client cases',
  description: 'crida studio\'s published client cases: who the client is, the sector, what was done and the page.',
  inputSchema: { type: 'object', properties: { lang: ESQUEMA_LANG }, additionalProperties: false },
  executa(args) {
    const lang = llengua(args);
    const c = D().casos[lang];
    const fonts = c.map(font);
    const items = c.map((x) => ({ key: x.clau, name: x.nom, title: x.titol, sector: x.client?.sector ?? null, services: x.serveis, url: x.url, updated: x.actualitzat }));
    return { text: items.map((i) => `- ${i.key}: ${i.title}${i.sector ? ` (${i.sector})` : ''}`).join('\n') + peuDeFonts(fonts, lang), estructurat: { cases: items, sources: fonts }, fonts };
  },
};

const detallCas: Eina = {
  name: 'get_case',
  title: 'Get one crida studio client case',
  description: 'One published client case: the client, the period, the services, the result stated on the page and how the work was done.',
  inputSchema: { type: 'object', properties: { key: { type: 'string', maxLength: 80, description: 'Case key from list_cases.' }, lang: ESQUEMA_LANG }, required: ['key'], additionalProperties: false },
  executa(args) {
    const lang = llengua(args);
    const c = D().casos[lang].find((x) => x.clau === args.key);
    if (!c) throw new ErrorArguments(`Unknown case key "${String(args.key)}". Call list_cases for the keys.`);
    const fonts = [font(c)];
    const text = [`${c.titol}. ${c.resum}`, c.client ? `${et(lang).client}: ${c.client.nom}${c.client.sector ? `, ${c.client.sector}` : ''}${c.client.web ? ` (${c.client.web})` : ''}.` : '',
      c.serveis.length ? `${et(lang).serveis}: ${c.serveis.join(', ')}.` : '', c.fet, ...c.seccions.map((x) => `\n## ${x.titol}\n${x.text}`)].filter(Boolean).join('\n') + peuDeFonts(fonts, lang);
    return { text, estructurat: { key: c.clau, title: c.titol, summary: c.resum, client: c.client, period: c.periode, services: c.serveis, fact: c.fet, sections: c.seccions, url: c.url, updated: c.actualitzat, sources: fonts }, fonts };
  },
};

const PRESSUPOST = {
  en: { cap: 'Hello crida studio,', serv: 'Service I am interested in', neg: 'About my business', obj: 'What I need', quan: 'When', pres: 'Budget I have in mind', peu: 'My name and how to reach me: [write them here]', av: 'This is a draft for you to review and send yourself from the contact page. This server sends nothing and keeps nothing.' },
  es: { cap: 'Hola, crida studio:', serv: 'Servicio que me interesa', neg: 'Sobre mi negocio', obj: 'Qué necesito', quan: 'Cuándo', pres: 'Presupuesto que tengo en mente', peu: 'Mi nombre y cómo contactarme: [escríbelos aquí]', av: 'Es un borrador para que lo revises y lo envíes tú desde la página de contacto. Este servidor no envía ni guarda nada.' },
  ca: { cap: 'Hola, crida studio:', serv: 'Servei que m\'interessa', neg: 'Sobre el meu negoci', obj: 'Què necessito', quan: 'Quan', pres: 'Pressupost que tinc al cap', peu: 'El meu nom i com contactar-me: [escriu-los aquí]', av: 'És un esborrany perquè el revisis i l\'enviïs tu des de la pàgina de contacte. Aquest servidor no envia ni desa res.' },
} as const;

const pressupost: Eina = {
  name: 'prepare_quote_request',
  title: 'Prepare a quote request for crida studio',
  description:
    'Prepares the text of a quote request that the person reviews and sends THEMSELVES from crida studio\'s contact page. It returns the draft, the contact page and the published starting price of the service if there is one. It sends nothing, stores nothing and asks for no personal data: leave name and contact details for the person to add.',
  inputSchema: {
    type: 'object',
    properties: {
      lang: ESQUEMA_LANG,
      service: { type: 'string', maxLength: 80, description: 'Service key from list_services, or a price id from get_prices (optional).' },
      business: { type: 'string', maxLength: 600, description: 'What the business does (no personal data).' },
      need: { type: 'string', minLength: 5, maxLength: 1200, description: 'What they need and why.' },
      timeline: { type: 'string', maxLength: 120 }, budget: { type: 'string', maxLength: 120 },
    },
    required: ['need'], additionalProperties: false,
  },
  executa(args) {
    const lang = llengua(args);
    const t = PRESSUPOST[lang];
    const necessitat = textCurt(args.need, 'need', 1200, true), negoci = textCurt(args.business, 'business', 600);
    const quan = textCurt(args.timeline, 'timeline', 120), pres = textCurt(args.budget, 'budget', 120), clau = textCurt(args.service, 'service', 80);
    const contacte = D().contacte[lang], p = D().preus[lang];
    if (!contacte) throw new ErrorArguments('The contact page is not available in this language.');
    const servei = clau ? D().serveis[lang].find((s) => s.clau === clau) : undefined;
    const preu = clau && p ? p.grups.flatMap((g) => g.serveis).find((s) => s.id === clau) : undefined;
    if (clau && !servei && !preu) throw new ErrorArguments(`Unknown service "${clau}". Use a key from list_services or an id from get_prices.`);
    const nomServei = servei?.titol ?? preu?.nom ?? '';
    const esborrany = [t.cap, '', nomServei ? `${t.serv}: ${nomServei}.` : '', negoci ? `${t.neg}: ${negoci}` : '', `${t.obj}: ${necessitat}`,
      quan ? `${t.quan}: ${quan}.` : '', pres ? `${t.pres}: ${pres}.` : '', '', t.peu].filter((l, i, a) => l !== '' || (a[i - 1] ?? '') !== '').join('\n');
    const fonts = [font(contacte), ...(preu && p ? [font(p)] : []), ...(servei ? [font(servei)] : [])];
    const text = `${t.av}\n\n${et(lang).contacte}: ${contacte.url}\n` + (preu && p ? `${et(lang).preuPartida}: ${p.paraula_des_de} ${preu.preu}${preu.unitat ? ` ${preu.unitat}` : ''} (${p.nota})\n` : '') +
      `\n---\n${esborrany}\n---` + peuDeFonts(fonts, lang);
    return { text, estructurat: { draft: esborrany, contact_page: contacte.url, starting_price: preu ? { name: preu.nom, price: preu.preu, unit: preu.unitat, note: p?.nota } : null, sends_anything: false, sources: fonts }, fonts };
  },
};

const TEXTOS = () => (dades as unknown as { textos: Record<Lang, Record<string, { intro: string; seccions: Seccio[]; faqs: { q: string; a: string }[] }>> }).textos;

const llegeixPagina: Eina = {
  name: 'read_page',
  title: 'Read a crida studio guide',
  description:
    'Reads one crida studio guide in full (marketing, web, SEO, paid search, brand, 3D, automation, applied AI, local business, biopharma): introduction, sections and frequent questions, with its address and date. Find the key with search_crida. For services, cases or datasets use their own tools.',
  inputSchema: { type: 'object', properties: { key: { type: 'string', maxLength: 120, description: 'Page key from search_crida.' }, lang: ESQUEMA_LANG }, required: ['key'], additionalProperties: false },
  executa(args) {
    const lang = llengua(args);
    const clau = textCurt(args.key, 'key', 120, true);
    const pagina = D().pagines[lang].find((p) => p.clau === clau);
    const t = TEXTOS()[lang][clau];
    if (!pagina || !t) {
      const altra = pagina ? ` It is a ${pagina.tipus}: use ${pagina.tipus === 'service' ? 'get_service' : pagina.tipus === 'case' ? 'get_case' : pagina.tipus === 'pricing' ? 'get_prices' : 'about_crida'}.` : '';
      throw new ErrorArguments(`"${clau}" is not a guide in ${lang}.${altra} Find guides with search_crida.`);
    }
    const fonts = [font(pagina)];
    const text = [`${pagina.titol}. ${pagina.resum}`, t.intro, ...t.seccions.map((x) => `\n## ${x.titol}\n${x.text}`),
      t.faqs.length ? `\n${et(lang).preguntes}:\n` + t.faqs.map((f) => `- ${f.q} ${f.a}`).join('\n') : ''].filter(Boolean).join('\n') + peuDeFonts(fonts, lang);
    return { text, estructurat: { key: clau, title: pagina.titol, summary: pagina.resum, topic: (pagina as Pagina & { tema?: string | null }).tema ?? null, intro: t.intro, sections: t.seccions, faqs: t.faqs, url: pagina.url, updated: pagina.actualitzat, sources: fonts }, fonts };
  },
};

/** Deterministic order (the spec asks it, so clients can cache the list). */
export const EINES: Eina[] = [sobreCrida, cerca, llegeixPagina, llistaDatasets, detallDataset, llegeixFitxer, llistaServeis, detallServei, preus, llistaCasos, detallCas, pressupost];
export const einaPerNom = (nom: string): Eina | undefined => EINES.find((e) => e.name === nom);

