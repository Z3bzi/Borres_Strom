import { describe, expect, it } from 'vitest';
import { daglengde, soldag, klarProduksjonW, Skyer, produksjonW } from '../src/sim/solar';
import { dogEnergiWh, last, nattbehovWh } from '../src/sim/load';
import { KVELD_GRENSE, LADES_TIL } from '../src/sim/logic';
import { DAGSFORBRUK_WH, FORBRUK_DC_PER_DOGN, STANDBY_W, dimensjonering, manedsBalanse, PV_KWP, produksjonPerDogn } from '../src/sim/data';
import { Hytte } from '../src/sim/cabin';
import { SCENARIOER } from '../src/sim/scenarios';
import { temperatur } from '../src/sim/temperature';
import { tall, kWh } from '../src/sim/format';

describe('solmodell', () => {
  it('daglengde ved 58,9° N: ca. 18 t i juni og ca. 6,5 t i desember', () => {
    expect(daglengde(172)).toBeGreaterThan(17.5);
    expect(daglengde(172)).toBeLessThan(18.8);
    expect(daglengde(355)).toBeGreaterThan(6);
    expect(daglengde(355)).toBeLessThan(7);
  });

  it('klokkekurven integrerer til månedens døgnenergi', () => {
    const s = soldag(new Date(Date.UTC(2026, 6, 15)));
    let wh = 0;
    for (let sek = 0; sek < 86400; sek += 10) wh += klarProduksjonW(s, sek / 3600) * 10 / 3600;
    expect(wh / 1000).toBeCloseTo(s.energiKWh, 1);
  });

  it('samme frø gir samme skyer', () => {
    const a = new Skyer(42), b = new Skyer(42), c = new Skyer(43);
    expect(a.faktor(1234, 'delvis')).toBe(b.faktor(1234, 'delvis'));
    expect(a.faktor(1234, 'delvis')).not.toBe(c.faktor(1234, 'delvis'));
  });

  it('overskyet gir mye mindre enn sol', () => {
    const s = soldag(new Date(Date.UTC(2026, 6, 15)));
    const sky = new Skyer(1);
    let sol = 0, over = 0;
    for (let sek = 0; sek < 86400; sek += 60) {
      sol += produksjonW(s, sek, 'sol', sky, sek / 60);
      over += produksjonW(s, sek, 'overskyet', sky, sek / 60);
    }
    expect(over / sol).toBeLessThan(0.4);
  });
});

describe('forbruksmodell', () => {
  it('et døgn med 6 personer summerer til lastlisten: arkets 4 825 Wh med Starlink byttet mot 5G-ruter (ca. 3,2 kWh)', () => {
    // Arket: Starlink 70 W + ruter 12 W i 24 t = 1 968 Wh. 5G-ruter 15 W i 24 t = 360 Wh.
    expect(DAGSFORBRUK_WH).toBe(4825 - 1968 + 360);
    // Startstrømmene (kjøleskap, pumpe, verktøy) gir noen få Wh ekstra
    expect(Math.abs(dogEnergiWh(6) - DAGSFORBRUK_WH)).toBeLessThan(25);
  });

  it('uten folk går bare standby på 48 W', () => {
    expect(STANDBY_W).toBe(48);
    expect(dogEnergiWh(0)).toBeCloseTo(48 * 24, 0);
    expect(last(12 * 3600, 0, false, false).totalW).toBe(48);
  });

  it('frakobling tar bort ikke-vitale laster men ikke lys og kjøleskap', () => {
    const t = 20 * 3600 + 10; // kl. 20:00:10, lys og ladere på, kjøleskap går
    const med = last(t, 6, false, false), uten = last(t, 6, false, true);
    expect(uten.ikkeVitalW).toBe(0);
    expect(uten.vitalW).toBe(med.vitalW);
    expect(med.vitalW).toBe(STANDBY_W + 60 + 96);
  });
});

