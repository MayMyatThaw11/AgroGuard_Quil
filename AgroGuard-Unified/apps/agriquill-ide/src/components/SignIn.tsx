import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Fingerprint, Loader2, Moon, ShieldCheck, Sprout, Sun, UserCheck } from 'lucide-react';
import { getContract, getLedger, getTerritoryProfile } from '../lib/api.ts';
import { ApiError } from '../lib/apiError.ts';
import { signIn } from '../lib/session.ts';
import { demoField, ledgerFact, svgPaddies, weatherLine, type DemoField, type LedgerFact } from '../lib/signinField.ts';
import { STORY_FARM } from '../lib/story.ts';
import { useTheme } from '../lib/useTheme.ts';

const SignInMap = lazy(() => import('./SignInField.tsx').then((module) => ({ default: module.SignInMap })));

const SKETCH_W = 800;
const SKETCH_H = 600;
const CONTACT: string = (import.meta.env?.VITE_TRIAL_CONTACT ?? '').trim();

type Fact<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'missing'; reason: string };

const LOADING = { state: 'loading' } as const;

function reasonOf(err: unknown): string {
  if (err instanceof ApiError) return err.status === 404 ? 'not found on the farm service' : err.message;
  return 'farm service offline';
}

const PROOF = [
  { icon: ShieldCheck, text: 'Weather and buyer rules checked before every job' },
  { icon: UserCheck, text: 'A named person says yes before anything moves' },
  { icon: Fingerprint, text: 'A record chain of what was measured and approved' },
];

const FieldSketch: React.FC<{ field: DemoField | null }> = ({ field }) => {
  const shapes = useMemo(() => (field ? svgPaddies(field.paddies, SKETCH_W, SKETCH_H, 150) : []), [field]);
  return (
    <svg className="si-sketch" viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="si-ground" cx="42%" cy="46%" r="75%">
          <stop offset="0%" stopColor="#173322" />
          <stop offset="60%" stopColor="#0d1a12" />
          <stop offset="100%" stopColor="#070c09" />
        </radialGradient>
        <pattern id="si-rows" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
          <line x1="0" y1="0" x2="0" y2="9" stroke="#2f6b45" strokeOpacity="0.28" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={SKETCH_W} height={SKETCH_H} fill="url(#si-ground)" />
      <rect width={SKETCH_W} height={SKETCH_H} fill="url(#si-rows)" />
      {shapes.map((shape) => (
        <g key={shape.id}>
          <path d={shape.d} className="si-sketch-paddy" />
          <text x={shape.cx} y={shape.cy} className="si-sketch-label" textAnchor="middle" dominantBaseline="middle">
            {shape.id}
          </text>
        </g>
      ))}
    </svg>
  );
};

const FactRow: React.FC<{ label: string; fact: Fact<string>; source?: string; warn?: boolean }> = ({ label, fact, source, warn = false }) => (
  <div className={`si-fact${fact.state === 'ok' && warn ? ' is-warn' : ''}${fact.state === 'missing' ? ' is-missing' : ''}`}>
    <dt>{label}</dt>
    <dd aria-live="polite">
      {fact.state === 'loading' ? <span className="si-fact-wait">Reading</span> : fact.state === 'ok' ? fact.value : `Unavailable · ${fact.reason}`}
    </dd>
    {source && fact.state === 'ok' ? <small>{source}</small> : null}
  </div>
);

