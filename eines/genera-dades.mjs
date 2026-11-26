// Builds dades/crida.json (the copy bundled in the Worker, used when the file published by the website cannot be read)
// from the PUBLISHED content of the website, so the MCP server only ever says what the website already says. Nothing is
// written by hand and nothing is estimated.
// Usage: npm run dades. It needs eines/regles.local.json (private, not in this repository): the local paths of the
// content repositories and the content rules. Without it, it stops: the rules are never skipped.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FITXER_REGLES = resolve(AQUI, 'regles.local.json');
if (!existsSync(FITXER_REGLES)) { console.error('STOP: eines/regles.local.json is missing (private paths and content rules).'); process.exit(1); }
const REGLES = JSON.parse(readFileSync(FITXER_REGLES, 'utf8'));
const REPO = resolve(AQUI, REGLES.recursos);
const ORIGEN = 'https://www.crida.studio';
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });

git('fetch', '--quiet', 'origin', 'main');
const commit = git('log', '-1', '--format=%h %cI', 'origin/main').trim().split(' ');
const llegeix = (lang) => JSON.parse(git('show', `origin/main:src/content_${lang}.json`));
const LANGS = ['en', 'es', 'ca'];
const viu = (d) => d.pages.filter((p) => !p.draft);
const url = (d, p) => ORIGEN + d.base + (p ? p.path : '');

const sortida = { generat: new Date().toISOString(), font: { commit: commit[0], data: commit[1] }, idiomes: {} };
for (const lang of LANGS) {
  const d = llegeix(lang);
  const pagines = viu(d);
  const contacte = pagines.find((p) => p.kind === 'contact');
  const preus = pagines.find((p) => p.kind === 'pricing');
  const dates = pagines.map((p) => p.modified_date).filter(Boolean).sort();
  sortida.idiomes[lang] = {
    llengua: d.language,
    hub: { titol: d.hub.title, descripcio: d.hub.description, intro: d.hub.intro, url: url(d), actualitzat: dates.at(-1) ?? null },
    home: ORIGEN + d.home,
    llms: url(d) + 'llms.txt',
    llms_complet: url(d) + 'llms-full.txt',
    contacte: contacte ? { titol: contacte.title, resum: contacte.summary, url: url(d, contacte), actualitzat: contacte.modified_date } : null,
    preus: preus ? { titol: preus.title, resum: preus.summary, url: url(d, preus), actualitzat: preus.modified_date } : null,
  };
}
sortida.sitemap = ORIGEN + '/sitemap-recursos.xml';

