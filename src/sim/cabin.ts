/**
 * Hele anlegget: energimodell (sol, forbruk, batteri, generator, temperatur) koblet til
 * styringen (`Controller`). 1 steg = 1 sekund. Deterministisk: samme oppsett gir samme resultat.
 * Hendelsesloggen og telefonvarslene lages fra faktiske signalendringer i styringen,
 * aldri fra et manus.
 */
import { Amf, Controller, type AmfMode, type Signals } from './logic';
import { BATTERI_KWH, FORUTSETNINGER, GENERATOR_LADING_W, MAKS_LADING_W, PV_KWP } from './data';
import { Skyer, dagnummer, produksjonW, soldag, type Soldag, type Vaer } from './solar';
import { temperatur } from './temperature';
import { last, type LastNaa } from './load';
import { klokke, prosent } from './format';

export type HendelseType =
  | 'kloyv' | 'nodstopp' | 'co' | 'diesel' | 'nostart' | 'overvaking' | 'kvitter' | 'testkjoring'
  | 'folk' | 'vaer';

export interface PlanlagtHendelse {
  /** Sekunder etter start */
  etterS: number;
  type: HendelseType;
  /** For av/på-hendelser: true = feilen oppstår, false = feilen er rettet */
  paa?: boolean;
  /** For 'folk': antall personer. For 'vaer': nytt vær. */
  verdi?: number | Vaer;
}

export interface SimOppsett {
  /** Startdato og -klokkeslett (hyttas klokke). maned: 0 = januar */
  start: { aar: number; maned: number; dag: number; time: number; minutt?: number };
  varighetS: number;
  vaer: Vaer;
  folk: number;
  /** Batterinivå ved start (%) */
  startNiva: number;
  seed: number;
  /** Justering av temperaturkurven (°C), f.eks. kuldeperiode */
  tempOffset?: number;
  amfMode?: AmfMode;
  hendelser?: PlanlagtHendelse[];
}

export type GeneratorTilstand = 'av' | 'forvarmer' | 'starter' | 'gaar' | 'hviler' | 'feil';

export const GENERATOR_TEKST: Record<GeneratorTilstand, string> = {
  av: 'Av', forvarmer: 'Forvarmer', starter: 'Starter', gaar: 'Går', hviler: 'Hviler', feil: 'Feil',
};

export type LoggType = 'generator' | 'batteri' | 'alarm' | 'sol' | 'last' | 'bruker' | 'info';

export interface LoggLinje {
  t: number;
  tid: string;
  tekst: string;
  type: LoggType;
}

export interface Varsel {
  t: number;
  tid: string;
  tittel: string;
  tekst: string;
  alvor: 'alarm' | 'info';
}

export interface Prove {
  t: number;
  niva: number;
  solW: number;
  forbrukW: number;
  generator: boolean;
  frakoblet: boolean;
  alarm: boolean;
}

export interface Statistikk {
  solKWh: number;
  forbrukKWh: number;
  generatorKWh: number;
  generatorS: number;
  liter: number;
  minNiva: number;
  maksNiva: number;
  starter: number;
  alarmer: number;
  frakobletS: number;
  stromlosS: number;
  forvarmetS: number;
}

export interface Tilstand {
  t: number;
  dato: Date;
  niva: number;
  solW: number;
  forbruk: LastNaa;
  generatorW: number;
  ladingW: number;
  tempC: number;
  generator: GeneratorTilstand;
  frakoblet: boolean;
  alarmAktiv: boolean;
  alarmLagret: boolean;
  stromlos: boolean;
  liter: number;
  signaler: Signals;
  sol: Soldag;
  innganger: { nodstopp: boolean; co: boolean; diesel: boolean; nostart: boolean; overvaking: boolean };
  kloyvAktiv: boolean;
}

/** Batteristyringen (BMS) slår av vekselretteren under dette nivået og på igjen over det øvre */
const BMS_STOPP = 10;
const BMS_START = 15;

