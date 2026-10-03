/**
 * De 13 scenarioene fra `demo()` i kilder/logo_sim.py, portet 1:1 med samme toleranser.
 * 1–11 er modul 1–10; 12–13 er modul 11 (nattstopp og kveldslading).
 * Dette er beviset på at nettsiden viser det styringen faktisk vil gjøre.
 */
import { describe, expect, it } from 'vitest';
import { Amf, Sim, at, run } from '../src/sim/logic';

function near(a: number | null, b: number, tol = 3): void {
  expect(a, `fikk ${a}, ventet ~${b}`).not.toBeNull();
  expect(Math.abs((a as number) - b), `fikk ${a}, ventet ~${b}`).toBeLessThanOrEqual(tol);
}

describe('logo_sim.py demo(), scenario 1–13', () => {
  it('1 lavt batterinivå, varmt: start etter 5 min', () => {
    const s = run(new Sim(25), 400);
    near(at(s, 'Q1', true), 300);
  });

  it('2 kaldt: forvarming (Q3) etter 5 min, start (Q1) 20 min senere', () => {
    const s = run(new Sim(25, 0), 1600);
    near(at(s, 'Q3', true), 300);
    near(at(s, 'Q1', true), 1500);
  });

  it('3 full syklus: stopp først når nivå > 80 og >= 30 min gange; hvile hindrer omstart i 10 min', () => {
    const s = new Sim(25);
    while (s.t < 400 || s.q1) s.step();
    const rise = at(s, 'Q1', true) as number;
    const fall = s.t;
    expect(fall - rise).toBeGreaterThan(1800);
    expect(s.soc).toBeGreaterThan(79.5);
    s.soc = 20;
    run(s, 700);
    near(at(s, 'Q1', true, fall), fall + 600, 15);
  });

  it('4 Q1 uten I1: startfeil-alarm etter 90 s', () => {
    const s = run(new Sim(25, 15, new Amf(10, 5, 'no_start')), 500);
    near(at(s, 'Q4', true), 300 + 90, 4);
  });

  it('5 KLAR faller bort: Q1 av', () => {
    const s = run(new Sim(25), 400);
    s.i.I3 = false;
    run(s, 1);
    expect(s.q1).toBe(false);
  });

  it('6 heartbeat uteblir: datafeil etter 60 s', () => {
    const s = run(new Sim(60), 100);
    s.i.hb = false;
    run(s, 100);
    near(at(s, 'Q4', true), 160);
  });

  it('7 kontroller med lang kjøletid (60 s) gir falsk «ukommandert», 5 s gjør ikke', () => {
    for (const [stop, alarm] of [[60, true], [5, false]] as const) {
      const s = run(new Sim(25, 15, new Amf(10, stop)), 400);
      s.soc = 95;
      run(s, 2200);
      expect(at(s, 'Q4', true) !== null, `stop=${stop}`).toBe(alarm);
    }
  });

  it('8 maks gangtid 6 t (lading av, nivået forblir lavt)', () => {
    const s = run(new Sim(25, 15, undefined, 0), 22500);
    near(at(s, 'Q1', false, 1), 299 + 21600);
  });

  it('9 lastfrakobling under 15 %, opphevet når generatoren går', () => {
    const s = run(new Sim(14), 400);
    expect(at(s, 'Q2', false)).toBe(0);
    near(at(s, 'Q2', true), 309, 5);
  });

  it('10 testkjøring: starter uten 5 min forsinkelse, stopper ~30 min etter I1; ikke ved nivå >= 70', () => {
    let s = run(new Sim(60), 10);
    s.wipe = 1800;
    run(s, 5);
    near(at(s, 'Q1', true), 10);
    while (s.q1) s.step();
    expect(s.t - 10).toBeGreaterThan(1800);
    expect(s.t - 10).toBeLessThan(1850);
    s = run(new Sim(80), 10);
    s.wipe = 1800;
    run(s, 60);
    expect(at(s, 'Q1', true)).toBeNull();
  });

  it('11 kontrollerfeil (I2): Q1 av og alarm', () => {
    const s = run(new Sim(25, 15, new Amf(10, 5, 'fault')), 600);
    expect(at(s, 'Q1', false, 1)).not.toBeNull();
    expect(s.alarm).toBe(true);
  });

  it('12 nattstopp: forvarming avbrytes kl. 22, ingen start før 07:00; start 21:55 stoppes kl. 22', () => {
    let s = new Sim(25, 0);
    s.tid0 = 21 * 3600 + 45 * 60;
    run(s, 34600);
    near(at(s, 'Q3', true), 300);
    near(at(s, 'Q3', false, 301), 900);
    near(at(s, 'Q3', true, 901), 33300);
    near(at(s, 'Q1', true), 33300 + 1200);
    s = new Sim(25);
    s.tid0 = 21 * 3600 + 50 * 60;
    run(s, 33100);
    near(at(s, 'Q1', true), 300);
    near(at(s, 'Q1', false, 301), 600);
    near(at(s, 'Q1', true, 601), 33000);
  });

  it('13 kveldslading: under 40 % kl. 17–20 gir start etter 5 min og lading til over 80 %, ferdig før 22', () => {
    let s = new Sim(35);
    s.tid0 = 18 * 3600;
    while (s.t < 400 || s.q1) s.step();
    near(at(s, 'Q1', true), 300);
    expect(s.soc).toBeGreaterThan(79.5);
    expect(s.t).toBeLessThan(4 * 3600);
    for (const [soc, tid] of [[45, 18], [35, 20]] as const) {
      s = new Sim(soc);
      s.tid0 = tid * 3600;
      run(s, 7000);
      expect(at(s, 'Q1', true), `${soc} % kl. ${tid}`).toBeNull();
    }
  });
});
