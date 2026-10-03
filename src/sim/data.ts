/**
 * Tall fra regnearket `kilder/hytte_kapasitet.xlsx` (arkene Forutsetninger, Last,
 * Sol Kragerø og Bruksmønster). Alt her er antakelser og beregninger, ikke målinger.
 */

/** Forutsetninger (ark «Forutsetninger») */
export const FORUTSETNINGER = {
  autonomidager: 1,
  /** Brukbar andel av batteriet (DoD) */
  dod: 0.8,
  /** Vekselretterens virkningsgrad */
  vekselretterVirkningsgrad: 0.9,
  /** Sikkerhetsmargin på forbruk og effekt */
  headroom: 0.25,
  /** Systemtap solceller (MPPT, kabling, ladetap) */
  systemtap: 0.9,
  /** Maks ladestrøm batteri (C-rate) */
  cRate: 0.3,
  /** Lader/generator virkningsgrad (AC til DC) */
  laderVirkningsgrad: 0.9,
  /** Strøm per liter diesel */
  kWhPerLiter: 2.5,
} as const;

/**
 * Solcelleeffekt som hele nettsiden regner med (simulering, årsoversikt og vintertabell).
 * Regnearket bruker 2 kWp i cellen «Installert solcelleeffekt», og Sebastian valgte
 * 3. oktober 2026 at siden skal bruke de samme 2 kWp som arket, så alle tall stemmer
 * med regnearket (bl.a. vinterunderskudd ca. 204 kWh / ca. 90 l diesel).
 * Overleveringen anbefaler 3 kWp (7 × 430 W). Endres tallet her, regnes alt om.
 */
export const PV_KWP = 2;

/** Batteri, nominell kapasitet (regnearket gir 8,38 kWh, avrundet til 8,4) */
export const BATTERI_KWH = 8.4;

/** Standby-last når ingen er der (W): Starlink 70 + ruter 12 + styring/Pi 8 + vekselretter tomgang 25 */
export const STANDBY_W = 115;

/** Generatorlading inn på batteriet (DC), ca. 0,3 C × 8,4 kWh */
export const GENERATOR_LADING_W = 2500;

/** Maks ladeeffekt batteri (DC), 0,3 C */
export const MAKS_LADING_W = FORUTSETNINGER.cRate * BATTERI_KWH * 1000;

export interface Last {
  navn: string;
  antall: number;
  effektW: number;
  timerPerDogn: number;
  startfaktor: number;
  /** Fast = kontinuerlig/daglig, Verktøy = sjelden bruk */
  type: 'Fast' | 'Verktøy';
  /** Kan kobles fra når batteriet er svært lavt (antakelse, se spørsmål til Sebastian) */
  ikkeVital: boolean;
}

/** Lastliste (ark «Last»). Sum 4 825 Wh/døgn med folk på hytta. */
export const LASTER: Last[] = [
  { navn: 'Starlink', antall: 1, effektW: 70, timerPerDogn: 24, startfaktor: 1, type: 'Fast', ikkeVital: false },
  { navn: 'Ruter / Wi-Fi', antall: 1, effektW: 12, timerPerDogn: 24, startfaktor: 1, type: 'Fast', ikkeVital: false },
  { navn: 'Styring og liten server', antall: 1, effektW: 8, timerPerDogn: 24, startfaktor: 1, type: 'Fast', ikkeVital: false },
  { navn: 'Vekselretter, tomgang', antall: 1, effektW: 25, timerPerDogn: 24, startfaktor: 1, type: 'Fast', ikkeVital: false },
  { navn: 'Mobilladere', antall: 6, effektW: 10, timerPerDogn: 1.5, startfaktor: 1, type: 'Fast', ikkeVital: true },
  { navn: 'Nettbrettladere', antall: 3, effektW: 15, timerPerDogn: 2, startfaktor: 1, type: 'Fast', ikkeVital: true },
  { navn: 'LED-belysning', antall: 12, effektW: 8, timerPerDogn: 5, startfaktor: 1, type: 'Fast', ikkeVital: false },
  { navn: 'Vedkløyver', antall: 1, effektW: 2200, timerPerDogn: 0.25, startfaktor: 3, type: 'Verktøy', ikkeVital: true },
  { navn: 'Verktøy (sag, drill)', antall: 1, effektW: 1200, timerPerDogn: 0.25, startfaktor: 2, type: 'Verktøy', ikkeVital: true },
  { navn: 'Kjøleskap', antall: 1, effektW: 60, timerPerDogn: 8, startfaktor: 3, type: 'Fast', ikkeVital: false },
  { navn: 'Vannpumpe', antall: 1, effektW: 150, timerPerDogn: 0.5, startfaktor: 3, type: 'Fast', ikkeVital: true },
];

/** Dagsforbruk med folk (Wh), sum av lastlisten */
export const DAGSFORBRUK_WH = LASTER.reduce((s, l) => s + l.antall * l.effektW * l.timerPerDogn, 0);

export const MANEDER = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
] as const;

export const MANEDER_KORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'] as const;

export const DAGER_I_MANED = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export interface SolManed {
  /** 0 = januar */
  maned: number;
  dager: number;
  /** kWh per 10 kWp per måned fra solkart.no (Kragerø, sør, 30° helning). null = mangler i kilden. */
  kWhPer10kWp: number | null;
  /** Mars og oktober er ikke oppgitt i kilden og er interpolert (snitt av nabomånedene). */
  interpolert: boolean;
}

