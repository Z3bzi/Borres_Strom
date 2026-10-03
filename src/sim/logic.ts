/**
 * Styringslogikk, modul 1–10. Dette er en direkte port av `kilder/logo_sim.py`
 * (referansesimuleringen) til TypeScript, med samme semantikk:
 *  - samme terskler og tider (1 steg = 1 sekund)
 *  - samme rekkefølge på evalueringen
 *  - reset-dominant lagring av «kjør»-signalet (Q1)
 *  - generatorkontrolleren svarer på Q1 fra forrige steg (ett skanns forsinkelse)
 *
 * Signalnavn (I1–I7, Q1–Q4) beholdes her i koden for sporbarhet mot
 * overleveringsdokumentet, men vises aldri på nettsiden.
 */

/** On-delay: sann når inngangen har vært sann i t steg. */
export class On {
  c = 0;
  constructor(public t: number) {}
  call(x: boolean): boolean {
    this.c = x ? this.c + 1 : 0;
    return this.c >= this.t;
  }
}

/** Off-delay (starter usann): forblir sann i t steg etter at inngangen faller. */
export class Off {
  c: number;
  constructor(public t: number) {
    this.c = t;
  }
  call(x: boolean): boolean {
    this.c = x ? 0 : Math.min(this.c + 1, this.t);
    return this.c < this.t;
  }
}

/** Terskel med hysterese: sann når x < lo, usann når x > hi, ellers hold. */
export class Trig {
  q = false;
  constructor(public lo: number, public hi: number) {}
  call(x: number): boolean {
    if (x < this.lo) this.q = true;
    else if (x > this.hi) this.q = false;
    return this.q;
  }
}

export type AmfMode = 'ok' | 'no_start' | 'stuck' | 'fault';

/**
 * Generisk generatorkontroller (autostart-kort). I1 = kjører, I2 = feil/lås.
 * mode: ok | no_start (starter aldri, ingen feil) | stuck (stopper ikke) | fault (låser etter 30 s gange).
 */
export class Amf {
  up = 0;
  down = 0;
  run = false;
  lock = false;
  constructor(
    public start = 10,
    public stop = 5,
    public mode: AmfMode = 'ok',
  ) {}

  call(q1: boolean): [boolean, boolean] {
    this.up = q1 ? this.up + 1 : 0;
    this.down = q1 ? 0 : this.down + 1;
    if (!this.lock && this.mode !== 'no_start' && this.up >= this.start) this.run = true;
    if (this.down >= this.stop && this.mode !== 'stuck') this.run = false;
    if (this.mode === 'fault' && this.run && this.up >= this.start + 30) this.lock = true;
    if (this.lock) this.run = false;
    return [this.run, this.lock];
  }

  /** Tilsvarer «Nullstill AMF-feil» i logo_modbus.py. */
  reset(): void {
    this.lock = false;
    this.run = false;
  }
}

/** Digitale innganger til styringen (alle sikkerhetssignaler er sanne = OK). */
export interface Inputs {
  /** Vern/nødstopp OK (NC: brudd = stopp) */
  I3: boolean;
  /** Auto/manuell-bryter i auto */
  I4: boolean;
  /** Drivstoff OK */
  I5: boolean;
  /** CO/røyk OK (blokkerer start) */
  I6: boolean;
  /** Batteristyring (BMS) OK */
  I7: boolean;
  /** Heartbeat fra overvåkingen */
  hb: boolean;
}

/** Alle interne signaler etter ett steg. Brukes til å lage hendelsesloggen fra faktisk tilstand. */
export interface Signals {
  I1: boolean;
  I2: boolean;
  klar: boolean;
  low: boolean;
  test: boolean;
  onske: boolean;
  kald: boolean;
  q3: boolean;
  forv: boolean;
  kjor: boolean;
  d30: boolean;
  d6h: boolean;
  stopp: boolean;
  hvile: boolean;
  q1: boolean;
  startfeil: boolean;
  ukom: boolean;
  dataok: boolean;
  now: boolean;
  alarm: boolean;
  shed: boolean;
  q2: boolean;
}

/** Selve styringen (modul 1–10). Batterinivå og temperatur kommer utenfra hvert steg. */
export class Controller {
  i: Inputs = { I3: true, I4: true, I5: true, I6: true, I7: true, hb: true };
  q1 = false;
  alarm = false;
  /** Gjenstående sekunder av testkjøring (Wiping relay) */
  wipe = 0;

