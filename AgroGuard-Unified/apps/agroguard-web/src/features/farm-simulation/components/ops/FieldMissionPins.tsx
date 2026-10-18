import React from 'react';
import { Bot, CheckCircle, Clock, Navigation, Plane, ShieldAlert, Tractor } from 'lucide-react';
import type { Mission } from '../../lib/fieldMissions.ts';

interface FieldMissionPinsProps {
  missions: readonly Mission[];
  onOpenThread: (id: string) => void;
}

export const FieldMissionPins: React.FC<FieldMissionPinsProps> = ({ missions, onOpenThread }) => {
  if (missions.length === 0) return null;

  return (
    <div className="ops-mission-pins" aria-label="Active field missions and notes">
      {missions.map((mission) => {
        const isCommand = mission.kind === 'command';
        const isDone = mission.phase === 'done';
        const isBlocked = mission.phase === 'blocked';

        return (
          <button
            key={mission.id}
            type="button"
            className={`ops-mission-chip ${isDone ? 'is-done' : isBlocked ? 'is-blocked' : 'is-active'}`}
            onClick={() => onOpenThread(mission.id)}
            title={`View ${mission.label}: ${mission.text}`}
          >
            <span className="ops-mission-chip-tag">{mission.label}</span>
            {isCommand ? (
              mission.machine === 'D-01' ? (
                <Plane size={11} />
              ) : mission.machine === 'R-02' ? (
                <Bot size={11} />
              ) : (
                <Tractor size={11} />
              )
            ) : null}
            <span className="truncate max-w-[120px]">{mission.action ?? mission.text}</span>
            {mission.phase === 'enroute' ? (
              <Navigation size={11} className="text-blue-500 animate-pulse" />
            ) : mission.phase === 'working' ? (
              <Clock size={11} className="text-amber-500 animate-spin" />
            ) : isDone ? (
              <CheckCircle size={11} className="text-emerald-500" />
            ) : isBlocked ? (
              <ShieldAlert size={11} className="text-red-500" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