/** Ark «Sol Kragerø». Kilde: solkart.no/kommune/kragero, 10 kWp sør, 30 grader, inkl. snø- og skittap. */
export const SOL_KRAGERO: SolManed[] = [
  { maned: 0, dager: 31, kWhPer10kWp: 108, interpolert: false },
  { maned: 1, dager: 28, kWhPer10kWp: 208, interpolert: false },
  { maned: 2, dager: 31, kWhPer10kWp: null, interpolert: true },
  { maned: 3, dager: 30, kWhPer10kWp: 1309, interpolert: false },
  { maned: 4, dager: 31, kWhPer10kWp: 1672, interpolert: false },
  { maned: 5, dager: 30, kWhPer10kWp: 1597, interpolert: false },
  { maned: 6, dager: 31, kWhPer10kWp: 1584, interpolert: false },
  { maned: 7, dager: 31, kWhPer10kWp: 1309, interpolert: false },
  { maned: 8, dager: 30, kWhPer10kWp: 1014, interpolert: false },
  { maned: 9, dager: 31, kWhPer10kWp: null, interpolert: true },
  { maned: 10, dager: 30, kWhPer10kWp: 267, interpolert: false },
  { maned: 11, dager: 31, kWhPer10kWp: 126, interpolert: false },
];

/** kWh per kWp per døgn for en måned (0 = januar). Mars og oktober interpoleres fra nabomånedene. */
export function kWhPerKwpPerDogn(maned: number): number {
  const m = SOL_KRAGERO[maned]!;
  if (m.kWhPer10kWp !== null) return m.kWhPer10kWp / 10 / m.dager;
  const prev = SOL_KRAGERO[(maned + 11) % 12]!;
  const next = SOL_KRAGERO[(maned + 1) % 12]!;
  const a = prev.kWhPer10kWp! / 10 / prev.dager;
  const b = next.kWhPer10kWp! / 10 / next.dager;
  return (a + b) / 2;
}

/** Produksjon per døgn (kWh DC etter systemtap) for en måned, med gitt solcelleeffekt */
export function produksjonPerDogn(maned: number, kwp = PV_KWP): number {
  return kWhPerKwpPerDogn(maned) * kwp * FORUTSETNINGER.systemtap;
}

/** Forbruk fra DC-siden per døgn med folk (kWh), inkl. 25 % margin, delt på vekselretterens virkningsgrad (Resultat!B15) */
export const FORBRUK_DC_PER_DOGN =
  (DAGSFORBRUK_WH / 1000) * (1 + FORUTSETNINGER.headroom) / FORUTSETNINGER.vekselretterVirkningsgrad;

/**
 * Ark «Bruksmønster»: dager med folk per måned. Mars og oktober mangler i arket;
 * her antas hytta lukket (0 dager). [TODO Sebastian: bekreft bruk i mars og oktober]
 */
export const DAGER_MED_FOLK = [0, 0, 0, 4, 8, 23, 31, 25, 8, 0, 0, 0] as const;

export interface ManedsBalanse {
  maned: number;
  dager: number;
  dagerMedFolk: number;
  forbrukKWh: number;
  produksjonKWh: number;
  balanseKWh: number;
  interpolert: boolean;
}

/** Månedlig energibalanse som i arket Bruksmønster, regnet med valgt solcelleeffekt */
export function manedsBalanse(kwp = PV_KWP): ManedsBalanse[] {
  return SOL_KRAGERO.map((m) => {
    const folk = DAGER_MED_FOLK[m.maned]!;
    const forbruk = folk * FORBRUK_DC_PER_DOGN + (m.dager - folk) * STANDBY_W * 24 / 1000;
    const prod = produksjonPerDogn(m.maned, kwp) * m.dager;
    return {
      maned: m.maned, dager: m.dager, dagerMedFolk: folk,
      forbrukKWh: forbruk, produksjonKWh: prod, balanseKWh: prod - forbruk, interpolert: m.interpolert,
    };
  });
}

export interface VinterLosning {
  navn: string;
  effektW: number;
  forbrukKWh: number;
  produksjonKWh: number;
  underskuddKWh: number;
  liter: number;
}

/** Overvåkingsløsninger om vinteren (nov–feb), som i arket Bruksmønster rad 30–33 */
export function vinterLosninger(kwp = PV_KWP): VinterLosning[] {
  const vinter = [0, 1, 10, 11];
  const dager = vinter.reduce((s, m) => s + SOL_KRAGERO[m]!.dager, 0);
  const prod = vinter.reduce((s, m) => s + produksjonPerDogn(m, kwp) * SOL_KRAGERO[m]!.dager, 0);
  const alt: [string, number][] = [
    ['Starlink på hele tiden (som planlagt)', STANDBY_W],
    ['Starlink Mini på likestrøm, hele tiden', 38],
    ['4G-ruter, hele tiden', 13],
    ['Starlink 1 time per døgn på timer', (70 + 12 + 25) / 24 + 8],
  ];
  return alt.map(([navn, effektW]) => {
    const forbruk = effektW * 24 / 1000 * dager;
    const underskudd = Math.max(0, forbruk - prod);
    return {
      navn, effektW, forbrukKWh: forbruk, produksjonKWh: prod, underskuddKWh: underskudd,
      liter: underskudd / FORUTSETNINGER.laderVirkningsgrad / FORUTSETNINGER.kWhPerLiter,
    };
  });
}
