# crida studio MCP server

[English](#english) · [Español](#español)

## English

A public, read-only [Model Context Protocol](https://modelcontextprotocol.io) server with the resources of [crida studio](https://www.crida.studio/en/insights/), a marketing, brand, web and technology studio in Spain that works for any type of business. AI assistants can connect to it and use its guides, its own open data, its services, prices and client cases, in English, Spanish and Catalan. Every answer cites the public page it comes from and its date.

**Endpoint:** `https://www.crida.studio/mcp` (Streamable HTTP, no sign-in)
**Server Card:** `https://www.crida.studio/mcp/server-card`
**Public counter:** `https://www.crida.studio/mcp/estat`

### Tools

| Tool | What it does |
|---|---|
| `about_crida` | What crida studio is, and where its resources, prices and contact page are |
| `search_crida` | Keyword search over every public page: guides, studies, cases, services, prices |
| `read_page` | One guide in full: introduction, sections and frequent questions |
| `list_open_datasets` | The datasets crida studio counted itself, with period, DOI and date |
| `get_open_dataset` | One dataset: findings, method, files, original sources and a ready citation |
| `read_open_data_file` | Rows of one open data file (CSV), with paging |
| `list_services` / `get_service` | Services and what each one includes |
| `get_prices` | Published starting prices (excluding VAT) |
| `list_cases` / `get_case` | Published client cases |
| `prepare_quote_request` | A draft quote request for the person to review and send **themselves** from the contact page. It sends nothing and stores nothing |

All tools are read-only. Nothing is estimated or written by hand: the data come from the website's own releases.

### Connect it

- **Claude** (claude.ai or desktop): Settings → Connectors → Add custom connector → `https://www.crida.studio/mcp`.
- **ChatGPT** (developer mode): add a connector with the same URL, no authentication.
- **Claude Code:** `claude mcp add --transport http crida https://www.crida.studio/mcp`
- **Any client:** the endpoint speaks MCP 2026-07-28 (stateless) and the earlier 2025-03-26 to 2025-11-25 revisions (with `initialize`).

### Limits

The server is free to use and has hard limits, so that abuse cannot run up costs:

- 300 calls per address per day (exact) and about 60 per minute;
- 20,000 calls per day and 300,000 per month for the whole service.

Beyond a limit the answer is `429` with `Retry-After` until the next day (Madrid time) or month. Addresses are never stored as they are: only a daily summary that cannot be followed from one day to the next.

### How it works

- A single Cloudflare Worker (`src/`) with a Durable Object that counts the calls.
- **Data:** read from a file the website publishes on every release (`/recursos/agents/mcp/crida.json`), at most once per 10 minutes per instance. A copy bundled with the Worker (`dades/`) is the fallback.
- **No amplification:** no tool calls other services or the server itself.
- **WebMCP:** `/mcp/webmcp.js` registers four of these tools in browsers that support it, calling this same endpoint.

```bash
npm install
npm run tipus      # TypeScript
npm run proves     # local tests against wrangler dev, with low limits (never against production)
```

### Licence

- **Code:** [MIT](LICENSE).
- **Data** in `dades/` and the data files linked by the tools: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), unless a study page says otherwise. Please credit crida studio and link the page each answer cites.

## Español

Un servidor [Model Context Protocol](https://modelcontextprotocol.io) público y de solo lectura con los recursos de [crida studio](https://www.crida.studio/es/recursos/), un estudio de marketing, marca, web y tecnología de España que trabaja para cualquier tipo de negocio. Los asistentes de IA se pueden conectar a él y usar sus guías, sus datos abiertos propios, sus servicios, precios y casos, en castellano, catalán e inglés. Cada respuesta cita la página pública de la que sale y su fecha.

**Dirección:** `https://www.crida.studio/mcp` (Streamable HTTP, sin inicio de sesión)
**Tarjeta del servidor:** `https://www.crida.studio/mcp/server-card`
**Contador público:** `https://www.crida.studio/mcp/estat`

### Herramientas

| Herramienta | Qué hace |
|---|---|
| `about_crida` | Qué es crida studio y dónde están sus recursos, precios y contacto |
| `search_crida` | Búsqueda por palabras en todas las páginas públicas: guías, estudios, casos, servicios y precios |
| `read_page` | Una guía entera: introducción, secciones y preguntas frecuentes |
| `list_open_datasets` | Los conjuntos de datos que ha contado crida studio, con periodo, DOI y fecha |
| `get_open_dataset` | Un conjunto: hallazgos, método, archivos, fuentes originales y cita lista para usar |
| `read_open_data_file` | Filas de un archivo de datos abiertos (CSV), por páginas |
| `list_services` / `get_service` | Los servicios y qué incluye cada uno |
| `get_prices` | Los precios de partida publicados (sin IVA) |
| `list_cases` / `get_case` | Los casos de clientes publicados |
| `prepare_quote_request` | Un borrador de petición de presupuesto que la persona revisa y envía **ella misma** desde la página de contacto. No envía ni guarda nada |

Todas las herramientas son de solo lectura. No hay nada estimado ni escrito a mano: los datos salen de las publicaciones de la propia web.

### Cómo conectarlo

- **Claude** (claude.ai o la aplicación): Configuración → Conectores → Añadir conector personalizado → `https://www.crida.studio/mcp`.
- **ChatGPT** (modo desarrollador): añade un conector con la misma dirección, sin autenticación.
- **Claude Code:** `claude mcp add --transport http crida https://www.crida.studio/mcp`
- **Cualquier cliente:** el servidor habla MCP 2026-07-28 (sin estado) y las versiones anteriores, de 2025-03-26 a 2025-11-25 (con `initialize`).

### Límites

El uso es gratuito y tiene límites fijos, para que un abuso no pueda disparar el coste:

- 300 llamadas por dirección y día (exactas) y unas 60 por minuto;
- 20.000 llamadas al día y 300.000 al mes para todo el servicio.

Al pasar un límite, la respuesta es `429` con `Retry-After` hasta el día siguiente (hora de Madrid) o el mes siguiente. Las direcciones nunca se guardan tal cual: solo un resumen diario que no se puede seguir de un día a otro.

### Licencia

- **Código:** [MIT](LICENSE).
- **Datos** de `dades/` y archivos de datos que enlazan las herramientas: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), salvo que la página del estudio diga otra cosa. Cita a crida studio y enlaza la página que menciona cada respuesta.
