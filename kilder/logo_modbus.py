#!/usr/bin/env python3
"""Modbus TCP-server som spiller GENERATOR AMF (192.168.0.3) og BATTERY SOC (192.168.0.4) for LOGO!Soft Comfort.
Vindu:    python logo_modbus.py            (uten argumenter åpnes GUI)
Terminal: python logo_modbus.py [fart=1] [start-SOC=50] [temp=15] [modus=ok|no_start|stuck|fault]
Selvtest: python logo_modbus.py test
fart = simulerte sekunder per sekund (sett lik tidsfaktoren i Soft Comfort-simuleringen).

Registerkart (Soft Comfort-adresser; antatt 1-basert, på ledningen er adressen n-1 - verifiser):
  AMF .3: Coil 1 = kjør (Q1, skrives av LOGO!) | DI 1 = kjører (I1) | DI 2 = feil/lås (I2)
  SOC .4: IR 1 = SOC i 0,1 % | IR 2 = temperatur i 0,1 grader C
Serveren lytter på alle adaptere, så PC-en må ha begge IP-ene (.3 og .4) for at begge enhetene skal svare.
"""
import socket, socketserver, struct, sys, threading, time
from logo_sim import Amf

S = dict(coil={}, di={}, ir={}, hr={})  # 0-basert adresse -> verdi
LOCK = threading.Lock()


def recvn(c, n):
    b = b""
    while len(b) < n:
        d = c.recv(n - len(b))
        if not d: return None
        b += d
    return b


