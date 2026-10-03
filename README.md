# Strøm på Børresholmen

Interaktiv presentasjon av forslaget til nytt off-grid strømanlegg på hytta: solceller, batteri og dieselgenerator med automatisk start. Kjernen er en simulering der styringslogikken er en direkte port av referansesimuleringen `kilder/logo_sim.py`.

Siden er statisk (ingen server, ingen sporing, ingen eksterne tjenester) og kan legges på GitHub Pages, Netlify eller Vercel.

## Kjøre lokalt

Krever Node.js 20 eller nyere.

```bash
npm install
npm run dev        # utviklingsserver, åpne adressen som vises
npm test           # kjører alle tester (11 scenarioer fra logo_sim.py + energimodell)
npm run build      # bygger ferdige filer til dist/
npm run preview    # viser dist/ lokalt
```

Skjermbilder i tre størrelser (mobil, nettbrett, desktop) lages med Playwright:

```bash
npm run build && npm run screenshots   # legger bilder i screenshots/
```

## Legge ut på GitHub Pages

1. Gå til **Settings → Pages** i repoet på GitHub og velg **Source: GitHub Actions**.
2. Arbeidsflyten i `.github/workflows/pages.yml` bygger siden og publiserer `dist/` hver gang det pushes til `main`.
3. Siden kommer på `https://<brukernavn>.github.io/<repo>/`. Stien settes automatisk fra repo-navnet (`BASE_PATH` ved bygging).

Skal siden ligge på et eget domene eller på roten, bygg med `BASE_PATH=/ npm run build`.

## Oppbygging

```
index.html            hele siden (tekst og struktur)
src/styles.css        utseende
src/main.ts           kobler sammen seksjonene
src/sim/logic.ts      styringslogikken, port av kilder/logo_sim.py (modul 1–10)
src/sim/data.ts       tall fra kilder/hytte_kapasitet.xlsx
src/sim/solar.ts      solproduksjon time for time (Kragerø, 58,9° N)
src/sim/load.ts       forbruksprofil fra lastlisten
src/sim/temperature.ts omtrentlig temperaturkurve
src/sim/cabin.ts      hele anlegget: energimodell + styring + hendelseslogg
src/sim/scenarios.ts  de ni ferdige scenarioene
src/ui/               måler, energiflyt-diagram, forløpsdiagram, telefon, årsdiagram, omvisning
tests/logic.test.ts   de 11 scenarioene fra logo_sim.py, portet 1:1
tests/energy.test.ts  energimodell og hele anlegget
kilder/               kildefilene (overlevering, regneark, referansesimulering)
```

Simuleringskjernen i `src/sim/` er ren TypeScript uten DOM, så den kan testes og brukes andre steder.

## Antakelser som er lagt inn i koden

- Solcelleeffekt: 2 kWp, samme som regnearket (`PV_KWP` i `src/sim/data.ts`). Endres tallet der, regnes alle tall på siden om.
- 5G-ruter med Wi-Fi på anslått 15 W i stedet for Starlink (70 W) og egen ruter (12 W), så standby er 48 W og dagsforbruket med folk ca. 3,2 kWh (`RUTER_5G_W` i `src/sim/data.ts`). Regnearket regner fortsatt med Starlink.
- Ikke-vitale laster ved lastfrakobling: vannpumpe, ladere, nettbrett, verktøy og vedkløyver.
- Hytta og anlegget er avslått fra november til mars (`ANLEGG_AV` i `src/sim/data.ts`): null forbruk, ingen generator.
- Månedlig testkjøring den 1. i måneden kl. 12:00.
- Batteristyringen slår av vekselretteren under 10 % og på igjen over 15 %.

Utstyr som ikke er valgt, er merket «Ikke valgt» på siden. Tallene i teksten låses av testen «dimensjonering» i `tests/energy.test.ts`.
