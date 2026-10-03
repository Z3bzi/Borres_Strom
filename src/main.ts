import './styles.css';
import { FlowDiagram } from './ui/flow';
import { SimApp } from './ui/simapp';
import { Telefon } from './ui/phone';
import { tegnAarsdiagram } from './ui/year';
import { startOmvisning } from './ui/tour';

const redusert = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Mini-meny: marker aktiv seksjon */
function nav(): void {
  const lenker = [...document.querySelectorAll<HTMLAnchorElement>('.mininav li a')];
  const seksjoner = lenker.map((a) => document.querySelector<HTMLElement>(a.getAttribute('href')!)).filter((s): s is HTMLElement => !!s);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const id = '#' + e.target.id;
      lenker.forEach((a) => a.classList.toggle('aktiv', a.getAttribute('href') === id));
      // Rull menyen sidelengs (bare menyen, aldri siden) så den aktive lenken er synlig
      const aktiv = lenker.find((a) => a.getAttribute('href') === id);
      const ul = aktiv?.closest('ul');
      if (aktiv && ul) {
        const mål = aktiv.offsetLeft - (ul.clientWidth - aktiv.offsetWidth) / 2;
        ul.scrollTo({ left: Math.max(0, mål), behavior: redusert ? 'auto' : 'smooth' });
      }
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  seksjoner.forEach((s) => io.observe(s));
}

/* Forklaringer (tooltip) på begreper */
function termer(): void {
  const tip = document.getElementById('tip')!;
  let aktiv: HTMLElement | null = null;
  const lukk = () => { tip.hidden = true; aktiv?.removeAttribute('aria-describedby'); aktiv = null; };
  document.querySelectorAll<HTMLButtonElement>('.term').forEach((b) => {
    b.setAttribute('aria-label', `${b.textContent}, forklaring`);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (aktiv === b) { lukk(); return; }
      aktiv = b;
      tip.textContent = b.dataset.tip ?? '';
      tip.hidden = false;
      b.setAttribute('aria-describedby', 'tip');
      const r = b.getBoundingClientRect();
      const bredde = Math.min(320, window.innerWidth - 32);
      let x = r.left + window.scrollX;
      if (x + bredde > window.scrollX + window.innerWidth - 16) x = window.scrollX + window.innerWidth - 16 - bredde;
      tip.style.left = `${Math.max(16, x)}px`;
      tip.style.top = `${r.bottom + window.scrollY + 8}px`;
    });
  });
  document.addEventListener('click', lukk);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lukk(); });
}

/* Demo av energiflyten i «Slik fungerer det» */
function flowDemo(): void {
  const el = document.getElementById('flow-demo');
  const tekst = document.getElementById('flow-demo-tekst');
  if (!el || !tekst) return;
  const flow = new FlowDiagram(el);
  const faser = [
    { solW: 1400, forbrukW: 180, generatorW: 0, batteriW: 1200, niva: 70, tekst: 'Midt på dagen: sola lader batteriet og forsyner hytta samtidig.' },
    { solW: 0, forbrukW: 350, generatorW: 0, batteriW: -390, niva: 55, tekst: 'Kvelden: lys, ladere og kjøleskap går på batteriet.' },
    { solW: 0, forbrukW: 48, generatorW: 0, batteriW: -53, niva: 28, tekst: 'Natta, batteriet under 30 % i 5 minutter: styringen starter generatoren.' },
    { solW: 0, forbrukW: 48, generatorW: 2500, batteriW: 2450, niva: 60, tekst: 'Generatoren lader med ca. 2,5 kW til batteriet er over 90 %, og stopper så av seg selv.' },
  ];
  let i = 0;
  const vis = () => { const f = faser[i]!; flow.oppdater(f); tekst.textContent = f.tekst; };
  vis();
  const io = new IntersectionObserver((e) => {
    if (e[0]?.isIntersecting && !redusert) {
      const id = setInterval(() => { i = (i + 1) % faser.length; vis(); }, 4000);
      el.dataset.timer = String(id);
    } else if (el.dataset.timer) {
      clearInterval(Number(el.dataset.timer));
      delete el.dataset.timer;
    }
  });
  io.observe(el);
  if (redusert) {
    // Uten bevegelse: la leseren bla gjennom fasene ved å trykke på figuren
    el.style.cursor = 'pointer';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', 'Vis neste fase i energiflyten');
    const neste = () => { i = (i + 1) % faser.length; vis(); };
    el.addEventListener('click', neste);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); neste(); } });
  }
}

/* Telefonen i «Fjernovervåking» (eksempel) */
function telefonDemo(): void {
  const el = document.getElementById('telefon-demo');
  if (!el) return;
  const t = new Telefon(el);
  t.status({ niva: 84, solW: 920, forbrukW: 48, generator: 'Av', tempC: 12, tid: '13:42', frakoblet: false });
  t.varsler([
    { t: 0, tid: '07:12', tittel: 'Generatoren startet', tekst: 'Automatisk start, batteriet er på 29 %.', alvor: 'info' },
    { t: 1, tid: '09:31', tittel: 'Generatoren stoppet', tekst: 'Batteriet er over 90 % og generatoren har gått i over 30 minutter.', alvor: 'info' },
    { t: 2, tid: '13:40', tittel: 'Generatoren starter ikke', tekst: 'Startsignal er sendt, men generatoren har ikke startet på 90 sekunder. (Eksempel på alarm)', alvor: 'alarm' },
  ]);
}

/* Omvisning første gang simuleringen kommer til syne */
function omvisning(): void {
  const tour = document.getElementById('tour')!;
  const sim = document.getElementById('sim-scenarioer')!;
  const io = new IntersectionObserver((e) => {
    if (e[0]?.isIntersecting) { io.disconnect(); startOmvisning(tour); }
  }, { threshold: 0.6 });
  io.observe(sim);
}

nav();
termer();
flowDemo();
telefonDemo();
new SimApp();
tegnAarsdiagram(document.getElementById('aarsdiagram')!, document.getElementById('aarsnotat')!);
omvisning();
