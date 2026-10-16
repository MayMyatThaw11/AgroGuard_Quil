export interface RegionFact {
  town: string;
  country: string;
  iso3: string;
  lat: number;
  lon: number;
  variety: string | null;
  spi3: number | null;
  spiClass: string | null;
  rainPercentile: number | null;
  rainPeriod: string | null;
  rain12: { period: string; mm: number }[];
  tmaxC: number | null;
  tminC: number | null;
  rain30Mm: number | null;
  et0MmDay: number | null;
  elevationM: number | null;
  evaporation: { year: number | null; actualMm: number | null; potentialMm: number | null; ratio: number | null; rootZoneMoisture: number | null } | null;
  riceYieldTHa: number | null;
  riceYieldYear: number | null;
  calendar: { season: string | null; sowing: string | null; harvest: string | null }[];
  sources: Record<string, string | null>;
  builtAt: string | null;
}

export const REGION_FACTS: readonly RegionFact[] = [
 {
  "town": "Alor Setar, Kedah",
  "country": "Malaysia",
  "iso3": "MYS",
  "lat": 6.121,
  "lon": 100.367,
  "variety": "MR 297",
  "spi3": -1.6,
  "spiClass": "severely dry",
  "rainPercentile": 0.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 247.46
   },
   {
    "period": "2025-10",
    "mm": 321.14
   },
   {
    "period": "2025-11",
    "mm": 556.81
   },
   {
    "period": "2025-12",
    "mm": 31.27
   },
   {
    "period": "2026-01",
    "mm": 6.1
   },
   {
    "period": "2026-02",
    "mm": 46.57
   },
   {
    "period": "2026-03",
    "mm": 21.27
   },
   {
    "period": "2026-04",
    "mm": 243.18
   },
   {
    "period": "2026-05",
    "mm": 324.05
   },
   {
    "period": "2026-06",
    "mm": 240.39
   },
   {
    "period": "2026-07",
    "mm": 125.56
   },
   {
    "period": "2026-08",
    "mm": 169.84
   }
  ],
  "tmaxC": 30.09,
  "tminC": 25.21,
  "rain30Mm": 248.39,
  "et0MmDay": 3.4,
  "elevationM": 167.38,
  "evaporation": {
   "year": 2025,
   "actualMm": 136.62,
   "potentialMm": 1507.32,
   "ratio": 0.091,
   "rootZoneMoisture": null
  },
  "riceYieldTHa": 3.54,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:bb0ad6d0358264eb0bd216faa8531cbf2bdb4f21b2a1260f2437f103ccf3ac38",
   "nasaPower": "sha256:80919d2a172b0b815641f5594a5e4f4529459907224c763fcfb8ea128c67f93f",
   "gleam": "sha256:80e1d2810b06dd98d32df9e8bc9a6ab04bef5d80124c8a19d8843b3652a92773",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:50:20+00:00"
 },
 {
  "town": "Battambang",
  "country": "Cambodia",
  "iso3": "KHM",
  "lat": 13.095,
  "lon": 103.202,
  "variety": "Phka Rumduol",
  "spi3": -0.51,
  "spiClass": "near normal",
  "rainPercentile": 23.3,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 289.66
   },
   {
    "period": "2025-10",
    "mm": 143.98
   },
   {
    "period": "2025-11",
    "mm": 106.69
   },
   {
    "period": "2025-12",
    "mm": 11.95
   },
   {
    "period": "2026-01",
    "mm": 2.94
   },
   {
    "period": "2026-02",
    "mm": 11.33
   },
   {
    "period": "2026-03",
    "mm": 37.53
   },
   {
    "period": "2026-04",
    "mm": 47.12
   },
   {
    "period": "2026-05",
    "mm": 129.13
   },
   {
    "period": "2026-06",
    "mm": 80.29
   },
   {
    "period": "2026-07",
    "mm": 252.15
   },
   {
    "period": "2026-08",
    "mm": 144.61
   }
  ],
  "tmaxC": 30.28,
  "tminC": 23.87,
  "rain30Mm": 323.22,
  "et0MmDay": 3.51,
  "elevationM": 44.52,
  "evaporation": {
   "year": 2025,
   "actualMm": 1023.57,
   "potentialMm": 1547.28,
   "ratio": 0.662,
   "rootZoneMoisture": 0.35
  },
  "riceYieldTHa": 3.64,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:7d9b7f0e478bc83905e0483146cbad06e228cfb5ef013a72c6f682c98ee1b773",
   "gleam": "sha256:53c06843f16425793b61e207b104023c78488e91ebc499906484857f1fbf06fb",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:43:55+00:00"
 },
 {
  "town": "Cabanatuan, Nueva Ecija",
  "country": "Philippines",
  "iso3": "PHL",
  "lat": 15.486,
  "lon": 120.967,
  "variety": "NSIC Rc 222",
  "spi3": 0.74,
  "spiClass": "near normal",
  "rainPercentile": 100.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 444.74
   },
   {
    "period": "2025-10",
    "mm": 244.61
   },
   {
    "period": "2025-11",
    "mm": 260.78
   },
   {
    "period": "2025-12",
    "mm": 91.15
   },
   {
    "period": "2026-01",
    "mm": 22.85
   },
   {
    "period": "2026-02",
    "mm": 15.59
   },
   {
    "period": "2026-03",
    "mm": 11.81
   },
   {
    "period": "2026-04",
    "mm": 12.38
   },
   {
    "period": "2026-05",
    "mm": 118.95
   },
   {
    "period": "2026-06",
    "mm": 151.18
   },
   {
    "period": "2026-07",
    "mm": 214.39
   },
   {
    "period": "2026-08",
    "mm": 614.79
   }
  ],
  "tmaxC": 29.19,
  "tminC": 24.34,
  "rain30Mm": 527.24,
  "et0MmDay": 4.17,
  "elevationM": 282.04,
  "evaporation": {
   "year": 2025,
   "actualMm": 1268.87,
   "potentialMm": 1332.59,
   "ratio": 0.952,
   "rootZoneMoisture": 0.391
  },
  "riceYieldTHa": 4.11,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:8295b949c272d0525840dc25f67f843c36a1b7f40e549bb479e267e67f4f09bd",
   "gleam": "sha256:fc2cbe8f9854f4dcc9f46ceb913562d6a2a7df33bc70998ecad83931fa3c3d7c",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:31:55+00:00"
 },
 {
  "town": "Can Tho",
  "country": "Vietnam",
  "iso3": "VNM",
  "lat": 10.045,
  "lon": 105.747,
  "variety": "ST25",
  "spi3": -4.24,
  "spiClass": "extremely dry",
  "rainPercentile": 10.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 299.78
   },
   {
    "period": "2025-10",
    "mm": 334.91
   },
   {
    "period": "2025-11",
    "mm": 288.27
   },
   {
    "period": "2025-12",
    "mm": 39.44
   },
   {
    "period": "2026-01",
    "mm": 3.74
   },
   {
    "period": "2026-02",
    "mm": 3.35
   },
   {
    "period": "2026-03",
    "mm": 4.59
   },
   {
    "period": "2026-04",
    "mm": 6.46
   },
   {
    "period": "2026-05",
    "mm": 108.27
   },
   {
    "period": "2026-06",
    "mm": 108.76
   },
   {
    "period": "2026-07",
    "mm": 121.83
   },
   {
    "period": "2026-08",
    "mm": 133.24
   }
  ],
  "tmaxC": 30.58,
  "tminC": 24.85,
  "rain30Mm": 446.97,
  "et0MmDay": 3.73,
  "elevationM": 1.91,
  "evaporation": {
   "year": 2025,
   "actualMm": 1375.14,
   "potentialMm": 1570.14,
   "ratio": 0.876,
   "rootZoneMoisture": 0.408
  },
  "riceYieldTHa": 6.15,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:a24e6c16ad0fe19165d15e5dc4a508cef7c6ce233054994a6ad28184e66e51bb",
   "gleam": "sha256:07ef56cf7a4cdcbdf65b1962ad64625c29c0538258c743d4e4357ca7d5dcf035",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:41:30+00:00"
 },
 {
  "town": "Cao Lanh, Dong Thap",
  "country": "Vietnam",
  "iso3": "VNM",
  "lat": 10.46,
  "lon": 105.633,
  "variety": "OM 18",
  "spi3": -3.04,
  "spiClass": "extremely dry",
  "rainPercentile": 0.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 229.58
   },
   {
    "period": "2025-10",
    "mm": 373.22
   },
   {
    "period": "2025-11",
    "mm": 207.11
   },
   {
    "period": "2025-12",
    "mm": 29.3
   },
   {
    "period": "2026-01",
    "mm": 4.75
   },
   {
    "period": "2026-02",
    "mm": 8.25
   },
   {
    "period": "2026-03",
    "mm": 8.74
   },
   {
    "period": "2026-04",
    "mm": 6.75
   },
   {
    "period": "2026-05",
    "mm": 117.16
   },
   {
    "period": "2026-06",
    "mm": 101.93
   },
   {
    "period": "2026-07",
    "mm": 114.22
   },
   {
    "period": "2026-08",
    "mm": 91.02
   }
  ],
  "tmaxC": 30.66,
  "tminC": 24.83,
  "rain30Mm": 443.99,
  "et0MmDay": 3.71,
  "elevationM": 2.46,
  "evaporation": {
   "year": 2025,
   "actualMm": 454.0,
   "potentialMm": 1572.92,
   "ratio": 0.289,
   "rootZoneMoisture": null
  },
  "riceYieldTHa": 6.15,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:1578df8cd366f662c930f8ba2bae5e3ee41c5c415f438c20be45e63e6e31613b",
   "gleam": "sha256:48680d1316c900932981d0be0e8e82ffeeb420e0599fdd16521c62f4aaf68182",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:41:58+00:00"
 },
 {
  "town": "Hinthada, Ayeyarwady",
  "country": "Myanmar",
  "iso3": "MMR",
  "lat": 17.648,
  "lon": 95.457,
  "variety": "Manawthukha rice",
  "spi3": 1.94,
  "spiClass": "very wet",
  "rainPercentile": 33.3,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 340.26
   },
   {
    "period": "2025-10",
    "mm": 243.06
   },
   {
    "period": "2025-11",
    "mm": 147.44
   },
   {
    "period": "2025-12",
    "mm": 1.29
   },
   {
    "period": "2026-01",
    "mm": 2.93
   },
   {
    "period": "2026-02",
    "mm": 0.88
   },
   {
    "period": "2026-03",
    "mm": 18.7
   },
   {
    "period": "2026-04",
    "mm": 6.41
   },
   {
    "period": "2026-05",
    "mm": 237.97
   },
   {
    "period": "2026-06",
    "mm": 481.71
   },
   {
    "period": "2026-07",
    "mm": 1012.02
   },
   {
    "period": "2026-08",
    "mm": 461.33
   }
  ],
  "tmaxC": 30.76,
  "tminC": 24.96,
  "rain30Mm": 463.32,
  "et0MmDay": 4.25,
  "elevationM": 13.67,
  "evaporation": {
   "year": 2025,
   "actualMm": 1301.9,
   "potentialMm": 1562.82,
   "ratio": 0.833,
   "rootZoneMoisture": 0.34
  },
  "riceYieldTHa": 3.94,
  "riceYieldYear": 2024,
  "calendar": [
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   },
   {
    "season": "Summer Rice",
    "sowing": "1 Nov to 31 Dec",
    "harvest": "1 Mar to 30 Apr"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Aug",
    "harvest": "1 Oct to 30 Nov"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   }
  ],
  "sources": {
   "chirps": "sha256:bb0ad6d0358264eb0bd216faa8531cbf2bdb4f21b2a1260f2437f103ccf3ac38",
   "nasaPower": "sha256:60f1d5e84a149beafb38ccc4795d60d7912d11bb1d285d824a742a848219463d",
   "gleam": "sha256:312b27dfa0f10a96c38fd217e5a627f421ec0ca7efeb61c718f0016bcb884075",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": "sha256:5566904e051b0df338a9a54dd7d241a83b270a532537facb1acaac86395ae842"
  },
  "builtAt": "2026-10-13T14:30:02+00:00"
 },
 {
  "town": "Ilagan, Isabela",
  "country": "Philippines",
  "iso3": "PHL",
  "lat": 17.148,
  "lon": 121.889,
  "variety": "NSIC Rc 160",
  "spi3": 0.08,
  "spiClass": "near normal",
  "rainPercentile": 66.7,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 309.95
   },
   {
    "period": "2025-10",
    "mm": 255.37
   },
   {
    "period": "2025-11",
    "mm": 769.89
   },
   {
    "period": "2025-12",
    "mm": 337.4
   },
   {
    "period": "2026-01",
    "mm": 47.77
   },
   {
    "period": "2026-02",
    "mm": 24.89
   },
   {
    "period": "2026-03",
    "mm": 21.27
   },
   {
    "period": "2026-04",
    "mm": 23.54
   },
   {
    "period": "2026-05",
    "mm": 33.73
   },
   {
    "period": "2026-06",
    "mm": 193.87
   },
   {
    "period": "2026-07",
    "mm": 130.61
   },
   {
    "period": "2026-08",
    "mm": 222.89
   }
  ],
  "tmaxC": 30.67,
  "tminC": 23.81,
  "rain30Mm": 251.74,
  "et0MmDay": 3.95,
  "elevationM": 133.8,
  "evaporation": {
   "year": 2025,
   "actualMm": 1428.5,
   "potentialMm": 1306.56,
   "ratio": 1.093,
   "rootZoneMoisture": 0.395
  },
  "riceYieldTHa": 4.11,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:711f326d44088d1f630700adc9b7f30224965aa0938a08420b7eec367faa41c9",
   "gleam": "sha256:3539dc3afc958096d8e13542da9f72cac8bdcac768629295f8400e6c8a365211",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:35:20+00:00"
 },
 {
  "town": "Indramayu, West Java",
  "country": "Indonesia",
  "iso3": "IDN",
  "lat": -6.327,
  "lon": 108.32,
  "variety": "Inpari 32",
  "spi3": -1.42,
  "spiClass": "moderately dry",
  "rainPercentile": 20.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 84.43
   },
   {
    "period": "2025-10",
    "mm": 110.92
   },
   {
    "period": "2025-11",
    "mm": 124.47
   },
   {
    "period": "2025-12",
    "mm": 232.54
   },
   {
    "period": "2026-01",
    "mm": 440.16
   },
   {
    "period": "2026-02",
    "mm": 282.25
   },
   {
    "period": "2026-03",
    "mm": 183.66
   },
   {
    "period": "2026-04",
    "mm": 143.34
   },
   {
    "period": "2026-05",
    "mm": 159.36
   },
   {
    "period": "2026-06",
    "mm": 39.0
   },
   {
    "period": "2026-07",
    "mm": 11.26
   },
   {
    "period": "2026-08",
    "mm": 6.05
   }
  ],
  "tmaxC": 31.91,
  "tminC": 23.18,
  "rain30Mm": 35.97,
  "et0MmDay": 5.18,
  "elevationM": 113.19,
  "evaporation": {
   "year": 2025,
   "actualMm": 0.0,
   "potentialMm": 1588.42,
   "ratio": 0.0,
   "rootZoneMoisture": null
  },
  "riceYieldTHa": 5.29,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:808ad7690b4b3acafe07bf95f99e19be9192dfaef3a28ff989a2501b02f160a7",
   "nasaPower": "sha256:d83295b32529c7fb1a4a7a82f98529860a18272b287bbc1de323e409c8269b6c",
   "gleam": "sha256:b6cb101c28ae2891f8d5c35d85c3b0c16665f2d4514ce5b21658be40d99a5e59",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:48:14+00:00"
 },
 {
  "town": "Karawang, West Java",
  "country": "Indonesia",
  "iso3": "IDN",
  "lat": -6.322,
  "lon": 107.338,
  "variety": "Ciherang",
  "spi3": -1.58,
  "spiClass": "severely dry",
  "rainPercentile": 3.3,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 177.63
   },
   {
    "period": "2025-10",
    "mm": 225.76
   },
   {
    "period": "2025-11",
    "mm": 275.64
   },
   {
    "period": "2025-12",
    "mm": 295.16
   },
   {
    "period": "2026-01",
    "mm": 407.99
   },
   {
    "period": "2026-02",
    "mm": 275.56
   },
   {
    "period": "2026-03",
    "mm": 230.96
   },
   {
    "period": "2026-04",
    "mm": 178.52
   },
   {
    "period": "2026-05",
    "mm": 154.81
   },
   {
    "period": "2026-06",
    "mm": 38.78
   },
   {
    "period": "2026-07",
    "mm": 13.66
   },
   {
    "period": "2026-08",
    "mm": 15.5
   }
  ],
  "tmaxC": 30.53,
  "tminC": 22.16,
  "rain30Mm": 75.78,
  "et0MmDay": 4.42,
  "elevationM": 274.68,
  "evaporation": {
   "year": 2025,
   "actualMm": 1257.47,
   "potentialMm": 1365.13,
   "ratio": 0.921,
   "rootZoneMoisture": 0.43
  },
  "riceYieldTHa": 5.29,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:808ad7690b4b3acafe07bf95f99e19be9192dfaef3a28ff989a2501b02f160a7",
   "nasaPower": "sha256:c6b2407c591a1d299ce6ed5b7303a4950820aaa62bf117726f38a8e06a1f5163",
   "gleam": "sha256:dd3b27c818c03afbb2f3eaf6fa3ad8d6c3f5e8bc0064ffa24c71fbb1b4592223",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:47:35+00:00"
 },
 {
  "town": "Long Xuyen, An Giang",
  "country": "Vietnam",
  "iso3": "VNM",
  "lat": 10.386,
  "lon": 105.435,
  "variety": "OM 5451",
  "spi3": -2.99,
  "spiClass": "extremely dry",
  "rainPercentile": 0.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 247.25
   },
   {
    "period": "2025-10",
    "mm": 341.12
   },
   {
    "period": "2025-11",
    "mm": 197.06
   },
   {
    "period": "2025-12",
    "mm": 34.79
   },
   {
    "period": "2026-01",
    "mm": 4.59
   },
   {
    "period": "2026-02",
    "mm": 9.35
   },
   {
    "period": "2026-03",
    "mm": 9.11
   },
   {
    "period": "2026-04",
    "mm": 8.74
   },
   {
    "period": "2026-05",
    "mm": 116.75
   },
   {
    "period": "2026-06",
    "mm": 116.33
   },
   {
    "period": "2026-07",
    "mm": 130.45
   },
   {
    "period": "2026-08",
    "mm": 72.68
   }
  ],
  "tmaxC": 30.66,
  "tminC": 24.83,
  "rain30Mm": 443.99,
  "et0MmDay": 3.71,
  "elevationM": 2.46,
  "evaporation": {
   "year": 2025,
   "actualMm": 338.6,
   "potentialMm": 1544.24,
   "ratio": 0.219,
   "rootZoneMoisture": null
  },
  "riceYieldTHa": 6.15,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:8d414d638a3addf05806ce9f0e92548b3d70567f3a2eac5b6130e9934ba4048b",
   "gleam": "sha256:1861c5616a64d3b545b741d384a11f3fea9a102ce2736490bcd462f96a78182b",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:41:13+00:00"
 },
 {
  "town": "Maliana, Bobonaro",
  "country": "Timor-Leste",
  "iso3": "TLS",
  "lat": -8.9917,
  "lon": 125.2197,
  "variety": "Nakroma",
  "spi3": -0.84,
  "spiClass": "near normal",
  "rainPercentile": 86.7,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 52.06
   },
   {
    "period": "2025-10",
    "mm": 100.83
   },
   {
    "period": "2025-11",
    "mm": 310.73
   },
   {
    "period": "2025-12",
    "mm": 435.03
   },
   {
    "period": "2026-01",
    "mm": 424.27
   },
   {
    "period": "2026-02",
    "mm": 454.6
   },
   {
    "period": "2026-03",
    "mm": 328.24
   },
   {
    "period": "2026-04",
    "mm": 295.04
   },
   {
    "period": "2026-05",
    "mm": 90.05
   },
   {
    "period": "2026-06",
    "mm": 35.48
   },
   {
    "period": "2026-07",
    "mm": 13.88
   },
   {
    "period": "2026-08",
    "mm": 11.57
   }
  ],
  "tmaxC": 31.23,
  "tminC": 21.26,
  "rain30Mm": 1.43,
  "et0MmDay": 5.26,
  "elevationM": 282.72,
  "evaporation": {
   "year": 2025,
   "actualMm": 937.32,
   "potentialMm": 1642.16,
   "ratio": 0.571,
   "rootZoneMoisture": 0.396
  },
  "riceYieldTHa": 2.17,
  "riceYieldYear": 2024,
  "calendar": [
   {
    "season": "First Season",
    "sowing": "25 Jan to 15 Feb",
    "harvest": "25 Apr to 15 May"
   },
   {
    "season": "Second Season",
    "sowing": "20 Jun to 20 Jul",
    "harvest": "20 Sep to 20 Oct"
   },
   {
    "season": "First Season",
    "sowing": "30 Jan to 20 Feb",
    "harvest": "30 Apr to 20 May"
   },
   {
    "season": "Second Season",
    "sowing": "20 Jun to 20 Jul",
    "harvest": "20 Sep to 20 Oct"
   }
  ],
  "sources": {
   "chirps": "sha256:808ad7690b4b3acafe07bf95f99e19be9192dfaef3a28ff989a2501b02f160a7",
   "nasaPower": "sha256:35a5e520aba3b474c24861b99b82256f0aebd17901032d0b697faf38cded1c35",
   "gleam": "sha256:ac55be9a6fb8610c75a947373a0c50c78b89ff8decbe2f148584c2f84bd6dfce",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": "sha256:fd9d54300cc4a7b5894cd086222f7cde2cdf0a3fed4a4f76d466484274397d7a"
  },
  "builtAt": "2026-10-13T14:52:15+00:00"
 },
 {
  "town": "Maubin, Ayeyarwady",
  "country": "Myanmar",
  "iso3": "MMR",
  "lat": 16.731,
  "lon": 95.654,
  "variety": "Paw San rice",
  "spi3": 1.68,
  "spiClass": "very wet",
  "rainPercentile": 40.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 429.47
   },
   {
    "period": "2025-10",
    "mm": 325.49
   },
   {
    "period": "2025-11",
    "mm": 127.88
   },
   {
    "period": "2025-12",
    "mm": 2.31
   },
   {
    "period": "2026-01",
    "mm": 0.71
   },
   {
    "period": "2026-02",
    "mm": 1.49
   },
   {
    "period": "2026-03",
    "mm": 26.77
   },
   {
    "period": "2026-04",
    "mm": 4.33
   },
   {
    "period": "2026-05",
    "mm": 242.37
   },
   {
    "period": "2026-06",
    "mm": 426.67
   },
   {
    "period": "2026-07",
    "mm": 858.57
   },
   {
    "period": "2026-08",
    "mm": 503.73
   }
  ],
  "tmaxC": 30.58,
  "tminC": 25.16,
  "rain30Mm": 322.88,
  "et0MmDay": 4.16,
  "elevationM": 3.9,
  "evaporation": {
   "year": 2025,
   "actualMm": 1179.75,
   "potentialMm": 1445.58,
   "ratio": 0.816,
   "rootZoneMoisture": 0.392
  },
  "riceYieldTHa": 3.94,
  "riceYieldYear": 2024,
  "calendar": [
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   },
   {
    "season": "Summer Rice",
    "sowing": "1 Nov to 31 Dec",
    "harvest": "1 Mar to 30 Apr"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Aug",
    "harvest": "1 Oct to 30 Nov"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   }
  ],
  "sources": {
   "chirps": "sha256:bb0ad6d0358264eb0bd216faa8531cbf2bdb4f21b2a1260f2437f103ccf3ac38",
   "nasaPower": "sha256:f994b7a983db50af29958bd0155cfdfb8d96fd1138a7a03fc44bf3c6d02c9ccd",
   "gleam": "sha256:98b3c81e46db233e0a5b12f59ab4c7801b7102966fdd766f99e2513afe2c36f5",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": "sha256:5566904e051b0df338a9a54dd7d241a83b270a532537facb1acaac86395ae842"
  },
  "builtAt": "2026-10-13T14:28:08+00:00"
 },
 {
  "town": "Muñoz, Nueva Ecija",
  "country": "Philippines",
  "iso3": "PHL",
  "lat": 15.716,
  "lon": 120.903,
  "variety": "NSIC Rc 216",
  "spi3": 0.21,
  "spiClass": "near normal",
  "rainPercentile": 100.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 402.39
   },
   {
    "period": "2025-10",
    "mm": 254.73
   },
   {
    "period": "2025-11",
    "mm": 216.23
   },
   {
    "period": "2025-12",
    "mm": 55.15
   },
   {
    "period": "2026-01",
    "mm": 19.81
   },
   {
    "period": "2026-02",
    "mm": 18.28
   },
   {
    "period": "2026-03",
    "mm": 18.52
   },
   {
    "period": "2026-04",
    "mm": 22.96
   },
   {
    "period": "2026-05",
    "mm": 155.13
   },
   {
    "period": "2026-06",
    "mm": 147.38
   },
   {
    "period": "2026-07",
    "mm": 229.22
   },
   {
    "period": "2026-08",
    "mm": 636.52
   }
  ],
  "tmaxC": 30.83,
  "tminC": 24.36,
  "rain30Mm": 438.13,
  "et0MmDay": 4.25,
  "elevationM": 107.63,
  "evaporation": {
   "year": 2025,
   "actualMm": 863.2,
   "potentialMm": 1318.95,
   "ratio": 0.654,
   "rootZoneMoisture": 0.405
  },
  "riceYieldTHa": 4.11,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:d498e321d1119d4c0b26a5d4dfc2d6f8af1a36f4d2b6053463f6266ce49dc807",
   "gleam": "sha256:982c146c1411bfd108713924e3ff2800d8e3e9cbb8db4e2f93799410fd2a04b2",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:34:40+00:00"
 },
 {
  "town": "Nakhon Sawan",
  "country": "Thailand",
  "iso3": "THA",
  "lat": 15.704,
  "lon": 100.137,
  "variety": "RD41",
  "spi3": -0.15,
  "spiClass": "near normal",
  "rainPercentile": 56.7,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 371.16
   },
   {
    "period": "2025-10",
    "mm": 167.13
   },
   {
    "period": "2025-11",
    "mm": 101.26
   },
   {
    "period": "2025-12",
    "mm": 3.88
   },
   {
    "period": "2026-01",
    "mm": 3.26
   },
   {
    "period": "2026-02",
    "mm": 15.35
   },
   {
    "period": "2026-03",
    "mm": 15.77
   },
   {
    "period": "2026-04",
    "mm": 18.57
   },
   {
    "period": "2026-05",
    "mm": 191.29
   },
   {
    "period": "2026-06",
    "mm": 102.01
   },
   {
    "period": "2026-07",
    "mm": 156.16
   },
   {
    "period": "2026-08",
    "mm": 165.61
   }
  ],
  "tmaxC": 30.43,
  "tminC": 24.65,
  "rain30Mm": 459.91,
  "et0MmDay": 3.8,
  "elevationM": 56.5,
  "evaporation": {
   "year": 2025,
   "actualMm": 1020.72,
   "potentialMm": 1577.73,
   "ratio": 0.647,
   "rootZoneMoisture": 0.356
  },
  "riceYieldTHa": 2.98,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:bb0ad6d0358264eb0bd216faa8531cbf2bdb4f21b2a1260f2437f103ccf3ac38",
   "nasaPower": "sha256:aed1090a685384d030c726ff4db9af753ab806145402a2df280a81eaec59e0ab",
   "gleam": "sha256:14b779a7304e4d7acf45308e013165b1c9a9299d34dad4f8a051fdad1a2b5bfd",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:39:08+00:00"
 },
 {
  "town": "Ngawi, East Java",
  "country": "Indonesia",
  "iso3": "IDN",
  "lat": -7.404,
  "lon": 111.446,
  "variety": "Inpari 42",
  "spi3": -1.17,
  "spiClass": "moderately dry",
  "rainPercentile": 0.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 112.88
   },
   {
    "period": "2025-10",
    "mm": 188.51
   },
   {
    "period": "2025-11",
    "mm": 512.49
   },
   {
    "period": "2025-12",
    "mm": 359.97
   },
   {
    "period": "2026-01",
    "mm": 329.18
   },
   {
    "period": "2026-02",
    "mm": 352.51
   },
   {
    "period": "2026-03",
    "mm": 306.69
   },
   {
    "period": "2026-04",
    "mm": 215.65
   },
   {
    "period": "2026-05",
    "mm": 162.21
   },
   {
    "period": "2026-06",
    "mm": 24.6
   },
   {
    "period": "2026-07",
    "mm": 15.5
   },
   {
    "period": "2026-08",
    "mm": 9.69
   }
  ],
  "tmaxC": 35.75,
  "tminC": 22.71,
  "rain30Mm": 9.09,
  "et0MmDay": 5.52,
  "elevationM": 222.2,
  "evaporation": {
   "year": 2025,
   "actualMm": 1027.3,
   "potentialMm": 1421.88,
   "ratio": 0.722,
   "rootZoneMoisture": 0.401
  },
  "riceYieldTHa": 5.29,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:808ad7690b4b3acafe07bf95f99e19be9192dfaef3a28ff989a2501b02f160a7",
   "nasaPower": "sha256:a681f7e1c3808af84e4eb129af607be757e2a35e6552a27b82b6718b3bac76ba",
   "gleam": "sha256:0ea7e09cad236fa1da6e39d8d3053c7c73ec4cd14a7c643318ec6381247cf874",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:49:56+00:00"
 },
 {
  "town": "Pathein, Ayeyarwady",
  "country": "Myanmar",
  "iso3": "MMR",
  "lat": 16.778,
  "lon": 94.732,
  "variety": "Paw San rice",
  "spi3": 1.04,
  "spiClass": "moderately wet",
  "rainPercentile": 63.3,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 445.37
   },
   {
    "period": "2025-10",
    "mm": 247.07
   },
   {
    "period": "2025-11",
    "mm": 245.76
   },
   {
    "period": "2025-12",
    "mm": 2.02
   },
   {
    "period": "2026-01",
    "mm": 2.05
   },
   {
    "period": "2026-02",
    "mm": 6.21
   },
   {
    "period": "2026-03",
    "mm": 5.1
   },
   {
    "period": "2026-04",
    "mm": 7.33
   },
   {
    "period": "2026-05",
    "mm": 243.33
   },
   {
    "period": "2026-06",
    "mm": 634.58
   },
   {
    "period": "2026-07",
    "mm": 876.36
   },
   {
    "period": "2026-08",
    "mm": 762.16
   }
  ],
  "tmaxC": 30.53,
  "tminC": 25.02,
  "rain30Mm": 312.5,
  "et0MmDay": 4.25,
  "elevationM": 12.51,
  "evaporation": {
   "year": 2025,
   "actualMm": 1269.6,
   "potentialMm": 1518.31,
   "ratio": 0.836,
   "rootZoneMoisture": 0.402
  },
  "riceYieldTHa": 3.94,
  "riceYieldYear": 2024,
  "calendar": [
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   },
   {
    "season": "Summer Rice",
    "sowing": "1 Nov to 31 Dec",
    "harvest": "1 Mar to 30 Apr"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Aug",
    "harvest": "1 Oct to 30 Nov"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   }
  ],
  "sources": {
   "chirps": "sha256:bb0ad6d0358264eb0bd216faa8531cbf2bdb4f21b2a1260f2437f103ccf3ac38",
   "nasaPower": "sha256:a04a5ccc283644e1342e27964f7e7072c64075878168d76065e91855777cbf07",
   "gleam": "sha256:e13c5ce22356f82ccc4bc280034fd0db314c70540954ff51c3410a75d19e59d7",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": "sha256:5566904e051b0df338a9a54dd7d241a83b270a532537facb1acaac86395ae842"
  },
  "builtAt": "2026-10-13T14:30:02+00:00"
 },
 {
  "town": "Phra Nakhon Si Ayutthaya",
  "country": "Thailand",
  "iso3": "THA",
  "lat": 14.353,
  "lon": 100.568,
  "variety": "Pathum Thani 1",
  "spi3": -0.46,
  "spiClass": "near normal",
  "rainPercentile": 16.7,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 285.11
   },
   {
    "period": "2025-10",
    "mm": 199.61
   },
   {
    "period": "2025-11",
    "mm": 123.58
   },
   {
    "period": "2025-12",
    "mm": 1.74
   },
   {
    "period": "2026-01",
    "mm": 3.05
   },
   {
    "period": "2026-02",
    "mm": 22.32
   },
   {
    "period": "2026-03",
    "mm": 14.21
   },
   {
    "period": "2026-04",
    "mm": 32.2
   },
   {
    "period": "2026-05",
    "mm": 163.52
   },
   {
    "period": "2026-06",
    "mm": 199.75
   },
   {
    "period": "2026-07",
    "mm": 141.92
   },
   {
    "period": "2026-08",
    "mm": 134.07
   }
  ],
  "tmaxC": 30.6,
  "tminC": 24.71,
  "rain30Mm": 481.02,
  "et0MmDay": 3.65,
  "elevationM": 24.8,
  "evaporation": {
   "year": 2025,
   "actualMm": 937.69,
   "potentialMm": 1625.86,
   "ratio": 0.577,
   "rootZoneMoisture": 0.367
  },
  "riceYieldTHa": 2.98,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:bb0ad6d0358264eb0bd216faa8531cbf2bdb4f21b2a1260f2437f103ccf3ac38",
   "nasaPower": "sha256:7dcb28a5c23e5b1ac70a801251f457ffba416848a4c0c3791e9042cec127e615",
   "gleam": "sha256:7ef69421a9af09e0f1f485469e8d9cc9afa3eea3034bdbd7b8eed93a0fa36572",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:37:23+00:00"
 },
 {
  "town": "Pototan, Iloilo",
  "country": "Philippines",
  "iso3": "PHL",
  "lat": 10.943,
  "lon": 122.635,
  "variety": "NSIC Rc 222",
  "spi3": -0.03,
  "spiClass": "near normal",
  "rainPercentile": 40.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 574.6
   },
   {
    "period": "2025-10",
    "mm": 449.94
   },
   {
    "period": "2025-11",
    "mm": 449.32
   },
   {
    "period": "2025-12",
    "mm": 130.58
   },
   {
    "period": "2026-01",
    "mm": 139.2
   },
   {
    "period": "2026-02",
    "mm": 132.4
   },
   {
    "period": "2026-03",
    "mm": 60.31
   },
   {
    "period": "2026-04",
    "mm": 13.92
   },
   {
    "period": "2026-05",
    "mm": 156.83
   },
   {
    "period": "2026-06",
    "mm": 308.77
   },
   {
    "period": "2026-07",
    "mm": 400.83
   },
   {
    "period": "2026-08",
    "mm": 267.09
   }
  ],
  "tmaxC": 29.76,
  "tminC": 24.77,
  "rain30Mm": 411.19,
  "et0MmDay": 3.3,
  "elevationM": 199.27,
  "evaporation": {
   "year": 2025,
   "actualMm": 1580.56,
   "potentialMm": 1554.28,
   "ratio": 1.017,
   "rootZoneMoisture": 0.37
  },
  "riceYieldTHa": 4.11,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:7af75700002c005a12caecdae1113180621c882b84399be87278f454a4e7a037",
   "gleam": "sha256:49f28655f8300833775e694abef240bf050395a6ebbf19e427177841a96a59b8",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:36:48+00:00"
 },
 {
  "town": "Prey Veng",
  "country": "Cambodia",
  "iso3": "KHM",
  "lat": 11.486,
  "lon": 105.325,
  "variety": "Phka Rumduol",
  "spi3": -0.86,
  "spiClass": "near normal",
  "rainPercentile": 13.3,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 265.22
   },
   {
    "period": "2025-10",
    "mm": 356.5
   },
   {
    "period": "2025-11",
    "mm": 132.86
   },
   {
    "period": "2025-12",
    "mm": 19.21
   },
   {
    "period": "2026-01",
    "mm": 2.56
   },
   {
    "period": "2026-02",
    "mm": 17.89
   },
   {
    "period": "2026-03",
    "mm": 9.52
   },
   {
    "period": "2026-04",
    "mm": 18.04
   },
   {
    "period": "2026-05",
    "mm": 112.76
   },
   {
    "period": "2026-06",
    "mm": 97.35
   },
   {
    "period": "2026-07",
    "mm": 183.68
   },
   {
    "period": "2026-08",
    "mm": 103.5
   }
  ],
  "tmaxC": 30.83,
  "tminC": 24.98,
  "rain30Mm": 389.48,
  "et0MmDay": 4.06,
  "elevationM": 15.06,
  "evaporation": {
   "year": 2025,
   "actualMm": 1660.32,
   "potentialMm": 1705.24,
   "ratio": 0.974,
   "rootZoneMoisture": 0.392
  },
  "riceYieldTHa": 3.64,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:8b339c3c764e17c06d58b8c3966faba869da15094e12e2bc4eb272e15cb9e09a",
   "gleam": "sha256:2899e21bb38528f15525b1e3a4a0b9c6bfcf0f908b907b6edc4f00c881f9dcd9",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:45:55+00:00"
 },
 {
  "town": "Pyapon, Ayeyarwady",
  "country": "Myanmar",
  "iso3": "MMR",
  "lat": 16.285,
  "lon": 95.678,
  "variety": "Sin Thu Kha rice",
  "spi3": 0.81,
  "spiClass": "near normal",
  "rainPercentile": 50.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 367.22
   },
   {
    "period": "2025-10",
    "mm": 241.15
   },
   {
    "period": "2025-11",
    "mm": 231.09
   },
   {
    "period": "2025-12",
    "mm": 4.53
   },
   {
    "period": "2026-01",
    "mm": 1.2
   },
   {
    "period": "2026-02",
    "mm": 5.91
   },
   {
    "period": "2026-03",
    "mm": 15.07
   },
   {
    "period": "2026-04",
    "mm": 3.01
   },
   {
    "period": "2026-05",
    "mm": 298.99
   },
   {
    "period": "2026-06",
    "mm": 463.73
   },
   {
    "period": "2026-07",
    "mm": 744.09
   },
   {
    "period": "2026-08",
    "mm": 530.14
   }
  ],
  "tmaxC": 30.58,
  "tminC": 25.16,
  "rain30Mm": 322.88,
  "et0MmDay": 4.16,
  "elevationM": 3.9,
  "evaporation": {
   "year": 2025,
   "actualMm": 1161.5,
   "potentialMm": 1474.0,
   "ratio": 0.788,
   "rootZoneMoisture": 0.382
  },
  "riceYieldTHa": 3.94,
  "riceYieldYear": 2024,
  "calendar": [
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   },
   {
    "season": "Summer Rice",
    "sowing": "1 Nov to 31 Dec",
    "harvest": "1 Mar to 30 Apr"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Aug",
    "harvest": "1 Oct to 30 Nov"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   }
  ],
  "sources": {
   "chirps": "sha256:bb0ad6d0358264eb0bd216faa8531cbf2bdb4f21b2a1260f2437f103ccf3ac38",
   "nasaPower": "sha256:1fe340e045fca77ff926ab80275bc0b26e9a0c67361ea3c8addf7393789742d4",
   "gleam": "sha256:1f22ce5ef3ec234a4567663cadbe4fe0651c21b7637dd48da79b2ab47c31e768",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": "sha256:5566904e051b0df338a9a54dd7d241a83b270a532537facb1acaac86395ae842"
  },
  "builtAt": "2026-10-13T14:30:02+00:00"
 },
 {
  "town": "Roi Et",
  "country": "Thailand",
  "iso3": "THA",
  "lat": 16.054,
  "lon": 103.653,
  "variety": "Hom Mali 105",
  "spi3": -1.06,
  "spiClass": "moderately dry",
  "rainPercentile": 16.7,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 305.37
   },
   {
    "period": "2025-10",
    "mm": 69.76
   },
   {
    "period": "2025-11",
    "mm": 28.34
   },
   {
    "period": "2025-12",
    "mm": 1.77
   },
   {
    "period": "2026-01",
    "mm": 0.79
   },
   {
    "period": "2026-02",
    "mm": 25.49
   },
   {
    "period": "2026-03",
    "mm": 10.62
   },
   {
    "period": "2026-04",
    "mm": 64.45
   },
   {
    "period": "2026-05",
    "mm": 132.96
   },
   {
    "period": "2026-06",
    "mm": 131.15
   },
   {
    "period": "2026-07",
    "mm": 220.55
   },
   {
    "period": "2026-08",
    "mm": 224.09
   }
  ],
  "tmaxC": 29.4,
  "tminC": 23.57,
  "rain30Mm": 261.69,
  "et0MmDay": 3.84,
  "elevationM": 148.47,
  "evaporation": {
   "year": 2025,
   "actualMm": 1114.98,
   "potentialMm": 1677.52,
   "ratio": 0.665,
   "rootZoneMoisture": 0.277
  },
  "riceYieldTHa": 2.98,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:0933a272bd602e0811bf6a39e26719b604ed905a55592d5073ff02f9fc8683ab",
   "gleam": "sha256:be0e2c22f99d5314006594dca6ee315ebf72af03eb06c19f11a35df715c85e43",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:39:24+00:00"
 },
 {
  "town": "Savannakhet",
  "country": "Laos",
  "iso3": "LAO",
  "lat": 16.557,
  "lon": 104.752,
  "variety": "TDK 8",
  "spi3": 0.55,
  "spiClass": "near normal",
  "rainPercentile": 60.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 285.51
   },
   {
    "period": "2025-10",
    "mm": 78.42
   },
   {
    "period": "2025-11",
    "mm": 20.41
   },
   {
    "period": "2025-12",
    "mm": 1.61
   },
   {
    "period": "2026-01",
    "mm": 1.51
   },
   {
    "period": "2026-02",
    "mm": 26.5
   },
   {
    "period": "2026-03",
    "mm": 13.83
   },
   {
    "period": "2026-04",
    "mm": 104.74
   },
   {
    "period": "2026-05",
    "mm": 150.69
   },
   {
    "period": "2026-06",
    "mm": 126.59
   },
   {
    "period": "2026-07",
    "mm": 415.53
   },
   {
    "period": "2026-08",
    "mm": 349.53
   }
  ],
  "tmaxC": 29.41,
  "tminC": 23.41,
  "rain30Mm": 252.76,
  "et0MmDay": 3.83,
  "elevationM": 169.56,
  "evaporation": {
   "year": 2025,
   "actualMm": 1376.69,
   "potentialMm": 1737.43,
   "ratio": 0.792,
   "rootZoneMoisture": 0.299
  },
  "riceYieldTHa": 4.11,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:ad4c6a40d773de58af73d7cfe5484b409fce94ea48a229217b9b687f403e1f73",
   "gleam": "sha256:74b94a1bad6c844f2c4e12a300be9de3e5e655a49b06b94170a57bf28134ccbf",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:45:55+00:00"
 },
 {
  "town": "Sekinchan, Selangor",
  "country": "Malaysia",
  "iso3": "MYS",
  "lat": 3.505,
  "lon": 101.105,
  "variety": "MR 220 CL2",
  "spi3": 0.16,
  "spiClass": "near normal",
  "rainPercentile": 16.7,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 257.55
   },
   {
    "period": "2025-10",
    "mm": 258.32
   },
   {
    "period": "2025-11",
    "mm": 676.0
   },
   {
    "period": "2025-12",
    "mm": 233.08
   },
   {
    "period": "2026-01",
    "mm": 95.15
   },
   {
    "period": "2026-02",
    "mm": 241.87
   },
   {
    "period": "2026-03",
    "mm": 186.2
   },
   {
    "period": "2026-04",
    "mm": 243.77
   },
   {
    "period": "2026-05",
    "mm": 217.34
   },
   {
    "period": "2026-06",
    "mm": 154.73
   },
   {
    "period": "2026-07",
    "mm": 191.41
   },
   {
    "period": "2026-08",
    "mm": 113.59
   }
  ],
  "tmaxC": 30.0,
  "tminC": 25.27,
  "rain30Mm": 211.72,
  "et0MmDay": 3.95,
  "elevationM": 76.64,
  "evaporation": {
   "year": 2025,
   "actualMm": 324.78,
   "potentialMm": 1600.39,
   "ratio": 0.203,
   "rootZoneMoisture": null
  },
  "riceYieldTHa": 3.54,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:bb0ad6d0358264eb0bd216faa8531cbf2bdb4f21b2a1260f2437f103ccf3ac38",
   "nasaPower": "sha256:c3bfa51193f2fc8b4defa4ff67a137be989989b42d354c2d05665ed67d9333b1",
   "gleam": "sha256:a4611b6b0646c267ae0bceee4f33664c0086399d244867142ddd674ae0b66c35",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:51:51+00:00"
 },
 {
  "town": "Shwebo, Sagaing",
  "country": "Myanmar",
  "iso3": "MMR",
  "lat": 22.568,
  "lon": 95.698,
  "variety": "Shwe Bo Paw San",
  "spi3": 1.01,
  "spiClass": "moderately wet",
  "rainPercentile": 80.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 269.79
   },
   {
    "period": "2025-10",
    "mm": 101.48
   },
   {
    "period": "2025-11",
    "mm": 43.01
   },
   {
    "period": "2025-12",
    "mm": 4.48
   },
   {
    "period": "2026-01",
    "mm": 1.9
   },
   {
    "period": "2026-02",
    "mm": 9.64
   },
   {
    "period": "2026-03",
    "mm": 2.13
   },
   {
    "period": "2026-04",
    "mm": 44.13
   },
   {
    "period": "2026-05",
    "mm": 123.26
   },
   {
    "period": "2026-06",
    "mm": 165.06
   },
   {
    "period": "2026-07",
    "mm": 119.92
   },
   {
    "period": "2026-08",
    "mm": 278.92
   }
  ],
  "tmaxC": 32.05,
  "tminC": 24.79,
  "rain30Mm": 159.5,
  "et0MmDay": 3.74,
  "elevationM": 124.9,
  "evaporation": {
   "year": 2025,
   "actualMm": 1048.72,
   "potentialMm": 1547.02,
   "ratio": 0.678,
   "rootZoneMoisture": 0.269
  },
  "riceYieldTHa": 3.94,
  "riceYieldYear": 2024,
  "calendar": [
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   },
   {
    "season": "Summer Rice",
    "sowing": "1 Nov to 31 Dec",
    "harvest": "1 Mar to 30 Apr"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Aug",
    "harvest": "1 Oct to 30 Nov"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   }
  ],
  "sources": {
   "chirps": "sha256:bb0ad6d0358264eb0bd216faa8531cbf2bdb4f21b2a1260f2437f103ccf3ac38",
   "nasaPower": "sha256:3527c60c4c056e46c4a75834d72ab775d84f0eb0c84982bfd77de9e9374b64f1",
   "gleam": "sha256:40fb4237c4b40e23b2c64545ebd403850709b5527c503d01a73033e8c8cc58f8",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": "sha256:5566904e051b0df338a9a54dd7d241a83b270a532537facb1acaac86395ae842"
  },
  "builtAt": "2026-10-13T14:31:55+00:00"
 },
 {
  "town": "Soc Trang",
  "country": "Vietnam",
  "iso3": "VNM",
  "lat": 9.603,
  "lon": 105.98,
  "variety": "ST25",
  "spi3": -4.75,
  "spiClass": "extremely dry",
  "rainPercentile": 6.7,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 290.55
   },
   {
    "period": "2025-10",
    "mm": 350.53
   },
   {
    "period": "2025-11",
    "mm": 269.36
   },
   {
    "period": "2025-12",
    "mm": 29.26
   },
   {
    "period": "2026-01",
    "mm": 2.8
   },
   {
    "period": "2026-02",
    "mm": 5.68
   },
   {
    "period": "2026-03",
    "mm": 3.93
   },
   {
    "period": "2026-04",
    "mm": 6.98
   },
   {
    "period": "2026-05",
    "mm": 178.81
   },
   {
    "period": "2026-06",
    "mm": 105.06
   },
   {
    "period": "2026-07",
    "mm": 141.23
   },
   {
    "period": "2026-08",
    "mm": 182.46
   }
  ],
  "tmaxC": 30.03,
  "tminC": 26.53,
  "rain30Mm": 486.83,
  "et0MmDay": 3.41,
  "elevationM": 0.71,
  "evaporation": {
   "year": 2025,
   "actualMm": 1240.99,
   "potentialMm": 1616.61,
   "ratio": 0.768,
   "rootZoneMoisture": 0.411
  },
  "riceYieldTHa": 6.15,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:a8567e3a9593c7d8debb803c796c023bf86b4d595026f023ac11d72adf461ec8",
   "gleam": "sha256:0f9cb0b19ece084ef9ae0f9d5340cb276a85146eeeafb4065e342c40b9e268cd",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:43:43+00:00"
 },
 {
  "town": "Subang, West Java",
  "country": "Indonesia",
  "iso3": "IDN",
  "lat": -6.571,
  "lon": 107.759,
  "variety": "Ciherang",
  "spi3": -1.8,
  "spiClass": "severely dry",
  "rainPercentile": 3.3,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 183.38
   },
   {
    "period": "2025-10",
    "mm": 267.64
   },
   {
    "period": "2025-11",
    "mm": 370.29
   },
   {
    "period": "2025-12",
    "mm": 398.33
   },
   {
    "period": "2026-01",
    "mm": 441.32
   },
   {
    "period": "2026-02",
    "mm": 308.83
   },
   {
    "period": "2026-03",
    "mm": 334.13
   },
   {
    "period": "2026-04",
    "mm": 272.18
   },
   {
    "period": "2026-05",
    "mm": 198.62
   },
   {
    "period": "2026-06",
    "mm": 25.79
   },
   {
    "period": "2026-07",
    "mm": 12.49
   },
   {
    "period": "2026-08",
    "mm": 12.06
   }
  ],
  "tmaxC": 30.53,
  "tminC": 22.16,
  "rain30Mm": 75.78,
  "et0MmDay": 4.42,
  "elevationM": 274.68,
  "evaporation": {
   "year": 2025,
   "actualMm": 1175.5,
   "potentialMm": 1403.98,
   "ratio": 0.837,
   "rootZoneMoisture": 0.454
  },
  "riceYieldTHa": 5.29,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:808ad7690b4b3acafe07bf95f99e19be9192dfaef3a28ff989a2501b02f160a7",
   "nasaPower": "sha256:e4fe88df2c4db2d3ec5c2ea51762665f60988f799350c118ad4e83d0fb10efe1",
   "gleam": "sha256:82b52678210548e0b6a853d5f7be7dcd6a46dbbc7d61a5f807cdeebb328b6644",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:49:34+00:00"
 },
 {
  "town": "Suphan Buri",
  "country": "Thailand",
  "iso3": "THA",
  "lat": 14.474,
  "lon": 100.122,
  "variety": "RD41",
  "spi3": 0.95,
  "spiClass": "near normal",
  "rainPercentile": 83.3,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 291.56
   },
   {
    "period": "2025-10",
    "mm": 207.5
   },
   {
    "period": "2025-11",
    "mm": 147.77
   },
   {
    "period": "2025-12",
    "mm": 4.3
   },
   {
    "period": "2026-01",
    "mm": 4.78
   },
   {
    "period": "2026-02",
    "mm": 13.82
   },
   {
    "period": "2026-03",
    "mm": 7.0
   },
   {
    "period": "2026-04",
    "mm": 17.16
   },
   {
    "period": "2026-05",
    "mm": 98.8
   },
   {
    "period": "2026-06",
    "mm": 103.99
   },
   {
    "period": "2026-07",
    "mm": 161.3
   },
   {
    "period": "2026-08",
    "mm": 166.47
   }
  ],
  "tmaxC": 30.77,
  "tminC": 24.74,
  "rain30Mm": 457.59,
  "et0MmDay": 3.65,
  "elevationM": 34.86,
  "evaporation": {
   "year": 2025,
   "actualMm": 937.46,
   "potentialMm": 1625.67,
   "ratio": 0.577,
   "rootZoneMoisture": 0.365
  },
  "riceYieldTHa": 2.98,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:bb0ad6d0358264eb0bd216faa8531cbf2bdb4f21b2a1260f2437f103ccf3ac38",
   "nasaPower": "sha256:3590aff0caa2a2184f03fdbd78810bf1493fd4b8a362a39c1f962ab909d8e865",
   "gleam": "sha256:504515a8dfd23b28a5d17abff107e4b10eb59dacd8249a56d69ad4a9fe6ce18a",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:37:13+00:00"
 },
 {
  "town": "Takeo",
  "country": "Cambodia",
  "iso3": "KHM",
  "lat": 10.99,
  "lon": 104.785,
  "variety": "Sen Kra Ob",
  "spi3": -1.56,
  "spiClass": "severely dry",
  "rainPercentile": 10.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 264.63
   },
   {
    "period": "2025-10",
    "mm": 371.39
   },
   {
    "period": "2025-11",
    "mm": 165.39
   },
   {
    "period": "2025-12",
    "mm": 28.82
   },
   {
    "period": "2026-01",
    "mm": 4.35
   },
   {
    "period": "2026-02",
    "mm": 8.68
   },
   {
    "period": "2026-03",
    "mm": 15.87
   },
   {
    "period": "2026-04",
    "mm": 15.96
   },
   {
    "period": "2026-05",
    "mm": 112.48
   },
   {
    "period": "2026-06",
    "mm": 106.9
   },
   {
    "period": "2026-07",
    "mm": 129.33
   },
   {
    "period": "2026-08",
    "mm": 106.76
   }
  ],
  "tmaxC": 30.87,
  "tminC": 24.84,
  "rain30Mm": 369.48,
  "et0MmDay": 3.54,
  "elevationM": 8.63,
  "evaporation": {
   "year": 2025,
   "actualMm": 1263.79,
   "potentialMm": 1548.4,
   "ratio": 0.816,
   "rootZoneMoisture": 0.365
  },
  "riceYieldTHa": 3.64,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:3a79c53e35a036e16780b7baa25c40f446b5a2bd2d8ceb42d2b215bab61c838a",
   "gleam": "sha256:b051ad251eb1c401da4bb29421784ffee56b859839fb23a65be64a96d4b6b7c6",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:45:23+00:00"
 },
 {
  "town": "Tarlac City, Tarlac",
  "country": "Philippines",
  "iso3": "PHL",
  "lat": 15.486,
  "lon": 120.59,
  "variety": "NSIC Rc 222",
  "spi3": 1.31,
  "spiClass": "moderately wet",
  "rainPercentile": 100.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 413.58
   },
   {
    "period": "2025-10",
    "mm": 246.34
   },
   {
    "period": "2025-11",
    "mm": 216.54
   },
   {
    "period": "2025-12",
    "mm": 37.84
   },
   {
    "period": "2026-01",
    "mm": 12.69
   },
   {
    "period": "2026-02",
    "mm": 17.11
   },
   {
    "period": "2026-03",
    "mm": 15.01
   },
   {
    "period": "2026-04",
    "mm": 23.05
   },
   {
    "period": "2026-05",
    "mm": 143.58
   },
   {
    "period": "2026-06",
    "mm": 202.98
   },
   {
    "period": "2026-07",
    "mm": 326.99
   },
   {
    "period": "2026-08",
    "mm": 917.93
   }
  ],
  "tmaxC": 30.83,
  "tminC": 24.36,
  "rain30Mm": 438.13,
  "et0MmDay": 4.25,
  "elevationM": 107.63,
  "evaporation": {
   "year": 2025,
   "actualMm": 756.51,
   "potentialMm": 1314.87,
   "ratio": 0.575,
   "rootZoneMoisture": 0.376
  },
  "riceYieldTHa": 4.11,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:0bf230c798330d12085215b4dd9d0c5642216d41b6cd29ab23ce55e42d3aff1b",
   "gleam": "sha256:3ec5586dac057d46fed6412bf4cd419f8355ab1518588a72a3a5de81fb90650e",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:35:00+00:00"
 },
 {
  "town": "Taungoo, Bago",
  "country": "Myanmar",
  "iso3": "MMR",
  "lat": 18.94,
  "lon": 96.434,
  "variety": "Sin Thu Kha rice",
  "spi3": 3.18,
  "spiClass": "extremely wet",
  "rainPercentile": 96.7,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 398.01
   },
   {
    "period": "2025-10",
    "mm": 140.27
   },
   {
    "period": "2025-11",
    "mm": 112.8
   },
   {
    "period": "2025-12",
    "mm": 2.41
   },
   {
    "period": "2026-01",
    "mm": 2.78
   },
   {
    "period": "2026-02",
    "mm": 1.27
   },
   {
    "period": "2026-03",
    "mm": 11.87
   },
   {
    "period": "2026-04",
    "mm": 15.71
   },
   {
    "period": "2026-05",
    "mm": 247.84
   },
   {
    "period": "2026-06",
    "mm": 488.23
   },
   {
    "period": "2026-07",
    "mm": 741.75
   },
   {
    "period": "2026-08",
    "mm": 795.54
   }
  ],
  "tmaxC": 32.29,
  "tminC": 24.27,
  "rain30Mm": 375.47,
  "et0MmDay": 4.25,
  "elevationM": 254.69,
  "evaporation": {
   "year": 2025,
   "actualMm": 1410.88,
   "potentialMm": 1448.86,
   "ratio": 0.974,
   "rootZoneMoisture": 0.353
  },
  "riceYieldTHa": 3.94,
  "riceYieldYear": 2024,
  "calendar": [
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   },
   {
    "season": "Summer Rice",
    "sowing": "1 Nov to 31 Dec",
    "harvest": "1 Mar to 30 Apr"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Aug",
    "harvest": "1 Oct to 30 Nov"
   },
   {
    "season": "Monsoon Rice",
    "sowing": "1 Jun to 31 Jul",
    "harvest": "1 Oct to 31 Dec"
   }
  ],
  "sources": {
   "chirps": "sha256:bb0ad6d0358264eb0bd216faa8531cbf2bdb4f21b2a1260f2437f103ccf3ac38",
   "nasaPower": "sha256:2ef65754839aa0c4439f8985cb30158ee43b7e69aed0b29683ac8a8813715fa3",
   "gleam": "sha256:8a128e7e5d7bc6f8109555d57d980b5fdafb70c5fae2e0ef95236ed256d62426",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": "sha256:5566904e051b0df338a9a54dd7d241a83b270a532537facb1acaac86395ae842"
  },
  "builtAt": "2026-10-13T14:31:55+00:00"
 },
 {
  "town": "Thai Binh",
  "country": "Vietnam",
  "iso3": "VNM",
  "lat": 20.446,
  "lon": 106.336,
  "variety": "Bac Thom 7",
  "spi3": 1.41,
  "spiClass": "moderately wet",
  "rainPercentile": 100.0,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 322.6
   },
   {
    "period": "2025-10",
    "mm": 249.2
   },
   {
    "period": "2025-11",
    "mm": 42.25
   },
   {
    "period": "2025-12",
    "mm": 31.52
   },
   {
    "period": "2026-01",
    "mm": 15.57
   },
   {
    "period": "2026-02",
    "mm": 54.69
   },
   {
    "period": "2026-03",
    "mm": 48.81
   },
   {
    "period": "2026-04",
    "mm": 87.0
   },
   {
    "period": "2026-05",
    "mm": 192.37
   },
   {
    "period": "2026-06",
    "mm": 151.21
   },
   {
    "period": "2026-07",
    "mm": 276.63
   },
   {
    "period": "2026-08",
    "mm": 609.04
   }
  ],
  "tmaxC": 29.91,
  "tminC": 24.67,
  "rain30Mm": 612.15,
  "et0MmDay": 3.29,
  "elevationM": 7.77,
  "evaporation": {
   "year": 2025,
   "actualMm": 1150.35,
   "potentialMm": 1288.54,
   "ratio": 0.893,
   "rootZoneMoisture": 0.377
  },
  "riceYieldTHa": 6.15,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:d7430863eae0f20827a0da8eb92d98ca2838432c4ffe5627e44eb2825fb862c3",
   "gleam": "sha256:5872af40fdecf4b421ba009bc738b0b290e5352fe2506a8dcf90224a0be09e45",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:43:36+00:00"
 },
 {
  "town": "Ubon Ratchathani",
  "country": "Thailand",
  "iso3": "THA",
  "lat": 15.244,
  "lon": 104.848,
  "variety": "Hom Mali 105",
  "spi3": -0.2,
  "spiClass": "near normal",
  "rainPercentile": 13.3,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 506.43
   },
   {
    "period": "2025-10",
    "mm": 87.28
   },
   {
    "period": "2025-11",
    "mm": 58.39
   },
   {
    "period": "2025-12",
    "mm": 0.87
   },
   {
    "period": "2026-01",
    "mm": 0.37
   },
   {
    "period": "2026-02",
    "mm": 16.82
   },
   {
    "period": "2026-03",
    "mm": 32.99
   },
   {
    "period": "2026-04",
    "mm": 57.18
   },
   {
    "period": "2026-05",
    "mm": 206.61
   },
   {
    "period": "2026-06",
    "mm": 181.23
   },
   {
    "period": "2026-07",
    "mm": 477.22
   },
   {
    "period": "2026-08",
    "mm": 269.27
   }
  ],
  "tmaxC": 30.11,
  "tminC": 24.05,
  "rain30Mm": 296.92,
  "et0MmDay": 4.17,
  "elevationM": 144.12,
  "evaporation": {
   "year": 2025,
   "actualMm": 1487.45,
   "potentialMm": 1708.3,
   "ratio": 0.871,
   "rootZoneMoisture": 0.253
  },
  "riceYieldTHa": 2.98,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:24806179275ca96e77051fafac6f940509292b228da512b19fe1797ddab565ac",
   "gleam": "sha256:e1f9279cc1248110bb0454f34515fa4c9ebe460937f9349da663ae850f3758d7",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:39:24+00:00"
 },
 {
  "town": "Vientiane Plain",
  "country": "Laos",
  "iso3": "LAO",
  "lat": 18.07,
  "lon": 102.68,
  "variety": "Thadokkham 11",
  "spi3": -1.04,
  "spiClass": "moderately dry",
  "rainPercentile": 26.7,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 467.99
   },
   {
    "period": "2025-10",
    "mm": 99.54
   },
   {
    "period": "2025-11",
    "mm": 23.49
   },
   {
    "period": "2025-12",
    "mm": 17.7
   },
   {
    "period": "2026-01",
    "mm": 4.51
   },
   {
    "period": "2026-02",
    "mm": 27.76
   },
   {
    "period": "2026-03",
    "mm": 20.33
   },
   {
    "period": "2026-04",
    "mm": 69.64
   },
   {
    "period": "2026-05",
    "mm": 266.41
   },
   {
    "period": "2026-06",
    "mm": 278.09
   },
   {
    "period": "2026-07",
    "mm": 310.8
   },
   {
    "period": "2026-08",
    "mm": 329.5
   }
  ],
  "tmaxC": 30.09,
  "tminC": 23.73,
  "rain30Mm": 192.81,
  "et0MmDay": 3.66,
  "elevationM": 222.17,
  "evaporation": {
   "year": 2025,
   "actualMm": 1171.98,
   "potentialMm": 1458.27,
   "ratio": 0.804,
   "rootZoneMoisture": 0.327
  },
  "riceYieldTHa": 4.11,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:dc11d5aae433fe76670283d2feb75897d0951c12b651157cf7708c91f7fa46f5",
   "gleam": "sha256:f96ca496b91cb8c961503c6fce0f80f956f135c4d9c6b4e35c7db33ed5b1f628",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:47:23+00:00"
 },
 {
  "town": "Wasan, Brunei-Muara",
  "country": "Brunei",
  "iso3": "BRN",
  "lat": 4.7686,
  "lon": 114.7967,
  "variety": "Sembada 188",
  "spi3": -1.66,
  "spiClass": "severely dry",
  "rainPercentile": 3.3,
  "rainPeriod": "2026-08",
  "rain12": [
   {
    "period": "2025-09",
    "mm": 412.09
   },
   {
    "period": "2025-10",
    "mm": 353.07
   },
   {
    "period": "2025-11",
    "mm": 392.16
   },
   {
    "period": "2025-12",
    "mm": 518.34
   },
   {
    "period": "2026-01",
    "mm": 596.3
   },
   {
    "period": "2026-02",
    "mm": 392.75
   },
   {
    "period": "2026-03",
    "mm": 64.24
   },
   {
    "period": "2026-04",
    "mm": 189.84
   },
   {
    "period": "2026-05",
    "mm": 413.58
   },
   {
    "period": "2026-06",
    "mm": 188.39
   },
   {
    "period": "2026-07",
    "mm": 177.09
   },
   {
    "period": "2026-08",
    "mm": 163.12
   }
  ],
  "tmaxC": 29.72,
  "tminC": 26.51,
  "rain30Mm": 339.36,
  "et0MmDay": 3.84,
  "elevationM": 32.34,
  "evaporation": {
   "year": 2025,
   "actualMm": 0.0,
   "potentialMm": 1676.92,
   "ratio": 0.0,
   "rootZoneMoisture": null
  },
  "riceYieldTHa": 2.42,
  "riceYieldYear": 2024,
  "calendar": [],
  "sources": {
   "chirps": "sha256:58f6cd66940364857df0251a4e2304cbda5cce466400b096d789c6d64220ed2f",
   "nasaPower": "sha256:6d89d2e66cc5618db60c769831ceecdb00f6cac9f63475351b33f13237d1f09b",
   "gleam": "sha256:c976acd6da2ad3bfff4c6e84960c7bf1ee9955d9516596665c401d7588046f0e",
   "faostat": "sha256:c5835418c18f9322e7decbd6800f93a216eaae3cdfa31acb08f0518c0c6d6853",
   "cropCalendar": null
  },
  "builtAt": "2026-10-13T14:51:51+00:00"
 }
];
