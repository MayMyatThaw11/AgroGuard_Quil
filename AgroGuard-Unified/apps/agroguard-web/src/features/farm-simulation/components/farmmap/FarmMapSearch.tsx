import React, { useEffect, useMemo, useState } from 'react';
import { Crosshair, Factory, MapPin, Search, Sprout, Store, Warehouse, X, type LucideIcon } from 'lucide-react';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { parseCoordinates, searchFarmMap } from '../../lib/farmmap/farmMapSearch.ts';
import { CROPS } from '../../lib/farmmap/farmMapTheme.ts';
import type { SearchKind, SearchResult } from '../../lib/farmmap/farmMapViewTypes.ts';
import { tintStyle } from './tint.ts';

const KINDS: Record<SearchKind, readonly [LucideIcon, string]> = {
  place: [MapPin, 'Place'],
  farm: [Sprout, 'Farm'],
  market: [Store, 'Market'],
  storage: [Warehouse, 'Storage'],
  mill: [Factory, 'Mill'],
  coord: [Crosshair, 'Coordinates'],
};

interface FarmMapSearchProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (result: SearchResult) => void;
}

export const FarmMapSearch: React.FC<FarmMapSearchProps> = ({ inputRef, onPick }) => {
  const data = useMemo(getFarmMap, []);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => parseCoordinates(query) ?? searchFarmMap(data, query), [data, query]);

  useEffect(() => setActive(0), [query]);

  const choose = (result: SearchResult | undefined) => {
    if (!result) return;
    onPick(result);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      choose(results[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      event.currentTarget.blur();
    }
  };

  const showList = open && query.trim().length > 0;
  return (
    <div className="aq-fm-search">
      <div className={`aq-fm-search-box ${open ? 'is-open' : ''}`}>
        <Search size={14} aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={showList}
          aria-controls="aq-fm-search-list"
          aria-label="Search farms, towns, markets or coordinates"
          value={query}
          placeholder="Search farms, towns, markets or 16.73, 95.65"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 140)}
          onKeyDown={handleKey}
        />
        {query ? (
          <button type="button" className="aq-fm-clear" aria-label="Clear search" onMouseDown={(event) => { event.preventDefault(); setQuery(''); }}>
            <X size={13} aria-hidden="true" />
          </button>
        ) : (
          <kbd className="aq-kbd">/</kbd>
        )}
      </div>
      {showList ? (
        <div className="aq-fm-results aq-fm-pop" id="aq-fm-search-list" role="listbox">
          {results.length ? (
            results.map((result, index) => {
              const [Icon, label] = KINDS[result.kind];
              const farmTint = result.kind === 'farm' ? CROPS[data.farmById[result.id].crop].color : null;
              return (
                <button
                  key={result.kind + result.id}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`aq-fm-result ${index === active ? 'is-active' : ''}`}
                  onMouseDown={(event) => { event.preventDefault(); choose(result); }}
                  onMouseEnter={() => setActive(index)}
                >
                  <span className={`aq-fm-result-icon ${farmTint ? 'is-tinted' : ''}`} style={farmTint ? tintStyle(farmTint) : undefined}>
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <span className="aq-fm-result-copy">
                    <span className="aq-fm-result-title">{result.title}</span>
                    <span className="aq-fm-result-sub">{result.sub}</span>
                  </span>
                  <span className="aq-fm-result-kind">{label}</span>
                </button>
              );
            })
          ) : (
            <p className="aq-fm-empty">No farm, town or market matches “{query.trim()}”. Try a town (Maubin, Karawang), a crop (coffee) or a farm code (AQ-VN-0341).</p>
          )}
          <div className="aq-fm-result-help">
            <span><kbd className="aq-kbd">↑</kbd> <kbd className="aq-kbd">↓</kbd> move</span>
            <span><kbd className="aq-kbd">↵</kbd> fly there</span>
            <span><kbd className="aq-kbd">esc</kbd> close</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};
