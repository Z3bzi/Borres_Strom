# Prompt: Interactive pitch website for the off-grid cabin power system

## Who I am and what this is for

I'm Sebastian, an electrical engineer (automation & robotics, HVL). I'm designing a new off-grid power system for our family's summer cabin on Børresholmen in Kragerø. My dad and my uncle must approve the project and fund it. I want to send them a link to a website they explore **on their own** (I won't be presenting), and the site must make them understand and trust the project well enough to say yes.

They are smart and practical and have basic technical knowledge, but they are not engineers. They will likely open the link on a phone or iPad first, maybe on a laptop later. They must be able to understand everything without me there.

**The core of the site is an interactive simulation of the cabin's power system** that lets them "live" a day or a week at the cabin and see the system handle sun, clouds, people, an empty cabin, winter and faults, automatically and safely.

## Hard requirements

- **Language:** All visible text on the site is in **Norwegian Bokmål**. Never Nynorsk. Use Norwegian number formats (decimal comma, space as thousands separator: `8,4 kWh`, `1 654 kWh`), 24-hour clock and Norwegian month names.
- **No costs, prices or money ask anywhere on the site.** No budget, BOM, NOK amounts or ROI calculations. I will handle money in conversation. Fuel use may be shown in litres, but not in kroner.
- **Self-explanatory:** No presenter. The site needs a clear guided path from top to bottom, plus a short guided tour or step-by-step intro to the simulation the first time it's opened.
- **Plain language:** Explain every technical term the first time it appears, or avoid it. Say «batterinivå», not «SOC». Use «styringen» or «automatikken», not «PLS/LOGO!». Explain «kWh» with an everyday comparison. Never show Modbus, register addresses, FBD or IP addresses. A small glossary («Ordliste») and hover/tap tooltips are welcome.
- **Honesty:** All numbers come from my calculations and are estimates. Mark assumptions as assumptions («beregnet», «anslått»). Don't overclaim reliability and don't promise anything the design doesn't do. Credibility with my family matters more than polish.
- **Static site, no backend:** It must be deployable as static files (GitHub Pages, Netlify or Vercel). No tracking, no analytics, no cookies, no external fonts or CDNs at runtime unless they are self-hosted.
- **Mobile first:** It must work well on a phone in portrait (from about 360 px wide) and on an iPad, and look good on desktop. Simulation controls must be easy to use with a finger.

## Read these files first (in this folder)

1. `Overlevering Hytte off-grid strøm og generator-autostart.md`: the full project handover (summary, assumptions, architecture, sizing, I/O plan, control logic modules 1–10, generator/shed/network plans, open points). This is the source of truth for **what the system does**.
2. `hytte_kapasitet.xlsx`: the sizing spreadsheet (sheets: Forutsetninger, Last, Resultat, Sol Kragerø, Bruksmønster). This is the source of truth for **numbers**: load list, monthly solar data for Kragerø, monthly energy balance, usage pattern and winter monitoring scenarios. Read it with Python (openpyxl), both formulas and cached values.
3. `logo_sim.py`: my Python reference simulation of the control logic (modules 1–10) against a generic generator controller, with 11 assert-based scenarios (`python logo_sim.py` must print OK). **The website's control logic must be a faithful port of this file.** If you find a mismatch between the handover and `logo_sim.py`, follow `logo_sim.py` and tell me about the mismatch.
4. `logo_modbus.py`: background only. It shows the battery/generator plant model (charging 2.5 kW when the generator runs, 115 W standby load, 8.4 kWh battery). Don't port the Modbus part.

Key facts (verify against the files, the files win):
- Fully off-grid summer cabin, 6 people. Used mostly at weekends, with people continuously from mid-June to mid-August. Winter use is very rare.
- New system: solar panels → charge controller → battery → inverter → cabin. A diesel generator in its own shed 30 m from the cabin (to keep noise away) starts **automatically** when the battery runs low. Automatic start is an absolute requirement.
- Starlink stays on 24/7 for remote monitoring. Total standby load is about 115 W (Starlink 70, router 12, controller/Pi 8, inverter idle 25).
- Daily use with people there is about 4.8 kWh (6.0 kWh with 25 % margin). The battery is about 8.4 kWh (1 day of autonomy, 80 % usable). The inverter is about 3.4 kW continuous and about 9.4 kW peak (motor start of the wood splitter). Planned solar is **3 kWp** (7 × 430 W). Note that the spreadsheet's «Installert solcelleeffekt» cell still says 2 kWp as an example value: use 3 kWp as the default in the site and say so in a comment in the code.
- Control thresholds: generator start request when battery < 30 % for 5 min, stop when > 90 % and it has run at least 30 min. Max run time 6 h. 10 min rest before restart. Preheating 20 min when below 5 °C. Non-essential loads are shed below 15 % and restored above 40 %. Start-failure alarm after 90 s, uncommanded-run alarm after 30 s, monitoring heartbeat timeout 60 s, monthly 30 min test run when battery < 70 %.
- Safety design: everything safety-related is fail-safe (a broken wire or dead controller means «stop», not «run»). A CO/smoke detector blocks starting, and so do the emergency stop and the auto/manual switch. A fuel-OK signal and a battery management OK signal are monitored. Alarms reach the phone via Starlink.
- Winter with Starlink on 24/7 gives a deficit of about 204 kWh, about 90 litres of diesel. Alternatives with near-zero deficit are Starlink Mini on DC, a 4G router, or Starlink on a timer. This is an honest trade-off worth showing.

