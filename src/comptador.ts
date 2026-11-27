// Comptador: ONE Durable Object for the whole service (name "global"). A Durable Object runs one request at a time,
// so the counts are exact and the caps really cut. Every call that reaches the MCP endpoint is counted here BEFORE
// it is read: garbage counts too. Stored: per Madrid day the total and one row per summarised IP (deleted when the day
// changes), per month the total, the semantic searches and the refusals. No IP is ever stored as is.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env.ts';
import { topallsDe } from './topalls.ts';

export type Motiu = 'ip' | 'dia' | 'mes';
export interface Decisio { ok: boolean; motiu?: Motiu; ipAvui: number; avui: number; mes: number }
export interface Estat {
  dia: string; mes: string;
  avui: { crides: number; topall: number; ips_tallades: number; rebutjades: number; proves: number };
  mes_actual: { crides: number; topall: number; cerques_semantiques: number; topall_cerques: number; rebutjades: number; proves: number };
  topall_ip_dia: number;
}

export class Comptador extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS comptes (clau TEXT PRIMARY KEY, valor INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS ips (ip TEXT PRIMARY KEY, n INTEGER NOT NULL)');
  }

  private llegeix(clau: string): number {
    return this.sql.exec<{ valor: number }>('SELECT valor FROM comptes WHERE clau = ?', clau).toArray()[0]?.valor ?? 0;
  }
  private suma(clau: string, n = 1): void {
    this.sql.exec('INSERT INTO comptes (clau, valor) VALUES (?, ?) ON CONFLICT(clau) DO UPDATE SET valor = valor + excluded.valor', clau, n);
  }

  /** A new Madrid day: the per-IP rows go (they are only needed for today); totals of old days older than 40 days go. */
  private canviDeDia(dia: string): void {
    const darrer = this.sql.exec<{ valor: number }>("SELECT valor FROM comptes WHERE clau = 'darrer_dia_num'").toArray()[0]?.valor;
    const num = Number(dia.replaceAll('-', ''));
    if (darrer === num) return;
    this.sql.exec('DELETE FROM ips');
    this.sql.exec("INSERT INTO comptes (clau, valor) VALUES ('darrer_dia_num', ?) ON CONFLICT(clau) DO UPDATE SET valor = excluded.valor", num);
    const limit = new Date(Date.now() - 40 * 86400_000).toISOString().slice(0, 10);
    for (const r of this.sql.exec<{ clau: string }>("SELECT clau FROM comptes WHERE clau LIKE 'dia:%' OR clau LIKE 'tallades:%' OR clau LIKE 'rebutjades:%' OR clau LIKE 'proves:%'").toArray()) {
      const data = r.clau.split(':')[1] ?? '';
      if (data.length === 10 && data < limit) this.sql.exec('DELETE FROM comptes WHERE clau = ?', r.clau);
    }
  }

  /** Counts one call. The order matters: month, then day, then this IP. A refused call is not added to the totals.
   *  `prova`: one of our own test calls (header X-Crida-Prova with the secret PROVA_CLAU, 27/11/2026). It counts and is capped
   *  like any other, and is also added to its own total, so /mcp/estat says how many calls were ours. */
  async compta(ip: string, dia: string, mes: string, prova = false): Promise<Decisio> {
    this.canviDeDia(dia);
    const t = topallsDe(this.env);
    const totalMes = this.llegeix(`mes:${mes}`), totalDia = this.llegeix(`dia:${dia}`);
    const ipAvui = this.sql.exec<{ n: number }>('SELECT n FROM ips WHERE ip = ?', ip).toArray()[0]?.n ?? 0;
    const motiu: Motiu | undefined = totalMes >= t.mes ? 'mes' : totalDia >= t.dia ? 'dia' : ipAvui >= t.ipDia ? 'ip' : undefined;
    if (motiu) {
      this.suma(`rebutjades:${dia}`);
      this.suma(`rebutjades_mes:${mes}`);
      if (motiu === 'ip' && ipAvui === t.ipDia) {
        this.suma(`tallades:${dia}`);
        this.sql.exec('UPDATE ips SET n = n + 1 WHERE ip = ?', ip); // marks it as counted once among the cut IPs
      }
      return { ok: false, motiu, ipAvui, avui: totalDia, mes: totalMes };
    }
    this.sql.exec('INSERT INTO ips (ip, n) VALUES (?, 1) ON CONFLICT(ip) DO UPDATE SET n = n + 1', ip);
    this.suma(`dia:${dia}`);
    this.suma(`mes:${mes}`);
    if (prova) { this.suma(`proves:${dia}`); this.suma(`proves_mes:${mes}`); }
    return { ok: true, ipAvui: ipAvui + 1, avui: totalDia + 1, mes: totalMes + 1 };
  }

  /** Reserves one semantic search of the month (phase c). false = the month's free allowance is used: static search. */
  async reservaCerca(mes: string): Promise<boolean> {
    const t = topallsDe(this.env);
    if (this.llegeix(`cerca:${mes}`) >= t.cercaMes) return false;
    this.suma(`cerca:${mes}`);
    return true;
  }

  async estat(dia: string, mes: string): Promise<Estat> {
    this.canviDeDia(dia);
    const t = topallsDe(this.env);
    return {
      dia, mes,
      avui: { crides: this.llegeix(`dia:${dia}`), topall: t.dia, ips_tallades: this.llegeix(`tallades:${dia}`), rebutjades: this.llegeix(`rebutjades:${dia}`), proves: this.llegeix(`proves:${dia}`) },
      mes_actual: { crides: this.llegeix(`mes:${mes}`), topall: t.mes, cerques_semantiques: this.llegeix(`cerca:${mes}`), topall_cerques: t.cercaMes, rebutjades: this.llegeix(`rebutjades_mes:${mes}`), proves: this.llegeix(`proves_mes:${mes}`) },
      topall_ip_dia: t.ipDia,
    };
  }
}
