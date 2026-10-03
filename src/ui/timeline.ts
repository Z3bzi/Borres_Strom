/** Forløpsdiagram på canvas: batterinivå, sol og forbruk, med generatorgange skravert og alarmer markert. */
import type { Prove, Varsel } from '../sim/cabin';
import { tall } from '../sim/format';

const css = (navn: string) => getComputedStyle(document.documentElement).getPropertyValue(navn).trim() || '#000';

export class Tidslinje {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private siste: Parameters<Tidslinje['tegn']> | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    const ro = new ResizeObserver(() => this.tilpass());
    ro.observe(canvas);
    this.tilpass();
  }

  private tilpass(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    if (this.siste) this.tegn(...this.siste);
  }

  tegn(prover: Prove[], varsler: Varsel[], startMs: number, varighetS: number, naaT: number): void {
    this.siste = [prover, varsler, startMs, varighetS, naaT];
    const c = this.ctx;
    const W = this.canvas.width / this.dpr;
    const H = this.canvas.height / this.dpr;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.font = '12px ' + css('--font');

    const smal = W < 480;
    const venstre = smal ? 48 : 52;
    const hoyre = smal ? 50 : 60;
    const toppMargin = 8;
    const bunn = 22;
    const gap = 16;
    const plotW = W - venstre - hoyre;
    const h1 = (H - toppMargin - bunn - gap) * 0.5; // batteri
    const h2 = H - toppMargin - bunn - gap - h1; // effekt
    const y1 = toppMargin;
    const y2 = toppMargin + h1 + gap;
    const tMax = Math.max(varighetS, naaT);
    const x = (t: number) => venstre + (plotW * t) / tMax;

    // Generatorgange skravert
    c.fillStyle = css('--generator-lys');
    let gStart: number | null = null;
    for (let i = 0; i <= prover.length; i++) {
      const p = prover[i];
      const paa = p?.generator ?? false;
      if (paa && gStart === null) gStart = p!.t;
      if ((!paa || !p) && gStart !== null) {
        const tSlutt = p ? p.t : naaT;
        c.fillRect(x(gStart), y1, Math.max(2, x(tSlutt) - x(gStart)), h1 + gap + h2);
        gStart = null;
      }
    }

    // Batteri: terskellinjer
    const yB = (p: number) => y1 + h1 - (h1 * p) / 100;
    c.strokeStyle = css('--linje');
    c.lineWidth = 1;
    c.fillStyle = css('--ink-2');
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (const p of [0, 30, 80, 100]) {
      c.beginPath(); c.moveTo(venstre, yB(p)); c.lineTo(venstre + plotW, yB(p)); c.stroke();
      if (p === 30 || p === 80) c.fillText(`${p} %`, venstre - 4, yB(p));
    }
    c.setLineDash([3, 4]);
    c.strokeStyle = css('--alarm');
    c.beginPath(); c.moveTo(venstre, yB(15)); c.lineTo(venstre + plotW, yB(15)); c.stroke();
    c.setLineDash([]);

    // Effekt: akse
    const maksW = Math.max(600, ...prover.map((p) => Math.max(p.solW, p.forbrukW))) * 1.05;
    const yP = (w: number) => y2 + h2 - (h2 * w) / maksW;
    c.strokeStyle = css('--linje');
    c.beginPath(); c.moveTo(venstre, yP(0)); c.lineTo(venstre + plotW, yP(0)); c.stroke();
    c.beginPath(); c.moveTo(venstre, y2); c.lineTo(venstre + plotW, y2); c.stroke();
    c.fillStyle = css('--ink-2');
    c.fillText(maksW >= 2000 ? `${tall(maksW / 1000, 1)} kW` : `${Math.round(maksW / 100) * 100} W`, venstre - 4, y2 + 6);
    c.fillText('0', venstre - 4, yP(0));

    // Tidsakse
    c.textAlign = 'center';
    c.textBaseline = 'top';
    const timer = tMax / 3600;
    const steg = timer <= 6 ? 1 : timer <= 30 ? (smal ? 6 : 3) : timer <= 80 ? 12 : 24;
    const startD = new Date(startMs);
    const forsteHel = Math.ceil((startD.getUTCHours() + startD.getUTCMinutes() / 60) / steg) * steg;
    for (let h = forsteHel - (startD.getUTCHours() + startD.getUTCMinutes() / 60); h <= timer; h += steg) {
      const t = h * 3600;
      const d = new Date(startMs + t * 1000);
      const xx = x(t);
      c.strokeStyle = css('--linje');
      c.beginPath(); c.moveTo(xx, y1); c.lineTo(xx, y2 + h2); c.stroke();
      const hh = d.getUTCHours();
      let lab = `${String(hh).padStart(2, '0')}:00`;
      if (steg >= 24 || (hh === 0 && timer > 30)) lab = `${d.getUTCDate()}.`;
      c.fillStyle = css('--ink-2');
      c.fillText(lab, xx, y2 + h2 + 5);
    }

    if (prover.length < 2) {
      c.fillStyle = css('--ink-2');
      c.textAlign = 'center';
      c.fillText('Trykk «Spill av» for å se forløpet', venstre + plotW / 2, y1 + h1 / 2);
      return;
    }

    const linje = (farge: string, f: (p: Prove) => number, fyll?: string) => {
      c.beginPath();
      prover.forEach((p, i) => (i ? c.lineTo(x(p.t), f(p)) : c.moveTo(x(p.t), f(p))));
      if (fyll) {
        const siste = prover[prover.length - 1]!;
        c.lineTo(x(siste.t), yP(0)); c.lineTo(x(prover[0]!.t), yP(0)); c.closePath();
        c.fillStyle = fyll; c.globalAlpha = 0.25; c.fill(); c.globalAlpha = 1;
        c.beginPath();
        prover.forEach((p, i) => (i ? c.lineTo(x(p.t), f(p)) : c.moveTo(x(p.t), f(p))));
      }
      c.strokeStyle = farge; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
    };
    linje(css('--sol'), (p) => yP(p.solW), css('--sol'));
    linje(css('--forbruk'), (p) => yP(p.forbrukW));
    linje(css('--batteri'), (p) => yB(p.niva));
    c.lineWidth = 2.5;
    linje(css('--batteri'), (p) => yB(p.niva));

    // Direkte etiketter til høyre
    const siste = prover[prover.length - 1]!;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = '650 12px ' + css('--font');
    c.fillStyle = css('--batteri');
    c.fillText(`${Math.round(siste.niva)} %`, x(siste.t) + 4, yB(siste.niva));
    const etiketter: [number, string, string][] = [[yP(siste.solW), css('--sol'), 'sol'], [yP(siste.forbrukW), css('--forbruk'), 'forbruk']];
    etiketter.sort((a, b) => a[0] - b[0]);
    let sisteY = -99;
    for (const [yy, farge, tekst] of etiketter) {
      const yEt = Math.max(yy, sisteY + 13);
      c.fillStyle = farge;
      c.fillText(tekst, x(siste.t) + 4, yEt);
      sisteY = yEt;
    }

    // Alarmer
    c.fillStyle = css('--alarm');
    for (const v of varsler) {
      if (v.alvor !== 'alarm') continue;
      const xx = x(v.t);
      c.beginPath(); c.arc(xx, y1 + 6, 5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(xx, y1 + 11); c.lineTo(xx, y2 + h2); c.strokeStyle = css('--alarm'); c.lineWidth = 1; c.setLineDash([2, 3]); c.stroke(); c.setLineDash([]);
    }

    // Nå-linje
    c.strokeStyle = css('--ink');
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(x(naaT), y1); c.lineTo(x(naaT), y2 + h2); c.stroke();
  }
}
