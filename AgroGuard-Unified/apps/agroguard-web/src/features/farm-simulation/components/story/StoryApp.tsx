import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FarmOpsView } from '../ops/FarmOpsView.tsx';
import { getLedger } from '../../lib/api.ts';
import { saveCamera } from '../../lib/farmmap/farmMapStorage.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';
import { activeSession, currentSession } from '../../lib/session.ts';
import { STORY, STORY_FARM, STORY_TAG, type StoryStep, type StoryView } from '../../lib/story.ts';
import { useOpsStore } from '../../store/opsStore.ts';

const FarmMapView = lazy(() => import('../farmmap/FarmMapView.tsx').then((m) => ({ default: m.FarmMapView })));

const STEP_KEYS: Record<string, 1 | -1> = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 };

function prepareCamera(step: StoryStep) {
  if (step.camera) saveCamera(browserStorage(), step.camera);
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

const LedgerProof: React.FC = () => {
  const [text, setText] = useState('Reading the record chain');
  useEffect(() => {
    let live = true;
    getLedger()
      .then((l) => live && setText(`${l.entries.length.toLocaleString('en-US')} records · chain ${l.valid ? 'verified' : 'failed verification'}`))
      .catch(() => live && setText('Record service offline: start the API to show the chain'));
    return () => {
      live = false;
    };
  }, []);
  return (
    <p className="story-live" role="status">
      {text}
    </p>
  );
};

export const StoryApp: React.FC = () => {
  const [index, setIndex] = useState(() => {
    prepareCamera(STORY[0]);
    return 0;
  });
  const [view, setView] = useState<StoryView>(STORY[0].view);
  const [farmId, setFarmId] = useState(STORY_FARM);
  const [readOnly, setReadOnly] = useState(() => activeSession() === null);
  const step = STORY[index];
  const last = index === STORY.length - 1;

  useEffect(() => {
    let live = true;
    currentSession()
      .then((session) => live && setReadOnly(session === null))
      .catch(() => live && setReadOnly(true));
    return () => {
      live = false;
    };
  }, []);

  const go = (next: number) => {
    const i = Math.max(0, Math.min(STORY.length - 1, next));
    if (STORY[i].view === 'map' && view !== 'map') prepareCamera(STORY[i]);
    if (STORY[i].view === 'field') {
      const paddy = STORY[i].paddy;
      useOpsStore.setState({ ground: 'map', selection: paddy ? { kind: 'paddy', id: paddy } : null });
    }
    setIndex(i);
    setView(STORY[i].view);
  };

  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    onKeyRef.current = (e) => {
      const delta = STEP_KEYS[e.key];
      if (!delta || isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      go(index + delta);
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="story-root">
      <div className="story-stage">
        {view === 'map' && (
          <Suspense fallback={<div className="aq-root aq-farmmap-loading" role="status">Loading the farm map</div>}>
            <FarmMapView
              onOpenFleet={() => setView('field')}
              onOpenOps={(id) => {
                setFarmId(id);
                setView('field');
              }}
            />
          </Suspense>
        )}
        {view === 'field' && <FarmOpsView farmId={farmId} onBack={() => setView('map')} readOnly={readOnly} />}
        {view === 'phone' && (
          <div className="story-phone-stage">
            <iframe
              className="story-phone"
              title="Farm Simulation field app on a phone"
              src={`?field&farm=${encodeURIComponent(farmId)}`}
              onLoad={(e) => e.currentTarget.contentWindow?.addEventListener('keydown', (k) => onKeyRef.current(k), true)}
            />
          </div>
        )}
      </div>
      <section className="story-band" aria-live="polite" aria-label="Pitch story">
        <div className="story-copy">
          <p className="story-tag">{STORY_TAG}</p>
          <p className="story-kicker">{step.kicker}</p>
          <h1 className="story-headline">{step.headline}</h1>
          <p className="story-line">{step.line}</p>
          {step.live === 'ledger' ? <LedgerProof /> : null}
          {step.sources.length ? (
            <p className="story-sources">
              Sources:{' '}
              {step.sources.map((s, i) => (
                <React.Fragment key={s.label}>
                  {i ? ' · ' : ''}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.label}
                    </a>
                  ) : (
                    s.label
                  )}
                </React.Fragment>
              ))}
            </p>
          ) : null}
          {last ? (
            <div className="story-cta">
              <a className="story-cta-primary" href={window.location.pathname}>
                {readOnly ? 'Sign in' : 'Open Farm Simulation'}
              </a>
              <a className="story-cta-secondary" href={window.location.pathname}>
                Bring your farm
              </a>
              {readOnly ? (
                <p className="story-cta-note">
                  This demo is read-only. Sign in to approve, record, or bring your own field outlines and records.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <nav className="story-nav" aria-label="Story steps">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous step">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <span className="story-count">
            {index + 1} / {STORY.length}
          </span>
          <button type="button" onClick={() => go(index + 1)} disabled={index === STORY.length - 1} aria-label="Next step">
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </nav>
      </section>
    </div>
  );
};