## What exists today (the «before» picture)

The cabin has a **small solar setup** today. I haven't given you its specs yet. **Ask me before you write this section**: panel size, battery type and size, what works and what doesn't today (for example fridge, water pump, tools, charging, lights in the evening, cloudy weekends, Starlink), and the pain points. Until I answer, use clearly marked placeholders (`[TODO Sebastian: …]`) and keep the comparison qualitative. Don't invent numbers for today's system.

## Site structure (one long, guided page with a sticky mini-nav)

1. **Intro / hero:** One sentence on what this is, for example the idea «Strøm på hytta som bare fungerer, også når ingen er der». A calm illustration of the cabin on the skerry with sun, panels and the generator shed, and a clear «Prøv simuleringen» button.
2. **I dag og med nytt anlegg:** A side-by-side comparison against today's small solar setup (placeholders until I give specs). Focus on everyday effect: fridge always on, water pump, tools, a cloudy weekend in September, coming to a cabin where the battery is already full, and knowing from home that everything is fine.
3. **Slik fungerer det:** An animated energy-flow diagram (sun → battery → cabin, generator → battery, with the 30 m to the shed), shown with flowing lines whose thickness reflects power. Explain in 4–5 short steps.
4. **Simuleringen (the centrepiece):** Spec below.
5. **Trygghet og sikkerhet:** Fail-safe principles in plain words, with small «Hva skjer hvis …?» cards: the controller loses power, the CO alarm goes off, the generator doesn't start, the diesel runs low, nobody is at the cabin. Each card links to a simulation scenario that shows it happening.
6. **Fjernovervåking:** A phone mockup that shows status (battery level, sun, generator, alarms) and an example push alarm. Say that it runs over Starlink and that the controller's own web page is not exposed to the internet (plain wording).
7. **Hele året:** A month-by-month bar chart of production vs. consumption (from the Bruksmønster sheet). Show where the sun covers everything (April–September), where the generator takes over (winter), and the Starlink-in-winter trade-off with the alternatives. Show fuel use in litres only.
8. **Gjennomtenkt:** What's already done (sizing, control logic spec, simulation, I/O plan, network plan) and what's next (choosing generator and controller, electrician for the shed/cabling/grounding/surge protection, insurance approval of unattended autostart). This shows it's thought through. Keep it short and non-technical, with no costs.
9. **Ordliste + FAQ:** Short.
10. **Footer:** «Laget av Sebastian» plus one line about my background. Show my contact email only if I confirm I want it.

## Simulation spec

**Two layers, both deterministic and testable:**

### A. Energy model (time step 1 s internally, displayed compressed)
- **Solar:** Build an hourly solar profile for any day of the year from the monthly kWh/kWp in the «Sol Kragerø» sheet (Kragerø, 30° south, solkart.no). Spread each month's daily energy over the daylight hours with a smooth bell curve, and compute day length astronomically for about 58.9° N. Interpolate March and October (missing in the source) and label them as interpolated. Apply the 0.9 system loss from Forutsetninger. Weather modifies the curve: «Sol», «Delvis skyet» and «Overskyet» multipliers, with gentle seeded randomness for passing clouds so the same scenario always gives the same result.
- **Consumption:** Build an hourly load profile from the «Last» sheet that sums to the sheet's daily energy when people are there: standby 115 W always; fridge 60 W cycling; lights in the evening; chargers in the evening; water pump in short bursts morning and evening; occasional wood-splitter/tool use as short, high-power events. With nobody there, only standby runs. Respect the inverter efficiency (0.9) and battery limits (usable window, 0.3 C max charge).
- **Generator:** Charges at about 2.5 kW DC when running (0.3 C × 8.4 kWh), with diesel at about 2.5 kWh/l → show litres used.
- **Temperature:** A simple seasonal/day-night temperature curve for Kragerø (approximate, labelled as approximate). It drives preheating below 5 °C.

### B. Control logic: port `logo_sim.py` exactly
- Port the `On`/`Off`/`Trig` timers, the generic `Amf` model and `Sim.step()` to TypeScript with the same semantics: reset-dominant latch, same thresholds, same delays, same order of evaluation, and the one-scan delay of the generator controller.
- **Port all 11 scenarios from `demo()` into automated tests** (Vitest or similar), with the same tolerances. They must pass. This is my proof that the website shows what the real controller will do.
- The energy model feeds the battery level into the control logic. The control logic decides generator run/stop, load shedding, preheating and alarms.