  low = new Trig(30, 90);
  d5 = new On(300);
  kald = new Trig(5, 8);
  d20 = new On(1200);
  d30 = new On(1800);
  d6h = new On(21600);
  hvile = new Off(600);
  d90 = new On(90);
  d30u = new On(30);
  hbd = new Off(60);
  shed = new Trig(15, 40);

  constructor(public amf: Amf = new Amf()) {}

  step(soc: number, temp: number): Signals {
    const i = this.i;
    const [I1, I2] = this.amf.call(this.q1); // AMF svarer på Q1 fra forrige steg
    const klar = i.I3 && i.I6 && i.I5 && !I2 && i.I4; // 1
    const low = this.low.call(soc); // 2
    const test = this.wipe > 0 && soc < 70 && klar; // 10
    this.wipe = Math.max(0, this.wipe - 1);
    const onske = this.d5.call(low) || test;
    const kald = this.kald.call(temp); // 3
    const q3 = (onske && kald) || I1;
    const forv = this.d20.call(q3);
    const kjor = onske && (!kald || forv);
    const d30 = this.d30.call(I1); // 5
    const d6h = this.d6h.call(this.q1);
    const stopp = (!low && d30) || d6h;
    const hvile = this.hvile.call(this.q1); // 6
    if (stopp || !klar) this.q1 = false; // 4 (reset-dominant)
    else if (kjor && !hvile) this.q1 = true;
    const startfeil = this.d90.call(this.q1 && !I1); // 7
    const ukom = this.d30u.call(I1 && !this.q1);
    const dataok = this.hbd.call(i.hb); // 9
    const now = startfeil || ukom || I2 || !(i.I3 && i.I5 && i.I6 && i.I7) || !dataok;
    this.alarm = this.alarm || now; // lagres til kvittering
    const shed = this.shed.call(soc); // 8
    const q2 = !shed || I1;
    return {
      I1, I2, klar, low, test, onske, kald, q3, forv, kjor, d30, d6h, stopp, hvile,
      q1: this.q1, startfeil, ukom, dataok, now, alarm: this.alarm, shed, q2,
    };
  }

  /** Kvittering av lagret alarm (Softkey i overleveringen). Aktive feil blir stående. */
  acknowledge(): void {
    this.alarm = false;
  }
}

export type LogEntry = [t: number, name: string, value: boolean];

/**
 * Testharness som tilsvarer `Sim` i logo_sim.py: enkel batterimodell (2,5 kW lading når
 * generatoren går, ellers 115 W standby) og logg over Q1/Q2/Q3/Q4/I1-endringer.
 */
export class Sim {
  ctl: Controller;
  t = 0;
  log: LogEntry[] = [];
  last: Record<string, boolean> = {};

  constructor(
    public soc = 80,
    public temp = 15,
    amf?: Amf,
    public charge = 2.5,
    public cap = 8.4,
  ) {
    this.ctl = new Controller(amf ?? new Amf());
  }

  get i(): Inputs { return this.ctl.i; }
  get q1(): boolean { return this.ctl.q1; }
  get alarm(): boolean { return this.ctl.alarm; }
  get wipe(): number { return this.ctl.wipe; }
  set wipe(v: number) { this.ctl.wipe = v; }
  get amf(): Amf { return this.ctl.amf; }

  step(): Signals {
    const s = this.ctl.step(this.soc, this.temp);
    this.soc = Math.min(100, Math.max(0, this.soc + ((s.I1 ? this.charge : -0.115) / this.cap) * 100 / 3600));
    const vals: Record<string, boolean> = { Q1: s.q1, Q2: s.q2, Q3: s.q3, Q4: s.alarm, I1: s.I1 };
    for (const [k, v] of Object.entries(vals)) {
      if (this.last[k] !== v) {
        this.log.push([this.t, k, v]);
        this.last[k] = v;
      }
    }
    this.t += 1;
    return s;
  }
}

export function run(s: Sim, n: number): Sim {
  for (let k = 0; k < n; k++) s.step();
  return s;
}

/** Første tidspunkt der signalet `k` fikk verdien `v` (etter `after`), ellers null. */
export function at(s: Sim, k: string, v: boolean, after = 0): number | null {
  for (const [t, n, x] of s.log) if (n === k && x === v && t >= after) return t;
  return null;
}
