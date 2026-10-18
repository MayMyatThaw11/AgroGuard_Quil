import React, { useEffect, useRef, useState } from 'react';
import {
  GitFork,
  CloudRain,
  ShieldCheck,
  Cpu,
  Radio,
  CheckCircle2,
  Zap
} from 'lucide-react';
import type { AseanPreset } from '../types';
import { SeasonCalendar } from './SeasonCalendar';

interface WorkflowDAGProps {
  activePreset: AseanPreset;
  onRunWorkflow: () => void;
  workflowRunning: boolean;
  currentDay: number;
  onSelectDay: (day: number) => void;
}

interface DAGStep {
  title: string;
  tag: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBox: string;
  headline: string;
  lines: string[];
  foot: string;
  latency: string;
}

interface DAGNodeCardProps {
  step: DAGStep;
  index: number;
  reached: boolean;
}

const DAGNodeCard: React.FC<DAGNodeCardProps> = ({ step, index, reached }) => {
  const Icon = step.icon;
  return (
    <div
      role="listitem"
      aria-current={reached ? 'step' : undefined}
      className={`p-4 rounded-xl border transition-all duration-200 ${
        reached
          ? 'bg-[var(--surface-raised)] border-[var(--accent)] text-[var(--text-primary)] shadow-sm'
          : 'bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-secondary)] opacity-60'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className={`p-1.5 rounded-lg ${step.iconBox}`}>
            <Icon className="w-4 h-4" />
          </span>
          <span className="font-semibold text-xs text-[var(--text-primary)]">{step.title}</span>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${step.badge}`}>
          {step.tag}
        </span>
      </div>
      <div className="text-[11px] text-[var(--text-primary)] font-medium mb-1">{step.headline}</div>
      <div className="text-[10px] text-[var(--text-tertiary)] leading-tight space-y-1">
        {step.lines.map(line => <div key={line}>{line}</div>)}
      </div>
      <div className="mt-4 pt-2 border-t border-[var(--border-default)] flex items-center justify-between text-[10px]">
        <span className="text-[var(--accent)] flex items-center space-x-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
          <span>{step.foot}</span>
        </span>
        <span className="font-mono text-[var(--text-tertiary)]">{step.latency}</span>
      </div>
    </div>
  );
};

// Illustrative node sequence. No engine runs behind these cards: the timings
// shown are decorative captions, not measurements.
export const WorkflowDAG: React.FC<WorkflowDAGProps> = ({
  activePreset,
  onRunWorkflow,
  workflowRunning,
  currentDay,
  onSelectDay
}) => {
  const [activeStep, setActiveStep] = useState<number>(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    const scheduled = timers.current;
    return () => scheduled.forEach(clearTimeout);
  }, []);

  const handleTestRun = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [
      setTimeout(() => setActiveStep(1), 0),
      setTimeout(() => setActiveStep(2), 600),
      setTimeout(() => setActiveStep(3), 1200),
      setTimeout(() => setActiveStep(4), 1800)
    ];
    onRunWorkflow();
  };

  const steps: DAGStep[] = [
    {
      title: 'Trigger Node',
      tag: 'Example rule',
      badge: 'bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--status-simulated)]',
      icon: CloudRain,
      iconBox: 'bg-[var(--status-simulated)]/10 text-[var(--status-simulated)]',
      headline: 'Meso-Scale Weather Trigger',
      lines: ['Example rule: rainfall above 50 mm / 24 h', 'Source: fixture values, not a forecast feed'],
      foot: 'Example event fired',
      latency: 'illustrative'
    },
    {
      title: 'Condition Node',
      tag: 'Example check',
      badge: 'bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--status-warning)]',
      icon: ShieldCheck,
      iconBox: 'bg-[var(--status-warning)]/10 text-[var(--status-warning)]',
      headline: 'Organic Buffer Sentinel',
      lines: ['Example buffer: 25 m perimeter', 'Not a certification or compliance determination'],
      foot: 'Example check passed',
      latency: 'illustrative'
    },
    {
      title: 'Compute Node',
      tag: 'No solver',
      badge: 'bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--accent)]',
      icon: Cpu,
      iconBox: 'bg-[var(--accent)]/10 text-[var(--accent)]',
      headline: 'Biophysical Solver',
      lines: ['No AquaCrop, Richards or surrogate model is executed', 'No calibration or performance benchmark exists'],
      foot: 'Example step resolved',
      latency: 'not measured'
    },
    {
      title: 'Actuation Node',
      tag: 'Simulated',
      badge: 'bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)]',
      icon: Radio,
      iconBox: 'bg-[var(--surface-hover)] text-[var(--text-primary)]',
      headline: 'LoRa Solenoid Controller',
      lines: ['Simulates an example inflow pulse', 'No hardware is contacted and no interlock is evaluated'],
      foot: 'Simulated only',
      latency: 'illustrative'
    }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--surface-sunken)] p-6 relative overflow-auto select-none font-sans">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border-default)]">
        <div>
          <div className="flex items-center space-x-2 text-[var(--text-primary)] font-bold text-base">
            <GitFork className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
            <span>Farm Simulation Automation Pipeline</span>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Interface illustration of a cyber-physical event-to-actuation pipeline (simulation mode).
          </p>
        </div>

        <button
          type="button"
          onClick={handleTestRun}
          disabled={workflowRunning}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-[var(--accent-strong)] hover:opacity-90 text-[var(--surface-sunken)] font-semibold text-xs shadow-sm transition active:scale-95 focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-50"
        >
          <Zap className="w-4 h-4 fill-current" aria-hidden="true" />
          <span>Play Example Sequence</span>
        </button>
      </div>

      {/* Screen-reader accessible live announcement */}
      <div aria-live="polite" className="sr-only">
        {activeStep > 0 ? `Automation step ${activeStep} of 4: ${steps[activeStep - 1]?.title} running` : 'Automation idle'}
      </div>

      <div className="flex-1 flex items-center justify-center relative min-h-[300px]">
        {/* Restrained same-hue connector line */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none hidden md:block" aria-hidden="true">
          <path
            d="M 220 180 C 320 180, 360 180, 460 180 S 600 180, 720 180 S 860 180, 980 180"
            fill="none"
            stroke="var(--border-default)"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
        </svg>

        <div role="list" aria-label="Pipeline steps" className="grid grid-cols-1 md:grid-cols-4 gap-6 w-full max-w-5xl z-10">
          {steps.map((step, index) => (
            <DAGNodeCard
              key={step.title}
              step={step}
              index={index}
              reached={activeStep >= index + 1}
            />
          ))}
        </div>
      </div>

      <p className="text-[10px] text-[var(--text-tertiary)] text-center mt-4">
        Preset in scope: {activePreset.country} · illustrative template only.
      </p>

      <div className="w-full max-w-5xl mx-auto mt-8">
        <SeasonCalendar
          currentDay={currentDay}
          onSelectDay={onSelectDay}
          presetCountry={activePreset.country}
        />
      </div>
    </div>
  );
};