describe('energibalanse (regneark)', () => {
  it('juli med folk har solsoverskudd, desember har underskudd', () => {
    expect(produksjonPerDogn(6)).toBeGreaterThan(FORBRUK_DC_PER_DOGN);
    expect(produksjonPerDogn(11)).toBeLessThan(FORBRUK_DC_PER_DOGN);
  });

  it('månedsbalanse følger arket Bruksmønster ved 2 kWp, med 5G-ruter og anlegget avslått november–mars', () => {
    expect(PV_KWP).toBe(2);
    const b = manedsBalanse(2);
    expect(b[0]!.forbrukKWh).toBe(0);
    expect(b[0]!.avslaatt).toBe(true);
    expect(b[0]!.produksjonKWh).toBeCloseTo(19.44, 1);
    expect(b[3]!.avslaatt).toBe(false);
    // September: 8 dager med folk + 22 dager standby
    expect(b[8]!.forbrukKWh).toBeCloseTo(8 * FORBRUK_DC_PER_DOGN + 22 * 48 * 24 / 1000, 6);
    expect(b[6]!.produksjonKWh).toBeGreaterThan(b[6]!.forbrukKWh);
    expect(b[6]!.produksjonKWh).toBeCloseTo(285.12, 1);
  });

});

describe('dimensjonering (tallene i teksten på siden)', () => {
  it('stemmer med tallene som står på siden', () => {
    const d = dimensjonering();
    expect(d.vekselretterKontW).toBeCloseTo(3323.75, 2); // «ca. 3,3 kW»
    expect(d.toppW).toBeCloseTo(9348.75, 2); // «ca. 9,3 kW»
    expect(d.autonomiDogn).toBeCloseTo(1.5, 1); // «ca. 1,5 døgn»
    expect(d.helgDekning).toBeCloseTo(0.75, 2); // «ca. 75 %»
    expect(d.batteriNodvendigKWh).toBeCloseTo(5.6, 1); // «ca. 5,6 kWh»
    expect(d.brukbartKWh).toBeCloseTo(6.72, 2); // «6,7 kWh»
    expect(d.kwpSeptember).toBeCloseTo(1.47, 2); // «ca. 1,5 kWp»
    expect(d.generatorMinW).toBeCloseTo(3323.75, 2); // «ca. 3,3 kW»
  });
});

describe('nattbehov og kveldsgrense (modul 11)', () => {
  it('en natt 20–07 med 6 personer trenger ca. 1,4 kWh, 17 % av batteriet (21 % med margin)', () => {
    const wh = nattbehovWh(6);
    expect(wh).toBeGreaterThan(1380);
    expect(wh).toBeLessThan(1480);
    expect((wh / 8400) * 100).toBeCloseTo(17, 0);
    expect(((wh * 1.25) / 8400) * 100).toBeCloseTo(21.3, 0);
    expect(nattbehovWh(0)).toBeCloseTo((48 * 11) / 0.9, 0);
  });

  it('kveldsgrensen er 15 % + nattbehovet med margin, rundet opp til nærmeste 5 %', () => {
    const behov = ((nattbehovWh(6) * 1.25) / 8400) * 100;
    expect(KVELD_GRENSE).toBe(Math.ceil((15 + behov) / 5) * 5);
    expect(LADES_TIL).toBe(80);
  });
});

describe('temperatur', () => {
  it('januar natt er under 5 °C, juli dag over', () => {
    expect(temperatur(20, 3)).toBeLessThan(5);
    expect(temperatur(196, 15)).toBeGreaterThan(15);
  });
});

