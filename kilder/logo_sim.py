#!/usr/bin/env python3
"""Simulerer FBD-modul 1-11 (Overlevering Hytte off-grid) mot en generisk AMF. 1 steg = 1 s.
Modul 11 (nattstopp og kveldslading) er bare aktiv når klokka er kjent (tid0 satt), ellers er logikken som før.
Kjør: python logo_sim.py   (assert-baserte scenarioer, ingen avhengigheter)
Antakelser å verifisere i Soft Comfort: RS er reset-dominant, terskelretning, off-delay-oppførsel."""


class On:  # On-delay
    def __init__(s, t): s.t, s.c = t, 0
    def __call__(s, x): s.c = s.c + 1 if x else 0; return s.c >= s.t


class Off:  # Off-delay (starter usann)
    def __init__(s, t): s.t, s.c = t, t
    def __call__(s, x): s.c = 0 if x else min(s.c + 1, s.t); return s.c < s.t


class Trig:  # sann når x<lo, usann når x>hi, ellers hold
    def __init__(s, lo, hi): s.lo, s.hi, s.q = lo, hi, False
    def __call__(s, x):
        if x < s.lo: s.q = True
        elif x > s.hi: s.q = False
        return s.q


class Amf:
    """Generisk AMF. I1 = kjører, I2 = feil/lås.
    mode: ok | no_start (aldri I1, ingen I2) | stuck (stopper ikke) | fault (låser etter 30 s gange)."""
    def __init__(s, start=10, stop=5, mode="ok"):
        s.start, s.stop, s.mode = start, stop, mode
        s.up = s.down = 0
        s.run = s.lock = False

    def __call__(s, q1):
        s.up = s.up + 1 if q1 else 0
        s.down = 0 if q1 else s.down + 1
        if not s.lock and s.mode != "no_start" and s.up >= s.start: s.run = True
        if s.down >= s.stop and s.mode != "stuck": s.run = False
        if s.mode == "fault" and s.run and s.up >= s.start + 30: s.lock = True
        if s.lock: s.run = False
        return s.run, s.lock


class Sim:
    def __init__(s, soc=80, temp=15, amf=None, charge=2.5, cap=8.4):
        s.soc, s.temp, s.amf, s.charge, s.cap = soc, temp, amf or Amf(), charge, cap
        s.i = dict(I3=1, I4=1, I5=1, I6=1, I7=1, hb=1)  # hb = heartbeat fra Pi
        s.q1 = s.alarm = False
        s.wipe = s.t = 0  # wipe = gjenstående sek av testkjøring (Wiping relay)
        s.log, s.last = [], {}
        s.low, s.d5 = Trig(30, 80), On(300)  # lad til 80 % (global regel)
        s.kald, s.d20 = Trig(5, 8), On(1200)
        s.d30, s.d6h, s.hvile = On(1800), On(21600), Off(600)
        s.d90, s.d30u, s.hbd = On(90), On(30), Off(60)
        s.shed = Trig(15, 40)
        s.tid0 = None  # klokkeslett (s etter midnatt) ved t=0; None = modul 11 av
        s.kvl, s.d5k = False, On(300)  # kveldslading (RS) og 5 min forsinkelse

    def step(s):
        i = s.i
        I1, I2 = s.amf(s.q1)  # AMF svarer på Q1 fra forrige steg
        klar = bool(i["I3"] and i["I6"] and i["I5"] and not I2 and i["I4"])  # 1
        low = s.low(s.soc)                                                    # 2
        test = s.wipe > 0 and s.soc < 70 and klar                             # 10
        s.wipe = max(0, s.wipe - 1)
        natt = False                                                          # 11
        if s.tid0 is not None:
            k = (s.tid0 + s.t) % 86400
            natt = k >= 22 * 3600 or k < 7 * 3600                             # nattstopp 22-07
            kvset = s.d5k(17 * 3600 <= k < 20 * 3600 and s.soc < 40)          # kveld 17-20, under 40 % (nattbehov)
            if s.soc > 80 or natt: s.kvl = False                              # reset-dominant
            elif kvset: s.kvl = True
        onske = (s.d5(low) or test or s.kvl) and not natt
        kald = s.kald(s.temp)                                                 # 3
        q3 = (onske and kald) or I1
        forv = s.d20(q3)
        kjor = onske and (not kald or forv)
        d30, d6h = s.d30(I1), s.d6h(s.q1)                                     # 5
        stopp = (not low and not s.kvl and d30) or d6h
        hvile = s.hvile(s.q1)                                                 # 6
        if stopp or not klar or natt: s.q1 = False                            # 4 (reset-dominant)
        elif kjor and not hvile: s.q1 = True
        startfeil = s.d90(s.q1 and not I1)                                    # 7
        ukom = s.d30u(I1 and not s.q1)
        dataok = s.hbd(i["hb"])                                               # 9
        s.now = bool(startfeil or ukom or I2 or not (i["I3"] and i["I5"] and i["I6"] and i["I7"]) or not dataok)
        s.alarm = s.alarm or s.now  # lagres til kvittering
        q2 = not s.shed(s.soc) or I1                                          # 8
        s.soc = min(100, max(0, s.soc + (s.charge if I1 else -0.115) / s.cap * 100 / 3600))
        for k, v in dict(Q1=s.q1, Q2=q2, Q3=q3, Q4=s.alarm, I1=I1).items():
            if s.last.get(k) != v: s.log.append((s.t, k, v)); s.last[k] = v
        s.t += 1


