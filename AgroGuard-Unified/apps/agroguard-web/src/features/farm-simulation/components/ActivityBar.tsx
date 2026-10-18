import React from 'react';
import {
  FolderTree,
  Globe2,
  GitFork,
  Bot,
  FlaskConical,
  BookOpen,
  User,
  HelpCircle,
  Settings,
  PanelLeftClose,
  Tractor,
  Sprout
} from 'lucide-react';

export type ActivityDestination =
  | 'operations'
  | 'agronomy'
  | 'explorer'
  | 'spatial'
  | 'workflows'
  | 'agents'
  | 'tests'
  | 'knowledge';

export interface ActivityBarProps {
  activeDestination: ActivityDestination;
  onSelectDestination: (dest: ActivityDestination) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  errorCount?: number;
  activityBarOpen?: boolean;
  onToggleActivityBar?: () => void;
  onOpenAccount?: () => void;
  onOpenHelp?: () => void;
  onOpenSettings?: () => void;
  settingsActive?: boolean;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeDestination,
  onSelectDestination,
  sidebarOpen,
  onToggleSidebar,
  errorCount = 0,
  activityBarOpen = true,
  onToggleActivityBar,
  onOpenAccount,
  onOpenHelp,
  onOpenSettings,
  settingsActive = false
}) => {
  const destinations: ReadonlyArray<{
    id: ActivityDestination;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    badgeCount?: number;
  }> = [
    {
      id: 'spatial',
      label: '3D Farm',
      description: '3D farm model: terrain, paddies, canals, robots, sensors, satellite imagery, DEM, soil & weather (⌘2)',
      icon: Globe2
    },
    {
      id: 'operations',
      label: 'Farm map',
      description: 'Farm map: globe to field, live field operations, mixed farming, fleet monitor (⌘0)',
      icon: Tractor
    },
    {
      id: 'agronomy',
      label: 'Agronomy',
      description: 'Crop suggestion and leaf disease detection from AgroGuard',
      icon: Sprout
    },
    {
      id: 'explorer',
      label: 'Explorer',
      description: 'Parcels, scenarios, .agri files, branches, saved runs (⌘1)',
      icon: FolderTree,
      badgeCount: errorCount > 0 ? errorCount : undefined
    },
    {
      id: 'workflows',
      label: 'Workflows',
      description: 'Agent workflow DAG, integrations, triggers, MCP tools (⌘3)',
      icon: GitFork
    },
    {
      id: 'agents',
      label: 'Agents',
      description: 'Farmer agent, planner, irrigation, scout, soil, market, compliance (⌘4)',
      icon: Bot
    },
    {
      id: 'tests',
      label: 'Tests',
      description: 'Simulation tests, integration tests, safety interlocks, replay (⌘5)',
      icon: FlaskConical
    },
    {
      id: 'knowledge',
      label: 'Knowledge',
      description: 'BrainAgroGuard vault, agronomic references, standards, docs (⌘6)',
      icon: BookOpen
    }
  ];

  const handleItemClick = (id: ActivityDestination) => {
    if (activeDestination === id) {
      // Selecting active item collapses or toggles sidebar
      onToggleSidebar();
    } else {
      onSelectDestination(id);
      if (!sidebarOpen && id !== 'operations' && id !== 'agronomy') {
        onToggleSidebar();
      }
    }
  };

  return (
    <aside
      className={`bg-[var(--surface-sunken)] flex flex-col items-center justify-between py-2 select-none z-20 shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
        activityBarOpen
          ? 'w-12 opacity-100 border-r border-[var(--border-default)]'
          : 'w-0 opacity-0 pointer-events-none border-none p-0'
      }`}
      aria-label="Activity Bar"
    >
      <div className="flex flex-col space-y-1 w-full" role="tablist" aria-orientation="vertical">
        {destinations.map((dest) => {
          const Icon = dest.icon;
          const isSelected = activeDestination === dest.id && sidebarOpen;
          return (
            <button
              key={dest.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => handleItemClick(dest.id)}
              className={`relative w-full h-10 flex items-center justify-center transition-colors group focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                isSelected
                  ? 'text-[var(--accent)] bg-[var(--surface-raised)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]'
              }`}
              title={`${dest.label} — ${dest.description}`}
              aria-label={dest.label}
            >
              {isSelected && (
                <div
                  className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--accent)] rounded-r"
                  aria-hidden="true"
                />
              )}
              <Icon className="w-4 h-4" />
              {dest.badgeCount !== undefined && dest.badgeCount > 0 && (
                <span
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--status-error)] ring-2 ring-[var(--surface-sunken)]"
                  aria-label={`${dest.badgeCount} issue`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Auxiliary Actions: Account, Help, Settings, Collapse */}
      <div className="flex flex-col space-y-1 w-full items-center pt-2 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={onOpenAccount}
          className="w-8 h-8 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)] transition focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          title="Account & Operator Profile (Linn Htet Aung)"
          aria-label="Account"
        >
          <User className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onOpenHelp}
          className="w-8 h-8 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)] transition focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          title="Help & Architecture Tour"
          aria-label="Help"
        >
          <HelpCircle className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className={`w-8 h-8 flex items-center justify-center rounded hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)] transition focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${settingsActive ? 'text-[var(--accent)] bg-[var(--accent-subtle)]' : 'text-[var(--text-tertiary)]'}`}
          title="Paddy settings"
          aria-label="Settings"
          aria-pressed={settingsActive}
        >
          <Settings className="w-4 h-4" aria-hidden="true" />
        </button>

        {onToggleActivityBar && (
          <button
            type="button"
            onClick={onToggleActivityBar}
            className="w-8 h-8 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)] transition focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            title="Collapse Activity Bar (Hide Rail)"
            aria-label="Collapse Activity Bar"
          >
            <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </aside>
  );
};
