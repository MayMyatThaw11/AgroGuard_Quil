import React, { useRef } from 'react';
import { FileCode, AlertCircle } from 'lucide-react';
import type { AseanPreset } from '../types';
import { useContractLint } from '../lib/useContractLint.ts';

interface CodeEditorProps {
  activePreset: AseanPreset;
  hasLintError: boolean;
  onFixLint: () => void;
  codeText: string;
  setCodeText: (text: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  activePreset, hasLintError, onFixLint, codeText, setCodeText
}) => {
  const gutter = useRef<HTMLDivElement>(null);
  const lint = useContractLint(codeText);
  const lines = codeText.split('\n');
  const lineCount = lines.length;
  const flaggedLine = lines.findIndex(line =>
    !line.trim().startsWith('//') && line.includes('synthetic_urea')
  ) + 1;
  const errorLines = new Set(lint.diagnostics.filter(d => d.severity === 'ERROR').map(d => d.line));
  const shown = lint.diagnostics.slice(0, 6);

  return (
    <section className="flex-1 min-h-0 min-w-0 flex flex-col bg-[var(--surface-base)]" aria-label="Scenario source editor">
      <div className="h-10 shrink-0 flex items-center gap-2 px-3 border-b border-[var(--border-default)]">
        <FileCode size={16} className="text-[var(--accent)]" aria-hidden="true" />
        <span className="text-xs truncate text-[var(--text-primary)]">{activePreset.id}_field_01.agri</span>
        <span className="ml-auto text-xs text-[var(--text-secondary)] font-mono">
          {lint.status === 'ready'
            ? 'Contract verifier'
            : lint.status === 'checking'
              ? 'Verifying'
              : 'Verifier offline: local token check only'}
        </span>
      </div>
      {hasLintError && (
        <div className="flex items-center gap-2 p-3 text-xs border-b border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)] text-[var(--text-primary)]">
          <AlertCircle size={16} className="text-[var(--status-warning)] shrink-0" aria-hidden="true" />
          <span className="flex-1">Demo rule: review the example input at line {flaggedLine}.</span>
          <button
            type="button"
            className="rounded-md bg-[var(--surface-active)] hover:bg-[var(--surface-hover)] border border-[var(--border-default)] px-2.5 py-1 text-xs transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            onClick={onFixLint}
          >
            Apply example fix
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          ref={gutter}
          aria-hidden="true"
          className="w-12 shrink-0 overflow-hidden py-3 text-right pr-3 text-[var(--text-tertiary)] font-mono-code text-xs leading-6 select-none"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i}
              className={i + 1 === flaggedLine || errorLines.has(i + 1) ? 'text-[var(--status-error)] font-semibold' : undefined}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          aria-label="Edit agricultural scenario source"
          value={codeText}
          spellCheck={false}
          wrap="off"
          onScroll={event => {
            if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
          }}
          onChange={event => setCodeText(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Tab') return;
            event.preventDefault();
            const input = event.currentTarget;
            const start = input.selectionStart;
            const end = input.selectionEnd;
            setCodeText(codeText.slice(0, start) + '    ' + codeText.slice(end));
            requestAnimationFrame(() => input.setSelectionRange(start + 4, start + 4));
          }}
          className="flex-1 min-w-0 resize-none bg-transparent py-3 px-3 font-mono-code text-xs leading-6 text-[var(--text-primary)] border-0 ring-0 focus:ring-0"
        />
      </div>
      {shown.length > 0 && (
        <ul className="shrink-0 max-h-40 overflow-auto border-t border-[var(--border-default)] px-3 py-2 text-xs space-y-1" aria-label="Contract diagnostics">
          {shown.map(d => (
            <li key={`${d.code}-${d.line}-${d.column}-${d.message}`} className="flex gap-2">
              <span className={d.severity === 'ERROR' ? 'text-[var(--status-error)] font-semibold' : 'text-[var(--status-warning)] font-semibold'}>
                {d.code}
              </span>
              <span className="text-[var(--text-secondary)]">L{d.line}</span>
              <span className="text-[var(--text-primary)]">{d.message}</span>
            </li>
          ))}
          {lint.diagnostics.length > shown.length && (
            <li className="text-[var(--text-secondary)]">{lint.diagnostics.length - shown.length} more</li>
          )}
        </ul>
      )}
      <div className="shrink-0 border-t border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-secondary)] font-mono text-[11px]">
        {lineCount} lines · UTF-8 · Changes in memory (simulation sandbox)
      </div>
    </section>
  );
};