export class Hytte {
  ctl: Controller;
  t = 0;
  niva: number;
  liter = 0;
  folk: number;
  vaer: Vaer;
  logg: LoggLinje[] = [];
  varsler: Varsel[] = [];
  prover: Prove[] = [];
  stats: Statistikk = {
    solKWh: 0, forbrukKWh: 0, generatorKWh: 0, generatorS: 0, liter: 0, minNiva: 100, maksNiva: 0,
    starter: 0, alarmer: 0, frakobletS: 0, stromlosS: 0, forvarmetS: 0,
  };
  ferdig = false;

  private startMs: number;
  private skyer: Skyer;
  private kloyvTil = -1;
  private prev: Signals | null = null;
  private stromlos = false;
  private full = false;
  private solOppe = false;
  private solDekker = false;
  private testkjoring = false;
  private sisteDoy = -1;
  private sol!: Soldag;
  private hendelser: PlanlagtHendelse[];
  private sisteTilstand: Tilstand | null = null;

  constructor(public oppsett: SimOppsett) {
    const s = oppsett.start;
    this.startMs = Date.UTC(s.aar, s.maned, s.dag, s.time, s.minutt ?? 0);
    this.niva = oppsett.startNiva;
    this.folk = oppsett.folk;
    this.vaer = oppsett.vaer;
    this.skyer = new Skyer(oppsett.seed);
    this.ctl = new Controller(new Amf(10, 5, oppsett.amfMode ?? 'ok'));
    this.hendelser = [...(oppsett.hendelser ?? [])].sort((a, b) => a.etterS - b.etterS);
    this.oppdaterDag();
  }

  get dato(): Date {
    return new Date(this.startMs + this.t * 1000);
  }

  /** Siste øyeblikksbilde (før første steg: starttilstanden) */
  get tilstand(): Tilstand {
    return this.sisteTilstand ?? this.startTilstand();
  }

  private oppdaterDag(): void {
    const d = this.dato;
    const doy = dagnummer(d);
    if (doy !== this.sisteDoy) {
      this.sisteDoy = doy;
      this.sol = soldag(d, PV_KWP);
      this.solOppe = false;
      this.solDekker = false;
    }
  }

  private skriv(type: LoggType, tekst: string): void {
    this.logg.push({ t: this.t, tid: klokke(this.dato), tekst, type });
  }

  private varsle(alvor: Varsel['alvor'], tittel: string, tekst: string): void {
    this.varsler.push({ t: this.t, tid: klokke(this.dato), tittel, tekst, alvor });
    if (alvor === 'alarm') this.stats.alarmer++;
  }

  /** Brukerhendelser fra knappene i simuleringen (og planlagte hendelser i scenarioene) */
  hendelse(type: HendelseType, paa = true, verdi?: number | Vaer): void {
    const i = this.ctl.i;
    switch (type) {
      case 'kloyv':
        this.kloyvTil = this.t + 600;
        this.skriv('bruker', 'Du kløyver ved: vedkløyveren (2,2 kW) går i 10 minutter.');
        break;
      case 'nodstopp':
        i.I3 = !paa;
        this.skriv('bruker', paa ? 'Du trykker på nødstoppen.' : 'Du tilbakestiller nødstoppen.');
        break;
      case 'co':
        i.I6 = !paa;
        this.skriv('bruker', paa ? 'Du utløser CO-/røykvarsleren i skuret (test).' : 'Du nullstiller CO-/røykvarsleren.');
        break;
      case 'diesel':
        i.I5 = !paa;
        this.skriv('bruker', paa ? 'Dieseltanken melder lavt nivå.' : 'Du fyller diesel på tanken.');
        break;
      case 'nostart':
        this.ctl.amf.mode = paa ? 'no_start' : 'ok';
        this.skriv('bruker', paa ? 'Generatoren vil ikke starte (f.eks. tomt startbatteri).' : 'Feilen på generatoren er rettet.');
        break;
      case 'overvaking':
        i.hb = !paa;
        this.skriv('bruker', paa ? 'Overvåkingen (den lille serveren) slutter å svare.' : 'Overvåkingen svarer igjen.');
        break;
      case 'kvitter':
        this.ctl.acknowledge();
        this.skriv('bruker', 'Du kvitterer alarmen på telefonen.');
        break;
      case 'testkjoring':
        this.planleggTest();
        break;
      case 'folk':
        this.folk = Number(verdi ?? 0);
        this.skriv('bruker', this.folk === 0 ? 'Ingen er på hytta nå.' : `${this.folk} ${this.folk === 1 ? 'person' : 'personer'} er på hytta.`);
        break;
      case 'vaer':
        this.vaer = verdi as Vaer;
        this.skriv('bruker', `Været er nå ${this.vaer === 'sol' ? 'sol' : this.vaer === 'delvis' ? 'delvis skyet' : 'overskyet'}.`);
        break;
    }
  }