def respond(pdu):
    f = pdu[0]
    a, n = struct.unpack(">HH", pdu[1:5])
    with LOCK:
        if f in (1, 2):
            t = S["coil" if f == 1 else "di"]
            bits = [t.get(a + k, 0) for k in range(n)]
            out = bytes(sum(b << j for j, b in enumerate(bits[i:i + 8])) for i in range(0, n, 8))
            return bytes([f, len(out)]) + out
        if f in (3, 4):
            t = S["hr" if f == 3 else "ir"]
            return bytes([f, 2 * n]) + b"".join(struct.pack(">H", t.get(a + k, 0) & 0xFFFF) for k in range(n))
        if f == 5: S["coil"][a] = int(n == 0xFF00); return pdu[:5]
        if f == 6: S["hr"][a] = n; return pdu[:5]
        if f == 15:
            for k in range(n): S["coil"][a + k] = pdu[6 + k // 8] >> (k % 8) & 1
            return pdu[:5]
        if f == 16:
            for k, v in enumerate(struct.unpack(f">{n}H", pdu[6:6 + 2 * n])): S["hr"][a + k] = v
            return pdu[:5]
    return bytes([f | 0x80, 1])  # ukjent funksjon


EVT = []  # tilkoblingslogg (vises i GUI)


def log(msg):
    EVT.append(msg); print(msg, flush=True)


class H(socketserver.BaseRequestHandler):
    def handle(s):  # ponytail: enhets-ID ignoreres, ett svar per forespørsel
        me, peer, seen = s.request.getsockname(), s.client_address, set()
        log(f"tilkobling fra {peer[0]}:{peer[1]} til {me[0]}:{me[1]}")
        while (h := recvn(s.request, 7)):
            tid, _, ln, uid = struct.unpack(">HHHB", h)
            pdu = recvn(s.request, ln - 1)
            if not pdu: break
            k = (pdu[0], *struct.unpack(">HH", pdu[1:5])) if len(pdu) >= 5 else (pdu[0],)
            if k not in seen: seen.add(k); log(f"  forespørsel funksjon {k[0]} adresse {k[1] if len(k) > 1 else '-'} antall/verdi {k[2] if len(k) > 2 else '-'} (enhet-ID {uid})")
            r = respond(pdu)
            s.request.sendall(struct.pack(">HHHB", tid, 0, len(r) + 1, uid) + r)
        log(f"tilkobling fra {peer[0]}:{peer[1]} lukket")


class Srv(socketserver.ThreadingTCPServer):
    allow_reuse_address = daemon_threads = True


def newP(soc=50.0, temp=15.0, speed=1.0):
    return dict(soc=soc, temp=temp, speed=speed, t=0, log=[])  # t = simulerte sekunder, log = [(t, tekst)]


def plant(P, amf):
    """AMF-modell (fra logo_sim) + batteri: lader 2,5 kW når I1, ellers 115 W last, 8,4 kWh. P deles med GUI."""
    last, due, prev = time.perf_counter(), 0.0, (0, 0, 0)
    while True:
        time.sleep(0.01)
        now = time.perf_counter(); due += (now - last) * P["speed"]; last = now
        n = int(due); due -= n
        for _ in range(n):
            with LOCK: q1 = int(bool(S["coil"].get(0, 0)))
            i1, i2 = (int(x) for x in amf(bool(q1)))
            P["soc"] = min(100, max(0, P["soc"] + (2.5 if i1 else -0.115) / 8.4 * 100 / 3600))
            P["t"] += 1
            with LOCK:
                S["di"][0], S["di"][1] = i1, i2
                S["ir"][0], S["ir"][1] = round(P["soc"] * 10), round(P["temp"] * 10)
            cur = (q1, i1, i2)
            for name, p, c in zip(("Q1 kjør", "I1 kjører", "I2 feil"), prev, cur):
                if p != c: P["log"].append((P["t"], f"{name} {'PÅ' if c else 'AV'}"))
            prev = cur


def serve(port):
    srv = Srv(("0.0.0.0", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def gui(port=502):
    import tkinter as tk
    from tkinter import ttk
    P, amf = newP(), Amf()
    threading.Thread(target=plant, args=(P, amf), daemon=True).start()
    try: serve(port); status = f"Modbus-server lytter på port {port}"
    except OSError as e: status = f"FEIL: kan ikke lytte på port {port}: {e}"

    root = tk.Tk(); root.title("LOGO! generator- og SOC-simulator")
    f = ttk.Frame(root, padding=10); f.pack(fill="both", expand=True)
    ttk.Label(f, text=status, foreground="red" if status.startswith("FEIL") else "green").grid(row=0, column=0, columnspan=3, sticky="w")

    def lamp(row, text, col):
        ttk.Label(f, text=text).grid(row=row, column=0, sticky="w")
        cv = tk.Canvas(f, width=18, height=18, highlightthickness=0); cv.grid(row=row, column=1)
        o = cv.create_oval(2, 2, 16, 16, fill="grey")
        return lambda on: cv.itemconfig(o, fill=col if on else "grey")

    set_q1, set_i1, set_i2 = lamp(1, "Q1 kjør (fra LOGO!)", "orange"), lamp(2, "I1 generator kjører", "green"), lamp(3, "I2 feil/lås", "red")
    soc_l, time_l = ttk.Label(f, font=("", 14, "bold")), ttk.Label(f)
    soc_l.grid(row=4, column=0, columnspan=2, sticky="w", pady=4); time_l.grid(row=4, column=2, sticky="e")

    def knob(row, label, lo, hi, key):  # glidebryter: leser tilbake fra P, skriver til P når du slipper
        ttk.Label(f, text=label).grid(row=row, column=0, sticky="w")
        sc = tk.Scale(f, from_=lo, to=hi, orient="horizontal", length=240); sc.set(P[key]); sc.grid(row=row, column=1, columnspan=2)
        drag = [False]
        sc.bind("<ButtonPress-1>", lambda e: drag.__setitem__(0, True))
        def release(e): P[key] = float(sc.get()); drag[0] = False
        sc.bind("<ButtonRelease-1>", release)
        return lambda: None if drag[0] else sc.set(P[key])

    sync = [knob(5, "SOC (%)", 0, 100, "soc"), knob(6, "Temperatur (°C)", -20, 30, "temp")]

    def combo(row, label, values, init, on_pick):
        ttk.Label(f, text=label).grid(row=row, column=0, sticky="w")
        cb = ttk.Combobox(f, values=values, state="readonly", width=12); cb.set(init); cb.grid(row=row, column=1, columnspan=2, sticky="w")
        cb.bind("<<ComboboxSelected>>", lambda e: on_pick(cb.get()))

    combo(7, "Fart (x)", ["1", "10", "60", "300", "1000"], "1", lambda v: P.update(speed=float(v)))
    combo(8, "AMF-modus", ["ok", "no_start", "stuck", "fault"], "ok", lambda v: setattr(amf, "mode", v))
    ttk.Button(f, text="Nullstill AMF-feil", command=lambda: (setattr(amf, "lock", False), setattr(amf, "run", False))).grid(row=9, column=0, columnspan=3, sticky="w", pady=4)
    txt = tk.Text(f, height=10, width=44, state="disabled"); txt.grid(row=10, column=0, columnspan=3)

    def tick():
        with LOCK: q1, i1, i2 = S["coil"].get(0, 0), S["di"].get(0, 0), S["di"].get(1, 0)
        set_q1(q1); set_i1(i1); set_i2(i2)
        soc_l.config(text=f"SOC {P['soc']:.1f} %"); time_l.config(text=f"simulert tid {P['t'] // 3600}:{P['t'] // 60 % 60:02}:{P['t'] % 60:02}")
        for s in sync: s()
        for src in (P["log"], EVT):
            while src:
                m = src.pop(0)
                if isinstance(m, tuple): m = f"{m[0] // 3600}:{m[0] // 60 % 60:02}:{m[0] % 60:02}  {m[1]}"
                txt.config(state="normal"); txt.insert("end", m + "\n"); txt.see("end"); txt.config(state="disabled")
        root.after(200, tick)

    tick(); root.mainloop()


def req(c, pdu):
    c.sendall(struct.pack(">HHHB", 1, 0, len(pdu) + 1, 1) + pdu)
    return recvn(c, struct.unpack(">HHHB", recvn(c, 7))[2] - 1)


def test():
    srv = Srv(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    P = newP(25, -3.5, 1000)
    threading.Thread(target=plant, args=(P, Amf()), daemon=True).start()
    c = socket.create_connection(("127.0.0.1", srv.server_address[1]))
    w = struct.pack(">BHH", 5, 0, 0xFF00)
    assert req(c, w) == w  # LOGO! setter Q1
    for _ in range(100):  # vent på I1 (AMF starter etter 10 simulerte s)
        if req(c, struct.pack(">BHH", 2, 0, 2)) == bytes([2, 1, 0b01]): break
        time.sleep(0.05)
    else: raise AssertionError("I1 kom aldri")
    _, _, soc, temp = struct.unpack(">BBHH", req(c, struct.pack(">BHH", 4, 0, 2)))
    assert 250 <= soc <= 400 and temp == 65536 - 35, (soc, temp)  # lader, -3,5 grader som 16-bit toerkomplement
    assert any(m == "I1 kjører PÅ" for _, m in P["log"]), P["log"]
    assert any("tilkobling fra" in m for m in EVT) and any("funksjon 5 adresse 0" in m for m in EVT), EVT
    assert req(c, struct.pack(">BHHB2H", 16, 4, 2, 4, 7, 9)) == struct.pack(">BHH", 16, 4, 2)
    assert req(c, struct.pack(">BHH", 3, 4, 2)) == bytes([3, 4, 0, 7, 0, 9])
    assert req(c, struct.pack(">BHH", 99, 0, 1))[0] == 99 | 0x80
    print("OK: Modbus-selvtest bestått")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["test"]: test()
    elif not a: gui()
    else:
        a += [None] * 4
        P, mode = newP(float(a[1] or 50), float(a[2] or 15), float(a[0] or 1)), a[3] or "ok"
        threading.Thread(target=plant, args=(P, Amf(mode=mode)), daemon=True).start()
        print(f"Modbus-server på port 502 (fart x{P['speed']}, SOC {P['soc']} %, {P['temp']} grader C, AMF-modus {mode}). Ctrl+C avslutter.")
        serve(502).serve_forever()
