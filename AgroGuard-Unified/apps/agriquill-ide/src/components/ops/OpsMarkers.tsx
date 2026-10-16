import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { OpsAsset, OpsPaddy } from '../../data/ops/types.ts';

export type AnchorMap = Map<string, THREE.Vector3>;
export type ElementMap = Map<string, HTMLElement>;

const HOVER_ANCHOR = 'hover-paddy';

const LIFT: Record<OpsAsset['kind'], number> = {
  pump: 10,
  gate: 9,
  sluice: 12,
  drone: 7,
  tractor: 11,
  robot: 8,
};

export function assetCaption(asset: OpsAsset): string {
  return asset.reading ? `${asset.label} · ${asset.reading}` : `${asset.label} · ${asset.status}`;
}

export function buildAnchors(assets: OpsAsset[], hoveredPaddy: OpsPaddy | undefined): AnchorMap {
  const anchors: AnchorMap = new Map();
  for (const asset of assets) {
    const [x, y, z] = asset.position;
    anchors.set(asset.id, new THREE.Vector3(x, y + LIFT[asset.kind], z));
  }
  if (hoveredPaddy) {
    const { x, z, w, d } = hoveredPaddy.rect;
    anchors.set(HOVER_ANCHOR, new THREE.Vector3(x + w / 2, 5, z + d / 2));
  }
  return anchors;
}

export function MarkerProjector({
  anchors,
  elements,
}: {
  anchors: React.RefObject<AnchorMap>;
  elements: React.RefObject<ElementMap>;
}) {
  const scratch = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const map = anchors.current;
    const els = elements.current;
    if (!map || !els) return;
    for (const [id, position] of map) {
      const el = els.get(id);
      if (!el) continue;
      scratch.copy(position).project(camera);
      const visible = scratch.z < 1 && Math.abs(scratch.x) < 1.2 && Math.abs(scratch.y) < 1.2;
      const x = ((scratch.x + 1) / 2) * size.width;
      const y = ((1 - scratch.y) / 2) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.visibility = visible ? 'visible' : 'hidden';
    }
  });
  return null;
}

interface OpsMarkerLayerProps {
  assets: OpsAsset[];
  hoveredPaddy: OpsPaddy | undefined;
  hoveredDepth: number | undefined;
  selectedId: string | null;
  taskAssetIds: Set<string>;
  elements: React.RefObject<ElementMap>;
  onSelect: (id: string) => void;
}

export const OpsMarkerLayer = React.memo(function OpsMarkerLayer({
  assets,
  hoveredPaddy,
  hoveredDepth,
  selectedId,
  taskAssetIds,
  elements,
  onSelect,
}: OpsMarkerLayerProps) {
  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) elements.current?.set(id, el);
    else elements.current?.delete(id);
  };

  return (
    <div className="ops-marker-layer">
      {assets.map((asset) => {
        const selected = selectedId === asset.id;
        return (
          <button
            key={asset.id}
            ref={register(asset.id)}
            type="button"
            onClick={() => onSelect(asset.id)}
            className={`ops-marker ${selected ? 'is-selected' : ''}`}
            aria-pressed={selected}
            aria-label={`${asset.number}. ${asset.id} ${assetCaption(asset)}`}
          >
            <span className="ops-marker-pin">{asset.number}</span>
            <span className="ops-marker-text">
              <strong>{asset.id}</strong> {assetCaption(asset)}
            </span>
            {taskAssetIds.has(asset.id) && <span className="ops-marker-task" title="Crew task scheduled" />}
          </button>
        );
      })}
      {hoveredPaddy && (
        <div ref={register(HOVER_ANCHOR)} className="ops-hovercard" role="tooltip">
          <strong>{hoveredPaddy.id}</strong>
          <span>
            {hoveredPaddy.cropName} · {hoveredPaddy.stage}
          </span>
          <span>{hoveredDepth === undefined ? 'Water: no reading' : `Water ${hoveredDepth.toFixed(1)} cm`}</span>
        </div>
      )}
    </div>
  );
});