  private planleggTest(): void {
    this.ctl.wipe = 1800;
    if (this.niva < 70) {
      this.skriv('generator', 'Månedlig testkjøring: styringen starter generatoren i 30 minutter, siden batteriet er under 70 %.');
    } else {
      this.skriv('generator', `Månedlig testkjøring hoppes over: batteriet er på ${prosent(this.niva)}, altså over 70 %.`);
    }
  }

  private generatorTilstand(s: Signals): GeneratorTilstand {
    if (s.I2 || s.startfeil) return 'feil';
    if (s.I1) return 'gaar';
    if (s.q1) return 'starter';
    if (s.q3) return 'forvarmer';
    if (s.hvile) return 'hviler';
    return 'av';
  }

  private startTilstand(): Tilstand {
    const d = this.dato;
    const sek = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
    const i = this.ctl.i;
    return {
      t: this.t, dato: d, niva: this.niva,
      solW: 0, forbruk: last(sek, this.folk, false, false), generatorW: 0, ladingW: 0,
      tempC: temperatur(this.sol.doy, sek / 3600, this.oppsett.tempOffset ?? 0),
      generator: 'av', frakoblet: false, alarmAktiv: false, alarmLagret: false,
      stromlos: false, liter: 0, signaler: tomSignaler(), sol: this.sol,
      innganger: { nodstopp: !i.I3, co: !i.I6, diesel: !i.I5, nostart: this.ctl.amf.mode === 'no_start', overvaking: !i.hb },
      kloyvAktiv: false,
    };
  }

