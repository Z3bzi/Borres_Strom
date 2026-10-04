# Overlevering: PLS-bytte fra LOGO! 9 til Arduino Opta RS485

Oct 4, 2026 · @Sebastian Alveberg

Fortsettelse av `Overlevering Hytte off-grid strøm og generator-autostart.md` (3. oktober 2026). Les den først. Denne filen dekker bare det som er nytt: valg av PLS, endret arkitektur rundt styringen og veien videre mot simulering på PC.

## Sammendrag

Styringen blir en **Arduino Opta RS485 (AFX00001, RS 260-0884)** i stedet for Siemens LOGO! 9. I/O-planen (I1–I8, Q1–Q4) og logikken (modul 1–11) er uendret. LOGO!-blokkene oversettes til IEC 61131-3-blokker i Arduino PLC IDE.

**Status 4. oktober 2026:**
- PLS valgt.
- Den første overleveringen er oppdatert (commit `8e5b025` på grenen `claude/dreamy-tesla-x58nev`).
- Koblingsplan med komponentliste er laget som artifact: https://claude.ai/artifact/H37QeGAQjM48mAZNHhzvDb
- Nettsiden (`index.html`) er bevisst **ikke** oppdatert og nevner fortsatt LOGO! 9.

**Neste mål:** Simulere hele styringen på PC-en før noe kjøpes eller bygges. Brukeren har en manual for PLC IDE, men den var ikke tilgjengelig i økten. Den må legges i `kilder/` eller ved i chatten.

## Hvorfor Opta

| Alternativ | Vurdering |
| --- | --- |
| RS PRO logikkmodul 917-6361/6370/6373/6377 | Forkastet. Ingen Ethernet, kun seriell Modbus RTU-**slave** (via 917-6392, 9600 baud), kun ladder, 250 linjer. Kan ikke selv hente SOC. |
| RS PRO 266-50xx | Forkastet. Stor PLS (16–36 innganger), instruksjonsliste og ladder, overdimensjonert. |
| Eaton easyE4 (EASY-E4-UC-12RC1) | Godt alternativ: display, FBD, Modbus TCP-klient og -server. easySoft 8 krever lisens. |
| Crouzet em4 Ethernet | FBD og Modbus TCP, men kun 24 V DC forsyning. |
| **Arduino Opta RS485** | **Valgt.** Samme I/O-fordeling som LOGO! 12/24RCE, alle innganger kan brukes analogt, Modbus TCP og RTU, FBD. Lisensen til PLC IDE følger med. |

Opta er utviklet av Finder og Arduino. RS485-varianten er samme maskinvare som Finder Opta Plus (8A.04.9.024.8310).

**Varianter** (omtrentlige priser i USD fra amerikanske forhandlere):

| Variant | SKU | Pris | Kommentar |
| --- | --- | --- | --- |
| Lite | AFX00003 | ~100 | Ethernet og USB-C |
| **RS485** | **AFX00001** | **~165** | Ethernet, USB-C og RS485. Valgt. |
| WiFi | AFX00002 | ~255 | Som RS485, pluss Wi-Fi og BLE |

**Utvidelser:** D1608E (AFX00005, 16 innganger og 8 releer), D1608S (AFX00006, med SSR), A0602 (AFX00007, analog). Ingen trengs nå.

## Opta-spesifikasjoner

**Bekreftet i produktoversikten** (`Opta_datasheet.pdf`, lastet opp i chatten, ikke lagt i repoet):

| Egenskap | Verdi |
| --- | --- |
| Innganger | 8, hver kan brukes digitalt eller som 0–10 V |
| Utganger | 4 releer, 10 A / 250 V AC, ingen kortslutningsbeskyttelse |
| Kommunikasjon | 10/100 Ethernet (TCP/IP, Modbus TCP), RS485 halv dupleks, USB-C |
| Programmering | Arduino-språk, eller IEC 61131-3 (LD, FBD, SFC, ST, IL) i PLC IDE |
| Klokke | Holder tiden typisk 10 døgn uten strøm ved 25 °C, NTP via Ethernet |
| Forsyning | 12…24 V DC |
| Temperatur | -20 til +50 °C, IP20 |
| Betjening | Ikke display. Programmerbar USER-knapp, RESET, fire status-LED-er. |
| Annet | Utvidelsesport, sikkerhetsbrikke ATECC608B |

