/**
 * Omtrentlig temperaturkurve for Kragerø: månedsnormaler (anslag) med en enkel døgnsvingning.
 * Brukes bare til å avgjøre om generatoren trenger forvarming (under 5 °C). Ikke målte data.
 */

/** Anslåtte månedsmiddel (°C), 0 = januar */
export const MANEDSMIDDEL = [-1.5, -1.5, 1.5, 6, 11, 15, 17.5, 17, 13, 8, 3.5, 0.5] as const;

/** Døgnsvingning (± °C) per måned, mindre om vinteren */
const SVING = [2, 2, 3, 4, 4.5, 4.5, 4.5, 4.5, 3.5, 3, 2, 2] as const;

const DAGER = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Glatt interpolasjon av månedsmiddel ut fra dagnummer (midt i måneden = normalen) */
export function middelTemp(doy: number): number {
  let d = doy - 1;
  let m = 0;
  while (m < 11 && d >= DAGER[m]!) { d -= DAGER[m]!; m++; }
  const midt = DAGER[m]! / 2;
  const t = d - midt;
  const nabo = t >= 0 ? (m + 1) % 12 : (m + 11) % 12;
  const avstand = t >= 0 ? (DAGER[m]! + DAGER[nabo]!) / 2 : (DAGER[nabo]! + DAGER[m]!) / 2;
  const f = Math.abs(t) / avstand;
  return MANEDSMIDDEL[m]! * (1 - f) + MANEDSMIDDEL[nabo]! * f;
}

/** Temperatur (°C) for dagnummer og klokkeslett (timer). Varmest ca. kl. 15, kaldest ca. kl. 03. */
export function temperatur(doy: number, time: number, offset = 0): number {
  let d = doy - 1;
  let m = 0;
  while (m < 11 && d >= DAGER[m]!) { d -= DAGER[m]!; m++; }
  return middelTemp(doy) + SVING[m]! * Math.cos((2 * Math.PI * (time - 15)) / 24) + offset;
}
