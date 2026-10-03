/** Telefon-mockup med status og varsler. */
import type { Tilstand, Varsel } from '../sim/cabin';
import { GENERATOR_TEKST } from '../sim/cabin';
import { grader, klokke, watt } from '../sim/format';

export interface TelefonStatus {
  niva: number;
  solW: number;
  forbrukW: number;
  generator: string;
  tempC: number;
  tid: string;
  frakoblet: boolean;
}

export class Telefon {
  private skjerm: HTMLElement;
  private statusEl: HTMLElement;
  private varslerEl: HTMLElement;
  private antallVist = 0;

  constructor(container: HTMLElement, private tittel = 'Børresholmen') {
    container.innerHTML = `<div class="skjerm">
      <div class="status-topp"><span class="klokke-lite">–</span><span>Starlink ▲</span></div>
      <div class="app-tittel">${this.tittel}</div>
      <div class="status-grid"></div>
      <div class="varsler"></div>
    </div>`;
    this.skjerm = container.querySelector('.skjerm')!;
    this.statusEl = this.skjerm.querySelector('.status-grid')!;
    this.varslerEl = this.skjerm.querySelector('.varsler')!;
    this.varslerEl.innerHTML = '<p class="ingen">Ingen varsler ennå.</p>';
  }

  status(s: TelefonStatus): void {
    this.skjerm.querySelector('.klokke-lite')!.textContent = s.tid;
    this.statusEl.innerHTML = `
      <div class="status-flis batteri"><div><div class="l">Batterinivå</div><div class="v">${Math.round(s.niva)} %</div></div>
        <div class="l">${s.frakoblet ? 'Pumpe, ladere og verktøy frakoblet' : 'Alle laster på'}</div>
        <div class="stolpe"><i style="width:${Math.max(0, Math.min(100, s.niva))}%"></i></div></div>
      <div class="status-flis"><div class="l">Sol nå</div><div class="v">${watt(s.solW)}</div></div>
      <div class="status-flis"><div class="l">Forbruk nå</div><div class="v">${watt(s.forbrukW)}</div></div>
      <div class="status-flis"><div class="l">Generator</div><div class="v">${s.generator}</div></div>
      <div class="status-flis"><div class="l">Temperatur i skuret</div><div class="v">${grader(s.tempC)}</div></div>`;
  }

  fraTilstand(t: Tilstand): void {
    this.status({
      niva: t.niva, solW: t.solW, forbrukW: t.forbruk.totalW, generator: GENERATOR_TEKST[t.generator],
      tempC: t.tempC, tid: klokke(t.dato), frakoblet: t.frakoblet,
    });
  }

  varsler(liste: Varsel[]): void {
    if (liste.length === this.antallVist) return;
    if (this.antallVist === 0) this.varslerEl.innerHTML = '';
    for (let i = this.antallVist; i < liste.length; i++) {
      const v = liste[i]!;
      const el = document.createElement('div');
      el.className = `varsel ${v.alvor}`;
      el.innerHTML = `<div class="t"><span>${v.alvor === 'alarm' ? '🔴 ' : ''}${v.tittel}</span><small>${v.tid}</small></div><div>${v.tekst}</div>`;
      this.varslerEl.prepend(el);
    }
    this.antallVist = liste.length;
  }

  nullstill(): void {
    this.antallVist = 0;
    this.varslerEl.innerHTML = '<p class="ingen">Ingen varsler ennå.</p>';
  }
}
