# Overlevering: Hytte off-grid strøm og generator-autostart

Oct 3, 2026 · @Sebastian Alveberg

## Sammendrag

Sebastian bygger selv strømautomatikken til en helt off-grid sommerhytte på Børresholmen, Kragerø: solceller og batteri, med et dieselaggregat i eget skur 30 m fra hytta som skal autostarte. Styringen er en Arduino Opta RS485 (AFX00001) programmert i FBD i Arduino PLC IDE. Den erstatter Siemens LOGO! 9 (6ED1052-1MD08-0BA3, 12/24RCE), som var planlagt fram til 4. oktober 2026.

**Endring 4. oktober 2026:** PLS-en er byttet fra LOGO! 9 til Arduino Opta RS485. I/O-planen og logikken er uendret, men LOGO!-blokkene oversettes til standardblokker (se «PLS: Arduino Opta RS485» under). Seksjonene under omtaler fortsatt LOGO! der teksten er skrevet før byttet.

**Status 3. oktober 2026:** dimensjonering, I/O-plan og logikkspesifikasjon er ferdig, og I/O er lagt inn i Soft Comfort. Nettverksvisningen er delvis satt opp. Generator og AMF/autostart-kort er ikke valgt, og SOC-kilden er ikke valgt.

**Mål:** full kontroll, mulighet til å bygge ut over tid, fail-safe generatorstart, og fjernovervåking via Starlink som står på 24/7.

## Forutsetninger

Hytta brukes mest i helger, men har folk sammenhengende fra midten av juni til midten av august. Vinterbruk er ekstremt sjelden.

- 6 personer, Kragerø (soldata fra solkart.no)
- Starlink på 24/7 for fjernovervåking. Standby-last totalt ca. 115 W: Starlink 70 W, ruter 12 W, LOGO!/Pi 8 W, vekselretter tomgang 25 W
- Autostart på generatoren er et absolutt krav
- Generator i eget skur 30 m fra hytta for å begrense støy
- Språk i all dokumentasjon: norsk bokmål

| Last | Antakelse |
| --- | --- |
| Mobilladere | 6 × 10 W × 1,5 h |
| Nettbrett | 3 × 15 W × 2 h |
| LED-lys | 12 × 8 W × 5 h |
| Kjøleskap | 60 W × 8 h, startstrøm ×3 |
| Vannpumpe | 150 W × 0,5 h, startstrøm ×3 |
| Vedkløyver | 2200 W × 0,25 h, startstrøm ×3 |
| Verktøy | 1200 W × 0,25 h, startstrøm ×2 |

## Systemarkitektur og dimensjonering

Batteriet på ca. 8,4 kWh gir ett døgns autonomi, og anbefalt solcelleeffekt er 3 kWp.

**Energiflyt:** solceller → MPPT → batteri/DC-bus → vekselretter → hyttelaster. Generatoren i skuret mater lader/vekselretter via 30 m kabel. LOGO! 9 starter og stopper generatoren, kobler fra ikke-vitale laster og varsler. Eget SOC-måleapparat (shunt/BMS/vekselretter/Cerbo) leverer SOC til LOGO! over Modbus TCP.

| Størrelse | Verdi |
| --- | --- |
| Dagsforbruk | 4825 Wh (6,03 kWh med 25 % headroom) |
| Batteri | ca. 8,4 kWh (1 d autonomi, DoD 80 %, vekselretter 90 %) |
| Vekselretter | ca. 3,4 kW kontinuerlig, topp ca. 9,4 kW |
| Solceller | minst 2,2 kWp (september), anbefalt 3 kWp (7 × 430 W) |
| Generatorlading | ca. 0,3 C, diesel ca. 2,5 kWh/l |
| Vinter med Starlink 24/7 | underskudd ca. 204 kWh, ca. 90 l diesel |

Tallene kommer fra regnearket `hytte_kapasitet.xlsx` (arkene Forutsetninger, Last, Resultat, Sol Kragerø, Bruksmønster). Verdiene i tabellen er fra siste beregning, men batteri-, vekselretter- og solcelletallene er regnet før standby-lasten ble satt til 115 W og er ikke oppdatert.

## PLS: Arduino Opta RS485

Valgt 4. oktober 2026. Opta er utviklet av Finder og Arduino og selges også som Finder Opta Plus (8A.04.9.024.8310).

