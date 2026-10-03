/** Simulerings-UI: kobler Hytte-modellen til knapper, måler, diagram, logg og telefon. */
import { Hytte, GENERATOR_TEKST, type HendelseType, type SimOppsett, type Tilstand } from '../sim/cabin';
import { SCENARIOER, frittOppsett, type Scenario } from '../sim/scenarios';
import { BATTERI_KWH, FORUTSETNINGER } from '../sim/data';
import { datoLang, grader, kWh, klokke, liter, prosent, tall, watt } from '../sim/format';
import type { Vaer } from '../sim/solar';
import { VAER_NAVN } from '../sim/solar';
import { FlowDiagram } from './flow';
import { Gauge } from './gauge';
import { Tidslinje } from './timeline';
import { Telefon } from './phone';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error(`Mangler element ${sel}`);
  return e;
};

const GENERATOR_INFO: Record<Tilstand['generator'], string> = {
  av: 'Står stille', forvarmer: 'Varmer opp før start (20 min)', starter: 'Startsignal sendt, venter på svar',
  gaar: 'Lader batteriet', hviler: 'Må hvile 10 min før ny start', natt: 'Nattstopp 22–07, starter tidligst 07:00', feil: 'Trenger tilsyn',
};

export class SimApp {
  private hytte!: Hytte;
  private scenario: Scenario | null = null;
  private fart = 600;
  private spiller = false;
  private rest = 0;
  private sisteFrame = 0;
  private loggVist = 0;
  private sisteDag = '';
  private tegnetT = -1;
  private redusertBevegelse = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private flow: FlowDiagram;
  private gauge: Gauge;
  private tidslinje: Tidslinje;
  private telefon: Telefon;

  constructor() {
    this.flow = new FlowDiagram($('#flow-live'));
    this.gauge = new Gauge($('#gauge'));
    this.tidslinje = new Tidslinje($<HTMLCanvasElement>('#tidslinje'));
    this.telefon = new Telefon($('#telefon-sim'));
    this.byggScenarioknapper();
    this.koble();
    this.lastScenario(SCENARIOER[0]!, false);
    requestAnimationFrame((t) => this.loop(t));
  }

