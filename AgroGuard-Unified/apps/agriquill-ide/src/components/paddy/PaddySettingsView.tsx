import React, { useCallback, useMemo, useState } from 'react';
import { OPS_FARM, buildForecastWeather, buildHistory, todayUtc } from '../../data/ops/fixture.ts';
import { planOperations } from '../../lib/api.ts';
import { ApiError, isSignInNeeded, writeErrorText } from '../../lib/apiError.ts';
import { buildOpsPlanRequest } from '../../lib/opsPayload.ts';
import {
  THRESHOLDS,
  THRESHOLD_GROUPS,
  effectiveFromPlan,
  toOverrides,
  type ThresholdGroupId,
} from '../../lib/paddySettings.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';
import { useOpsStore } from '../../store/opsStore.ts';
import { dirtyKeys, usePaddySettingsStore } from '../../store/paddySettingsStore.ts';
import { ApplyBanner } from './ApplyBanner.tsx';
import { PaddyGroupNav } from './PaddyGroupNav.tsx';
import { PaddySaveBar } from './PaddySaveBar.tsx';
import { PaddySettingsHeader } from './PaddySettingsHeader.tsx';
import { ResetAllDialog } from './ResetAllDialog.tsx';
import { ThresholdGroupForm } from './ThresholdGroupForm.tsx';
import { ThresholdPreviewCard } from './ThresholdPreviewCard.tsx';
import { useOpsFarm } from '../ops/useOpsFarm.ts';

const ID_PREFIX = 'aq-paddy';

function selectedFarm(): string {
  return new URLSearchParams(window.location.search).get('farm') || OPS_FARM.id;
}

export const PaddySettingsView: React.FC<{ onBack: () => void; farmId?: string }> = ({ onBack, farmId }) => {
  const id = farmId ?? selectedFarm();
  const choice = useOpsFarm(id, id !== OPS_FARM.id);
  const farm = choice.farm;
  const store = usePaddySettingsStore();
  const plan = useOpsStore((s) => s.plan);
  const setPlan = useOpsStore((s) => s.setPlan);
  const [activeGroup, setActiveGroup] = useState<ThresholdGroupId>('water');

  const start = useMemo(todayUtc, []);
  const history = useMemo(() => (farm ? buildHistory(farm, start) : null), [farm, start]);
  const forecastWeather = useMemo(() => buildForecastWeather(), []);

  const dirty = dirtyKeys(store.applied, store.draft);
  const errorCount = store.issues.filter((entry) => entry.level === 'error').length;
  const dirtyCounts = useMemo(() => {
    const counts: Record<ThresholdGroupId, number> = { water: 0, weather: 0, harvest: 0, wind: 0, salinity: 0 };
    for (const key of dirty) {
      const group = THRESHOLDS.find((entry) => entry.key === key)?.group;
      if (group) counts[group] += 1;
    }
    return counts;
  }, [dirty]);

  const activeMeta = THRESHOLD_GROUPS.find((group) => group.id === activeGroup) ?? THRESHOLD_GROUPS[0];
  const effective = effectiveFromPlan(plan?.thresholds);
  const usesDefaults = Object.keys(toOverrides(store.applied)).length === 0;

  const handleApply = useCallback(() => {
    if (!farm || !history) return;
    void usePaddySettingsStore.getState().apply({
      requestPlan: (overrides) =>
        planOperations(buildOpsPlanRequest({ farm, start, history, forecastWeather, overrides })).catch((err: unknown) => {
          throw isSignInNeeded(err) ? new ApiError(writeErrorText(err, ''), err.status) : err;
        }),
      storage: browserStorage(),
      onPlan: setPlan,
    });
  }, [farm, start, history, forecastWeather, setPlan]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && !store.resetDialogOpen) onBack();
  };

  return (
    <div className="aq-root" onKeyDown={handleKeyDown}>
      <div className="aq-page">
        <PaddySettingsHeader onBack={onBack} farm={farm} fixture={choice.farm !== null && choice.fixture} />
        {choice.farm === null ? (
          <div className={`aq-alert ${choice.loading ? 'is-warning' : 'is-error'}`} role={choice.loading ? 'status' : 'alert'}>
            <span>{choice.message}</span>
          </div>
        ) : null}
        <ApplyBanner
          status={store.applyStatus}
          error={store.applyError}
          taskCount={store.lastTaskCount}
          storageOk={store.storageOk}
        />
        {farm ? (
          <div className="aq-layout">
            <PaddyGroupNav
              groups={THRESHOLD_GROUPS}
              active={activeGroup}
              dirtyCounts={dirtyCounts}
              idPrefix={ID_PREFIX}
              onSelect={setActiveGroup}
            />
            <ThresholdGroupForm
              group={activeMeta}
              values={store.draft}
              issues={store.issues}
              panelId={`${ID_PREFIX}-panel`}
              tabId={`${ID_PREFIX}-tab-${activeMeta.id}`}
              onChange={store.setDraftValue}
              onReset={store.resetField}
              onResetGroup={() => store.resetGroup(activeMeta.id)}
            />
            <div className="aq-aside">
              <ThresholdPreviewCard
                draft={store.draft}
                effective={effective}
                hasPlan={plan !== null}
                usesDefaults={usesDefaults}
              />
            </div>
          </div>
        ) : null}
        {farm && dirty.length > 0 ? (
          <PaddySaveBar
            dirtyCount={dirty.length}
            errorCount={errorCount}
            applying={store.applyStatus === 'applying'}
            onDiscard={store.discard}
            onResetAll={store.requestResetAll}
            onApply={handleApply}
          />
        ) : null}
      </div>
      {store.resetDialogOpen ? <ResetAllDialog onCancel={store.cancelResetAll} onConfirm={store.confirmResetAll} /> : null}
    </div>
  );
};
