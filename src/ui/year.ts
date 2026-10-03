/** Årsoversikt: liggende stolper per måned (produksjon vs. forbruk) og vintertabell. */
import { MANEDER, PV_KWP, manedsBalanse, vinterLosninger } from '../sim/data';
import { kWh, liter, tall } from '../sim/format';

const SVG = 'http://www.w3.org/2000/svg';

export function tegnAarsdiagram(container: HTMLElement, notat: HTMLElement): void {
  const rader = manedsBalanse(PV_KWP);
  const maks = Math.max(...rader.map((r) => Math.max(r.forbrukKWh, r.produksjonKWh)));
  const smal = container.clientWidth < 520;
  const W = smal ? 360 : 720;
  const venstre = smal ? 64 : 96;
  const hoyre = smal ? 54 : 70;
  const radH = smal ? 44 : 40;
  const stolpeH = smal ? 14 : 13;
  const toppH = 34;
  const H = toppH + rader.length * radH + 8;
  const plotW = W - venstre - hoyre;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Beregnet solproduksjon og forbruk per måned i kilowattimer');
  const mk = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    svg.append(e);
    return e;
  };
  const defs = document.createElementNS(SVG, 'defs');
  defs.innerHTML = `<pattern id="skravur" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="var(--sol)"/></pattern>`;
  svg.append(defs);

  // Forklaring
  mk('rect', { x: venstre, y: 8, width: 14, height: 10, rx: 2, fill: 'var(--sol)' });
  mk('text', { x: venstre + 20, y: 17, class: 'forkl' }, 'Sol (beregnet)');
  mk('rect', { x: venstre + (smal ? 118 : 140), y: 8, width: 14, height: 10, rx: 2, fill: 'var(--forbruk)' });
  mk('text', { x: venstre + (smal ? 138 : 160), y: 17, class: 'forkl' }, 'Forbruk');

  rader.forEach((r, i) => {
    const y = toppH + i * radH;
    const navn = MANEDER[r.maned]!;
    mk('text', { x: venstre - 8, y: y + radH / 2 + 1, 'text-anchor': 'end', class: 'mnd' }, navn.charAt(0).toUpperCase() + navn.slice(1, smal ? 3 : undefined));
    const wP = (plotW * r.produksjonKWh) / maks;
    const wF = (plotW * r.forbrukKWh) / maks;
    mk('rect', { x: venstre, y: y + 4, width: wP, height: stolpeH, rx: 3, fill: r.interpolert ? 'url(#skravur)' : 'var(--sol)' });
    mk('text', { x: venstre + wP + 5, y: y + 4 + stolpeH - 3, class: 'v' }, `${tall(r.produksjonKWh)}${r.interpolert ? ' (anslått)' : ''}`);
    mk('rect', { x: venstre, y: y + 6 + stolpeH, width: wF, height: stolpeH, rx: 3, fill: 'var(--forbruk)' });
    mk('text', { x: venstre + wF + 5, y: y + 6 + 2 * stolpeH - 3, class: 'v' }, `${tall(r.forbrukKWh)}`);
    if (r.avslaatt) {
      mk('text', { x: venstre - 8, y: y + radH / 2 + 14, 'text-anchor': 'end', class: 'note' }, 'avslått');
    } else if (r.dagerMedFolk > 0) {
      mk('text', { x: venstre - 8, y: y + radH / 2 + 14, 'text-anchor': 'end', class: 'note' }, `${r.dagerMedFolk} d. folk`);
    }
  });

  container.replaceChildren(svg);
  const sumP = rader.reduce((s, r) => s + r.produksjonKWh, 0);
  const sumF = rader.reduce((s, r) => s + r.forbrukKWh, 0);
  const paa = rader.filter((r) => !r.avslaatt);
  const dekker = paa.filter((r) => !r.interpolert && r.produksjonKWh >= r.forbrukKWh).map((r) => MANEDER[r.maned]);
  notat.textContent = `Tall i kWh per måned, beregnet med ${tall(PV_KWP)} kWp solceller og soldata fra solkart.no. Sola dekker hele forbruket fra ${dekker[0]} til ${dekker[dekker.length - 1]}, og trolig også i oktober. Mars og oktober mangler i kilden og er anslått (skravert). Fra november til mars er anlegget avslått, så sola der blir ikke brukt. Over året: sol ${kWh(sumP, 0)}, forbruk ${kWh(sumF, 0)}.`;
}

export function tegnVintertabell(container: HTMLElement, notat: HTMLElement): void {
  const rader = vinterLosninger(PV_KWP);
  const t = document.createElement('table');
  t.className = 'vinter';
  t.innerHTML = `<caption class="liten">Hvis overvåkingen likevel sto på om vinteren (november til februar), beregnet</caption>
    <thead><tr><th>Løsning</th><th class="tallcelle">Effekt</th><th class="tallcelle">Forbruk</th><th class="tallcelle">Underskudd</th><th class="tallcelle">Diesel</th></tr></thead>
    <tbody>${rader.map((r, i) => `<tr class="${i === 0 ? 'valgt' : ''}"><td>${r.navn}</td><td class="tallcelle">${tall(r.effektW)} W</td><td class="tallcelle">${kWh(r.forbrukKWh, 0)}</td><td class="tallcelle">${kWh(r.underskuddKWh, 0)}</td><td class="tallcelle"><strong>${r.liter > 0 ? 'ca. ' + liter(r.liter, 0) : '0 l'}</strong></td></tr>`).join('')}</tbody>`;
  const rull = document.createElement('div');
  rull.className = 'tabell-rull';
  rull.append(t);
  container.replaceChildren(rull);
  notat.textContent = `Tallene gjelder november til februar og er beregnet fra regnearket med ${tall(PV_KWP)} kWp solceller. Sola gir i den perioden ca. ${kWh(rader[0]!.produksjonKWh, 0)}. Effektene er antakelser som må sjekkes mot databladene.`;
}
