import { FARM_SITES } from './farmSites.ts';
import type { FixtureFarm, FixtureMachine } from './twinTypes.ts';

type Town = readonly [
  country: string,
  town: string,
  lat: number,
  lon: number,
  weight: number,
  variety: string,
];

const TOWNS: readonly Town[] = [
  ['Myanmar', 'Maubin, Ayeyarwady', 16.731, 95.654, 3, 'Paw San rice'],
  ['Myanmar', 'Pyapon, Ayeyarwady', 16.285, 95.678, 2, 'Sin Thu Kha rice'],
  ['Myanmar', 'Hinthada, Ayeyarwady', 17.648, 95.457, 2, 'Manawthukha rice'],
  ['Myanmar', 'Pathein, Ayeyarwady', 16.778, 94.732, 2, 'Paw San rice'],
  ['Myanmar', 'Taungoo, Bago', 18.94, 96.434, 2, 'Sin Thu Kha rice'],
  ['Myanmar', 'Shwebo, Sagaing', 22.568, 95.698, 2, 'Shwe Bo Paw San'],
  ['Philippines', 'Cabanatuan, Nueva Ecija', 15.486, 120.967, 3, 'NSIC Rc 222'],
  ['Philippines', 'Muñoz, Nueva Ecija', 15.716, 120.903, 2, 'NSIC Rc 216'],
  ['Philippines', 'Tarlac City, Tarlac', 15.486, 120.59, 2, 'NSIC Rc 222'],
  ['Philippines', 'Ilagan, Isabela', 17.148, 121.889, 2, 'NSIC Rc 160'],
  ['Philippines', 'Pototan, Iloilo', 10.943, 122.635, 2, 'NSIC Rc 222'],
  ['Thailand', 'Suphan Buri', 14.474, 100.122, 3, 'RD41'],
  ['Thailand', 'Phra Nakhon Si Ayutthaya', 14.353, 100.568, 2, 'Pathum Thani 1'],
  ['Thailand', 'Nakhon Sawan', 15.704, 100.137, 2, 'RD41'],
  ['Thailand', 'Ubon Ratchathani', 15.244, 104.848, 2, 'Hom Mali 105'],
  ['Thailand', 'Roi Et', 16.054, 103.653, 2, 'Hom Mali 105'],
  ['Vietnam', 'Long Xuyen, An Giang', 10.386, 105.435, 3, 'OM 5451'],
  ['Vietnam', 'Cao Lanh, Dong Thap', 10.46, 105.633, 2, 'OM 18'],
  ['Vietnam', 'Can Tho', 10.045, 105.747, 2, 'ST25'],
  ['Vietnam', 'Soc Trang', 9.603, 105.98, 2, 'ST25'],
  ['Vietnam', 'Thai Binh', 20.446, 106.336, 2, 'Bac Thom 7'],
  ['Cambodia', 'Battambang', 13.095, 103.202, 3, 'Phka Rumduol'],
  ['Cambodia', 'Takeo', 10.99, 104.785, 2, 'Sen Kra Ob'],
  ['Cambodia', 'Prey Veng', 11.486, 105.325, 2, 'Phka Rumduol'],
  ['Laos', 'Savannakhet', 16.557, 104.752, 2, 'TDK 8'],
  ['Laos', 'Vientiane Plain', 18.07, 102.68, 2, 'Thadokkham 11'],
  ['Indonesia', 'Karawang, West Java', -6.322, 107.338, 3, 'Ciherang'],
  ['Indonesia', 'Indramayu, West Java', -6.327, 108.32, 2, 'Inpari 32'],
  ['Indonesia', 'Subang, West Java', -6.571, 107.759, 2, 'Ciherang'],
  ['Indonesia', 'Ngawi, East Java', -7.404, 111.446, 2, 'Inpari 42'],
  ['Malaysia', 'Alor Setar, Kedah', 6.121, 100.367, 2, 'MR 297'],
  ['Malaysia', 'Sekinchan, Selangor', 3.505, 101.105, 2, 'MR 220 CL2'],
  ['Brunei', 'Wasan, Brunei-Muara', 4.7686, 114.7967, 1, 'Sembada 188'],
  ['Timor-Leste', 'Maliana, Bobonaro', -8.9917, 125.2197, 1, 'Nakroma'],
];

const GROUP_NAMES = ['Rice Cooperative', 'Rice Growers', 'Paddy Collective', "Farmers' Group", 'Seed Farm'];