def run(s, n):
    for _ in range(n): s.step()
    return s


def at(s, k, v, after=0):
    return next((t for t, n, x in s.log if n == k and x == v and t >= after), None)


def near(a, b, tol=3): assert a is not None and abs(a - b) <= tol, f"fikk {a}, ventet ~{b}"


def demo():
    # 1 lavt SOC, varmt: start etter 5 min
    s = run(Sim(soc=25), 400); near(at(s, "Q1", True), 300)
    # 2 kaldt: Q3 etter 5 min, Q1 20 min senere
    s = run(Sim(soc=25, temp=0), 1600); near(at(s, "Q3", True), 300); near(at(s, "Q1", True), 1500)
    # 3 full syklus: stopp først når SOC>80 og >=30 min gange; HVILE hindrer omstart i 10 min
    s = Sim(soc=25)
    while s.t < 400 or s.q1: s.step()
    rise, fall = at(s, "Q1", True), s.t
    assert fall - rise > 1800 and s.soc > 79.5, (rise, fall, s.soc)
    s.soc = 20; run(s, 700); near(at(s, "Q1", True, after=fall), fall + 600, 15)
    # 4 Q1 uten I1: STARTFEIL etter 90 s
    s = run(Sim(soc=25, amf=Amf(mode="no_start")), 500); near(at(s, "Q4", True), 300 + 90, 4)
    # 5 KLAR faller bort: Q1 av
    s = run(Sim(soc=25), 400); s.i["I3"] = 0; run(s, 1); assert not s.q1
    # 6 heartbeat uteblir: DATAFEIL etter 60 s
    s = run(Sim(soc=60), 100); s.i["hb"] = 0; run(s, 100); near(at(s, "Q4", True), 160)
    # 7 AMF med lang kjøletid (60 s) gir falsk UKOMMANDERT, 5 s gjør ikke
    for stop, alarm in ((60, True), (5, False)):
        s = run(Sim(soc=25, amf=Amf(stop=stop)), 400); s.soc = 95; run(s, 2200)
        assert (at(s, "Q4", True) is not None) == alarm, stop
    # 8 maks gangtid 6 t (lading av, SOC forblir lav)
    s = run(Sim(soc=25, charge=0), 22500); near(at(s, "Q1", False, after=1), 299 + 21600)
    # 9 lastfrakobling: SHED under 15 %, opphevet når generator går
    s = run(Sim(soc=14), 400); assert at(s, "Q2", False) == 0; near(at(s, "Q2", True), 309, 5)
    # 10 testkjøring: starter uten 5 min forsinkelse, stopper ~30 min etter I1; ikke ved SOC>=70
    s = run(Sim(soc=60), 10); s.wipe = 1800; run(s, 5); near(at(s, "Q1", True), 10)
    while s.q1: s.step()
    assert 1800 < s.t - 10 < 1850, s.t
    s = run(Sim(soc=80), 10); s.wipe = 1800; run(s, 60); assert at(s, "Q1", True) is None
    # 11 AMF-feil (I2): Q1 av og alarm
    s = run(Sim(soc=25, amf=Amf(mode="fault")), 600); assert at(s, "Q1", False, after=1) and s.alarm
    # 12 nattstopp: start 21:55, stopp 22:00, ingen forvarming eller start før 07:00 (kaldt)
    s = Sim(soc=25, temp=0); s.tid0 = 21 * 3600 + 45 * 60; run(s, 34600)
    near(at(s, "Q3", True), 300); near(at(s, "Q3", False, after=301), 900)  # forvarming avbrutt kl. 22
    near(at(s, "Q3", True, after=901), 33300); near(at(s, "Q1", True), 33300 + 1200)  # 07:00 + 20 min
    s = Sim(soc=25); s.tid0 = 21 * 3600 + 50 * 60; run(s, 33100)
    near(at(s, "Q1", True), 300); near(at(s, "Q1", False, after=301), 600); near(at(s, "Q1", True, after=601), 33000)
    # 13 kveldslading: under 40 % kl. 17-20 gir start etter 5 min og lading til over 80 %, ferdig før 22
    s = Sim(soc=35); s.tid0 = 18 * 3600
    while s.t < 400 or s.q1: s.step()
    near(at(s, "Q1", True), 300); assert s.soc > 79.5 and s.t < 4 * 3600, (s.t, s.soc)
    for soc, tid in ((45, 18), (35, 20)):  # over 40 %, eller etter kl. 20: ingen start
        s = Sim(soc=soc); s.tid0 = tid * 3600; run(s, 7000); assert at(s, "Q1", True) is None, (soc, tid)
    print("OK: alle scenarioer bestått")


if __name__ == "__main__":
    demo()
