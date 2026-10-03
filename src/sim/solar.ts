/**
 * Solproduksjon time for time, bygd fra månedstallene i arket «Sol Kragerø».
 * Daglengden regnes astronomisk for ca. 58,9° N (Kragerø). Energien for dagen fordeles
 * over dagslyset med en glatt klokkekurve (cos²). Vær og forbipasserende skyer skalerer kurven.
 * Alt er beregnet/anslått, ikke målt.
 */
import { FORUTSETNINGER, PV_KWP, kWhPerKwpPerDogn } from './data';

export const BREDDEGRAD = 58.9;
export const LENGDEGRAD = 9.4;

export type Vaer = 'sol' | 'delvis' | 'overskyet';

export const VAER_NAVN: Record<Vaer, string> = { sol: 'Sol', delvis: 'Delvis skyet', overskyet: 'Overskyet' };

/**
 * Antakelser om været. Kildens månedstall er et gjennomsnitt over alle slags dager, så en
 * skyfri dag ligger over gjennomsnittet og en overskyet dag langt under.
 * [base, laveste skyfaktor, høyeste skyfaktor]
 */
const VAER: Record<Vaer, { base: number; lo: number; hi: number }> = {
  sol: { base: 1.25, lo: 0.92, hi: 1.0 },
  delvis: { base: 1.0, lo: 0.45, hi: 1.15 },
  overskyet: { base: 1.0, lo: 0.2, hi: 0.4 },
};

/** Maks effekt fra panelene i praksis (kW), et stykke under merkeeffekten */
const MAKS_ANDEL_AV_KWP = 0.85;

const rad = (g: number) => (g * Math.PI) / 180;

/** Dagnummer (1 = 1. januar) for en simuleringsdato (UTC-felter = hyttas klokke) */
export function dagnummer(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86_400_000) + 1;
}

/** Solens deklinasjon (grader) for et dagnummer */
export function deklinasjon(doy: number): number {
  return 23.44 * Math.sin(rad((360 / 365) * (doy - 81)));
}

/** Daglengde i timer (solhøyde −0,833° ved opp- og nedgang) */
export function daglengde(doy: number, bredde = BREDDEGRAD): number {
  const dec = rad(deklinasjon(doy));
  const phi = rad(bredde);
  const cosw = (Math.sin(rad(-0.833)) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosw <= -1) return 24;
  if (cosw >= 1) return 0;
  return (2 * (Math.acos(cosw) * 180) / Math.PI) / 15;
}

/** Omtrentlig sommertid (siste søndag i mars til siste søndag i oktober), forenklet til dagnummer 87–300 */
export function sommertid(doy: number): boolean {
  return doy >= 87 && doy <= 300;
}

/** Klokkeslett for solens høyeste punkt (timer, desimal). Tidsjevning er utelatt (anslag). */
export function solmiddag(doy: number): number {
  return 12 + (15 - LENGDEGRAD) / 15 + (sommertid(doy) ? 1 : 0);
}

export interface Soldag {
  doy: number;
  maned: number;
  daglengde: number;
  soloppgang: number;
  solnedgang: number;
  /** Gjennomsnittlig produksjon denne måneden (kWh/døgn DC etter systemtap) */
  energiKWh: number;
  interpolert: boolean;
}

export function soldag(d: Date, kwp = PV_KWP): Soldag {
  const doy = dagnummer(d);
  const maned = d.getUTCMonth();
  const L = daglengde(doy);
  const noon = solmiddag(doy);
  return {
    doy, maned, daglengde: L, soloppgang: noon - L / 2, solnedgang: noon + L / 2,
    energiKWh: kWhPerKwpPerDogn(maned) * kwp * FORUTSETNINGER.systemtap,
    interpolert: maned === 2 || maned === 9,
  };
}

/**
 * Produksjon uten vær (W DC), klokkeslett i timer (desimal). cos²-klokke over dagslyset,
 * normalisert så integralet over dagen blir månedens gjennomsnitt.
 */
export function klarProduksjonW(s: Soldag, time: number): number {
  const x = (time - (s.soloppgang + s.solnedgang) / 2) / s.daglengde; // −0,5 … 0,5
  if (Math.abs(x) >= 0.5 || s.daglengde <= 0) return 0;
  const c = Math.cos(Math.PI * x);
  return ((2 * s.energiKWh * 1000) / s.daglengde) * c * c;
}

/** Deterministisk pseudotilfeldighet (mulberry32) for «forbipasserende skyer» */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KNUTE_MIN = 20;

/**
 * Skyfaktor for et absolutt minutt i simuleringen. Verdinoise med knuter hver 20. minutt og
 * glatt overgang, så samme frø og vær alltid gir samme skyer.
 */
export class Skyer {
  private cache = new Map<number, number>();
  constructor(private seed: number) {}

  private knute(k: number, v: Vaer): number {
    const key = k * 4 + (v === 'sol' ? 0 : v === 'delvis' ? 1 : 2);
    let x = this.cache.get(key);
    if (x === undefined) {
      const r = mulberry32((this.seed * 7919 + k * 104729 + key) >>> 0)();
      const { lo, hi } = VAER[v];
      x = lo + (hi - lo) * r;
      this.cache.set(key, x);
    }
    return x;
  }

  faktor(absMinutt: number, v: Vaer): number {
    const p = absMinutt / KNUTE_MIN;
    const k = Math.floor(p);
    const f = p - k;
    const s = f * f * (3 - 2 * f); // smoothstep
    const a = this.knute(k, v);
    const b = this.knute(k + 1, v);
    return VAER[v].base * (a + (b - a) * s);
  }
}

/** Faktisk produksjon (W DC) et gitt sekund i simuleringen */
export function produksjonW(s: Soldag, sekundIDogn: number, vaer: Vaer, skyer: Skyer, absMinutt: number, kwp = PV_KWP): number {
  const klar = klarProduksjonW(s, sekundIDogn / 3600);
  const p = klar * skyer.faktor(absMinutt, vaer);
  return Math.min(p, kwp * 1000 * MAKS_ANDEL_AV_KWP);
}
