import React from 'react';
import {
  PanelLeft,
  PanelRight,
  ListVideo,
  Globe2,
  CalendarDays,
  Sliders
} from 'lucide-react';
import { getGrowthStage, SEASON_DAYS } from '../lib/metrics';

export interface WorkspaceStripProps {
  readonly activeView: string;
  readonly activeFile: string;
  readonly presetCountry: string;
  readonly presetCrop: string;
  readonly scenarioLabel: string;
  readonly currentDay: number;
  readonly isSimulating: boolean;
  readonly sidebarOpen: boolean;
  readonly inspectorOpen: boolean;
  readonly timelineOpen: boolean;
  readonly activityBarOpen?: boolean;
  readonly onToggleSidebar: () => void;
  readonly onToggleInspector: () => void;
  readonly onToggleTimeline: () => void;
  readonly onToggleActivityBar?: () => void;
}

/**
 * Contextual workflow strip above the canvas.
 *
 * Carries the facts the operator needs while working the field: which parcel
 * file is active, which preset and review scenario apply, and which example
 * replay day is selected. The three panel toggles relocate existing panels
 * into a collapsed state instead of deleting them; the scene renderer,
 * simulation state and ledger are untouched by this strip.
 */
export const WorkspaceStrip: React.FC<WorkspaceStripProps> = ({
  activeView,
  activeFile,
  presetCountry,
  presetCrop,
  scenarioLabel,
  currentDay,
  isSimulating,
  sidebarOpen,
  inspectorOpen,
  timelineOpen,
  activityBarOpen = true,
  onToggleSidebar,
  onToggleInspector,
  onToggleTimeline,
  onToggleActivityBar
}) => {
  return (
    <div className="workspace-strip" role="region" aria-label="Workspace context">
      <div className="workspace-strip-group">
        {onToggleActivityBar && (
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onToggleActivityBar}
            aria-pressed={activityBarOpen}
            title={activityBarOpen ? 'Collapse activity rail' : 'Expand activity rail'}
            aria-label={activityBarOpen ? 'Collapse activity rail' : 'Expand activity rail'}
          >
            <Sliders size={13} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onToggleSidebar}
          aria-pressed={sidebarOpen}
          title={sidebarOpen ? 'Collapse explorer panel' : 'Expand explorer panel'}
          aria-label={sidebarOpen ? 'Collapse explorer panel' : 'Expand explorer panel'}
        >
          <PanelLeft size={14} aria-hidden="true" />
        </button>
        <span className="workspace-strip-crumb" title="Active parcel file">
          <Globe2 size={12} aria-hidden="true" />
          <span className="workspace-strip-file" translate="no">
            parcels/{activeFile}
          </span>
        </span>
      </div>

      <div className="workspace-strip-meta" aria-live="off">
        <span className="workspace-strip-chip" title="Active enterprise preset">
          {presetCountry} · {presetCrop}
        </span>
        <span className="workspace-strip-chip" title="Review scenario">
          Scenario&nbsp;<strong translate="no">{scenarioLabel}</strong>
        </span>
        <span className="workspace-strip-chip" title="Example replay position">
          <CalendarDays size={12} aria-hidden="true" />
          Day {currentDay}/{SEASON_DAYS} · {getGrowthStage(currentDay)}
          {isSimulating ? ' · replaying' : ''}
        </span>
        <span className="workspace-strip-view" title="Active workspace view">
          {activeView}
        </span>
      </div>

      <div className="workspace-strip-group">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onToggleTimeline}
          aria-pressed={timelineOpen}
          title={timelineOpen ? 'Collapse timeline to a slim scrubber' : 'Expand full timeline dock'}
          aria-label={timelineOpen ? 'Collapse timeline to a slim scrubber' : 'Expand full timeline dock'}
        >
          <ListVideo size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onToggleInspector}
          aria-pressed={inspectorOpen}
          title={inspectorOpen ? 'Collapse inspector panel' : 'Expand inspector panel'}
          aria-label={inspectorOpen ? 'Collapse inspector panel' : 'Expand inspector panel'}
        >
          <PanelRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
