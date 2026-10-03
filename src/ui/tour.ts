/** Kort omvisning første gang simuleringen vises. Kan hoppes over. */
interface Steg { mål: string; tittel: string; tekst: string; }

const STEG: Steg[] = [
  { mål: '#sim-batteri', tittel: 'Dette er batteriet', tekst: 'Måleren viser hvor fullt batteriet er. Merkene viser hvor styringen reagerer: under 30 % starter generatoren, over 80 % stopper den.' },
  { mål: '#sim-sol', tittel: 'Her ser du sola', tekst: 'Hvor mye solcellene gir akkurat nå, og hvor mye hytta bruker. Energiflyten under viser hvor strømmen går.' },
  { mål: '#sim-transport', tittel: 'Trykk her for å spole tiden', tekst: 'Spill av, og velg hvor fort tiden skal gå. 10 minutter hyttetid per sekund gjør et døgn på to og et halvt minutt.' },
  { mål: '#sim-scenarioer', tittel: 'Velg et scenario', tekst: 'Start med «Vanlig sommerdag i juli», og prøv så en grå helg, en kald morgen og feil. Hendelsesloggen forklarer hva styringen gjør, og hvorfor.' },
];

const NOKKEL = 'borres-strom-omvisning-sett';

function sett(): boolean {
  try { return localStorage.getItem(NOKKEL) === '1'; } catch { return false; }
}
function merkSett(): void {
  try { localStorage.setItem(NOKKEL, '1'); } catch { /* ignorer */ }
}

export function startOmvisning(container: HTMLElement, tvang = false): void {
  if (!tvang && sett()) return;
  let i = 0;
  let mål: HTMLElement | null = null;

  const vis = () => {
    mål?.classList.remove('tour-mål');
    const s = STEG[i]!;
    mål = document.querySelector<HTMLElement>(s.mål);
    mål?.classList.add('tour-mål');
    mål?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    container.innerHTML = `<div class="bakteppe"></div>
      <div class="kort" role="dialog" aria-modal="true" aria-labelledby="tour-tittel">
        <div class="steg-nr">Omvisning ${i + 1} av ${STEG.length}</div>
        <h3 id="tour-tittel">${s.tittel}</h3>
        <p>${s.tekst}</p>
        <div class="cta">
          <button type="button" class="knapp primær" data-neste>${i === STEG.length - 1 ? 'Ferdig' : 'Neste'}</button>
          <button type="button" class="knapp lenke" data-hopp>Hopp over</button>
        </div>
      </div>`;
    container.hidden = false;
    container.querySelector<HTMLButtonElement>('[data-neste]')!.focus();
  };
  const avslutt = () => {
    mål?.classList.remove('tour-mål');
    container.hidden = true;
    container.innerHTML = '';
    merkSett();
  };
  container.onclick = (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-neste]')) { i++; if (i >= STEG.length) avslutt(); else vis(); }
    else if (t.closest('[data-hopp]') || t.classList.contains('bakteppe')) avslutt();
  };
  container.onkeydown = (e) => { if (e.key === 'Escape') avslutt(); };
  vis();
}
