import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILIES } from '../../src/features/farm-simulation/lib/site/techniqueCatalog.ts';
import { climateFacts, createSiteService, soilFacts, surroundingFacts, terrainFacts, type DailyClimate, type SiteFacts, type SoilGridsResponse } from '../../src/features/farm-simulation/lib/site/siteFacts.ts';
import { aridityClass, evaluateSite, groupResults, siteCharacter, thermalClass } from '../../src/features/farm-simulation/lib/site/techniqueFit.ts';
import type { SiteSnapshot } from '../../src/features/farm-simulation/lib/livetwin/twinGis.ts';

const AT = Date.parse('2026-10-13T00:00:00Z');

function daily(years: number, rainPerDay: (month: number) => number, temp: (month: number) => number, et0 = 4): DailyClimate {
  const time: string[] = [];
  for (let t = Date.parse('2016-01-01T00:00:00Z'); t < Date.parse(`${2016 + years}-01-01T00:00:00Z`); t += 86400000) time.push(new Date(t).toISOString().slice(0, 10));
  const month = (d: string) => Number(d.slice(5, 7));
  return {
    time,
    precipitation_sum: time.map((d) => rainPerDay(month(d))),
    temperature_2m_mean: time.map((d) => temp(month(d))),
    et0_fao_evapotranspiration: time.map(() => et0),
    shortwave_radiation_sum: time.map(() => 19),
  };
}

function snapshot(near: SiteSnapshot['near'], inside: SiteSnapshot['inside'] = []): SiteSnapshot {
  return { lat: 16.7, lon: 95.6, at: AT, inside, near, source: 'test' };
}

function site(climate: DailyClimate | null, elevations: number[] | null, around: SiteSnapshot | null, soil: SoilGridsResponse | null = null): SiteFacts {
  return {
    lat: 16.7,
    lon: 95.6,
    retrievedAt: AT,
    pinIn: around ? around.inside.map((x) => x.cat) : [],
    facts: { ...climateFacts(climate, '2016–2025', AT), ...terrainFacts(16.7, 95.6, elevations, AT), ...surroundingFacts(around, AT), ...soilFacts(soil, AT) },
  };
}

function soilGrids(clay: (number | null)[], silt: (number | null)[]): SoilGridsResponse {
  const ranges = [[0, 5], [5, 15], [15, 30]];
  const layer = (name: string, means: (number | null)[]) => ({
    name,
    unit_measure: { d_factor: 10 },
    depths: ranges.map(([top, bottom], i) => ({ range: { top_depth: top, bottom_depth: bottom }, values: { mean: means[i] } })),
  });
  return { properties: { layers: [layer('clay', clay), layer('silt', silt)] } };
}

const wetHot = daily(2, (m) => (m >= 5 && m <= 10 ? 12 : 1), () => 27.5);
const aridHot = daily(2, () => 1, () => 28, 6);
const cold = daily(2, () => 3, (m) => (m === 1 || m === 12 ? -6 : 14));
const flat = [5, 5, 5, 5, 5];
const coast = { coast: { label: 'Beach / coast', n: 1, d: 1800, name: null, ele: null } };
const river = { river: { label: 'River', n: 1, d: 900, name: 'Test river', ele: null } };

test('Catalogue: all 37 families exist and none is marked validated', () => {
  assert.equal(FAMILIES.length, 37);
  assert.deepEqual(FAMILIES.map((f) => f.id), Array.from({ length: 37 }, (_, i) => i + 1));
  assert.ok(FAMILIES.every((f) => f.coverage === 'CATALOGUED'));
  assert.ok(FAMILIES.every((f) => f.coverage !== 'FIELD_VALIDATED' && f.coverage !== 'MODEL_SUPPORTED'));
});

test('Classes follow the documented boundaries', () => {
  assert.equal(aridityClass(0.04), 'hyper-arid');
  assert.equal(aridityClass(0.19), 'arid');
  assert.equal(aridityClass(0.49), 'semi-arid');
  assert.equal(aridityClass(0.64), 'dry sub-humid');
  assert.equal(aridityClass(0.65), 'humid');
  assert.equal(thermalClass(18, 30), 'hot');
  assert.equal(thermalClass(10, 25), 'warm');
  assert.equal(thermalClass(5, 20), 'mild');
  assert.equal(thermalClass(-3, 25), 'cold');
});

test('Climate facts come from the archive as modelled values with their period', () => {
  const facts = climateFacts(wetHot, '2016–2017', AT);
  assert.equal(facts.rainMm.sourceClass, 'MODELLED');
  assert.equal(facts.rainMm.period, '2016–2017');
  assert.ok(Math.abs((facts.rainMm.value ?? 0) - (12 * 184 + 1 * 181.5)) < 5);
  assert.equal(facts.dryMonths.value, 6);
  assert.ok((facts.aridity.value ?? 0) > 1);
  const holed = { ...wetHot, precipitation_sum: wetHot.precipitation_sum.map((v, i) => (i % 3 === 0 ? null : v)) };
  const gap = climateFacts(holed, '2016–2017', AT);
  assert.equal(gap.rainMm.value, null);
  assert.match(gap.rainMm.reason ?? '', /missing/);
  assert.equal(climateFacts(null, '', AT, 'HTTP 429').aridity.reason, 'HTTP 429');
});