| Egenskap | Verdi |
| --- | --- |
| Innganger | 8, hver kan brukes digitalt eller som 0–10 V |
| Utganger | 4 releer, 10 A / 250 V AC |
| Kommunikasjon | Ethernet (Modbus TCP), RS485 (Modbus RTU), USB-C |
| Programmering | Arduino PLC IDE med IEC 61131-3 (FBD, LD, ST, SFC, IL). Lisensen følger med enheten. |
| Klokke | Holder tiden typisk 10 døgn uten strøm ved 25 °C, NTP via Ethernet |
| Forsyning | 12–24 V DC nominelt, 10,2–27,6 V tillatt ifølge databladet (må bekreftes) |
| Temperatur | -20 til +50 °C |
| Betjening | Ikke display. Programmerbar USER-knapp og fire status-LED-er. |
| Utvidelse | D1608E (16 innganger og 8 releer), D1608S (med halvlederreleer), A0602 (analog) |

**Hvorfor byttet:** Modbus TCP-klient er bekreftet, alle innganger kan brukes analogt, og RS485 lar autostart-kortet (for eksempel DSE7310) kobles direkte med Modbus RTU. Det fjerner flere av de åpne punktene for LOGO! 9.

**Oversettelse av LOGO!-blokkene i logikken:**

| LOGO! | Opta (IEC 61131-3) |
| --- | --- |
| On-delay / Off-delay | TON / TOF |
| Latching relay (reset-dominant) | RS |
| Wiping relay | TP |
| Analog threshold trigger | Sammenligning med hysterese (egen funksjonsblokk) |
| Weekly timer / Yearly timer | Sammenligning mot klokka |
| Asynchronous pulse generator | Blinker av TON og TOF |
| Message text og Softkey | USER-knappen og varsel via Pi-en |

## I/O-plan

I/O-planen er den samme for Opta som for LOGO! 12/24RCE: 8 innganger og 4 reléutganger. Alle sikkerhetssignaler er koblet slik at brudd gir stopp.

| Kanal | Funksjon | Merknad |
| --- | --- | --- |
| I1 | Generator kjører | Fra AMF-kort |
| I2 | Generator feil/lås | Fra AMF-kort |
| I3 | Vern/nødstopp OK | NC, bryter = stopp |
| I4 | Auto/manuell | Auto kreves for start |
| I5 | Drivstoff OK | NC |
| I6 | CO/røyk OK | NC, blokkerer start |
| I7 | BMS OK | 1 = OK, 0 = feil |
| I8 | Ledig | Evt. hardwired «batteri lavt» som reserve |
| Q1 | Generator kjør | Normalt åpen, spenningsløs = stopp |
| Q2 | Lastfrakobling | Aktiv = ikke-vitale laster tillatt |
| Q3 | Hjelpestrøm skur | Forvarming/lader |
| Q4 | Alarm | Pulserende |

**Utgangene:** relékontaktene tåler 10 A ved 250 V AC og har ingen kortslutningsbeskyttelse. Bruk ekstern sikring og frihjulsdiode eller RC-ledd på induktive laster. Feil i PLS-en gir da automatisk stopp og lastfrakobling.

## FBD-logikk

Logikken er delt i elleve moduler. Terskler og tider under er startverdier som skal justeres i simulering og ved igangkjøring.