describe('hele anlegget', () => {
  function kjor(id: string) {
    const sc = SCENARIOER.find((s) => s.id === id)!;
    const h = new Hytte(sc.oppsett);
    while (!h.ferdig) h.step();
    return h;
  }

  it('sommerdag i juli: sola dekker alt, generatoren står', () => {
    const h = kjor('sommer');
    expect(h.stats.starter).toBe(0);
    expect(h.stats.solKWh).toBeGreaterThan(h.stats.forbrukKWh);
    expect(h.stats.forbrukKWh).toBeCloseTo(DAGSFORBRUK_WH / 1000, 1);
  });

  it('overskyet helg i september: generatoren starter automatisk og stopper igjen', () => {
    const h = kjor('september');
    expect(h.stats.starter).toBeGreaterThanOrEqual(1);
    expect(h.stats.liter).toBeGreaterThan(0);
    expect(h.stats.kveldsladinger).toBe(1);
    expect(h.logg.some((l) => l.tekst.startsWith('Klokka er mellom 17 og 20'))).toBe(true);
    expect(h.logg.some((l) => l.tekst.includes('over 80 %') && l.tekst.includes('stopper'))).toBe(true);
  });

  it('kald natt i april: venter til 07:00, forvarming 20 min før start', () => {
    const h = kjor('kald');
    expect(h.logg.some((l) => l.tekst.includes('nattstopp (22–07)'))).toBe(true);
    expect(h.logg.find((l) => l.tekst.startsWith('Det er kaldt i skuret'))!.tid).toBe('07:00');
    expect(h.stats.forvarmetS).toBeGreaterThanOrEqual(1200);
    expect(h.stats.starter).toBeGreaterThanOrEqual(1);
    expect(h.logg.some((l) => l.tekst.includes('Forvarmingen er ferdig'))).toBe(true);
  });

  it('tom hytte i oktober: generatoren holder batteriet i live', () => {
    const h = kjor('tom');
    expect(h.stats.starter).toBeGreaterThanOrEqual(1);
    expect(h.stats.minNiva).toBeGreaterThan(20);
    expect(h.stats.stromlosS).toBe(0);
  });

  it('generatoren starter ikke: alarm etter 90 s', () => {
    const h = kjor('starterikke');
    const start = h.logg.find((l) => l.tekst.includes('sender startsignal'))!;
    const alarm = h.varsler.find((v) => v.tittel === 'Generatoren starter ikke')!;
    // On-delay på 90 skann teller med skannet der startsignalet settes (som i logo_sim.py: 389 ≈ 300 + 90)
    expect(alarm.t - start.t).toBeGreaterThanOrEqual(89);
    expect(alarm.t - start.t).toBeLessThanOrEqual(90);
  });

  it('CO-alarm: start sperret, alarm sendt, starter når varsleren er nullstilt', () => {
    const h = kjor('co');
    expect(h.varsler.some((v) => v.tittel.startsWith('CO-'))).toBe(true);
    const co = h.logg.find((l) => l.tekst.startsWith('CO-/røykvarsleren i skuret har slått ut'))!;
    const nullstilt = h.logg.find((l) => l.tekst.startsWith('CO-/røykvarsleren er nullstilt'))!;
    const start = h.logg.find((l) => l.tekst.includes('Generatoren går og lader'))!;
    expect(start.t).toBeGreaterThan(nullstilt.t);
    expect(h.prover.some((p) => p.generator && p.t > co.t && p.t < nullstilt.t)).toBe(false);
  });

  it('nødstopp: generatoren stopper med en gang', () => {
    const h = kjor('nodstopp');
    const stopp = h.logg.find((l) => l.tekst.startsWith('Nødstoppen er trykket, så styringen stopper'))!;
    const trykk = h.logg.find((l) => l.tekst === 'Du trykker på nødstoppen.')!;
    expect(stopp.t - trykk.t).toBeLessThanOrEqual(1);
    expect(h.varsler.some((v) => v.tittel === 'Nødstopp')).toBe(true);
  });

  it('svært lavt batteri: frakobling under 15 %, innkobling når generatoren går', () => {
    const h = kjor('lavt');
    expect(h.logg.some((l) => l.tekst.includes('kobler fra ikke-vitale laster'))).toBe(true);
    expect(h.logg.some((l) => l.tekst === 'Generatoren går, så ikke-vitale laster kobles inn igjen.')).toBe(true);
  });

  it('ingen scenarioer starter aggregatet mellom 22:00 og 07:00', () => {
    for (const sc of SCENARIOER) expect(kjor(sc.id).stats.natteStarter, sc.id).toBe(0);
  });

  it('nattstopp avbryter ladingen kl. 22:00 i «Batteriet blir veldig lavt»', () => {
    const h = kjor('lavt');
    const stopp = h.logg.find((l) => l.tekst.startsWith('Klokka er 22:00'))!;
    expect(stopp.tid).toBe('22:00');
  });

  it('månedlig testkjøring: 30 min den 1. kl. 12:00', () => {
    const h = kjor('test');
    expect(h.stats.starter).toBe(1);
    expect(h.stats.generatorS).toBeGreaterThan(1790);
    expect(h.stats.generatorS).toBeLessThan(1860);
    expect(h.logg.some((l) => l.tekst.startsWith('Testkjøringen er ferdig'))).toBe(true);
  });
});

describe('format', () => {
  it('norske tall', () => {
    expect(tall(1654.92, 0)).toBe('1 655');
    expect(kWh(8.4)).toBe('8,4 kWh');
    expect(tall(-3.5, 1)).toBe('−3,5');
  });
});
