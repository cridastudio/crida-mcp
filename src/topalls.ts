// Caps of the public MCP server (house rule: whatever can cost money is protected from bots and abuse; if someone
// abuses, it is cut). The numbers live in wrangler.toml [vars] and are never raised without the owner's yes.
import type { Env } from './env.ts';

export interface Topalls { ipDia: number; dia: number; mes: number; cercaMes: number }

const enter = (v: string | undefined, perDefecte: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : perDefecte;
};

/** The caps in force. A missing or broken value falls back to the safe default, never to "no cap". */
export const topallsDe = (env: Env): Topalls => ({
  ipDia: enter(env.TOPALL_IP_DIA, 300),
  dia: enter(env.TOPALL_DIA, 20000),
  mes: enter(env.TOPALL_MES, 300000),
  cercaMes: enter(env.TOPALL_CERCA_MES, 900),
});

/** Madrid day (YYYY-MM-DD) and month (YYYY-MM): the counters reset at local midnight. */
const DATA_MADRID = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' });
export const dia = (d = new Date()): string => DATA_MADRID.format(d);
export const mes = (d = new Date()): string => dia(d).slice(0, 7);

/** Seconds until the next Madrid midnight (for Retry-After), between 60 s and 25 h. */
export function segonsFinsDema(d = new Date()): number {
  const avui = dia(d);
  let t = d.getTime();
  for (let pas = 3600_000; pas >= 60_000; pas /= 60) while (dia(new Date(t + pas)) === avui) t += pas;
  return Math.min(90000, Math.max(60, Math.ceil((t - d.getTime()) / 1000)));
}

const prefix64 = (ip: string): string | null => {
  const parts = ip.split('::')[0]?.split(':') ?? [];
  return parts.length >= 4 ? parts.slice(0, 4).join(':') + '::/64' : null;
};
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** IP summarised with the day and a secret: never stored as is, cannot be followed from one day to the next.
 *  IPv6 counts by /64, because a home connection can change the end of the address at will. */
export async function ipResumida(req: Request, sal: string): Promise<{ resum: string; clau: string }> {
  const cru = req.headers.get('cf-connecting-ip') ?? 'local';
  const ip = cru.includes(':') ? prefix64(cru) ?? cru : cru;
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}|${dia()}|${sal}`));
  return { resum: hex(new Uint8Array(h).subarray(0, 8)), clau: ip };
}
