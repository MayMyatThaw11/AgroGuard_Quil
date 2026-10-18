import React from 'react';
import { Play, Pause, Square } from 'lucide-react';
import { getGrowthStage, SEASON_DAYS } from '../../lib/metrics';

interface TransportPillProps {
  readonly currentDay: number;
  readonly isSimulating: boolean;
  readonly onToggleSimulate: () => void;
  readonly onStopReplay: () => void;
}

/**
 * Floating transport pill over the canvas bottom edge.
 *
 * Mirrors the dock scrubber through the same shared day state, so the two
 * can never disagree. Same pill language as the action rail.
 */
export const TransportPill: React.FC<TransportPillProps> = ({
  currentDay,
  isSimulating,
  onToggleSimulate,
  onStopReplay
}) => {
  return (
    <div className="transport-pill" role="toolbar" aria-label="Replay transport">
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
      <span className="transport-pill-day" aria-live="polite">
        Day {currentDay}/{SEASON_DAYS} · {getGrowthStage(currentDay)}
      </span>
    </div>
  );
};
