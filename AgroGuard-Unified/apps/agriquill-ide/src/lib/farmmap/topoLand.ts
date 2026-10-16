import type { Position } from './farmMapTypes.ts';

interface Transform {
  scale: [number, number];
  translate: [number, number];
}

interface Geometry {
  type: string;
  arcs?: unknown;
  geometries?: Geometry[];
}

export interface Topology {
  type: 'Topology';
  transform?: Transform;
  arcs: number[][][];
  objects: Record<string, Geometry>;
}

function decodeArcs(topology: Topology): Position[][] {
  const { transform } = topology;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return transform ? [x * transform.scale[0] + transform.translate[0], y * transform.scale[1] + transform.translate[1]] : [x, y];
    });
  });
}

function ringOf(arcIds: number[], arcs: Position[][]): Position[] {
  const ring: Position[] = [];
  arcIds.forEach((id) => {
    const points = id >= 0 ? arcs[id] : [...arcs[~id]].reverse();
    ring.push(...(ring.length ? points.slice(1) : points));
  });
  return ring;
}

function collect(geometry: Geometry, arcs: Position[][], out: Position[][][]) {
  if (geometry.type === 'GeometryCollection') {
    geometry.geometries?.forEach((g) => collect(g, arcs, out));
    return;
  }
  if (geometry.type === 'Polygon') {
    out.push((geometry.arcs as number[][]).map((ring) => ringOf(ring, arcs)));
  } else if (geometry.type === 'MultiPolygon') {
    (geometry.arcs as number[][][]).forEach((polygon) => out.push(polygon.map((ring) => ringOf(ring, arcs))));
  }
}

export function landPolygons(topology: Topology, objectName: string): Position[][][] {
  const object = topology.objects[objectName];
  if (!object) return [];
  const out: Position[][][] = [];
  collect(object, decodeArcs(topology), out);
  return out;
}