### UI of the simulation
- **Big, readable state:** A battery-level gauge (with the 15/30/40/90 % marks visible but explained), sun production now, consumption now, generator state (off / preheating / starting / running / resting / fault), loads shed yes/no, and a clock with day and date.
- **Live diagram:** The same energy-flow diagram as section 3, animated from simulation values.
- **Timeline chart:** Battery level, solar and consumption over the simulated period, with generator runs shaded and events marked.
- **Event log in plain Norwegian:** One line per event, explaining *why*, for example «14:05 Batteriet har vært under 30 % i 5 minutter, så generatoren starter» or «16:40 Batteriet er over 90 % og generatoren har gått i over 30 minutter, så den stopper». Every log line is generated from the actual logic state, never from a script that can drift from the logic.
- **Controls:**
  - Play/pause and speed (for example 1 min, 10 min or 1 h of cabin time per second), plus a step-forward button.
  - Season/date picker, weather, and people at the cabin (yes/no or a number 0–6). A simple «hendelser» panel: «Kløyv ved nå», «Nødstopp», «CO-alarm», «Lite diesel», «Generatoren starter ikke», «Mister kontakt med overvåkingen».
- **Ready-made scenarios** (buttons with a one-line description and an end-of-scenario summary in plain words):
  1. «Vanlig sommerdag i juli», where the sun covers everything.
  2. «Overskyet helg i september», where the generator starts automatically.
  3. «Kald vinterdag»: preheating, then start.
  4. «Ingen på hytta i desember (Starlink på hele tiden)»: standby only, generator keeps the battery alive, litres used.
  5. «Generatoren starter ikke»: alarm on the phone after 90 s.
  6. «CO-alarm i skuret»: start is blocked and an alarm is sent.
  7. «Nødstopp»: everything stops safely.
  8. «Batteriet blir veldig lavt»: non-essential loads are disconnected and restored when the generator runs.
  9. «Månedlig testkjøring».
- **Phone mockup** beside or under the simulation (on mobile, a tab) that shows the alarms the family would receive in each scenario.
- **First-time guided tour** (3–5 steps, skippable): «Dette er batteriet», «Her ser du sola», «Trykk her for å spole tiden», «Velg et scenario».
- **Reduced motion:** Respect `prefers-reduced-motion`.

## Design direction

- Calm, trustworthy and Scandinavian, with a coastal feel (Kragerø skerries, sea, granite, summer light). It should feel like a well-made product page from a serious small company, not a SaaS template and not an engineering dashboard.
- Light theme primary. Dark mode is optional, but if you do it, do it properly.
- Use hand-built SVG illustrations and diagrams, consistent icons, generous whitespace and large type for key numbers. Use colour meaningfully and consistently: sun, battery, generator, consumption, alarm. Don't rely on colour alone (labels and icons too).
- Charts must be readable on a phone: few series, direct labels, no tiny legends.
- Use real photos of the cabin only if I provide them. Leave an obvious slot for one or two (`[TODO Sebastian: bilde]`).

## Tech constraints and quality bar

- **Stack:** Keep it simple and justify anything heavier. My suggestion is Vite + TypeScript, hand-written SVG/Canvas for diagrams and charts, and no UI framework unless it clearly pays off. One small charting library is OK if it's light and self-hosted.
- **Structure:** Keep the simulation core (energy model + control logic) as pure, framework-free TypeScript modules with no DOM access, so it's testable and reusable.
- **Tests:** The port of the 11 `logo_sim.py` scenarios, plus a few energy-model sanity tests: a July day with people has a solar surplus, a December day has a deficit, and a full day with people sums to about 4.8 kWh of consumption.
- **Accessibility:** Semantic HTML, keyboard-usable controls, proper contrast and labelled controls.
- **Performance:** Fast first load on mobile data at the cabin, with no large assets.
- **Verification before you call it done:** Run the tests and the build. Open the site with Playwright at phone (390×844), iPad (820×1180) and desktop (1440×900) sizes. Take screenshots, look at them, and fix layout and readability problems. Read through all the Norwegian text once more for Bokmål correctness, plain language and typos.
- **Deployment:** Add a short README (in Norwegian) with how to run locally and how to deploy to GitHub Pages.

## How to work with me

1. Start by reading the four files and give me a short plan: site outline, simulation architecture, and any mismatches or open questions you found in my files.
2. Ask me for the «today's system» specs and any photos before writing section 2. Ask any other questions in one batch, then continue without waiting on things you can placeholder.
3. Build in this order: (a) simulation core plus the ported tests passing, (b) the simulation UI, (c) the surrounding story sections, (d) polish and responsive checks.
4. Leave `[TODO Sebastian: …]` markers wherever you need my input, and list them all at the end.
5. Don't add features I didn't ask for. If you think something would strengthen the pitch, suggest it in one line and let me decide.