  /** Ett sekund fram. Returnerer øyeblikksbildet. */
  step(): Tilstand {
    // Planlagte hendelser
    while (this.hendelser.length && this.hendelser[0]!.etterS <= this.t) {
      const h = this.hendelser.shift()!;
      this.hendelse(h.type, h.paa ?? true, h.verdi);
    }
    this.oppdaterDag();
    const d = this.dato;
    const sek = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
    const absMinutt = Math.floor((this.startMs / 60000) + this.t / 60);
    const temp = temperatur(this.sol.doy, sek / 3600, this.oppsett.tempOffset ?? 0);

    // Månedlig testkjøring: den 1. i måneden kl. 12:00 (antatt tidspunkt)
    if (d.getUTCDate() === 1 && sek === 12 * 3600) {
      this.skriv('info', 'Det er den 1. i måneden kl. 12:00: tidspunkt for månedlig testkjøring.');
      this.planleggTest();
    }

    // Styringen leser batterinivå og temperatur, og bestemmer
    const s = this.ctl.step(this.niva, temp);

    // Energiflyt dette sekundet
    const solW = produksjonW(this.sol, sek, this.vaer, this.skyer, absMinutt, PV_KWP);
    const kloyv = this.t < this.kloyvTil;
    let forbruk = last(sek, this.folk, kloyv, !s.q2);
    if (this.stromlos) forbruk = { totalW: 0, vitalW: 0, ikkeVitalW: 0, aktive: [] };
    const forbrukDC = forbruk.totalW / FORUTSETNINGER.vekselretterVirkningsgrad;
    const generatorW = s.I1 ? GENERATOR_LADING_W : 0;
    const netto = solW + generatorW - forbrukDC;
    let ladingW = 0;
    if (netto > 0) {
      // Maks 0,3 C inn på batteriet, og mykere lading de siste prosentene
      const taper = this.niva > 95 ? Math.max(0, (100 - this.niva) / 5) : 1;
      ladingW = Math.min(netto, MAKS_LADING_W) * taper;
    } else {
      ladingW = netto;
    }
    this.niva = Math.min(100, Math.max(0, this.niva + (ladingW / (BATTERI_KWH * 1000)) * 100 / 3600));

    // Batteristyringen beskytter batteriet
    if (!this.stromlos && this.niva <= BMS_STOPP) {
      this.stromlos = true;
      this.skriv('batteri', 'Batteriet er nesten tomt (10 %). Batteristyringen slår av vekselretteren for å beskytte batteriet. Hytta er uten strøm til batteriet er ladet litt opp.');
      this.varsle('alarm', 'Hytta er uten strøm', 'Batteriet er nesten tomt og vekselretteren er slått av.');
    } else if (this.stromlos && this.niva >= BMS_START) {
      this.stromlos = false;
      this.skriv('batteri', 'Batteriet er ladet nok til at vekselretteren slår seg på igjen.');
    }

    // Statistikk
    const st = this.stats;
    st.solKWh += solW / 3_600_000;
    st.forbrukKWh += forbruk.totalW / 3_600_000;
    st.generatorKWh += generatorW / 3_600_000;
    if (s.I1) {
      st.generatorS++;
      const l = (GENERATOR_LADING_W / FORUTSETNINGER.laderVirkningsgrad / 1000) / FORUTSETNINGER.kWhPerLiter / 3600;
      this.liter += l;
      st.liter = this.liter;
    }
    if (!s.q2) st.frakobletS++;
    if (this.stromlos) st.stromlosS++;
    if (s.q3 && !s.I1) st.forvarmetS++;
    st.minNiva = Math.min(st.minNiva, this.niva);
    st.maksNiva = Math.max(st.maksNiva, this.niva);

    // Hendelser fra sol og batteri (ved første steg settes flaggene stille, uten logglinjer)
    if (this.t === 0) {
      this.solOppe = solW > 5;
      this.solDekker = solW > forbrukDC;
    }
    if (solW > 5 && !this.solOppe) {
      this.solOppe = true;
      this.skriv('sol', 'Sola står opp og panelene begynner å produsere.');
    } else if (solW <= 5 && this.solOppe && sek / 3600 > this.sol.solnedgang - 0.5) {
      this.solOppe = false;
      this.skriv('sol', 'Sola er nede. Resten av kvelden går hytta på batteriet.');
    }
    if (solW > forbrukDC && !this.solDekker && this.solOppe) {
      this.solDekker = true;
      this.skriv('sol', 'Sola gir mer enn hytta bruker, så overskuddet lader batteriet.');
    }
    if (this.niva >= 99.5 && !this.full) {
      this.full = true;
      this.skriv('batteri', 'Batteriet er fullt. Overskudd fra sola blir ikke brukt.');
    } else if (this.niva < 97 && this.full) {
      this.full = false;
    }

    // Hendelser fra styringen (signalendringer)
    this.loggSignaler(s);
    this.prev = s;

    if (this.t % 60 === 0) {
      this.prover.push({ t: this.t, niva: this.niva, solW, forbrukW: forbruk.totalW, generator: s.I1, frakoblet: !s.q2, alarm: s.now });
    }

    const tilstand: Tilstand = {
      t: this.t, dato: d, niva: this.niva, solW, forbruk, generatorW, ladingW, tempC: temp,
      generator: this.generatorTilstand(s), frakoblet: !s.q2, alarmAktiv: s.now, alarmLagret: this.ctl.alarm,
      stromlos: this.stromlos, liter: this.liter, signaler: s, sol: this.sol,
      innganger: {
        nodstopp: !this.ctl.i.I3, co: !this.ctl.i.I6, diesel: !this.ctl.i.I5,
        nostart: this.ctl.amf.mode === 'no_start', overvaking: !this.ctl.i.hb,
      },
      kloyvAktiv: kloyv,
    };
    this.sisteTilstand = tilstand;
    this.t++;
    if (this.t >= this.oppsett.varighetS) this.ferdig = true;
    return tilstand;
  }

