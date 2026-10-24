import { hash, rng } from '../farmmap/farmMapRandom.ts';
import type { NearGeometry } from '../farmmap/surroundings.ts';
import type { BBox } from '../fieldsim/imagery.ts';
import { inside, type XZ } from '../fieldsim/localFrame.ts';
import type { TreeSet } from './profile.ts';

export interface OmtFeature {
  layer: string;
  cls: string | null;
  id: number | string | null;
  name: string | null;
  props: Record<string, unknown>;
  geometry: NearGeometry;
}

export interface BuildingMesh {
  ring: XZ[];
  heightM: number;
  minHeightM: number;
  heightSource: 'osm' | 'default';
  illustrative: true;
}

export interface RoadRibbon {
  cls: string;
  widthM: number;
  points: XZ[];
  illustrative: true;
}

export interface WaterPoly {
  cls: string;
  ring: XZ[];
}

export interface Scatter {
  x: number;
  z: number;
  s: number;
}

export interface Neighbourhood {
  buildings: BuildingMesh[];
  roads: RoadRibbon[];
  water: WaterPoly[];
  waterways: RoadRibbon[];
  trees: Scatter[];
  rocks: Scatter[];
  reeds: Scatter[];
  volcano: { name: string; eleM: number | null } | null;
}

export interface NeighbourhoodLimits {
  maxTrees?: number;
  maxRocks?: number;
  maxReeds?: number;
}

export const DEFAULT_BUILDING_HEIGHT_M = 5;
export const ROAD_WIDTH_M: Record<string, number> = { motorway: 12, trunk: 10, primary: 9, secondary: 8, tertiary: 7, minor: 5, service: 3.5, track: 3, path: 1.5, rail: 3 };
export const WATERWAY_WIDTH_M: Record<string, number> = { river: 12, stream: 3, canal: 8, drain: 2, ditch: 1.5 };
const DEFAULT_ROAD_WIDTH_M = 4;
const DEFAULT_WATERWAY_WIDTH_M = 2;
const RESAMPLE_M = 10;
const TREE_CELL_M = 12;
const ROCK_CELL_M = 40;
const REED_CELL_M = 6;
const WOOD = new Set(['wood', 'forest']);
const ROCKY = new Set(['rock', 'bare_rock', 'scree', 'sand']);

type Coord = number[];

const polygonsOf = (g: NearGeometry): Coord[][][] => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const linesOf = (g: NearGeometry): Coord[][] => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);

function extent(g: NearGeometry): BBox {
  const flat: Coord[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v) && typeof v[0] === 'number') flat.push(v as Coord);
    else if (Array.isArray(v)) v.forEach(walk);
  };
  walk(g.coordinates);
  const lons = flat.map((c) => c[0]);
  const lats = flat.map((c) => c[1]);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
}

const meets = (a: BBox, b: BBox) => a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLon <= b.maxLon && a.maxLon >= b.minLon;

function keyOf(f: OmtFeature, e: BBox): string {
  const lon = ((e.minLon + e.maxLon) / 2).toFixed(4);
  const lat = ((e.minLat + e.maxLat) / 2).toFixed(4);
  return `${f.layer}:${f.id ?? ''}:${f.cls ?? ''}:${lon}:${lat}`;
}

export function resample(points: readonly XZ[], stepM: number): XZ[] {
  if (points.length < 2) return [...points];
  const out: XZ[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const [x0, z0] = points[i - 1];
    const [x1, z1] = points[i];
    const parts = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / stepM));
    for (let k = 1; k <= parts; k += 1) out.push([x0 + ((x1 - x0) * k) / parts, z0 + ((z1 - z0) * k) / parts]);
  }
  return out;
}

function scatter(rings: XZ[][], cell: number, random: () => number, room: number): Scatter[] {
  const [outer, ...holes] = rings;
  if (!outer || room <= 0) return [];
  const xs = outer.map((p) => p[0]);
  const zs = outer.map((p) => p[1]);
  const out: Scatter[] = [];
  for (let x = Math.min(...xs); x < Math.max(...xs); x += cell) {
    for (let z = Math.min(...zs); z < Math.max(...zs); z += cell) {
      const p: XZ = [x + random() * cell, z + random() * cell];
      if (!inside(p, outer) || holes.some((h) => inside(p, h))) continue;
      out.push({ x: p[0], z: p[1], s: 0.8 + random() * 0.5 });
      if (out.length >= room) return out;
    }
  }
  return out;
}