**Fra søk, ikke lest i primærkilden:**
- Tillatt forsyning er 10,2–27,6 V DC.
- Lisensen til PLC IDE følger med Opta og aktiveres med «Activate PLC Runtime».

## Endringer i arkitekturen

Detaljer og diagrammer står i artifacten. Kort fortalt:

- **Forsyning:** Styringen får en isolert DC-DC til 24 V, uansett systemspenning. Grunnen er at et 24 V LiFePO4-batteri når 28,4–28,8 V under lading, som er over 27,6 V. Forslag: Mean Well DDR-60G-24 (9–36 V inn) eller DDR-60L-24 (18–75 V inn). Sikringer: F1 Opta 1 A, F2 innganger og sensorer 2 A, F3 spoler og alarm 4 A.
- **Aggregatet over RS485:** Autostart-kortet (for eksempel DSE7310 MKII) kobles på Opta-ens RS485 som Modbus RTU-slave med ID 1. Da trengs ingen omformer fra RS485 til TCP, 192.168.0.3 blir ledig, og Cat6 til skuret trengs ikke lenger.
- **Temperatur:** Egen Modbus RTU-føler i skuret med ID 2 på samme buss. Den erstatter at temperaturen hentes fra SOC-enheten, slik `logo_modbus.py` gjør i dag.
- **Koblingsreléer KR1 og KR2 i skuret:** Kortets utganger for «kjører» og «alarm» går sannsynligvis på aggregatets 12 V. Reléene gir tørre kontakter tilbake til I1 og I2.
- **Kontaktorer:** K2 (lastfrakobling, Q2) og K3 (hjelpestrøm til skuret, Q3) har 24 V DC-spole og frihjulsdiode. Opta-reléene bryter aldri 230 V-laster direkte.
- **Q1:** Tørr kontakt mot kortets remote start-inngang og B−, så systemene er galvanisk skilt. Sjekk polariteten i kortets manual.
- **Nødstopp:** Bryteren har to NC-kontakter. Den ene går direkte til kortets nødstoppinngang, den andre til I3.
- **Kvittering:** USER-knappen erstatter Softkey og Message text i LOGO!.

### Modbus-roller og adresser

| Enhet | Adresse | Rolle |
| --- | --- | --- |
| Opta | 192.168.0.2 | TCP-klient mot SOC, TCP-server for livstegn fra Pi, RTU-master på RS485 |
| Autostart-kort | RS485 ID 1 | RTU-slave |
| Temperaturføler | RS485 ID 2 | RTU-slave |
| Batterimonitor | 192.168.0.4 | TCP-server, SOC |
| Raspberry Pi | 192.168.0.5 | Skriver livstegn og leser status |

### 12-lederen hytte–skur

| Leder | Funksjon |
| --- | --- |
| 1 | +24 V ut, felles for kontaktene og CO-detektoren (F2) |
| 2 | 0 V (CO-detektor) |
| 3–8 | Retur I1, I2, I3, I4, I5, I6 |
| 9–10 | Q1 a og b (remote start og B−) |
| 11–12 | Reserve |

RS485 går i egen kabel, 2-par tvunnet og skjermet (for eksempel LiYCY-TP 2×2×0,5): A/B pluss 0 V og +24 V til føleren. Terminering med 120 Ω i begge ender hvis enhetene ikke har det innebygd.

## LOGO!-blokker oversatt til IEC 61131-3

| LOGO! | Opta / PLC IDE |
| --- | --- |
| On-delay / Off-delay | TON / TOF |
| Latching relay (reset-dominant) | RS |
| Wiping relay | TP |
| Analog threshold trigger | Sammenligning med hysterese (egen funksjonsblokk) |
| Weekly timer / Yearly timer | Sammenligning mot klokka |
| Asynchronous pulse generator | Blinker av TON og TOF |
| Message text og Softkey | USER-knappen og varsel via Pi-en |
| Nettverksinngang (NAI) | Modbus TCP-klient eller -server-variabel |

