import React, { useRef } from 'react';

export interface TileOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface ChoiceTilesProps<T extends string> {
  label: string;
  value: T;
  options: readonly TileOption<T>[];
  onChange: (value: T) => void;
}

export function ChoiceTiles<T extends string>({ label, value, options, onChange }: ChoiceTilesProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(0, options.findIndex((o) => o.value === value));

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      move(index, 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      move(index, -1);
    }
  };

  return (
    <div className="aq-tiles fx-tile-press" role="radiogroup" aria-label={label}>
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={i === selected ? 0 : -1}
          className="aq-tile"
          onClick={() => onChange(option.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {option.icon ? <span aria-hidden="true">{option.icon}</span> : null}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