export const SignIn: React.FC<{ onSignedIn: () => void }> = ({ onSignedIn }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState<Fact<DemoField>>(LOADING);
  const [weather, setWeather] = useState<Fact<string>>(LOADING);
  const [ledger, setLedger] = useState<Fact<LedgerFact>>(LOADING);
  const [map, setMap] = useState<'loading' | 'ready' | 'failed'>('loading');
  const { theme, toggle } = useTheme();

  useEffect(() => {
    let live = true;
    getContract(STORY_FARM)
      .then((res) => {
        const parsed = demoField(res.contract);
        if (live) setField(parsed ? { state: 'ok', value: parsed } : { state: 'missing', reason: 'the demo contract has no farm block' });
      })
      .catch((err: unknown) => live && setField({ state: 'missing', reason: reasonOf(err) }));
    getLedger()
      .then((res) => live && setLedger({ state: 'ok', value: ledgerFact(res) }))
      .catch((err: unknown) => live && setLedger({ state: 'missing', reason: reasonOf(err) }));
    return () => {
      live = false;
    };
  }, []);

  const location = field.state === 'ok' ? field.value.location : null;

  useEffect(() => {
    if (field.state === 'loading') return undefined;
    if (!location) {
      setWeather({ state: 'missing', reason: field.state === 'missing' ? field.reason : 'the farm has no location' });
      return undefined;
    }
    let live = true;
    getTerritoryProfile(location[1], location[0])
      .then((res) => {
        const line = weatherLine(res.weather_forecast.daily?.[0]);
        if (live) setWeather(line ? { state: 'ok', value: line } : { state: 'missing', reason: 'no forecast for today' });
      })
      .catch((err: unknown) => live && setWeather({ state: 'missing', reason: reasonOf(err) }));
    return () => {
      live = false;
    };
  }, [field, location]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    signIn(name, code)
      .then(onSignedIn)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not reach the farm service');
      })
      .finally(() => setBusy(false));
  };

  const demo = field.state === 'ok' ? field.value : null;
  const farmFact: Fact<string> =
    field.state !== 'ok'
      ? field
      : {
          state: 'ok',
          value: [demo?.name, `${demo?.paddies.length ?? 0} paddies`, demo?.areaHa != null ? `${demo.areaHa.toFixed(2)} ha` : null].filter(Boolean).join(' · '),
        };
  const ledgerRow: Fact<string> = ledger.state === 'ok' ? { state: 'ok', value: ledger.value.text } : ledger;
  const contactHref = CONTACT.includes('@') ? `mailto:${CONTACT}` : CONTACT.startsWith('http') ? CONTACT : null;

  return (
    <main className="si-root">
      <section className="si-field" aria-label="Demo cooperative on the map">
        <FieldSketch field={demo} />
        {demo && demo.paddies.length > 0 && map !== 'failed' ? (
          <div className={`si-map${map === 'ready' ? ' is-ready' : ''}`}>
            <Suspense fallback={null}>
              <SignInMap field={demo} onReady={() => setMap('ready')} onFail={() => setMap('failed')} />
            </Suspense>
          </div>
        ) : null}
        <div className="si-shade" aria-hidden="true" />
        <p className="si-tag">
          <span className="si-dot" aria-hidden="true" />
          Demo cooperative · fixture farm on mapped farmland
        </p>
        <dl className="si-facts">
          <FactRow label="Farm" fact={farmFact} source="Registered contract outlines" />
          <FactRow label="Weather today" fact={weather} source="Open-Meteo forecast for the farm's grid cell" />
          <FactRow label="Record chain" fact={ledgerRow} warn={ledger.state === 'ok' && !ledger.value.ok} source="Hash-chained ledger" />
        </dl>
      </section>

      <section className="si-panel">
        <div className="si-inner">
          <header className="si-brand">
            <span className="si-mark" aria-hidden="true">
              <Sprout size={18} strokeWidth={1.9} />
            </span>
            <span className="si-word">AgriQill</span>
            <span className="pill pill-neutral">Beta</span>
            <button
              type="button"
              className="si-theme"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Use the light theme' : 'Use the dark theme'}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            >
              {theme === 'dark' ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
            </button>
          </header>

          <p className="si-eyebrow">Farm work, checked before it happens</p>
          <h1 className="si-title">Not now, and here is why.</h1>
          <p className="si-lede">
            AgriQill plans each day of farm work against live weather and the buyer's rules, holds any job that fails a check, and keeps a record of who
            approved what.
          </p>
          <ul className="si-proof">
            {PROOF.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <form className="si-form" onSubmit={submit} aria-labelledby="si-form-title">
            <h2 id="si-form-title" className="si-form-title">
              Sign in
            </h2>
            <p className="si-form-hint">Use the name and access code your farm gave you.</p>
            <div className="si-row">
              <label className="si-label" htmlFor="si-name">
                Your name
              </label>
              <input
                id="si-name"
                className="si-input"
                type="text"
                autoComplete="username"
                maxLength={80}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="si-row">
              <label className="si-label" htmlFor="si-code">
                Access code
              </label>
              <div className="si-input-wrap">
                <input
                  id="si-code"
                  className="si-input has-toggle"
                  type={reveal ? 'text' : 'password'}
                  autoComplete="current-password"
                  maxLength={120}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button
                  type="button"
                  className="si-reveal"
                  onClick={() => setReveal((v) => !v)}
                  aria-label={reveal ? 'Hide the access code' : 'Show the access code'}
                  aria-pressed={reveal}
                >
                  {reveal ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                </button>
              </div>
            </div>
            {error ? (
              <p className="si-error" role="alert">
                <AlertCircle size={16} strokeWidth={1.9} aria-hidden="true" />
                <span>{error}</span>
              </p>
            ) : null}
            <button type="submit" className="si-submit" disabled={busy}>
              {busy ? <Loader2 size={16} strokeWidth={2} className="si-spin" aria-hidden="true" /> : null}
              {busy ? 'Signing in' : 'Sign in'}
            </button>
          </form>

          <div className="si-or">
            <span>or</span>
          </div>
          <a className="si-demo" href={`${window.location.pathname}?story`}>
            <span>
              <strong>Try the demo farm</strong>
              <small>Read-only guided tour · no code needed</small>
            </span>
            <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
          </a>
          <p className="si-help">
            No code yet? Each person gets their own from the farm manager
            {CONTACT ? (
              <>
                {' '}or from{' '}
                {contactHref ? <a href={contactHref}>{CONTACT}</a> : CONTACT}
              </>
            ) : null}
            . Field crew log readings; managers also approve plans.
          </p>

          <footer className="si-foot">Every figure on this page is live or labelled. Benefits are design targets until a pilot season measures them.</footer>
        </div>
      </section>
    </main>
  );
};