## Foreslåtte endringer i logikken (ikke innført)

1. **I2 (feil) er koblet NO,** så et kabelbrudd skjuler en feil. Vurder å bruke kortets «OK»-signal på NC og snu I2 i logikken.
2. **Når temperaturen kommer over RS485,** må modul 3 behandle kommunikasjonsfeil som KALD. Da forvarmer aggregatet heller unødig enn å starte kaldt.

Begge påvirker `src/sim/logic.ts` og `kilder/logo_sim.py`, og testene i `tests/logic.test.ts` hvis de innføres.

## Åpne punkter

- Spenningsområdet 10,2–27,6 V må bekreftes i det fulle databladet for AFX00001.
- Kan Opta være Modbus TCP-klient, TCP-server og RTU-master samtidig i PLC IDE?
- Har PLC IDE simulering uten maskinvare, og hvordan fungerer den? Sjekk i manualen.
- NTP og sommertid i Opta (modul 10 og 11).
- Er det innebygd 120 Ω-terminering i Opta eller i kortet?
- Systemspenning, aggregat og autostart-kort, batterimonitor og 5G-ruter er fortsatt ikke valgt. De styrer DC-DC-modell, spolespenning på KR1 og KR2, registerkart og hvor BMS OK kommer fra.
- Punktene fra 3. oktober om LOGO! 9 (Soft Comfort, NAI, AM4, analoge innganger) gjelder ikke lenger.

## Neste steg

1. **Legg PLC IDE-manualen i repoet,** for eksempel `kilder/PLC_IDE_manual.pdf`. Den ble ikke funnet i repoet, blant opplastingene eller på Google Drive.
2. **Skriv en byggeguide for simulering på PC** basert på manualen:
   - installere PLC IDE og opprette prosjekt for Opta RS485,
   - variabler for I1–I8 og Q1–Q4,
   - modul 1–11 i FBD med blokktabellen over,
   - simulering uten maskinvare, hvis IDE-en støtter det.
3. **Test Modbus mot PC-en:**
   - `kilder/logo_modbus.py` kan spille SOC-enheten over TCP. Den spiller også AMF-kortet over TCP, så aggregatdelen må over på Modbus RTU eller testes med en USB-RS485-adapter.
   - Scenarioene i `tests/logic.test.ts` (13 stykker fra `logo_sim.py`) er fasit for hvordan logikken skal oppføre seg.
4. Først når simuleringen stemmer: kjøp Opta, DC-DC, KR-reléer, sensorer og kabler etter listen i artifacten.

## Filer og lenker

- `kilder/Overlevering Hytte off-grid strøm og generator-autostart.md`: oppdatert med Opta-seksjon (commit `8e5b025`).
- Koblingsplan, klemmeplan og komponentliste: https://claude.ai/artifact/H37QeGAQjM48mAZNHhzvDb (privat til den deles).
- Referansesimulering: `kilder/logo_sim.py` og `src/sim/logic.ts`. Modbus-testserver: `kilder/logo_modbus.py`.

**Kilder:**
- [Opta Family (Arduino Store)](https://store.arduino.cc/collections/opta-family)
- [Opta-datablad AFX00001/2/3](https://docs.arduino.cc/resources/datasheets/AFX00001-AFX00002-AFX00003-datasheet.pdf)
- [PLC IDE-lisens og aktivering](https://docs.arduino.cc/software/plc-ide/tutorials/plc-ide-setup-license)
- [Opta på RS](https://ae.rsdelivers.com/product/arduino/afx00001/arduino-opta-rs485-series-logic-controller-12-24-v/2600884)

Nettverket i skyøkten blokkerte rs-online.com, docs.arduino.cc og store.arduino.cc. Opplysninger fra disse sidene kom derfor via søk.