test('Surroundings never turn absence into zero', () => {
  const none = surroundingFacts(snapshot({}), AT);
  assert.equal(none.coastKm.value, null);
  assert.equal(none.coastKm.beyondKm, 4);
  assert.equal(surroundingFacts(null, AT).coastKm.beyondKm, undefined);
  assert.equal(surroundingFacts(snapshot(river), AT).riverKm.value, 0.9);
  assert.equal(terrainFacts(16.7, 95.6, null, AT).slopePct.value, null);
});

test('A wet, hot, flat site by a river puts paddy and rice–fish among the fits and keeps management layers apart', () => {
  const groups = groupResults(evaluateSite(site(wetHot, flat, snapshot(river))));
  const fitting = [...groups.fits, ...groups.conditional].map((r) => r.family.id);
  assert.ok(fitting.includes(3));
  assert.ok(fitting.includes(30));
  assert.ok(groups.notHere.some((r) => r.family.id === 18));
  assert.ok(groups.onTop.every((r) => ['management', 'enabling'].includes(r.family.kind)));
  assert.ok(![...groups.fits, ...groups.conditional].some((r) => r.family.id === 36));
  const character = siteCharacter(site(wetHot, flat, snapshot(river))).map((c) => c.label);
  assert.deepEqual(character, ['Hot', 'Wet', 'Lowland', 'Flat', 'Near river']);
});

test('Shore sites open the marine families; inland sites rule them out', () => {
  const shore = evaluateSite(site(wetHot, flat, snapshot(coast)));
  const inland = evaluateSite(site(wetHot, flat, snapshot(river)));
  for (const id of [18, 20, 22]) {
    assert.notEqual(shore.find((r) => r.family.id === id)?.status, 'not_here');
    assert.equal(inland.find((r) => r.family.id === id)?.status, 'not_here');
  }
});

test('Arid sites rule out rainfed farming and favour dryland practice; cold sites rule out paddy', () => {
  const arid = evaluateSite(site(aridHot, flat, snapshot({})));
  assert.equal(arid.find((r) => r.family.id === 1)?.status, 'not_here');
  assert.equal(arid.find((r) => r.family.id === 4)?.status, 'fits');
  const coldSite = evaluateSite(site(cold, flat, snapshot(river)));
  assert.equal(coldSite.find((r) => r.family.id === 3)?.status, 'not_here');
});

test('Missing climate data never produces a fit for climate-driven families', () => {
  const unknown = evaluateSite(site(null, null, null));
  for (const id of [1, 3, 4, 5, 10]) assert.notEqual(unknown.find((r) => r.family.id === id)?.status, 'fits');
  assert.equal(unknown.find((r) => r.family.id === 1)?.status, 'needs_data');
  assert.ok(unknown.find((r) => r.family.id === 1)?.missing.some((m) => m.includes('climate')));
});

test('SoilGrids texture feeds paddy and pond rules; a masked cell stays null', () => {
  const delta = soilGrids([330, 326, 352], [404, 407, 399]);
  assert.equal(soilFacts(delta, AT).finePct.value, 74);
  const sandy = soilGrids([80, 80, 90], [150, 150, 150]);
  const masked = soilGrids([null, null, null], [null, null, null]);
  assert.equal(soilFacts(masked, AT).finePct.value, null);
  assert.match(soilFacts(masked, AT).finePct.reason ?? '', /no value/);
  const pond = (s: SoilGridsResponse | null) => evaluateSite(site(wetHot, flat, snapshot(river), s)).find((r) => r.family.id === 16);
  assert.ok(pond(delta)?.reasons.some((r) => r.sign === '+' && r.facts.includes('finePct') && r.basis === 'FAO pond soil guide'));
  assert.ok(pond(sandy)?.reasons.some((r) => r.sign === '!' && r.text.includes('seeps')));
  assert.ok(pond(masked)?.missing.some((m) => m.startsWith('soil texture')));
});

test('Site service shares one request per spot and does not cache a partial answer', async () => {
  const urls: string[] = [];
  const service = createSiteService({
    fetcher: async (url) => {
      urls.push(url);
      return { ok: false, status: 429, json: async () => ({ reason: 'limit' }) };
    },
    storage: null,
    now: () => AT,
  });
  const [a, b] = await Promise.all([service.facts(16.7, 95.6), service.facts(16.7, 95.6)]);
  assert.equal(a, b);
  assert.equal(urls.length, 5);
  assert.equal(a.facts.rainMm.value, null);
  assert.match(a.facts.rainMm.reason ?? '', /HTTP 429 · limit/);
  assert.match(a.facts.finePct.reason ?? '', /SoilGrids unavailable/);
  await service.facts(16.7, 95.6);
  assert.equal(urls.length, 10);
});
