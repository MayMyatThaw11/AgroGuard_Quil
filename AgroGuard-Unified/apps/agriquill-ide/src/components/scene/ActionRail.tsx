import React, { useState } from 'react';
import {
  Satellite,
  Sprout,
  RadioTower,
  Play,
  Pause,
  Square,
  Command,
  Radio,
  RefreshCw,
  ChevronDown,
  Sliders
} from 'lucide-react';

interface ActionRailProps {
  readonly isSimulating: boolean;
  readonly isFetchingData: boolean;
  readonly onFetchSatellite: () => void;
  readonly onToggleSimulate: () => void;
  readonly onStopReplay: () => void;
  readonly onOpenView: (view: string) => void;
  readonly onOpenPalette: () => void;
}

/**
 * Floating action rail over the field canvas.
 *
 * Restrained pill with icon buttons, hairline dividers, and hideable state.
 */
export const ActionRail: React.FC<ActionRailProps> = ({
  isSimulating,
  isFetchingData,
  onFetchSatellite,
  onToggleSimulate,
  onStopReplay,
  onOpenView,
  onOpenPalette
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="action-rail action-rail-collapsed" role="toolbar" aria-label="Field actions minimized">
        <button
          type="button"
          className="action-rail-btn"
          onClick={() => setCollapsed(false)}
          title="Expand field action toolbar"
          aria-label="Expand field action toolbar"
        >
          <Sliders size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="action-rail" role="toolbar" aria-label="Field actions">
      <button
        type="button"
        className="action-rail-btn"
        onClick={onFetchSatellite}
        disabled={isFetchingData}
        title="Fetch territory profile from the backend (example fixtures while offline)"
        aria-label="Fetch territory profile from the backend"
      >
        {isFetchingData
          ? <RefreshCw size={15} aria-hidden="true" className="spin" />
          : <Satellite size={15} aria-hidden="true" />}
      </button>

      <div className="action-rail-divider" aria-hidden="true" />

      <button
        type="button"
        className="action-rail-btn"
        onClick={() => onOpenView('presets')}
        title="Choose a crop template from the 11 ASEAN presets"
        aria-label="Choose a crop template from the presets"
      >
        <Sprout size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="action-rail-btn"
        onClick={() => onOpenView('mcp')}
        title="Open the MCP actuator sandbox (simulated devices only — no real device is connected)"
        aria-label="Open the MCP actuator sandbox"
      >
        <RadioTower size={15} aria-hidden="true" />
      </button>

      <div className="action-rail-divider" aria-hidden="true" />

      <button
        type="button"
        className="action-rail-btn"
        onClick={onToggleSimulate}
        aria-pressed={isSimulating}
        title={isSimulating ? 'Pause the season replay (state is preserved)' : 'Play the 120-day example replay'}
        aria-label={isSimulating ? 'Pause the season replay' : 'Play the season replay'}
      >
        {isSimulating
          ? <Pause size={15} aria-hidden="true" className="fill-current" />
          : <Play size={15} aria-hidden="true" className="fill-current" />}
      </button>
      <button
        type="button"
        className="action-rail-btn"
        onClick={onStopReplay}
        title="Stop the replay and return to day 1"
        aria-label="Stop the replay and return to day 1"
      >
        <Square size={14} aria-hidden="true" className="fill-current" />
      </button>

      <div className="action-rail-divider" aria-hidden="true" />

      <button
        type="button"
        className="action-rail-btn"
        onClick={() => onOpenView('mcp')}
        title="Open MCP and API controls"
        aria-label="Open MCP and API controls"
      >
        <Radio size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="action-rail-btn"
        onClick={onOpenPalette}
        title="Open the command palette"
        aria-label="Open the command palette"
      >
        <Command size={15} aria-hidden="true" />
      </button>

      <div className="action-rail-divider" aria-hidden="true" />

      <button
        type="button"
        className="action-rail-btn"
        onClick={() => setCollapsed(true)}
        title="Hide / minimize field toolbar"
        aria-label="Hide / minimize field toolbar"
      >
        <ChevronDown size={14} aria-hidden="true" />
      </button>
    </div>
  );
};
