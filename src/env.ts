import type { Comptador } from './comptador.ts';

export interface Env {
  COMPTADOR: DurableObjectNamespace<Comptador>;
  PER_MINUT: RateLimit;
  IP_SAL?: string;
  /** Secret that marks our own test calls (header X-Crida-Prova), so the counter can tell them apart. */
  PROVA_CLAU?: string;
  /** Data file published by the website on every release; read by src/dades.ts. */
  DADES_URL?: string;
  TOPALL_IP_DIA?: string;
  TOPALL_DIA?: string;
  TOPALL_MES?: string;
  TOPALL_CERCA_MES?: string;
}