function lcg(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function buildFixture(count = 100, now: Date = new Date()): { farms: FixtureFarm[]; fleet: FixtureMachine[] } {
  const random = lcg(20261011);
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const pool: Town[] = [];
  TOWNS.forEach((t) => {
    if (!FARM_SITES[t[1]]?.length) return;
    for (let i = 0; i < t[4]; i += 1) pool.push(t);
  });
  const taken = new Map<string, number>();
  const farms: FixtureFarm[] = [];
  for (let n = 1; n <= count; n += 1) {
    const t = n === 1 ? pool[0] : pool[Math.floor(random() * pool.length)];
    const town = t[1].split(',')[0];
    const sites = FARM_SITES[t[1]];
    const used = taken.get(t[1]) ?? 0;
    const site = sites[used % sites.length];
    taken.set(t[1], used + 1);
    const seasonStart = 15 + Math.floor(random() * 75);
    const paddies = Array.from({ length: 8 }, (_, k) => {
      const ago = seasonStart + Math.floor(random() * 35);
      const planted = new Date(today.getTime() - ago * 86400000);
      return {
        id: `PD-0${k + 1}`,
        variety: t[5],
        transplanted: isoDay(planted),
        areaHa: +(0.65 + random() * 0.25).toFixed(2),
        seepageMmDay: +(2.5 + random() * 3).toFixed(1),
      };
    });
    farms.push({
      id: `FM-${String(n).padStart(3, '0')}`,
      name: n === 1 ? 'Maubin Delta Cooperative' : `${town} ${GROUP_NAMES[Math.floor(random() * GROUP_NAMES.length)]}`,
      region: t[0],
      country: t[0],
      town: t[1],
      lat: +site.latitude.toFixed(4),
      lon: +site.longitude.toFixed(4),
      site: { osm: site.osm, areaHa: site.areaHa, landuse: site.landuse, crop: site.crop, landCover: site.landCover },
      organic: n === 1 || random() < 0.6,
      paddies,
    });
  }
  const fleet: FixtureMachine[] = [];
  const countries = Array.from(new Set(farms.map((f) => f.country)));
  let drones = 0;
  let robots = 0;
  let tractors = 0;
  countries.forEach((country) => {
    const group = farms.filter((f) => f.country === country);
    const pick = (i: number) => group[(i * 7) % group.length].id;
    const per = Math.max(1, Math.round(group.length / 6));
    for (let i = 0; i < per + 1; i += 1) {
      drones += 1;
      fleet.push({
        id: `D-${String(drones).padStart(2, '0')}`,
        kind: 'drone',
        model: 'Agras-class 10 L',
        status: drones === 9 ? 'maintenance' : 'idle',
        farmId: drones === 1 ? 'FM-001' : pick(i),
        speedKmh: 40,
        rangeKm: 8,
        ratesHaPerHour: { 'Scout & NDVI scan': 7.5, 'Spot-spray': 4, 'Water & thermal survey': 7.5 },
      });
    }
    for (let i = 0; i < per; i += 1) {
      robots += 1;
      fleet.push({
        id: `R-${String(robots).padStart(2, '0')}`,
        kind: 'robot',
        model: 'Row weeder',
        status: robots === 6 ? 'offline' : 'idle',
        farmId: robots === 1 ? 'FM-001' : pick(i + 3),
        speedKmh: 25,
        ratesHaPerHour: { 'Weed between rows': 0.25, 'Soil & leaf sample': 1.5, 'Pest trap check': 3 },
      });
    }
    for (let i = 0; i < per + 1; i += 1) {
      tractors += 1;
      fleet.push({
        id: `T-${String(tractors).padStart(2, '0')}`,
        kind: 'tractor',
        model: '35 hp + 1.2 t trailer',
        status: 'idle',
        farmId: tractors === 1 ? 'FM-001' : pick(i + 5),
        speedKmh: 25,
        ratesHaPerHour: { 'Till soil': 0.6, 'Haul harvest': 0.8, 'Deliver inputs': 3, 'Repair dike': 1.2 },
      });
    }
  });
  farms.forEach((farm, i) => {
    fleet.push({
      id: `P-${String(i + 1).padStart(3, '0')}`,
      kind: 'pump',
      model: 'Intake pump + 3 impact sprinklers',
      status: 'idle',
      farmId: farm.id,
      flowM3h: 150,
      ratesHaPerHour: {},
    });
  });
  return { farms, fleet };
}