1. **KLAR** = I3 AND I6 AND I5 AND NOT I2 AND I4 (Auto). AND har fire innganger, så bruk to AND-blokker.
2. **SOC-terskler:** Analog threshold trigger på SOC (nettverks-analoginngang): på under 30 %, av over 80 % (endret fra 90 % 3. oktober 2026: aggregatet lader til 80 %). Resultat SOCLAV går gjennom 5 min On-delay til STARTONSKE (= OR TESTKJØR). Sjekk terskelretningen i simulering.
3. **Forvarming:** KALD = temperatur under 5 °C (hysterese 5/8). Q3 = (STARTONSKE AND KALD) OR I1. 20 min On-delay gir FORVARMET. KJØR = STARTONSKE AND (NOT KALD OR FORVARMET).
4. **Q1** = Latching relay (RS), ikke retentiv. Set = KJØR AND KLAR AND NOT HVILE. Reset = STOPP OR NOT KLAR OR NATT.
5. **STOPP** = (NOT SOCLAV AND NOT KVELDLADING AND 30 min On-delay på I1) OR 6 t On-delay på Q1 (maks gangtid).
6. **HVILE** = 10 min Off-delay på Q1, som hindrer rask omstart.
7. **Alarmer:** STARTFEIL = 90 s On-delay (Q1 AND NOT I1). UKOMMANDERT = 30 s On-delay (I1 AND NOT Q1). I tillegg I2, NOT I3, NOT I6, NOT I5, NOT BMS OK og DATAFEIL. Alt til Q4 via Asynchronous pulse generator, med Message text-blokker og lagring til kvittering med Softkey.
8. **Lastfrakobling:** SHED-terskel på SOC (på under 15 %, av over 40 %). Q2 = NOT SHED OR I1.
9. **Datavakt:** heartbeat fra Pi på nettverksinngang, 60 s Off-delay gir DATAOK. DATAFEIL = NOT DATAOK.
10. **Testkjøring:** Yearly timer (månedsmodus hvis tilgjengelig, ellers Weekly) og 30 min Wiping relay. Bare når SOC er under 70 % og KLAR.
11. **Natt og kveld** (lagt til 3. oktober 2026): NATT = Weekly timer 22:00–07:00. KVELD = Weekly timer 17:00–20:00. KVELDLADING = RS, Set = 5 min On-delay (KVELD AND SOC < 40 %), Reset = SOC > 80 % OR NATT. STARTONSKE = (SOCLAV forsinket OR TESTKJØR OR KVELDLADING) AND NOT NATT. Grensen 40 % er 15 % rest kl. 07 + nattbehov 20–07 for 6 personer (ca. 1,43 kWh DC, 17 %, 21 % med 25 % margin), rundet opp.

**Simuler minst:** nattstopp avbryter forvarming og gange kl. 22 og slipper kl. 07, og kveldslading starter under 40 % kl. 17–20. Lavt SOC gir start etter 5 min. Kaldt gir forvarming 20 min før start. Q1 uten I1 gir STARTFEIL etter 90 s. At KLAR faller bort gir stopp. At heartbeat uteblir gir DATAFEIL.

## Generator, autostart-kort og skur

Anbefalingen er et ferdig dieselaggregat med autostart-kort montert, og LOGO! sender bare «kjør». Hytta er off-grid, så det trengs ikke nettvakt eller omkobler, kun et auto start/remote start-kort.

**Aggregat (ikke valgt):**

- Diesel, enfase, ca. 5–6 kVA, elstart og lukket lyddempet kappe
- 1500 rpm vannkjølt foretrekkes fremfor 3000 rpm luftkjølt (roligere, lengre levetid, dyrere og tyngre)
- Kontroller (DSE, Datakom eller ComAp) ferdig montert og ledningsført, så sensorer og kort er matchet
- Sjekk i databladet: tørr remote start-inng. i bruk, potensialfrie signaler for «kjører» og «alarm» til I1 og I2, og at kortet ikke er en billig manuell kontroller. «AMF» betyr ofte nettvakt, og «ATS-ready» betyr ofte bare to klemmer for startsignal