export function buildNeighbourhood(
  features: readonly OmtFeature[],
  toLocal: (lat: number, lon: number) => XZ,
  seed: string,
  box: BBox,
  limits: NeighbourhoodLimits = {},
): Neighbourhood {
  const out: Neighbourhood = { buildings: [], roads: [], water: [], waterways: [], trees: [], rocks: [], reeds: [], volcano: null };
  const maxTrees = limits.maxTrees ?? 6000;
  const maxRocks = limits.maxRocks ?? 1500;
  const maxReeds = limits.maxReeds ?? 3000;
  const seen = new Set<string>();
  const local = (ring: Coord[]): XZ[] => ring.map((c) => toLocal(c[1], c[0]));
  for (const f of features) {
    const e = extent(f.geometry);
    if (!meets(e, box)) continue;
    const key = keyOf(f, e);
    if (seen.has(key)) continue;
    seen.add(key);
    const random = rng(hash(`${seed}:${key}`));
    if (f.layer === 'building') {
      for (const rings of polygonsOf(f.geometry)) {
        const height = f.props.render_height;
        const minHeight = f.props.render_min_height;
        out.buildings.push({
          ring: local(rings[0]).slice(0, -1),
          heightM: typeof height === 'number' ? height : DEFAULT_BUILDING_HEIGHT_M,
          minHeightM: typeof minHeight === 'number' ? minHeight : 0,
          heightSource: typeof height === 'number' ? 'osm' : 'default',
          illustrative: true,
        });
      }
    } else if (f.layer === 'transportation') {
      const cls = f.cls ?? '';
      for (const line of linesOf(f.geometry)) out.roads.push({ cls, widthM: ROAD_WIDTH_M[cls] ?? DEFAULT_ROAD_WIDTH_M, points: resample(local(line), RESAMPLE_M), illustrative: true });
    } else if (f.layer === 'waterway') {
      const cls = f.cls ?? '';
      for (const line of linesOf(f.geometry)) out.waterways.push({ cls, widthM: WATERWAY_WIDTH_M[cls] ?? DEFAULT_WATERWAY_WIDTH_M, points: resample(local(line), RESAMPLE_M), illustrative: true });
    } else if (f.layer === 'water') {
      for (const rings of polygonsOf(f.geometry)) out.water.push({ cls: f.cls ?? '', ring: local(rings[0]).slice(0, -1) });
    } else if (f.layer === 'landcover') {
      const cls = f.cls ?? '';
      for (const rings of polygonsOf(f.geometry)) {
        const shape = rings.map((r) => local(r).slice(0, -1));
        if (WOOD.has(cls)) out.trees.push(...scatter(shape, TREE_CELL_M, random, maxTrees - out.trees.length));
        else if (ROCKY.has(cls)) out.rocks.push(...scatter(shape, ROCK_CELL_M, random, maxRocks - out.rocks.length));
        else if (cls === 'wetland') out.reeds.push(...scatter(shape, REED_CELL_M, random, maxReeds - out.reeds.length));
      }
    } else if (f.layer === 'mountain_peak' && f.cls === 'volcano' && !out.volcano) {
      const ele = f.props.ele;
      out.volcano = { name: f.name ?? '', eleM: typeof ele === 'number' ? ele : null };
    }
  }
  return out;
}

export type TreeKind = 'tree_broadleaf' | 'tree_palm' | 'tree_conifer' | 'bamboo';

const TREE_MIX: Record<TreeSet, Record<TreeKind, number>> = {
  lowland: { tree_broadleaf: 0.55, tree_palm: 0.3, tree_conifer: 0, bamboo: 0.15 },
  upland: { tree_broadleaf: 0.6, tree_palm: 0.1, tree_conifer: 0.2, bamboo: 0.1 },
  montane: { tree_broadleaf: 0.4, tree_palm: 0, tree_conifer: 0.55, bamboo: 0.05 },
};

export const treeMix = (set: TreeSet): Record<TreeKind, number> => TREE_MIX[set];

export function assignSpecies(trees: readonly Scatter[], mix: Record<TreeKind, number>, seed: string): Record<TreeKind, Scatter[]> {
  const kinds = Object.keys(mix) as TreeKind[];
  const out: Record<TreeKind, Scatter[]> = { tree_broadleaf: [], tree_palm: [], tree_conifer: [], bamboo: [] };
  trees.forEach((tree, i) => {
    const r = (hash(`${seed}:${i}`) % 10000) / 10000;
    let acc = 0;
    let chosen: TreeKind = kinds[kinds.length - 1];
    for (const kind of kinds) {
      acc += mix[kind];
      if (r < acc) {
        chosen = kind;
        break;
      }
    }
    out[chosen].push(tree);
  });
  return out;
}
