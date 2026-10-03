/** Norske tallformater: desimalkomma, mellomrom som tusenskille, 24-timers klokke. */
import { MANEDER } from './data';

const NBSP = ' ';

export function tall(v: number, desimaler = 0): string {
  const fixed = Math.abs(v).toFixed(desimaler);
  const [heltall, des] = fixed.split('.');
  const grupper = heltall!.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = v < 0 && Number(fixed) !== 0 ? '−' : '';
  return sign + grupper + (des ? ',' + des : '');
}

export function kWh(v: number, desimaler = 1): string {
  return `${tall(v, desimaler)}${NBSP}kWh`;
}

export function watt(v: number): string {
  if (Math.abs(v) >= 1000) return `${tall(v / 1000, v >= 10000 ? 1 : 2)}${NBSP}kW`;
  return `${tall(Math.round(v))}${NBSP}W`;
}

export function prosent(v: number, desimaler = 0): string {
  return `${tall(v, desimaler)}${NBSP}%`;
}

export function liter(v: number, desimaler = 1): string {
  return `${tall(v, desimaler)}${NBSP}l`;
}

export function grader(v: number): string {
  return `${tall(v, 0)}${NBSP}°C`;
}

const UKEDAGER = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

/** Simuleringstid representeres som UTC-felter i en Date, tolket som hyttas lokale klokke. */
export function klokke(d: Date, medSekunder = false): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  if (!medSekunder) return `${hh}:${mm}`;
  return `${hh}:${mm}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

export function dato(d: Date): string {
  return `${d.getUTCDate()}. ${MANEDER[d.getUTCMonth()]}`;
}

export function ukedag(d: Date): string {
  return UKEDAGER[d.getUTCDay()]!;
}

export function datoLang(d: Date): string {
  const u = ukedag(d);
  return `${u.charAt(0).toUpperCase()}${u.slice(1)} ${dato(d)}`;
}

/** «2 t 15 min», «45 min», «90 s» */
export function varighet(sek: number): string {
  if (sek < 120) return `${Math.round(sek)}${NBSP}s`;
  const min = Math.round(sek / 60);
  if (min < 60) return `${min}${NBSP}min`;
  const t = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${t}${NBSP}t ${m}${NBSP}min` : `${t}${NBSP}t`;
}
