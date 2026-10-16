import React, { useRef } from 'react';
import type { ThresholdGroup, ThresholdGroupId } from '../../lib/paddySettings.ts';

interface PaddyGroupNavProps {
  groups: readonly ThresholdGroup[];
  active: ThresholdGroupId;
  dirtyCounts: Readonly<Record<ThresholdGroupId, number>>;
  idPrefix: string;
  onSelect: (id: ThresholdGroupId) => void;
}

export const PaddyGroupNav: React.FC<PaddyGroupNavProps> = ({ groups, active, dirtyCounts, idPrefix, onSelect }) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (from: number, step: number) => {
    const next = groups[(from + step + groups.length) % groups.length];
    onSelect(next.id);
    refs.current[next.id]?.focus();
  };

  const handleKey = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      move(index, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(0, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      move(groups.length - 1, 0);
    }
  };

  return (
    <nav className="aq-card aq-nav" role="tablist" aria-label="Threshold groups" aria-orientation="vertical">
      {groups.map((group, index) => {
        const selected = group.id === active;
        const dirty = dirtyCounts[group.id];
        return (
          <button
            key={group.id}
            ref={(node) => {
              refs.current[group.id] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${group.id}`}
            className="aq-tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(group.id)}
            onKeyDown={(event) => handleKey(event, index)}
          >
            <span>{group.label}</span>
            {dirty > 0 ? (
              <span className="aq-tab-count" aria-label={`${dirty} unsaved changes`}>
                {dirty}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
};