  private loggSignaler(s: Signals): void {
    const p = this.prev ?? tomSignaler();
    const i = this.ctl.i;
    const niva = prosent(this.niva, 1);

    // Sikkerhetsinnganger (nødstopp, CO/røyk, diesel)
    if (!i.I3 && !this.sisteInngang('nodstopp')) {
      this.skriv('alarm', 'Nødstoppen er trykket. Generatoren er sperret, og styringen sender alarm.');
      this.varsle('alarm', 'Nødstopp', 'Nødstoppen i skuret er trykket. Generatoren er sperret.');
      this.merkInngang('nodstopp', true);
    } else if (i.I3 && this.sisteInngang('nodstopp')) {
      this.skriv('info', 'Nødstoppen er tilbakestilt. Generatoren kan starte igjen.');
      this.merkInngang('nodstopp', false);
    }
    if (!i.I6 && !this.sisteInngang('co')) {
      this.skriv('alarm', 'CO-/røykvarsleren i skuret har slått ut. Generatoren er sperret, og styringen sender alarm.');
      this.varsle('alarm', 'CO-/røykalarm i skuret', 'Varsleren i generatorskuret har slått ut. Generatoren er sperret.');
      this.merkInngang('co', true);
    } else if (i.I6 && this.sisteInngang('co')) {
      this.skriv('info', 'CO-/røykvarsleren er nullstilt. Generatoren kan starte igjen.');
      this.merkInngang('co', false);
    }
    if (!i.I5 && !this.sisteInngang('diesel')) {
      this.skriv('alarm', 'Lite diesel på tanken. Generatoren er sperret til det er fylt, og styringen sender alarm.');
      this.varsle('alarm', 'Lite diesel', 'Tanken i skuret er nesten tom. Generatoren starter ikke før det er fylt.');
      this.merkInngang('diesel', true);
    } else if (i.I5 && this.sisteInngang('diesel')) {
      this.skriv('info', 'Dieseltanken er fylt. Generatoren kan starte igjen.');
      this.merkInngang('diesel', false);
    }

    // Batterinivå
    if (s.low && !p.low) this.skriv('batteri', `Batteriet er under 30 % (${niva}). Styringen venter 5 minutter før den ber generatoren starte.`);
    if (!s.low && p.low) this.skriv('batteri', `Batteriet er over 90 % (${niva}).`);

    if (s.q3 && !p.q3 && !s.I1) {
      this.skriv('generator', `Det er kaldt i skuret (under 5 °C), så forvarmingen av generatoren starter. Den går i 20 minutter før start.`);
    }

    if (s.q1 && !p.q1) {
      this.testkjoring = s.test;
      this.stats.starter++;
      if (s.test) this.skriv('generator', 'Testkjøring: styringen sender startsignal til generatoren.');
      else if (s.kald) this.skriv('generator', 'Forvarmingen er ferdig etter 20 minutter, så styringen sender startsignal til generatoren.');
      else this.skriv('generator', 'Batteriet har vært under 30 % i 5 minutter, så styringen sender startsignal til generatoren.');
    }
    if (!s.q1 && p.q1) {
      let grunn: string;
      if (s.stopp && s.d6h) grunn = 'Generatoren har gått i 6 timer (største tillatte gangtid), så styringen stopper den.';
      else if (s.stopp && this.testkjoring) grunn = 'Testkjøringen er ferdig: generatoren har gått i 30 minutter, så styringen stopper den.';
      else if (s.stopp) grunn = `Batteriet er over 90 % (${niva}) og generatoren har gått i over 30 minutter, så styringen stopper den.`;
      else if (!i.I3) grunn = 'Nødstoppen er trykket, så styringen stopper generatoren med en gang.';
      else if (!i.I6) grunn = 'CO-/røykvarsleren i skuret har slått ut, så styringen stopper generatoren med en gang.';
      else if (!i.I5) grunn = 'Lite diesel, så styringen stopper generatoren.';
      else if (s.I2) grunn = 'Generatorkontrolleren melder feil, så styringen tar bort startsignalet.';
      else if (!i.I4) grunn = 'Bryteren er satt til manuell, så styringen tar bort startsignalet.';
      else grunn = 'Styringen tar bort startsignalet.';
      this.skriv('generator', `${grunn} Den må hvile i 10 minutter før den kan starte igjen.`);
      this.varsle('info', 'Generatoren stoppet', grunn);
    }
    if (s.I1 && !p.I1) {
      this.skriv('generator', 'Generatoren går og lader batteriet med ca. 2,5 kW.');
      this.varsle('info', 'Generatoren startet', this.testkjoring ? 'Månedlig testkjøring (30 minutter).' : `Automatisk start, batteriet er på ${niva}.`);
    }
    if (!s.I1 && p.I1) {
      this.skriv('generator', s.q1 ? 'Generatoren har stoppet selv om styringen ber den gå.' : 'Generatoren har stoppet.');
    }

    if (!s.q2 && p.q2) this.skriv('last', `Batteriet er under 15 % (${niva}), så styringen kobler fra ikke-vitale laster: vannpumpe, ladere og verktøy. Lys, kjøleskap og overvåking går som før.`);
    if (s.q2 && !p.q2) {
      this.skriv('last', s.I1 ? 'Generatoren går, så ikke-vitale laster kobles inn igjen.' : `Batteriet er over 40 % (${niva}), så ikke-vitale laster kobles inn igjen.`);
    }
    if (!s.q2 && p.q2) this.varsle('alarm', 'Batteriet er svært lavt', `Batteriet er på ${niva}. Pumpe, ladere og verktøy er koblet fra.`);

    // Alarmer
    if (s.startfeil && !p.startfeil) {
      this.skriv('alarm', 'Generatoren har ikke startet 90 sekunder etter startsignalet. Styringen sender alarm.');
      this.varsle('alarm', 'Generatoren starter ikke', 'Startsignal er sendt, men generatoren har ikke startet på 90 sekunder.');
    }
    if (s.ukom && !p.ukom) {
      this.skriv('alarm', 'Generatoren går uten at styringen har bedt om det (i 30 sekunder). Styringen sender alarm.');
      this.varsle('alarm', 'Generatoren går av seg selv', 'Generatoren har gått i 30 sekunder uten startsignal.');
    }
    if (s.I2 && !p.I2) {
      this.skriv('alarm', 'Generatorkontrolleren melder feil og låser generatoren. Styringen sender alarm.');
      this.varsle('alarm', 'Feil på generatoren', 'Generatorkontrolleren har låst generatoren. Må sjekkes på stedet.');
    }
    if (!s.dataok && p.dataok) {
      this.skriv('alarm', 'Styringen har ikke fått livstegn fra overvåkingen på 60 sekunder. Alarm.');
      this.varsle('alarm', 'Mistet kontakt med hytta', `Siste melding fra hytta kom ${klokke(new Date(this.dato.getTime() - 60_000))}.`);
    }
    if (s.dataok && !p.dataok && this.prev) this.skriv('info', 'Kontakten med overvåkingen er tilbake.');

  }

  private inngangFlagg: Record<string, boolean> = {};
  private sisteInngang(n: string): boolean { return this.inngangFlagg[n] ?? false; }
  private merkInngang(n: string, v: boolean): void { this.inngangFlagg[n] = v; }
}

function tomSignaler(): Signals {
  return {
    I1: false, I2: false, klar: true, low: false, test: false, onske: false, kald: false, q3: false, forv: false,
    kjor: false, d30: false, d6h: false, stopp: false, hvile: false, q1: false, startfeil: false, ukom: false,
    dataok: true, now: false, alarm: false, shed: false, q2: true,
  };
}
