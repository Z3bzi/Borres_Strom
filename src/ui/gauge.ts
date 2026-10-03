/** Batterimåler (stående batteri) med merker på 15, 30, 40 og 80 %. */
const SVG = 'http://www.w3.org/2000/svg';

export class Gauge {
  private fyll: SVGRectElement;
  private svg: SVGSVGElement;
  private readonly topp = 24;
  private readonly hoyde = 180;

  constructor(container: HTMLElement) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 120 220');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Batterimåler');
    this.svg = svg;
    const mk = (tag: string, attrs: Record<string, string | number>, text?: string) => {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      if (text !== undefined) e.textContent = text;
      svg.append(e);
      return e;
    };
    mk('rect', { x: 28, y: 10, width: 24, height: 10, rx: 3, fill: 'var(--granitt)' });
    mk('rect', { x: 10, y: this.topp, width: 60, height: this.hoyde, rx: 10, fill: '#fff', stroke: 'var(--granitt)', 'stroke-width': 3 });
    this.fyll = mk('rect', { x: 16, y: this.topp + 6, width: 48, height: 0, rx: 6, fill: 'var(--batteri)' }) as SVGRectElement;
    const merker: [number, string, string][] = [[80, 'var(--batteri)', '80'], [40, '#7cc39a', '40'], [30, 'var(--sol)', '30'], [15, 'var(--alarm)', '15']];
    for (const [p, farge, tekst] of merker) {
      const y = this.y(p);
      mk('line', { x1: 72, y1: y, x2: 86, y2: y, stroke: farge, 'stroke-width': 3, 'stroke-linecap': 'round' });
      mk('text', { x: 90, y: y + 4, 'font-size': 12, fill: 'var(--ink-2)', 'font-weight': 650 }, tekst);
    }
    container.replaceChildren(svg);
  }

  private y(p: number): number {
    return this.topp + this.hoyde - (this.hoyde * p) / 100;
  }

  oppdater(niva: number, sheddet: boolean): void {
    const h = Math.max(0, (this.hoyde - 12) * niva / 100);
    this.fyll.setAttribute('height', String(h));
    this.fyll.setAttribute('y', String(this.topp + this.hoyde - 6 - h));
    this.fyll.setAttribute('fill', niva < 15 || sheddet ? 'var(--alarm)' : niva < 30 ? 'var(--sol)' : 'var(--batteri)');
    this.svg.setAttribute('aria-label', `Batterimåler, ${Math.round(niva)} prosent`);
  }
}
