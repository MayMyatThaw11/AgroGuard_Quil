import React from 'react';
import { Compass, X, ArrowRight } from 'lucide-react';

interface IntuitiveTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuickDemo: () => void;
}

export const IntuitiveTourModal: React.FC<IntuitiveTourModalProps> = ({
  isOpen,
  onClose,
  onQuickDemo
}) => {
  if (!isOpen) return null;

  const steps: Array<[string, string, string, string]> = [
    [
      '1',
      'bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/30',
      'Eleven Regional Templates (Top Bar)',
      'Switch between the country templates in the header dropdown or the Presets rail. Each is an interface fixture.'
    ],
    [
      '2',
      'bg-[var(--status-error-bg)] text-[var(--status-error)] border border-[var(--status-error)]/30',
      'Example Input Warning and Token Fix',
      'The editor flags the literal string synthetic_urea. This is a text search, not a compliance rule.'
    ],
    [
      '3',
      'bg-[var(--status-simulated-bg)] text-[var(--status-simulated)] border border-[var(--status-simulated)]/30',
      'Canvas Layers and Six Depth Cards',
      'Toggle the example layer gradients and select a depth card. All values come from the preset file.'
    ],
    [
      '4',
      'bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border-default)]',
      '120-Day Replay Scrubber (Bottom)',
      'Drag the slider or press play. The day counter drives every visible example value in the app.'
    ]
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick tour"
        className="w-full max-w-lg bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden p-6 relative"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tour"
          className="absolute top-4 right-4 text-[var(--text-tertiary)] hover:text-white transition focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded p-1"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="flex items-center space-x-2 text-[var(--accent)] font-semibold text-sm mb-1">
          <Compass className="w-4 h-4" aria-hidden="true" />
          <span>Quick Tour</span>
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight mb-2">
          Welcome to Farm Simulation
        </h2>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-6">
          An interface prototype. Every number on screen is a fixture, every reply is a fixed string, and
          no satellite, weather, soil, model or device connection exists.
        </p>

        <div className="space-y-3 mb-6 text-xs">
          {steps.map(([index, chipClass, title, body]) => (
            <div key={index} className="flex items-start space-x-3 p-2.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)]">
              <span className={`p-1.5 rounded-md font-bold font-mono text-[11px] shrink-0 ${chipClass}`}>{index}</span>
              <div>
                <div className="font-semibold text-[var(--text-primary)]">{title}</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">{body}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-primary)] text-xs font-semibold transition border border-[var(--border-default)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            Explore on My Own
          </button>
          <button
            type="button"
            onClick={() => {
              onQuickDemo();
              onClose();
            }}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-[var(--accent-strong)] hover:opacity-90 text-[var(--surface-sunken)] text-xs font-semibold shadow-sm transition active:scale-95 focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            <span>Start Example Replay</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};