**Kort hvis du bygger selv:** [DSE7310 MKII](https://www.deepseaelectronics.com/genset/manual-auto-start-control-modules/dse7310-mkii) har remote start-inngang, 8–35 V DC forsyning og RS485 Modbus RTU. Den har ikke Ethernet, så den trenger RS485→TCP-konverter. Billigere alternativ er [Datakom DKG-152](https://www.controllers4generators.com/news/new_features_datakom_dkg_152_remote_start_generator_control_panel/), men kommunikasjon og forsyningsspenning er ikke bekreftet.

**Kobling:** Q1 til remote start-inngangen. Kortets «kjører» til I1 og «alarm» til I2, via relé hvis spenningsnivået ikke passer. Egen sikring på kortets forsyning.

**Skur og kabling (30 m):** 3G6 generator→hytte, 3G2.5 hjelpestrøm 10 A med jordfeilbryter, 12-leder skjermet 0,75 mm² til styring. Overspenningsvern og jording gjøres av elektriker. Skuret trenger ventilasjon og lyddemping, brann- og CO-sikring. Autostart uten tilsyn må godkjennes av forsikringsselskapet.

## Nettverk og fjernovervåking

Alle enheter har statisk IP, og PLS-en skal ikke eksponeres mot internett.

| Enhet | IP | Status |
| --- | --- | --- |
| PLS (Arduino Opta RS485) | 192.168.0.2 | Valgt |
| Generator/AMF-kort | 192.168.0.3 | Lagt inn i Soft Comfort |
| SOC-enhet | 192.168.0.4 | Planlagt, ikke valgt |
| Raspberry Pi | 192.168.0.5 | Planlagt |

- **SOC:** leses fra shunt, BMS, vekselretter eller Cerbo over Modbus TCP inn i nettverks-analoginngang (NAI) i LOGO!. Er enheten bare RTU, brukes RS485→TCP-konverter.
- **Pi:** Python, Mosquitto og Node-RED eller Home Assistant som knutepunkt og heartbeat-kilde til datavakten.
- **Fjernadgang:** Starlink har CGNAT, så bruk utgående VPN (Tailscale eller WireGuard) fra Pi.
- **30 m til skuret:** utendørs Cat6 med overspenningsvern, eller fiberkonverter.

## Åpne punkter og uverifiserte antakelser

Dette er ikke bekreftet og må sjekkes mot manual eller i simulering før det bygges på.

- **Forsyningsspenning til Opta:** 10,2–27,6 V DC ifølge databladet (ikke lest direkte, må bekreftes). Et 24 V LiFePO4-batteri (8S) når 28,4–28,8 V under lading, så ved 24 V eller 48 V trengs en DC-DC-omformer. Avhenger av systemspenningen, som ikke er valgt.
- At Opta kan være Modbus TCP-klient (SOC fra 192.168.0.4) og server (heartbeat fra Pi) samtidig i PLC IDE. Test før bygging.
- Temperatur til forvarming: leses over Modbus. Skal den måles direkte på Opta, må føleren ha 0–10 V-utgang.
- Sommertid og NTP-synkronisering av klokka i Opta (modul 10 og 11).
- Punktene under om LOGO! 9 (Soft Comfort, NAI, AM4 og blokkretninger) gjelder ikke lenger etter byttet til Opta, men står igjen som historikk.
- LOGO! 9 som Modbus TCP-klient, og Modbus RTU-kobling: oppgitt av Sebastian, men ikke funnet i databladet (som nevner MQTT). Sjekk manualen.
- Hvilke innganger som kan brukes som analoge (på LOGO! 8 er det I1, I2, I7 og I8; ikke bekreftet for 9). Det påvirker I-planen, siden I7 er BMS OK.
- Om nettverks-analoginnganger (NAI) og UDF finnes i V9, og hvilke menynavn som gjelder.
- Om utvidelsesmoduler (først og fremst AM4) er kompatible med LOGO! 9.
- Demoversjonen av Soft Comfort V9: full programmering, men overføring til enheten er sperret (én kilde).
- Retning på Analog threshold trigger, og om Yearly timer har månedsmodus. Begge testes i simulering.
- Aggregat, autostart-kort (sensortyper, utganger, enfase-konfigurasjon, pris og norsk forhandler) og SOC-enhet er ikke valgt.
- Forsikringsselskapets godkjenning av ubemannet autostart, og elektrikers godkjenning av 230 V, jording og overspenningsvern.

## Neste steg og filer

1. Velg aggregat (se kravene over) og få manual og koblingsskjema for autostart-kortet.
2. Velg SOC-kilde (192.168.0.4) og finn Modbus-registerkartet. Deretter kobles SOC inn i PLS-en og terskelmodulen (2) bygges.
3. Bygg og simuler FBD modul for modul, i rekkefølgen KLAR, SOC-terskler, forvarming, Q1-lagring, stopp og hvile, alarmer, lastfrakobling, datavakt og testkjøring.
4. Legg inn I/O-planen i Arduino PLC IDE, aktiver lisensen og verifiser de åpne punktene over mot Opta-databladet.
5. Sett opp Pi, VPN og heartbeat.
6. Elektriker for skur, kabling, jording og overspenningsvern. Avklar forsikring.

**Filer:** `hytte_kapasitet.xlsx` (Forutsetninger, Last, Resultat, Sol Kragerø, Bruksmønster) er laget i Claude-sesjonen og ble sendt som vedlegg i chatten. Systemdiagram og I/O-tabell ble tegnet inline i chatten og finnes ikke som filer. De kan tegnes opp igjen på forespørsel.
