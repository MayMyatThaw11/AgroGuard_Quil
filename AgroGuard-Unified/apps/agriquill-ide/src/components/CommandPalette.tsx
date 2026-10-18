import React, { useEffect, useRef, useState } from 'react';
import { Search, Play, Satellite, ShieldCheck, Columns, Globe, GitFork, BookOpen, Compass, Tractor, SlidersHorizontal, Terminal, LayoutGrid, Map, Workflow, Sprout } from 'lucide-react';
import type { AseanPreset } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  presets: AseanPreset[];
  onSelectPreset: (preset: AseanPreset) => void;
  onSimulate: () => void;
  onFetchSatellite: () => void;
  onFixLint: () => void;
  onSetActiveView: (view: string) => void;
  onOpenTerminal: () => void;
  onToggleSplit: () => void;
  isSplitView: boolean;
}

export const CommandPalette: React.FC<CommandPaletteProps> = props => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!props.isOpen) return;
    restoreFocus.current = document.activeElement as HTMLElement;
    setQuery('');
    setSelected(0);
    input.current?.focus();
    return () => restoreFocus.current?.focus();
  }, [props.isOpen]);

  const items = [
    { title: 'Open farm operations', icon: Tractor, run: () => props.onSetActiveView('ops') },
    { title: 'Open crop suggestion and disease detection', icon: Sprout, run: () => props.onSetActiveView('agronomy') },
    { title: 'Open fleet monitor', icon: LayoutGrid, run: () => props.onSetActiveView('fleet') },
    { title: 'Open ASEAN farm map', icon: Map, run: () => props.onSetActiveView('farm-map') },
    { title: 'Open practice plans and crop protection', icon: Workflow, run: () => props.onSetActiveView('twin') },
    { title: 'Open paddy settings', icon: SlidersHorizontal, run: () => props.onSetActiveView('paddy-settings') },
    { title: 'Open terminal output', icon: Terminal, run: props.onOpenTerminal },
    { title: 'Replay example season', icon: Play, run: props.onSimulate },
    { title: 'Load example data', icon: Satellite, run: props.onFetchSatellite },
    { title: 'Apply example input fix', icon: ShieldCheck, run: props.onFixLint },
    { title: props.isSplitView ? 'Focus one panel' : 'Split code and canvas', icon: Columns, run: props.onToggleSplit },
    { title: 'Open field canvas', icon: Globe, run: () => props.onSetActiveView('spatial') },
    { title: 'Open FastMCP edge actuators', icon: Satellite, run: () => props.onSetActiveView('mcp') },
    { title: 'Open decision ledger', icon: GitFork, run: () => props.onSetActiveView('ledger') },
    { title: 'Open parcel editor', icon: BookOpen, run: () => props.onSetActiveView('editor') },
    { title: 'Open workflow', icon: GitFork, run: () => props.onSetActiveView('workflow') },
    { title: 'Open knowledge vault', icon: BookOpen, run: () => props.onSetActiveView('vault') },
    ...props.presets.map(p => ({
      title: `Open ${p.country} template: ${p.crop}`,
      icon: Compass, run: () => props.onSelectPreset(p)
    }))
  ].filter(item => item.title.toLowerCase().includes(query.toLowerCase()));

  // Keep the highlighted row inside the filtered result set.
  const activeIndex = items.length === 0 ? 0 : Math.min(selected, items.length - 1);

  const choose = (index: number) => {
    items[index]?.run();
    if (items[index]) props.onClose();
  };

  if (!props.isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-start p-4 pt-20"
      onMouseDown={event => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); props.onClose(); }
          if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(i => Math.min(i + 1, items.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(i => Math.max(i - 1, 0)); }
          if (event.key === 'Enter') { event.preventDefault(); choose(activeIndex); }
          if (event.key === 'Tab') { event.preventDefault(); input.current?.focus(); }
        }}
      >
        <div className="flex gap-3 p-3.5 border-b border-[var(--border-default)] items-center">
          <Search size={18} className="text-[var(--text-secondary)] shrink-0" aria-hidden="true" />
          <input
            ref={input}
            aria-label="Search commands"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={items[activeIndex] ? `command-${activeIndex}` : undefined}
            className="flex-1 min-w-0 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] border-0 ring-0 focus:ring-0"
            value={query}
            placeholder="Search actions or regional templates"
            onChange={event => { setQuery(event.target.value); setSelected(0); }}
          />
          <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-hover)] border border-[var(--border-default)] text-[var(--text-secondary)]">Esc</kbd>
        </div>
        <div role="listbox" id="command-results" className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
          {items.map((item, index) => {
            const Icon = item.icon;
            const isSelected = activeIndex === index;
            return (
              <button
                type="button"
                id={`command-${index}`}
                role="option"
                aria-selected={isSelected}
                key={item.title}
                onMouseEnter={() => setSelected(index)}
                onClick={() => choose(index)}
                className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-xs transition-colors ${
                  isSelected
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                    : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
                ref={element => {
                  if (element && isSelected) element.scrollIntoView({ block: 'nearest' });
                }}
              >
                <Icon size={16} className={isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'} aria-hidden="true" />
                <span className="truncate">{item.title}</span>
              </button>
            );
          })}
          {!items.length && <p className="p-4 text-sm text-[var(--text-secondary)]">No matching commands.</p>}
        </div>
        <footer className="p-2.5 px-3.5 text-xs text-[var(--text-secondary)] border-t border-[var(--border-default)] font-mono text-[11px]">
          Up / Down to navigate · Enter to select · Esc to dismiss
        </footer>
      </section>
    </div>
  );
};