// ---------- Phase b: open data. Studies with a dataset in the three languages, and the files themselves. ----------
// The files come from the PUBLISHED repository (what the website serves), never from a working copy.
const PUBLICAT = resolve(AQUI, REGLES.publicat);
const gitP = (...a) => execFileSync('git', ['-C', PUBLICAT, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
gitP('fetch', '--quiet', 'origin', 'main');
const commitP = gitP('log', '-1', '--format=%h %cI', 'origin/main').trim().split(' ');
const text = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
sortida.font_publicat = { commit: commitP[0], data: commitP[1] };
sortida.estudis = {};
const fitxers = new Set();
for (const lang of LANGS) {
  const d = llegeix(lang);
  sortida.estudis[lang] = viu(d).filter((p) => p.dataset).map((p) => {
    for (const f of p.dataset.files ?? []) fitxers.add(f);
    return {
      clau: p.key, titol: p.title, resum: text(p.summary), descripcio: text(p.description), url: url(d, p), tema: p.topic ?? null,
      publicat: p.published_date ?? null, actualitzat: p.modified_date ?? null,
      dataset: {
        nom: p.dataset.name, descripcio: text(p.dataset.description), periode: p.dataset.temporal ?? null, ambit: p.dataset.spatial ?? null,
        llicencia: p.dataset.license ?? null, doi: p.dataset.doi ?? null,
        fitxers: (p.dataset.files ?? []).map((f) => (f.startsWith('/') ? ORIGEN + f : f)),
      },
      seccions: (p.sections ?? []).map((s) => ({ titol: text(s.title), text: (s.paragraphs ?? []).map(text).filter(Boolean).join('\n') })).filter((s) => s.titol || s.text),
      fonts_originals: (p.sources ?? []).map((s) => (Array.isArray(s) ? { titol: text(s[0]), url: s[1] } : { titol: text(s.title ?? s.name), url: s.url })).filter((s) => s.url),
    };
  });
}
// ---------- Phase c: search index, services, prices, cases and contact ----------
// Content rules (private file): a section or answer that names the excluded company is left out of the server.
const EMPRESA = new RegExp(REGLES.empresa_excloure);
const senseTecnic = (o) => !EMPRESA.test(JSON.stringify(o));
const seccions = (p) => (p.sections ?? []).map((s) => ({ titol: text(s.title), text: (s.paragraphs ?? []).map(text).filter(Boolean).join('\n') })).filter((s) => (s.titol || s.text) && senseTecnic(s));
const faqs = (p) => (p.faqs ?? []).map((f) => (Array.isArray(f) ? { q: text(f[0]), a: text(f[1]) } : { q: text(f.q ?? f.question), a: text(f.a ?? f.answer) })).filter((f) => f.q && f.a && senseTecnic(f));
sortida.pagines = {}; sortida.serveis = {}; sortida.preus = {}; sortida.casos = {}; sortida.contacte = {};
for (const lang of LANGS) {
  const d = llegeix(lang);
  const pagines = viu(d);
  // Page kinds that are not a crida service, case or guide are left out of the index (private rules).
  sortida.pagines[lang] = pagines.filter((p) => p.kind !== REGLES.pagina_excloure_tipus).map((p) => ({ clau: p.key, tipus: p.kind, tema: p.topic ?? null, titol: text(p.title), resum: text(p.summary), descripcio: text(p.description), url: url(d, p), actualitzat: p.modified_date ?? null }));
  // Full text of every guide (marketing, web, brand, AI, local business, biopharma alike) for read_page.
  sortida.textos ??= {};
  sortida.textos[lang] = Object.fromEntries(pagines.filter((p) => p.kind === 'guide').map((p) => [p.key, { intro: text(p.intro), seccions: seccions(p), faqs: faqs(p) }]));
  sortida.serveis[lang] = pagines.filter((p) => p.kind === 'service').map((p) => ({
    clau: p.key, titol: text(p.title), resum: text(p.summary), descripcio: text(p.description), url: url(d, p), actualitzat: p.modified_date ?? null,
    seccions: seccions(p), faqs: faqs(p), cta: p.cta ? { titol: text(p.cta.title), text: text(p.cta.copy) } : null,
  }));
  const pr = pagines.find((p) => p.kind === 'pricing');
  sortida.preus[lang] = pr ? {
    titol: text(pr.title), url: url(d, pr), actualitzat: pr.modified_date ?? null, nota: text(pr.pricing.note),
    explicacio: text(`${pr.pricing.statement?.title ?? ''} ${pr.pricing.statement?.text ?? ''}`),
    grups: pr.pricing.groups.map((g) => ({ id: g.id, titol: text(g.title), serveis: g.services.map((s) => ({
      id: s.id, nom: text(s.name), per_a: text(s.say), preu: text(s.price), unitat: text(s.unit), inclou: (s.includes ?? []).map(text), afegits: (s.addons ?? []).map(text), te_sentit_si: text(s.fit),
    })) })),
    paraula_des_de: text(pr.pricing.from), faqs: faqs(pr),
  } : null;
  sortida.casos[lang] = pagines.filter((p) => p.kind === 'case').map((p) => ({
    clau: p.key, nom: text(p.name ?? p.title), titol: text(p.title), resum: text(p.summary), url: url(d, p), actualitzat: p.modified_date ?? null,
    client: p.client ? { nom: text(p.client.name), web: p.client.url ?? null, sector: text(p.client.sector), pais: p.client.country ?? null } : null,
    periode: p.period ?? null, serveis: (p.services ?? []).map((s) => text(s.label)), fet: text(p.fact), seccions: seccions(p),
  }));
  const c = pagines.find((p) => p.kind === 'contact');
  sortida.contacte[lang] = c ? { titol: text(c.title), resum: text(c.summary), url: url(d, c), actualitzat: c.modified_date ?? null, tancament: text(c.contact?.closing), formulari: text(c.contact?.form?.title) } : null;
}

// Content rules: the excluded company never appears, the providers behind the assistant Ona are never named where Ona is
// spoken of, and no personal data (e-mail addresses) is published.
// The website already follows them; this check stops the build if a page ever breaks them.
const PROVEIDORS = new RegExp(REGLES.proveidors_ona, 'i');
const MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/;
// Provider names are only forbidden where Ona is spoken of (a guide may well name an AI model in general).
const elements = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v).flatMap(elements) : [v]);
for (const part of ['pagines', 'textos', 'serveis', 'preus', 'casos', 'contacte', 'estudis']) {
  for (const lang of LANGS) {
    const v = sortida[part][lang];
    for (const item of (Array.isArray(v) ? v : part === 'textos' ? Object.values(v) : [v])) {
      const t = JSON.stringify(item ?? '');
      // Providers: checked section by section (each text field), so a guide that names an AI model in one section and
      // Ona in another is fine; a section that speaks of Ona and names a provider stops the build.
      const paragraf = elements(item).find((x) => typeof x === 'string' && /\bOna\b/.test(x) && PROVEIDORS.test(x));
      const m = EMPRESA.exec(t) ?? MAIL.exec(t) ?? (paragraf ? PROVEIDORS.exec(JSON.stringify(paragraf)) : null);
      if (m) { console.error(`STOP: "${m[0]}" in ${part}/${lang}: ${t.slice(Math.max(0, m.index - 120), m.index + 80)}`); process.exit(1); }
    }
  }
}

sortida.fitxers = {};
for (const f of [...fitxers].sort()) {
  if (!f.startsWith('/recursos/dades/')) continue; // only crida's own files; anything else is a link, not bundled
  sortida.fitxers[ORIGEN + f] = gitP('show', `origin/main:${f.slice(1)}`);
}

const desti = resolve(AQUI, '../dades/crida.json');
mkdirSync(dirname(desti), { recursive: true });
writeFileSync(desti, JSON.stringify(sortida, null, 1) + '\n');
console.log(`dades/crida.json from ${commit[0]} (${commit[1]}) and ${commitP[0]}: ${LANGS.length} languages, ` +
  `${sortida.estudis.en.length} studies, ${Object.keys(sortida.fitxers).length} files, ${(JSON.stringify(sortida).length / 1024).toFixed(0)} KB`);
