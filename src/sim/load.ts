/**
 * Forbruksprofil time for time, bygd fra lastlisten (ark «Last»). Med 6 personer summerer
 * profilen til lastlistens døgnsum (ca. 3,2 kWh med 5G-ruter). Uten folk går bare standby (48 W).
 * Når styringen kobler fra ikke-vitale laster, faller pumpe, ladere og verktøy bort.
 * Fordelingen over døgnet er en antakelse.
 */
import { STANDBY_W } from './data';

export interface LastNaa {
  /** Sum (W AC) */
  totalW: number;
  /** Vitale laster: standby, kjøleskap, lys */
  vitalW: number;
  /** Ikke-vitale laster: pumpe, ladere, nettbrett, verktøy, vedkløyver */
  ikkeVitalW: number;
  /** Navn på det som trekker mest akkurat nå utover standby (til visning) */
  aktive: string[];
}

const T = (h: number, m = 0) => h * 3600 + m * 60;

/** Vannpumpe: 15 korte tappinger à 2 min = 30 min/døgn */
const PUMPE_START = [
  T(7, 30), T(7, 45), T(8, 0), T(8, 15), T(8, 30),
  T(12, 30), T(13, 0),
  T(18, 30), T(18, 45), T(19, 0), T(19, 30), T(20, 0), T(21, 0), T(21, 30), T(22, 0),
];
const PUMPE_VARIGHET = 120;

/** Daglig bruk av vedkløyver (11:00–11:15) og verktøy (15:00–15:15) når det er folk der */
const KLOYVER_START = T(11, 0);
const VERKTOY_START = T(15, 0);
const VERKTOY_VARIGHET = 15 * 60;

/** Lys 5 timer per kveld */
const LYS_FRA = T(18, 30);
const LYS_TIL = T(23, 30);

/** Ladere: mobil 1,5 t, nettbrett 2 t om kvelden */
const MOBIL_FRA = T(20, 0);
const MOBIL_TIL = T(21, 30);
const BRETT_FRA = T(20, 0);
const BRETT_TIL = T(22, 0);

/** Kjøleskap: 60 W, går 10 av hver 30 min (8 t/døgn). Startstrøm ×3 de første 2 s. */
function kjoleskapW(sek: number): number {
  const i = sek % 1800;
  if (i >= 600) return 0;
  return i < 2 ? 180 : 60;
}

function inne(sek: number, fra: number, til: number): boolean {
  return sek >= fra && sek < til;
}

/**
 * Last akkurat nå.
 * @param sekIDogn sekund i døgnet (0–86 399)
 * @param folk antall personer (0–6)
 * @param ekstraKloyver sann når «Kløyv ved nå» er aktiv
 * @param sheddet sann når ikke-vitale laster er koblet fra
 */
export function last(sekIDogn: number, folk: number, ekstraKloyver: boolean, sheddet: boolean): LastNaa {
  const aktive: string[] = [];
  let vital = STANDBY_W;
  let ikkeVital = 0;
  if (folk > 0) {
    const k = kjoleskapW(sekIDogn);
    vital += k;
    if (k) aktive.push('kjøleskap');
    if (inne(sekIDogn, LYS_FRA, LYS_TIL)) { vital += 12 * 8; aktive.push('lys'); }

    if (inne(sekIDogn, MOBIL_FRA, MOBIL_TIL)) { ikkeVital += folk * 10; aktive.push('mobillading'); }
    if (inne(sekIDogn, BRETT_FRA, BRETT_TIL)) { ikkeVital += Math.ceil(folk / 2) * 15; aktive.push('nettbrett'); }
    for (const p of PUMPE_START) {
      if (inne(sekIDogn, p, p + PUMPE_VARIGHET)) {
        ikkeVital += sekIDogn - p < 1 ? 450 : 150;
        aktive.push('vannpumpe');
        break;
      }
    }
    if (inne(sekIDogn, KLOYVER_START, KLOYVER_START + VERKTOY_VARIGHET)) {
      ikkeVital += sekIDogn - KLOYVER_START < 1 ? 6600 : 2200;
      aktive.push('vedkløyver');
    }
    if (inne(sekIDogn, VERKTOY_START, VERKTOY_START + VERKTOY_VARIGHET)) {
      ikkeVital += sekIDogn - VERKTOY_START < 1 ? 2400 : 1200;
      aktive.push('verktøy');
    }
  }
  if (ekstraKloyver && !aktive.includes('vedkløyver')) {
    ikkeVital += 2200;
    aktive.push('vedkløyver');
  }
  if (sheddet) ikkeVital = 0;
  return { totalW: vital + ikkeVital, vitalW: vital, ikkeVitalW: ikkeVital, aktive };
}

/** Energi per døgn (Wh AC) for et gitt antall folk, uten frakobling. Brukes i tester og tekst. */
export function dogEnergiWh(folk: number): number {
  let wh = 0;
  for (let s = 0; s < 86400; s++) wh += last(s, folk, false, false).totalW / 3600;
  return wh;
}
