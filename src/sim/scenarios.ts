/**
 * Ferdige scenarioer for simuleringen. Hvert scenario er bare et oppsett (dato, vær, folk,
 * startnivå, planlagte hendelser). Oppsummeringen skrives fra faktisk statistikk etterpå.
 */
import type { SimOppsett, Statistikk, Hytte } from './cabin';
import { kWh, liter, prosent, varighet } from './format';

export interface Scenario {
  id: string;
  tittel: string;
  beskrivelse: string;
  oppsett: SimOppsett;
  /** Anbefalt fart (simulerte sekunder per virkelig sekund) */
  fart: number;
  oppsummering: (st: Statistikk, h: Hytte) => string;
}

const T = (h: number, m = 0) => h * 3600 + m * 60;

function generatorSetning(st: Statistikk): string {
  if (st.starter === 0) return 'Generatoren startet ikke.';
  const n = st.starter === 1 ? 'én gang' : `${st.starter} ganger`;
  return `Generatoren startet ${n} og gikk i alt ${varighet(st.generatorS)}, som brukte ca. ${liter(st.liter)} diesel.`;
}

export const SCENARIOER: Scenario[] = [
  {
    id: 'sommer',
    tittel: 'Vanlig sommerdag i juli',
    beskrivelse: 'Seks personer på hytta en solrik onsdag. Sola dekker alt, og generatoren står stille.',
    oppsett: { start: { aar: 2026, maned: 6, dag: 15, time: 0 }, varighetS: 24 * 3600, vaer: 'sol', folk: 6, startNiva: 60, seed: 11 },
    fart: 600,
    oppsummering: (st) =>
      `På ett døgn ga sola ${kWh(st.solKWh)} og hytta brukte ${kWh(st.forbrukKWh)}. Batteriet var lavest på ${prosent(st.minNiva)} og høyest på ${prosent(st.maksNiva)}. ${generatorSetning(st)} ${st.starter === 0 ? 'Slik ser de fleste sommerdagene ut.' : ''}`,
  },
  {
    id: 'september',
    tittel: 'Overskyet helg i september',
    beskrivelse: 'Fredag kveld til søndag kveld med seks personer og grått vær. Batteriet holder ikke hele helgen alene, så generatoren starter av seg selv.',
    oppsett: { start: { aar: 2026, maned: 8, dag: 18, time: 18 }, varighetS: 48 * 3600, vaer: 'overskyet', folk: 6, startNiva: 80, seed: 7 },
    fart: 1200,
    oppsummering: (st) =>
      `I løpet av helgen ga sola bare ${kWh(st.solKWh)}, mens hytta brukte ${kWh(st.forbrukKWh)}. ${generatorSetning(st)} Batteriet var lavest på ${prosent(st.minNiva)}. Ingen trengte å gjøre noe.`,
  },
  {
    id: 'vinter',
    tittel: 'Kald vinterdag',
    beskrivelse: 'To personer på hytta i januar, minusgrader. Styringen forvarmer generatoren i 20 minutter før den starter.',
    oppsett: { start: { aar: 2026, maned: 0, dag: 20, time: 7 }, varighetS: 6 * 3600, vaer: 'delvis', folk: 2, startNiva: 33, seed: 3, tempOffset: -4 },
    fart: 300,
    oppsummering: (st) =>
      `Det var kaldt, så generatoren ble forvarmet i ${varighet(st.forvarmetS)} før start. ${generatorSetning(st)} Sola ga bare ${kWh(st.solKWh)} på disse timene.`,
  },
  {
    id: 'desember',
    tittel: 'Ingen på hytta i desember',
    beskrivelse: 'En uke med tom hytte og Starlink på hele tiden. Generatoren holder batteriet i live av seg selv.',
    oppsett: { start: { aar: 2026, maned: 11, dag: 3, time: 0 }, varighetS: 7 * 24 * 3600, vaer: 'delvis', folk: 0, startNiva: 55, seed: 5 },
    fart: 3600,
    oppsummering: (st) =>
      `På en uke brukte overvåkingen ${kWh(st.forbrukKWh)}, og sola ga ${kWh(st.solKWh)}. ${generatorSetning(st)} Det er prisen for å ha Starlink på hele vinteren, se avsnittet «Hele året».`,
  },
  {
    id: 'starterikke',
    tittel: 'Generatoren starter ikke',
    beskrivelse: 'Grå septemberdag, batteriet er lavt, og generatoren svarer ikke på startsignalet. Du får alarm på telefonen etter 90 sekunder.',
    oppsett: {
      start: { aar: 2026, maned: 8, dag: 19, time: 16 }, varighetS: 3 * 3600, vaer: 'overskyet', folk: 6, startNiva: 31, seed: 9,
      hendelser: [{ etterS: 60, type: 'nostart', paa: true }],
    },
    fart: 60,
    oppsummering: (st) =>
      `${st.alarmer > 0 ? 'Alarmen kom på telefonen 90 sekunder etter at startsignalet ble sendt.' : 'Ingen alarm ble sendt.'} Batteriet falt til ${prosent(st.minNiva)}${st.frakobletS > 0 ? ', og ikke-vitale laster ble koblet fra for å spare strøm' : ''}. Her må noen reise ut og se på generatoren, men du vet det med en gang.`,
  },
  {
    id: 'co',
    tittel: 'CO-alarm i skuret',
    beskrivelse: 'Batteriet er lavt og trenger generatoren, men CO-/røykvarsleren i skuret slår ut. Starten blir sperret, og alarmen går.',
    oppsett: {
      start: { aar: 2026, maned: 9, dag: 10, time: 19 }, varighetS: 90 * 60, vaer: 'overskyet', folk: 4, startNiva: 29, seed: 4,
      hendelser: [{ etterS: 120, type: 'co', paa: true }, { etterS: 45 * 60, type: 'co', paa: false }],
    },
    fart: 60,
    oppsummering: (st, h) => {
      const sperret = h.logg.some((l) => l.tekst.startsWith('CO-/røykvarsleren i skuret har slått ut'));
      return `${sperret ? 'Varsleren sperret generatoren, og alarmen gikk til telefonen.' : ''} ${st.starter > 0 ? `Da varsleren ble nullstilt, startet generatoren som normalt.` : 'Generatoren startet ikke.'} Sikkerheten går alltid foran strøm.`;
    },
  },
  {
    id: 'nodstopp',
    tittel: 'Nødstopp',
    beskrivelse: 'Generatoren går, og noen trykker på nødstoppen i skuret. Alt stopper trygt, og alarmen går.',
    oppsett: {
      start: { aar: 2026, maned: 9, dag: 11, time: 20 }, varighetS: 60 * 60, vaer: 'overskyet', folk: 3, startNiva: 27, seed: 8,
      hendelser: [{ etterS: 20 * 60, type: 'nodstopp', paa: true }],
    },
    fart: 60,
    oppsummering: (st) =>
      `Generatoren stoppet med en gang nødstoppen ble trykket${st.alarmer > 0 ? ', og alarmen gikk til telefonen' : ''}. Den kan ikke starte igjen før nødstoppen er tilbakestilt på stedet.`,
  },
  {
    id: 'lavt',
    tittel: 'Batteriet blir veldig lavt',
    beskrivelse: 'Kveld med mye forbruk og nesten tomt batteri. Under 15 % kobler styringen fra pumpe, ladere og verktøy til generatoren går.',
    oppsett: {
      start: { aar: 2026, maned: 8, dag: 26, time: 20, minutt: 30 }, varighetS: 3 * 3600, vaer: 'overskyet', folk: 6, startNiva: 16, seed: 2,
      hendelser: [{ etterS: 30, type: 'kloyv' }],
    },
    fart: 60,
    oppsummering: (st) =>
      `Batteriet var nede i ${prosent(st.minNiva)}. Ikke-vitale laster var koblet fra i ${varighet(st.frakobletS)}, mens lys, kjøleskap og overvåking gikk hele tiden. ${generatorSetning(st)}`,
  },
  {
    id: 'test',
    tittel: 'Månedlig testkjøring',
    beskrivelse: 'Den 1. i måneden kl. 12:00 kjører generatoren i 30 minutter, hvis batteriet er under 70 %, så den ikke står ubrukt for lenge.',
    oppsett: { start: { aar: 2026, maned: 9, dag: 1, time: 11, minutt: 55 }, varighetS: 60 * 60, vaer: 'delvis', folk: 0, startNiva: 62, seed: 6 },
    fart: 120,
    oppsummering: (st) =>
      `${generatorSetning(st)} ${st.starter > 0 ? 'Den stoppet av seg selv etter 30 minutter, uavhengig av batterinivået.' : 'Batteriet var over 70 %, så testkjøringen ble hoppet over.'}`,
  },
];

export function finnScenario(id: string): Scenario | undefined {
  return SCENARIOER.find((s) => s.id === id);
}

/** Fritt oppsett når brukeren velger dato, vær og folk selv */
export function frittOppsett(dato: Date, vaer: SimOppsett['vaer'], folk: number, startNiva: number): SimOppsett {
  return {
    start: { aar: dato.getUTCFullYear(), maned: dato.getUTCMonth(), dag: dato.getUTCDate(), time: 6 },
    varighetS: 24 * 3600, vaer, folk, startNiva, seed: 1,
  };
}

export { T as klokkeslettSek };
