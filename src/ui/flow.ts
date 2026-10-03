/** Energiflyt-diagram i SVG: sol → batteri → hytta, generator → batteri. Linjetykkelse følger effekt. */
import { watt } from '../sim/format';

export interface FlowVerdier {
  solW: number;
  forbrukW: number;
  generatorW: number;
  /** Positivt = lading, negativt = utlading (W) */
  batteriW: number;
  niva: number;
  generatorTekst?: string;
}

const SVG = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

function tykkelse(w: number): number {
  if (w <= 1) return 2;
  return Math.min(14, 2 + Math.sqrt(w) / 5);
}

export class FlowDiagram {
  private solLinje: SVGPathElement;
  private genLinje: SVGPathElement;
  private hytteLinje: SVGPathElement;
  private solTekst: SVGTextElement;
  private genTekst: SVGTextElement;
  private hytteTekst: SVGTextElement;
  private batteriFyll: SVGRectElement;
  private batteriTekst: SVGTextElement;
  private batteriRetning: SVGTextElement;
  private genSub: SVGTextElement;
  private solIkon: SVGGElement;

  constructor(container: HTMLElement) {
    const svg = el('svg', { viewBox: '0 0 360 300', role: 'img', 'aria-label': 'Energiflyt mellom sol, batteri, generator og hytta' });

    // Linjer
    this.solLinje = el('path', { d: 'M 86 78 C 130 78, 140 150, 168 150', class: 'flyt', stroke: 'var(--sol)' });
    this.genLinje = el('path', { d: 'M 86 230 C 130 230, 140 150, 168 150', class: 'flyt', stroke: 'var(--generator)' });
    this.hytteLinje = el('path', { d: 'M 232 150 C 260 150, 262 150, 290 150', class: 'flyt', stroke: 'var(--forbruk)' });
    svg.append(this.solLinje, this.genLinje, this.hytteLinje);

    // Sol
    const sol = el('g', { transform: 'translate(46 78)' });
    this.solIkon = sol;
    sol.append(el('circle', { r: 30, fill: 'var(--sol-lys)', stroke: 'var(--sol)', 'stroke-width': 2 }));
    sol.append(el('circle', { r: 12, fill: 'var(--sol)' }));
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      sol.append(el('line', { x1: Math.cos(a) * 17, y1: Math.sin(a) * 17, x2: Math.cos(a) * 23, y2: Math.sin(a) * 23, stroke: 'var(--sol)', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    }
    sol.append(el('text', { y: 46, 'text-anchor': 'middle', class: 'node-tekst' }, 'Solceller'));
    this.solTekst = el('text', { x: 132, y: 86, 'text-anchor': 'middle', class: 'verdi', fill: 'var(--sol)' }, '');
    svg.append(sol, this.solTekst);

    // Generator (skur)
    const gen = el('g', { transform: 'translate(46 230)' });
    gen.append(el('rect', { x: -32, y: -26, width: 64, height: 52, rx: 8, fill: 'var(--generator-lys)', stroke: 'var(--generator)', 'stroke-width': 2 }));
    gen.append(el('path', { d: 'M -22 -6 h 44 v 20 h -44 z', fill: 'var(--generator)', opacity: 0.85 }));
    gen.append(el('path', { d: 'M -10 -6 v -8 h 20 v 8', fill: 'none', stroke: 'var(--generator)', 'stroke-width': 2 }));
    gen.append(el('text', { y: 44, 'text-anchor': 'middle', class: 'node-tekst' }, 'Generator'));
    this.genSub = el('text', { y: 58, 'text-anchor': 'middle', class: 'node-sub' }, 'i skuret, 30 m unna');
    gen.append(this.genSub);
    this.genTekst = el('text', { x: 132, y: 234, 'text-anchor': 'middle', class: 'verdi', fill: 'var(--generator)' }, '');
    svg.append(gen, this.genTekst);

    // Batteri
    const bat = el('g', { transform: 'translate(200 150)' });
    bat.append(el('rect', { x: -28, y: -44, width: 56, height: 88, rx: 8, fill: '#fff', stroke: 'var(--batteri)', 'stroke-width': 2.5 }));
    bat.append(el('rect', { x: -10, y: -52, width: 20, height: 8, rx: 2, fill: 'var(--batteri)' }));
    this.batteriFyll = el('rect', { x: -22, y: -38, width: 44, height: 76, rx: 4, fill: 'var(--batteri)', opacity: 0.85 });
    bat.append(this.batteriFyll);
    this.batteriTekst = el('text', { y: 6, 'text-anchor': 'middle', class: 'node-tekst', fill: 'var(--ink)' }, '');
    bat.append(this.batteriTekst);
    bat.append(el('text', { y: 64, 'text-anchor': 'middle', class: 'node-tekst' }, 'Batteri'));
    this.batteriRetning = el('text', { y: 80, 'text-anchor': 'middle', class: 'node-sub' }, '');
    bat.append(this.batteriRetning);
    svg.append(bat);

    // Hytta
    const hytte = el('g', { transform: 'translate(322 150)' });
    hytte.append(el('polygon', { points: '-30,-6 0,-34 30,-6', fill: 'var(--forbruk)' }));
    hytte.append(el('rect', { x: -24, y: -6, width: 48, height: 36, fill: 'var(--forbruk-lys)', stroke: 'var(--forbruk)', 'stroke-width': 2 }));
    hytte.append(el('rect', { x: -6, y: 10, width: 12, height: 20, fill: 'var(--forbruk)' }));
    hytte.append(el('text', { y: 52, 'text-anchor': 'middle', class: 'node-tekst' }, 'Hytta'));
    this.hytteTekst = el('text', { x: 261, y: 138, 'text-anchor': 'middle', class: 'verdi', fill: 'var(--forbruk)' }, '');
    svg.append(hytte, this.hytteTekst);

    container.replaceChildren(svg);
  }

  oppdater(v: FlowVerdier): void {
    const sett = (p: SVGPathElement, w: number, rask = false) => {
      p.setAttribute('stroke-width', String(tykkelse(w)));
      p.classList.toggle('aktiv', w > 1);
      p.classList.toggle('tom', w <= 1);
      p.classList.toggle('rask', rask);
    };
    sett(this.solLinje, v.solW, v.solW > 1200);
    sett(this.genLinje, v.generatorW, true);
    sett(this.hytteLinje, v.forbrukW, v.forbrukW > 1000);
    this.solTekst.textContent = v.solW > 1 ? watt(v.solW) : '';
    this.genTekst.textContent = v.generatorW > 1 ? watt(v.generatorW) : '';
    this.hytteTekst.textContent = v.forbrukW > 1 ? watt(v.forbrukW) : '';
    const h = Math.max(0, Math.min(76, (76 * v.niva) / 100));
    this.batteriFyll.setAttribute('height', String(h));
    this.batteriFyll.setAttribute('y', String(38 - h));
    this.batteriTekst.textContent = `${Math.round(v.niva)} %`;
    this.batteriTekst.setAttribute('fill', v.niva > 55 ? '#fff' : 'var(--ink)');
    this.batteriRetning.textContent = v.batteriW > 20 ? `lades, ${watt(v.batteriW)}` : v.batteriW < -20 ? `gir ${watt(-v.batteriW)}` : 'i ro';
    this.solIkon.style.opacity = v.solW > 1 ? '1' : '0.45';
    if (v.generatorTekst !== undefined) this.genSub.textContent = v.generatorTekst;
  }
}
