// Vista Bay — shared constants: city size, tuning, colours, story names.
// Original city and characters. No reference to any commercial game.
export const CITY = 600;            // city is 600 x 600 m, x/z in [-300, 300]
export const HALF = CITY / 2;
export const ROAD_SPACING = 60;    // grid roads every 60 m
export const ROAD_WIDTH = 10;
export const ROADS = [-270, -210, -150, -90, -30, 30, 90, 150, 210, 270];

export const TUNE = {
  walkSpeed: 6.5,
  runSpeed: 10.5,
  playerRadius: 0.55,
  playerHealth: 100,
  pistolDamage: 34,
  pistolMag: 12,
  pistolReserve: 120,
  punchDamage: 18,
  punchRange: 2.2,
  carHealth: 120,
  goonHealth: 60,
  goonDamage: 9,
  goonRange: 34,
  trafficCount: 26,
  pedCount: 42,
  copCarPerStar: 2,
  heatDecay: 1.6,        // heat points per second while unseen
  bustedCashLoss: 0.20, // lose 20% of cash when busted or wasted
  saveKey: 'vista-bay-save-v3',
};

export const COLOURS = {
  sky: 0x87bfe8,
  fog: 0x9fc6e2,
  sun: 0xfff0c8,
  ground: 0x4a7d4f,
  sand: 0xe8d29a,
  ocean: 0x1e6f9e,
  road: 0x2e3138,
  sidewalk: 0x9aa0a6,
  buildingGlass: 0x6fa8c8,
};

// Original story cast — invented for Vista Bay.
export const CAST = {
  mara: 'Mara Voss',
  dario: 'Dario Kane',
  rook: 'Rook',
  fixer: 'Mara Voss',
};