  private byggScenarioknapper(): void {
    const wrap = $('#scenario-knapper');
    for (const sc of SCENARIOER) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = sc.tittel;
      b.dataset.id = sc.id;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => this.lastScenario(sc, true));
      wrap.append(b);
    }
  }

  private koble(): void {
    $('#knapp-spill').addEventListener('click', () => this.settSpill(!this.spiller));
    $('#knapp-steg').addEventListener('click', () => { this.settSpill(false); this.kjorSteg(60); this.render(true); });
    $('#knapp-nullstill').addEventListener('click', () => this.nullstill());
    document.querySelectorAll<HTMLButtonElement>('#sim-transport [data-fart]').forEach((b) =>
      b.addEventListener('click', () => this.settFart(Number(b.dataset.fart))));

    // Faner på smale skjermer; på brede skjermer vises alle tre panelene ved siden av hverandre
    const faner = [...document.querySelectorAll<HTMLButtonElement>('.fane-knapper [role="tab"]')];
    const bred = matchMedia('(min-width: 900px)');
    const visPaneler = () => {
      for (const g of faner) {
        const panel = $(`#${g.getAttribute('aria-controls')}`);
        panel.hidden = bred.matches ? false : g.getAttribute('aria-selected') !== 'true';
      }
    };
    faner.forEach((f) => f.addEventListener('click', () => {
      faner.forEach((g) => g.setAttribute('aria-selected', String(g === f)));
      visPaneler();
    }));
    bred.addEventListener('change', visPaneler);
    visPaneler();

    // Innstillinger
    $<HTMLInputElement>('#inn-dato').addEventListener('change', () => this.frittOppsettFraInnstillinger());
    const niva = $<HTMLInputElement>('#inn-niva');
    niva.addEventListener('input', () => { $('#niva-verdi').textContent = prosent(Number(niva.value)); });
    niva.addEventListener('change', () => this.frittOppsettFraInnstillinger());
    $('#folk-minus').addEventListener('click', () => this.settFolk(this.hytte.folk - 1));
    $('#folk-pluss').addEventListener('click', () => this.settFolk(this.hytte.folk + 1));
    document.querySelectorAll<HTMLButtonElement>('#vaer-knapper [data-vaer]').forEach((b) =>
      b.addEventListener('click', () => this.settVaer(b.dataset.vaer as Vaer)));

    // Hendelser
    document.querySelectorAll<HTMLButtonElement>('#hendelser [data-hendelse]').forEach((b) =>
      b.addEventListener('click', () => {
        const type = b.dataset.hendelse as HendelseType;
        if (b.hasAttribute('aria-pressed')) {
          const paa = b.getAttribute('aria-pressed') !== 'true';
          this.hytte.hendelse(type, paa);
        } else {
          this.hytte.hendelse(type);
        }
        if (!this.spiller) { this.kjorSteg(1); }
        this.render(true);
      }));
    $('#knapp-kvitter').addEventListener('click', () => { this.hytte.hendelse('kvitter'); this.kjorSteg(1); this.render(true); });

    // Oppsummering
    $('#knapp-videre').addEventListener('click', () => {
      this.hytte.oppsett.varighetS += 24 * 3600;
      this.hytte.ferdig = false;
      $('#oppsummering').hidden = true;
      this.settSpill(true);
    });
    $('#knapp-neste').addEventListener('click', () => {
      const i = this.scenario ? SCENARIOER.indexOf(this.scenario) : -1;
      this.lastScenario(SCENARIOER[(i + 1) % SCENARIOER.length]!, true);
      $('#sim-scenarioer').scrollIntoView({ block: 'start', behavior: this.redusertBevegelse ? 'auto' : 'smooth' });
    });

    // Lenker fra trygghetskortene
    document.querySelectorAll<HTMLAnchorElement>('[data-scenario]').forEach((a) =>
      a.addEventListener('click', () => {
        const sc = SCENARIOER.find((s) => s.id === a.dataset.scenario);
        if (sc) this.lastScenario(sc, true);
      }));
  }

  lastScenario(sc: Scenario, spill: boolean): void {
    this.scenario = sc;
    document.querySelectorAll<HTMLButtonElement>('#scenario-knapper button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.id === sc.id)));
    $('#scenario-beskrivelse').textContent = sc.beskrivelse;
    this.settFart(sc.fart);
    this.start(structuredClone(sc.oppsett), spill);
  }

  private frittOppsettFraInnstillinger(): void {
    const datoStr = $<HTMLInputElement>('#inn-dato').value;
    const d = datoStr ? new Date(datoStr + 'T00:00:00Z') : new Date(Date.UTC(2026, 6, 15));
    const niva = Number($<HTMLInputElement>('#inn-niva').value);
    this.scenario = null;
    document.querySelectorAll<HTMLButtonElement>('#scenario-knapper button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    $('#scenario-beskrivelse').textContent = 'Eget oppsett. Velg dato, vær og folk i innstillingene.';
    this.start(frittOppsett(d, this.hytte.vaer, this.hytte.folk, niva), true);
  }

  private start(oppsett: SimOppsett, spill: boolean): void {
    this.hytte = new Hytte(oppsett);
    this.loggVist = 0;
    this.sisteDag = '';
    this.tegnetT = -1;
    $('#logg').innerHTML = '<li class="tom">Ingen hendelser ennå.</li>';
    this.telefon.nullstill();
    $('#oppsummering').hidden = true;
    this.synkInnstillinger();
    this.settSpill(spill);
    this.render(true);
  }

  private nullstill(): void {
    if (this.scenario) this.lastScenario(this.scenario, false);
    else this.frittOppsettFraInnstillinger();
  }

  private synkInnstillinger(): void {
    const s = this.hytte.oppsett.start;
    const d = new Date(Date.UTC(s.aar, s.maned, s.dag));
    $<HTMLInputElement>('#inn-dato').value = d.toISOString().slice(0, 10);
    $<HTMLInputElement>('#inn-niva').value = String(Math.round(this.hytte.oppsett.startNiva));
    $('#niva-verdi').textContent = prosent(Math.round(this.hytte.oppsett.startNiva));
    $('#folk-verdi').textContent = String(this.hytte.folk);
    document.querySelectorAll<HTMLButtonElement>('#vaer-knapper [data-vaer]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.vaer === this.hytte.vaer)));
  }

  private settFolk(n: number): void {
    n = Math.max(0, Math.min(6, n));
    if (n === this.hytte.folk) return;
    this.hytte.hendelse('folk', true, n);
    $('#folk-verdi').textContent = String(n);
    this.render(true);
  }

  private settVaer(v: Vaer): void {
    if (v === this.hytte.vaer) return;
    this.hytte.hendelse('vaer', true, v);
    this.synkInnstillinger();
    this.render(true);
  }

  private settFart(f: number): void {
    this.fart = f;
    document.querySelectorAll<HTMLButtonElement>('#sim-transport [data-fart]').forEach((b) =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.fart) === f)));
  }

  private settSpill(p: boolean): void {
    if (this.hytte.ferdig) p = false;
    this.spiller = p;
    const b = $('#knapp-spill');
    b.textContent = p ? '⏸ Pause' : '▶ Spill av';
    b.setAttribute('aria-pressed', String(p));
    this.sisteFrame = 0;
    this.rest = 0;
  }

  private kjorSteg(n: number): void {
    for (let k = 0; k < n && !this.hytte.ferdig; k++) this.hytte.step();
    if (this.hytte.ferdig) this.ferdig();
  }

  private ferdig(): void {
    this.settSpill(false);
    const tekst = this.scenario
      ? this.scenario.oppsummering(this.hytte.stats, this.hytte)
      : this.generellOppsummering();
    $('#oppsummering-tekst').textContent = tekst.replace(/\s+/g, ' ').trim();
    $('#oppsummering').hidden = false;
    $('#oppsummering').scrollIntoView({ block: 'nearest', behavior: this.redusertBevegelse ? 'auto' : 'smooth' });
  }

  private generellOppsummering(): string {
    const st = this.hytte.stats;
    const gen = st.starter === 0 ? 'Generatoren startet ikke.' : `Generatoren startet ${st.starter === 1 ? 'én gang' : st.starter + ' ganger'} og brukte ca. ${liter(st.liter)} diesel.`;
    return `Sola ga ${kWh(st.solKWh)}, og hytta brukte ${kWh(st.forbrukKWh)}. Batteriet var lavest på ${prosent(st.minNiva)}. ${gen}`;
  }

  private loop(now: number): void {
    if (this.spiller) {
      if (this.sisteFrame) {
        const dt = Math.min(0.25, (now - this.sisteFrame) / 1000);
        this.rest += dt * this.fart;
        const steg = Math.floor(this.rest);
        this.rest -= steg;
        if (steg > 0) this.kjorSteg(Math.min(steg, 7200));
      }
      this.sisteFrame = now;
      this.render(false);
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  private render(alt: boolean): void {
    const t = this.hytte.tilstand;
    if (!alt && t.t === this.tegnetT) return;
    this.tegnetT = t.t;

    $('#klokke-dato').textContent = datoLang(t.dato);
    $('#klokke-tid').textContent = klokke(t.dato);
    $('#klokke-vaer').textContent = `${VAER_NAVN[this.hytte.vaer]} · ${grader(t.tempC)} · ${this.hytte.folk === 0 ? 'ingen på hytta' : `${this.hytte.folk} på hytta`}`;

    this.gauge.oppdater(t.niva, t.frakoblet);
    $('#batteri-prosent').textContent = prosent(t.niva);
    $('#batteri-kwh').textContent = `${kWh((BATTERI_KWH * t.niva) / 100)} av ${kWh(BATTERI_KWH)}${t.stromlos ? ' · strømmen er slått av for å beskytte batteriet' : ''}`;

    $('#sol-naa').textContent = watt(t.solW);
    $('#sol-info').textContent = t.solW > 1
      ? `Dagslengde ${tall(t.sol.daglengde, 1)} t${t.sol.interpolert ? ' · anslått måned' : ''}`
      : `Mørkt · sola står opp ca. ${klokkeslett(t.sol.soloppgang)}`;

    $('#temp-naa').textContent = grader(t.tempC);
    $('#temp-info').textContent = t.signaler.kald ? 'Under 5 °C: forvarming før start' : 'Over 5 °C: ingen forvarming nødvendig';

    const f = t.forbruk;
    $('#forbruk-naa').textContent = watt(f.totalW);
    $('#forbruk-info').textContent = t.stromlos ? 'Uten strøm' : f.aktive.length ? `Standby + ${f.aktive.join(', ')}` : 'Bare standby (5G-ruter, styring, vekselretter)';

    const gk = $('#sim-generator');
    gk.classList.toggle('gaar', t.generator === 'gaar');
    $('#generator-naa').textContent = GENERATOR_TEKST[t.generator];
    $('#generator-info').textContent = `${GENERATOR_INFO[t.generator]} · ${liter(t.liter)} brukt`;

    const lk = $('.flis.laster');
    lk.classList.toggle('frakoblet', t.frakoblet);
    $('#laster-naa').textContent = t.frakoblet ? 'Delvis frakoblet' : 'Alle på';
    $('#laster-info').textContent = t.frakoblet ? 'Pumpe, ladere og verktøy er koblet fra' : 'Ingenting er koblet fra';

    const ak = $('#sim-alarm');
    ak.classList.toggle('aktiv', t.alarmAktiv || t.alarmLagret);
    $('#alarm-naa').textContent = t.alarmAktiv ? 'Alarm' : t.alarmLagret ? 'Kvittert?' : 'Ingen';
    $('#alarm-info').textContent = t.alarmAktiv ? 'Feil pågår, se hendelser og telefon' : t.alarmLagret ? 'Feilen er borte, alarmen må kvitteres' : 'Alt er i orden';
    $('#knapp-kvitter').hidden = !(t.alarmLagret && !t.alarmAktiv);

    this.flow.oppdater({
      solW: t.solW, forbrukW: f.totalW, generatorW: t.generatorW,
      batteriW: t.ladingW, niva: t.niva,
      generatorTekst: t.generator === 'gaar' ? 'går' : t.generator === 'forvarmer' ? 'forvarmer' : 'i skuret, 30 m unna',
    });

    this.tidslinje.tegn(this.hytte.prover, this.hytte.varsler, Date.UTC(this.hytte.oppsett.start.aar, this.hytte.oppsett.start.maned, this.hytte.oppsett.start.dag, this.hytte.oppsett.start.time, this.hytte.oppsett.start.minutt ?? 0), this.hytte.oppsett.varighetS, t.t);

    this.oppdaterLogg();
    this.telefon.fraTilstand(t);
    this.telefon.varsler(this.hytte.varsler);

    document.querySelectorAll<HTMLButtonElement>('#hendelser [aria-pressed]').forEach((b) => {
      const k = b.dataset.hendelse as keyof Tilstand['innganger'];
      b.setAttribute('aria-pressed', String(t.innganger[k]));
    });
  }

  private oppdaterLogg(): void {
    const logg = this.hytte.logg;
    if (logg.length === this.loggVist) return;
    const ol = $('#logg');
    if (this.loggVist === 0) ol.innerHTML = '';
    for (let i = this.loggVist; i < logg.length; i++) {
      const l = logg[i]!;
      const d = new Date(Date.UTC(this.hytte.oppsett.start.aar, this.hytte.oppsett.start.maned, this.hytte.oppsett.start.dag, this.hytte.oppsett.start.time, this.hytte.oppsett.start.minutt ?? 0) + l.t * 1000);
      const dag = datoLang(d);
      if (dag !== this.sisteDag) {
        const li = document.createElement('li');
        li.className = 'dag';
        li.textContent = dag;
        ol.prepend(li);
        this.sisteDag = dag;
      }
      const li = document.createElement('li');
      li.innerHTML = `<span class="prikk ${l.type}"></span><span class="tid">${l.tid}</span><span>${l.tekst}</span>`;
      ol.prepend(li);
    }
    this.loggVist = logg.length;
    while (ol.children.length > 400) ol.lastElementChild?.remove();
  }
}

function klokkeslett(timer: number): string {
  const h = Math.floor(timer);
  const m = Math.round((timer - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export { FORUTSETNINGER };
